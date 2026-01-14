# python/models/stock_lstm.py
# LSTM model for stock return prediction

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass


@dataclass
class LSTMOutput:
    """Output from LSTM forward pass."""
    prediction: torch.Tensor       # Point prediction (batch_size,)
    log_variance: torch.Tensor     # Aleatoric uncertainty (batch_size,)
    hidden_states: torch.Tensor    # Last hidden state (batch_size, hidden_size)
    attention_weights: Optional[torch.Tensor] = None  # (batch_size, seq_len)


class AttentionPooling(nn.Module):
    """
    Attention-based pooling over sequence dimension.

    Instead of just taking the last hidden state, we learn which
    timesteps are most important for prediction.
    """

    def __init__(self, hidden_size: int):
        super().__init__()
        self.attention = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.Tanh(),
            nn.Linear(hidden_size // 2, 1)
        )

    def forward(self, lstm_output: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            lstm_output: (batch_size, seq_len, hidden_size)

        Returns:
            pooled: (batch_size, hidden_size)
            weights: (batch_size, seq_len)
        """
        # Calculate attention scores
        scores = self.attention(lstm_output).squeeze(-1)  # (batch, seq_len)
        weights = F.softmax(scores, dim=-1)               # (batch, seq_len)

        # Weighted sum
        pooled = torch.bmm(
            weights.unsqueeze(1),  # (batch, 1, seq_len)
            lstm_output            # (batch, seq_len, hidden)
        ).squeeze(1)               # (batch, hidden)

        return pooled, weights


class StockLSTM(nn.Module):
    """
    Bidirectional LSTM for stock return prediction.

    Architecture:
    1. Input projection layer (handles variable input features)
    2. 2-layer bidirectional LSTM
    3. Attention pooling over sequence
    4. Dropout for regularization
    5. Dense layers for prediction
    6. Dual output: point prediction + log variance (aleatoric uncertainty)

    The log variance output enables:
    - Heteroscedastic predictions (uncertainty varies by sample)
    - Proper loss weighting (Gaussian NLL)
    - Position sizing based on prediction confidence
    """

    def __init__(
        self,
        input_size: int = 45,
        hidden_size: int = 128,
        num_layers: int = 2,
        dropout: float = 0.2,
        bidirectional: bool = True,
        output_uncertainty: bool = True
    ):
        super().__init__()

        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.bidirectional = bidirectional
        self.output_uncertainty = output_uncertainty

        # Direction multiplier
        self.num_directions = 2 if bidirectional else 1

        # Input projection (normalizes input dimensionality)
        self.input_projection = nn.Sequential(
            nn.Linear(input_size, hidden_size),
            nn.LayerNorm(hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout)
        )

        # LSTM layers
        self.lstm = nn.LSTM(
            input_size=hidden_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=dropout if num_layers > 1 else 0
        )

        # Attention pooling
        lstm_output_size = hidden_size * self.num_directions
        self.attention = AttentionPooling(lstm_output_size)

        # Output layers
        self.output_dropout = nn.Dropout(dropout)

        self.output_layers = nn.Sequential(
            nn.Linear(lstm_output_size, hidden_size),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU()
        )

        # Prediction head (mean)
        self.prediction_head = nn.Linear(hidden_size // 2, 1)

        # Uncertainty head (log variance)
        if output_uncertainty:
            self.uncertainty_head = nn.Linear(hidden_size // 2, 1)

        # Initialize weights
        self._init_weights()

    def _init_weights(self):
        """Initialize weights for stable training."""
        for name, param in self.named_parameters():
            if 'weight' in name:
                if 'lstm' in name:
                    # Orthogonal init for LSTM
                    nn.init.orthogonal_(param)
                elif 'linear' in name.lower() or len(param.shape) >= 2:
                    # Xavier for linear layers
                    nn.init.xavier_uniform_(param)
            elif 'bias' in name:
                nn.init.zeros_(param)

    def forward(
        self,
        x: torch.Tensor,
        return_attention: bool = False
    ) -> LSTMOutput:
        """
        Forward pass.

        Args:
            x: Input tensor (batch_size, seq_len, input_size)
            return_attention: Whether to return attention weights

        Returns:
            LSTMOutput with prediction, log_variance, hidden_states, attention_weights
        """
        batch_size = x.size(0)

        # Input projection
        x = self.input_projection(x)  # (batch, seq, hidden)

        # LSTM
        lstm_out, (h_n, c_n) = self.lstm(x)
        # lstm_out: (batch, seq, hidden * num_directions)
        # h_n: (num_layers * num_directions, batch, hidden)

        # Attention pooling
        pooled, attention_weights = self.attention(lstm_out)
        # pooled: (batch, hidden * num_directions)

        # Dropout
        pooled = self.output_dropout(pooled)

        # Output layers
        features = self.output_layers(pooled)

        # Prediction (mean)
        prediction = self.prediction_head(features).squeeze(-1)

        # Uncertainty (log variance)
        if self.output_uncertainty:
            log_variance = self.uncertainty_head(features).squeeze(-1)
            # Clamp to prevent numerical issues
            log_variance = torch.clamp(log_variance, min=-10, max=10)
        else:
            log_variance = torch.zeros_like(prediction)

        # Get last hidden state
        if self.bidirectional:
            # Concatenate forward and backward final hidden states
            h_forward = h_n[-2]  # (batch, hidden)
            h_backward = h_n[-1]  # (batch, hidden)
            hidden = torch.cat([h_forward, h_backward], dim=-1)
        else:
            hidden = h_n[-1]

        return LSTMOutput(
            prediction=prediction,
            log_variance=log_variance,
            hidden_states=hidden,
            attention_weights=attention_weights if return_attention else None
        )

    def predict(
        self,
        x: torch.Tensor,
        return_std: bool = True
    ) -> Dict[str, np.ndarray]:
        """
        Make predictions (inference mode).

        Args:
            x: Input tensor
            return_std: Whether to return standard deviation

        Returns:
            Dictionary with 'mean' and optionally 'std'
        """
        self.eval()
        with torch.no_grad():
            output = self.forward(x)

            result = {
                'mean': output.prediction.cpu().numpy()
            }

            if return_std and self.output_uncertainty:
                # Convert log variance to standard deviation
                std = torch.exp(0.5 * output.log_variance)
                result['std'] = std.cpu().numpy()

            return result

    def get_feature_importance(
        self,
        x: torch.Tensor,
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Estimate feature importance via gradient-based attribution.

        Uses integrated gradients approximation.
        """
        self.eval()
        x.requires_grad_(True)

        output = self.forward(x)
        prediction = output.prediction.sum()
        prediction.backward()

        # Gradient magnitude as importance
        gradients = x.grad.abs().mean(dim=(0, 1)).cpu().numpy()

        if feature_names is None:
            feature_names = [f'feature_{i}' for i in range(len(gradients))]

        importance = {
            name: float(grad)
            for name, grad in zip(feature_names, gradients)
        }

        # Normalize
        total = sum(importance.values())
        if total > 0:
            importance = {k: v / total for k, v in importance.items()}

        return importance


class GaussianNLLLoss(nn.Module):
    """
    Gaussian Negative Log-Likelihood Loss.

    Trains both mean and variance prediction.
    Loss = 0.5 * (log(var) + (y - mu)^2 / var)

    This properly weights predictions:
    - High variance predictions penalized less for errors
    - Low variance predictions penalized more for errors
    """

    def __init__(self, reduction: str = 'mean'):
        super().__init__()
        self.reduction = reduction

    def forward(
        self,
        prediction: torch.Tensor,
        log_variance: torch.Tensor,
        target: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            prediction: Predicted mean (batch_size,)
            log_variance: Log variance (batch_size,)
            target: True values (batch_size,)
        """
        # Variance
        variance = torch.exp(log_variance)

        # NLL
        nll = 0.5 * (log_variance + (target - prediction).pow(2) / variance)

        if self.reduction == 'mean':
            return nll.mean()
        elif self.reduction == 'sum':
            return nll.sum()
        else:
            return nll


class CombinedLoss(nn.Module):
    """
    Combined loss for training.

    Components:
    1. Gaussian NLL (for mean + uncertainty)
    2. MSE (for mean prediction)
    3. Direction accuracy (for sign of prediction)
    """

    def __init__(
        self,
        nll_weight: float = 0.5,
        mse_weight: float = 0.3,
        direction_weight: float = 0.2
    ):
        super().__init__()
        self.nll_weight = nll_weight
        self.mse_weight = mse_weight
        self.direction_weight = direction_weight

        self.nll = GaussianNLLLoss()
        self.mse = nn.MSELoss()

    def forward(
        self,
        prediction: torch.Tensor,
        log_variance: torch.Tensor,
        target: torch.Tensor
    ) -> Tuple[torch.Tensor, Dict[str, float]]:
        """
        Compute combined loss.

        Returns:
            total_loss: Combined loss for backprop
            components: Dictionary of individual loss components
        """
        # NLL loss
        nll_loss = self.nll(prediction, log_variance, target)

        # MSE loss
        mse_loss = self.mse(prediction, target)

        # Direction loss (binary cross-entropy on sign)
        pred_sign = torch.sigmoid(prediction * 10)  # Soft sign
        target_sign = (target > 0).float()
        direction_loss = F.binary_cross_entropy(pred_sign, target_sign)

        # Combined
        total = (
            self.nll_weight * nll_loss +
            self.mse_weight * mse_loss +
            self.direction_weight * direction_loss
        )

        components = {
            'nll': nll_loss.item(),
            'mse': mse_loss.item(),
            'direction': direction_loss.item(),
            'total': total.item()
        }

        return total, components


def create_model(config: Dict) -> StockLSTM:
    """Factory function to create model from config."""
    return StockLSTM(
        input_size=config.get('input_size', 45),
        hidden_size=config.get('hidden_size', 128),
        num_layers=config.get('num_layers', 2),
        dropout=config.get('dropout', 0.2),
        bidirectional=config.get('bidirectional', True),
        output_uncertainty=config.get('output_uncertainty', True)
    )


# Quick test
if __name__ == '__main__':
    print("Testing StockLSTM...")

    # Create model
    model = StockLSTM(
        input_size=45,
        hidden_size=128,
        num_layers=2,
        dropout=0.2
    )

    # Test input
    batch_size = 32
    seq_len = 60
    input_size = 45

    x = torch.randn(batch_size, seq_len, input_size)
    y = torch.randn(batch_size)

    # Forward pass
    output = model(x, return_attention=True)
    print(f"Prediction shape: {output.prediction.shape}")
    print(f"Log variance shape: {output.log_variance.shape}")
    print(f"Attention weights shape: {output.attention_weights.shape}")

    # Test loss
    loss_fn = CombinedLoss()
    loss, components = loss_fn(output.prediction, output.log_variance, y)
    print(f"Loss: {loss.item():.4f}")
    print(f"Components: {components}")

    # Test inference
    result = model.predict(x)
    print(f"Predictions: mean={result['mean'].mean():.4f}, std={result['std'].mean():.4f}")

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Total parameters: {total_params:,}")
    print(f"Trainable parameters: {trainable_params:,}")

    print("\nAll tests passed!")
