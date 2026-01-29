# python/models/temporal_fusion.py
# Temporal Fusion Transformer for Stock Return Prediction
#
# Based on "Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting"
# by Lim et al. (2021)
#
# Key components:
# 1. Variable Selection Networks - learn which features matter
# 2. Gated Residual Networks - provide skip connections with gating
# 3. LSTM Encoder-Decoder - capture local temporal patterns
# 4. Multi-Head Attention - capture long-range dependencies
# 5. Quantile Outputs - predict distribution, not just mean

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import math


@dataclass
class TFTOutput:
    """Output from TFT forward pass."""
    predictions: torch.Tensor          # Quantile predictions (batch, num_quantiles)
    attention_weights: torch.Tensor    # Temporal attention (batch, seq_len)
    variable_importance: Dict[str, torch.Tensor]  # Feature importance scores
    hidden_states: torch.Tensor        # Final hidden state


class GatedLinearUnit(nn.Module):
    """
    Gated Linear Unit (GLU).

    Splits input in half, applies sigmoid to one half as gate,
    multiplies with other half.
    """

    def __init__(self, input_size: int, output_size: int):
        super().__init__()
        self.fc = nn.Linear(input_size, output_size * 2)
        self.output_size = output_size

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.fc(x)
        x, gate = x.chunk(2, dim=-1)
        return x * torch.sigmoid(gate)


class GatedResidualNetwork(nn.Module):
    """
    Gated Residual Network (GRN).

    Core building block of TFT. Provides non-linear processing
    with skip connections and gating for gradient flow.

    Architecture:
    1. Dense layer with ELU activation
    2. Dense layer
    3. Dropout
    4. Gated Linear Unit
    5. Layer normalization
    6. Residual connection
    """

    def __init__(
        self,
        input_size: int,
        hidden_size: int,
        output_size: int,
        dropout: float = 0.1,
        context_size: Optional[int] = None
    ):
        super().__init__()

        self.input_size = input_size
        self.output_size = output_size
        self.context_size = context_size

        # Main pathway
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.elu = nn.ELU()

        # Context integration (optional)
        if context_size is not None:
            self.context_fc = nn.Linear(context_size, hidden_size, bias=False)

        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.dropout = nn.Dropout(dropout)

        # Gated output
        self.glu = GatedLinearUnit(hidden_size, output_size)

        # Layer norm and residual
        self.layer_norm = nn.LayerNorm(output_size)

        # Skip connection projection if sizes differ
        if input_size != output_size:
            self.skip_projection = nn.Linear(input_size, output_size)
        else:
            self.skip_projection = None

    def forward(
        self,
        x: torch.Tensor,
        context: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        # Residual
        if self.skip_projection is not None:
            residual = self.skip_projection(x)
        else:
            residual = x

        # Main pathway
        hidden = self.fc1(x)
        hidden = self.elu(hidden)

        # Add context if provided
        if context is not None and self.context_size is not None:
            hidden = hidden + self.context_fc(context)

        hidden = self.fc2(hidden)
        hidden = self.dropout(hidden)

        # Gated output
        hidden = self.glu(hidden)

        # Residual connection with layer norm
        return self.layer_norm(hidden + residual)


class VariableSelectionNetwork(nn.Module):
    """
    Variable Selection Network (VSN).

    Learns which input features are important for the prediction task.
    Provides interpretable feature importance scores.

    For each feature:
    1. Project to hidden size via GRN
    2. Calculate softmax weights across features
    3. Weighted sum of processed features
    """

    def __init__(
        self,
        num_features: int,
        input_size: int,
        hidden_size: int,
        dropout: float = 0.1,
        context_size: Optional[int] = None
    ):
        super().__init__()

        self.num_features = num_features
        self.hidden_size = hidden_size

        # GRN for each feature
        self.feature_grns = nn.ModuleList([
            GatedResidualNetwork(
                input_size=input_size,
                hidden_size=hidden_size,
                output_size=hidden_size,
                dropout=dropout,
                context_size=context_size
            )
            for _ in range(num_features)
        ])

        # Softmax weight calculation
        self.weight_grn = GatedResidualNetwork(
            input_size=num_features * input_size,
            hidden_size=hidden_size,
            output_size=num_features,
            dropout=dropout,
            context_size=context_size
        )

    def forward(
        self,
        features: List[torch.Tensor],
        context: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            features: List of tensors, each (batch, seq_len, input_size) or (batch, input_size)
            context: Optional context tensor

        Returns:
            combined: Weighted combination of features
            weights: Softmax weights for each feature (interpretable importance)
        """
        # Process each feature through its GRN
        processed = []
        for i, (feature, grn) in enumerate(zip(features, self.feature_grns)):
            processed.append(grn(feature, context))

        # Stack for weighted sum: (batch, ..., num_features, hidden_size)
        stacked = torch.stack(processed, dim=-2)

        # Calculate weights
        # Flatten features for weight GRN
        if len(features[0].shape) == 3:
            # Time series: (batch, seq_len, num_features * input_size)
            batch_size, seq_len, _ = features[0].shape
            flat_features = torch.cat(features, dim=-1)
        else:
            # Static: (batch, num_features * input_size)
            flat_features = torch.cat(features, dim=-1)

        # Get weights: (batch, ..., num_features)
        weights = self.weight_grn(flat_features, context)
        weights = F.softmax(weights, dim=-1)

        # Weighted sum: (batch, ..., hidden_size)
        weights_expanded = weights.unsqueeze(-1)  # (batch, ..., num_features, 1)
        combined = (stacked * weights_expanded).sum(dim=-2)

        return combined, weights


class InterpretableMultiHeadAttention(nn.Module):
    """
    Interpretable Multi-Head Attention.

    Modified attention that provides interpretable attention weights
    by sharing values across heads.
    """

    def __init__(
        self,
        hidden_size: int,
        num_heads: int = 4,
        dropout: float = 0.1
    ):
        super().__init__()

        self.hidden_size = hidden_size
        self.num_heads = num_heads
        self.head_size = hidden_size // num_heads

        assert hidden_size % num_heads == 0, "hidden_size must be divisible by num_heads"

        # Query, Key projections (per head)
        self.query = nn.Linear(hidden_size, hidden_size)
        self.key = nn.Linear(hidden_size, hidden_size)

        # Value projection (shared across heads for interpretability)
        self.value = nn.Linear(hidden_size, hidden_size)

        # Output projection
        self.output = nn.Linear(hidden_size, hidden_size)

        self.dropout = nn.Dropout(dropout)
        self.scale = math.sqrt(self.head_size)

    def forward(
        self,
        query: torch.Tensor,
        key: torch.Tensor,
        value: torch.Tensor,
        mask: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            query: (batch, seq_len, hidden_size)
            key: (batch, seq_len, hidden_size)
            value: (batch, seq_len, hidden_size)
            mask: Optional attention mask

        Returns:
            output: (batch, seq_len, hidden_size)
            attention_weights: (batch, seq_len, seq_len) - averaged across heads
        """
        batch_size, seq_len, _ = query.shape

        # Linear projections
        Q = self.query(query)  # (batch, seq, hidden)
        K = self.key(key)
        V = self.value(value)

        # Reshape for multi-head: (batch, num_heads, seq, head_size)
        Q = Q.view(batch_size, seq_len, self.num_heads, self.head_size).transpose(1, 2)
        K = K.view(batch_size, seq_len, self.num_heads, self.head_size).transpose(1, 2)
        V = V.view(batch_size, seq_len, self.num_heads, self.head_size).transpose(1, 2)

        # Attention scores: (batch, num_heads, seq, seq)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / self.scale

        # Apply mask if provided
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))

        # Softmax
        attention_weights = F.softmax(scores, dim=-1)
        attention_weights = self.dropout(attention_weights)

        # Apply attention to values
        context = torch.matmul(attention_weights, V)

        # Reshape back: (batch, seq, hidden)
        context = context.transpose(1, 2).contiguous().view(batch_size, seq_len, self.hidden_size)

        # Output projection
        output = self.output(context)

        # Average attention weights across heads for interpretability
        avg_attention = attention_weights.mean(dim=1)  # (batch, seq, seq)

        return output, avg_attention


class TemporalFusionTransformer(nn.Module):
    """
    Temporal Fusion Transformer for stock return prediction.

    Architecture Overview:
    1. Input embeddings for static and time-varying features
    2. Variable selection networks for feature importance
    3. LSTM encoder for local temporal patterns
    4. Static enrichment with GRN
    5. Multi-head attention for long-range dependencies
    6. Position-wise feed-forward
    7. Quantile output layer

    Key advantages:
    - Interpretable: attention weights and variable importance
    - Handles multiple input types: static, known, unknown
    - Uncertainty quantification via quantile regression
    - Regime-aware through static context
    """

    def __init__(
        self,
        num_time_varying_features: int = 40,
        num_static_features: int = 5,
        hidden_size: int = 128,
        lstm_layers: int = 2,
        num_attention_heads: int = 4,
        dropout: float = 0.1,
        quantiles: List[float] = [0.1, 0.5, 0.9]
    ):
        super().__init__()

        self.hidden_size = hidden_size
        self.num_time_varying = num_time_varying_features
        self.num_static = num_static_features
        self.quantiles = quantiles

        # ==========================================
        # Input Processing
        # ==========================================

        # Static feature embeddings (sector, market cap bucket, etc.)
        self.static_embeddings = nn.Linear(num_static_features, hidden_size)

        # Time-varying feature embeddings
        self.temporal_embeddings = nn.Linear(num_time_varying_features, hidden_size)

        # ==========================================
        # Variable Selection Networks
        # ==========================================

        # Static variable selection
        self.static_vsn = VariableSelectionNetwork(
            num_features=1,  # Treat all static as single group
            input_size=hidden_size,
            hidden_size=hidden_size,
            dropout=dropout
        )

        # Temporal variable selection (with static context)
        self.temporal_vsn = VariableSelectionNetwork(
            num_features=1,  # Treat all temporal as single group
            input_size=hidden_size,
            hidden_size=hidden_size,
            dropout=dropout,
            context_size=hidden_size
        )

        # ==========================================
        # Locality Processing (LSTM)
        # ==========================================

        self.lstm_encoder = nn.LSTM(
            input_size=hidden_size,
            hidden_size=hidden_size,
            num_layers=lstm_layers,
            batch_first=True,
            dropout=dropout if lstm_layers > 1 else 0,
            bidirectional=False  # Causal for time series
        )

        # Gate for LSTM output
        self.lstm_gate = GatedLinearUnit(hidden_size, hidden_size)
        self.lstm_norm = nn.LayerNorm(hidden_size)

        # ==========================================
        # Static Enrichment
        # ==========================================

        self.static_enrichment = GatedResidualNetwork(
            input_size=hidden_size,
            hidden_size=hidden_size,
            output_size=hidden_size,
            dropout=dropout,
            context_size=hidden_size
        )

        # ==========================================
        # Temporal Self-Attention
        # ==========================================

        self.attention = InterpretableMultiHeadAttention(
            hidden_size=hidden_size,
            num_heads=num_attention_heads,
            dropout=dropout
        )

        self.attention_gate = GatedLinearUnit(hidden_size, hidden_size)
        self.attention_norm = nn.LayerNorm(hidden_size)

        # ==========================================
        # Position-wise Feed-Forward
        # ==========================================

        self.feed_forward = GatedResidualNetwork(
            input_size=hidden_size,
            hidden_size=hidden_size * 4,
            output_size=hidden_size,
            dropout=dropout
        )

        # ==========================================
        # Output Layer
        # ==========================================

        # Final GRN before output
        self.output_grn = GatedResidualNetwork(
            input_size=hidden_size,
            hidden_size=hidden_size,
            output_size=hidden_size,
            dropout=dropout
        )

        # Quantile outputs
        self.quantile_output = nn.Linear(hidden_size, len(quantiles))

        # Initialize weights
        self._init_weights()

    def _init_weights(self):
        """Initialize weights for stable training."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.LSTM):
                for name, param in module.named_parameters():
                    if 'weight' in name:
                        nn.init.orthogonal_(param)
                    elif 'bias' in name:
                        nn.init.zeros_(param)

    def forward(
        self,
        temporal_features: torch.Tensor,
        static_features: Optional[torch.Tensor] = None,
        return_attention: bool = True
    ) -> TFTOutput:
        """
        Forward pass.

        Args:
            temporal_features: (batch, seq_len, num_time_varying_features)
            static_features: (batch, num_static_features) or None
            return_attention: Whether to return attention weights

        Returns:
            TFTOutput with predictions, attention, and variable importance
        """
        batch_size, seq_len, _ = temporal_features.shape

        # ==========================================
        # 1. Input Embeddings
        # ==========================================

        # Temporal embeddings
        temporal_embedded = self.temporal_embeddings(temporal_features)
        # (batch, seq_len, hidden_size)

        # Static embeddings
        if static_features is not None:
            static_embedded = self.static_embeddings(static_features)
            # (batch, hidden_size)
        else:
            static_embedded = torch.zeros(
                batch_size, self.hidden_size,
                device=temporal_features.device
            )

        # ==========================================
        # 2. Variable Selection
        # ==========================================

        # Static variable selection
        static_selected, static_weights = self.static_vsn([static_embedded])
        # static_selected: (batch, hidden_size)

        # Expand static context for temporal VSN
        static_context = static_selected.unsqueeze(1).expand(-1, seq_len, -1)
        # (batch, seq_len, hidden_size)

        # Temporal variable selection with static context
        temporal_selected, temporal_weights = self.temporal_vsn(
            [temporal_embedded],
            context=static_context
        )
        # temporal_selected: (batch, seq_len, hidden_size)

        # ==========================================
        # 3. LSTM Encoder
        # ==========================================

        lstm_out, (h_n, c_n) = self.lstm_encoder(temporal_selected)
        # lstm_out: (batch, seq_len, hidden_size)

        # Gated residual connection
        lstm_gated = self.lstm_gate(lstm_out)
        temporal_features_encoded = self.lstm_norm(lstm_gated + temporal_selected)

        # ==========================================
        # 4. Static Enrichment
        # ==========================================

        # Enrich temporal features with static context
        enriched = self.static_enrichment(
            temporal_features_encoded,
            context=static_context
        )
        # (batch, seq_len, hidden_size)

        # ==========================================
        # 5. Self-Attention
        # ==========================================

        # Create causal mask (can only attend to past)
        mask = torch.tril(torch.ones(seq_len, seq_len, device=temporal_features.device))
        mask = mask.unsqueeze(0).unsqueeze(0)  # (1, 1, seq, seq)

        attention_out, attention_weights = self.attention(
            query=enriched,
            key=enriched,
            value=enriched,
            mask=mask
        )

        # Gated residual
        attention_gated = self.attention_gate(attention_out)
        attention_features = self.attention_norm(attention_gated + enriched)

        # ==========================================
        # 6. Position-wise Feed-Forward
        # ==========================================

        ff_out = self.feed_forward(attention_features)
        # (batch, seq_len, hidden_size)

        # ==========================================
        # 7. Output
        # ==========================================

        # Use last timestep for prediction
        final_hidden = ff_out[:, -1, :]  # (batch, hidden_size)

        # Final GRN
        output_features = self.output_grn(final_hidden)

        # Quantile predictions
        quantile_predictions = self.quantile_output(output_features)
        # (batch, num_quantiles)

        # Get temporal attention for last position (interpretability)
        if return_attention:
            # Attention from last position to all previous
            temporal_attention = attention_weights[:, -1, :]  # (batch, seq_len)
        else:
            temporal_attention = None

        # Variable importance
        variable_importance = {
            'static': static_weights,
            'temporal': temporal_weights
        }

        return TFTOutput(
            predictions=quantile_predictions,
            attention_weights=temporal_attention,
            variable_importance=variable_importance,
            hidden_states=final_hidden
        )

    def predict(
        self,
        temporal_features: torch.Tensor,
        static_features: Optional[torch.Tensor] = None,
        return_all_quantiles: bool = False
    ) -> Dict[str, np.ndarray]:
        """
        Make predictions (inference mode).

        Args:
            temporal_features: Input features
            static_features: Static features (optional)
            return_all_quantiles: Return all quantiles or just median

        Returns:
            Dictionary with predictions
        """
        self.eval()
        with torch.no_grad():
            output = self.forward(temporal_features, static_features)

            # Get median prediction (quantile 0.5)
            median_idx = self.quantiles.index(0.5) if 0.5 in self.quantiles else len(self.quantiles) // 2
            predictions = output.predictions[:, median_idx].cpu().numpy()

            result = {
                'mean': predictions,
                'median': predictions
            }

            if return_all_quantiles:
                result['quantiles'] = {
                    str(q): output.predictions[:, i].cpu().numpy()
                    for i, q in enumerate(self.quantiles)
                }

                # Uncertainty from quantile spread
                if 0.1 in self.quantiles and 0.9 in self.quantiles:
                    q10_idx = self.quantiles.index(0.1)
                    q90_idx = self.quantiles.index(0.9)
                    result['std'] = (
                        output.predictions[:, q90_idx] - output.predictions[:, q10_idx]
                    ).cpu().numpy() / 2.56  # ~1 std for normal

            if output.attention_weights is not None:
                result['attention'] = output.attention_weights.cpu().numpy()

            return result

    def get_attention_interpretation(
        self,
        temporal_features: torch.Tensor,
        static_features: Optional[torch.Tensor] = None,
        timestep_labels: Optional[List[str]] = None
    ) -> Dict:
        """
        Get interpretable attention analysis.

        Returns attention weights with labels for visualization.
        """
        self.eval()
        with torch.no_grad():
            output = self.forward(temporal_features, static_features, return_attention=True)

            attention = output.attention_weights.cpu().numpy()

            if timestep_labels is None:
                timestep_labels = [f't-{i}' for i in range(attention.shape[-1] - 1, -1, -1)]

            return {
                'attention_weights': attention,
                'timestep_labels': timestep_labels,
                'static_importance': output.variable_importance['static'].cpu().numpy(),
                'temporal_importance': output.variable_importance['temporal'].cpu().numpy()
            }


class QuantileLoss(nn.Module):
    """
    Quantile Loss (Pinball Loss).

    For quantile q:
    - If actual > predicted: loss = q * |error|
    - If actual < predicted: loss = (1-q) * |error|

    This asymmetric loss trains the model to predict specific quantiles.
    """

    def __init__(self, quantiles: List[float] = [0.1, 0.5, 0.9]):
        super().__init__()
        self.quantiles = quantiles

    def forward(
        self,
        predictions: torch.Tensor,
        targets: torch.Tensor
    ) -> torch.Tensor:
        """
        Args:
            predictions: (batch, num_quantiles)
            targets: (batch,)

        Returns:
            Mean quantile loss
        """
        targets = targets.unsqueeze(-1)  # (batch, 1)
        errors = targets - predictions   # (batch, num_quantiles)

        losses = []
        for i, q in enumerate(self.quantiles):
            error = errors[:, i]
            loss = torch.max(q * error, (q - 1) * error)
            losses.append(loss)

        # Stack and mean
        total_loss = torch.stack(losses, dim=-1).mean()
        return total_loss


class TFTCombinedLoss(nn.Module):
    """
    Combined loss for TFT training.

    Components:
    1. Quantile loss for distribution prediction
    2. Direction accuracy bonus
    """

    def __init__(
        self,
        quantiles: List[float] = [0.1, 0.5, 0.9],
        direction_weight: float = 0.1
    ):
        super().__init__()
        self.quantile_loss = QuantileLoss(quantiles)
        self.direction_weight = direction_weight
        self.median_idx = quantiles.index(0.5) if 0.5 in quantiles else len(quantiles) // 2

    def forward(
        self,
        predictions: torch.Tensor,
        targets: torch.Tensor
    ) -> Tuple[torch.Tensor, Dict[str, float]]:
        """
        Compute combined loss.

        Returns:
            total_loss: Combined loss
            components: Dictionary of loss components
        """
        # Quantile loss
        q_loss = self.quantile_loss(predictions, targets)

        # Direction loss
        median_pred = predictions[:, self.median_idx]
        pred_sign = torch.sigmoid(median_pred * 10)
        target_sign = (targets > 0).float()
        dir_loss = F.binary_cross_entropy(pred_sign, target_sign)

        # Combined
        total = q_loss + self.direction_weight * dir_loss

        components = {
            'quantile': q_loss.item(),
            'direction': dir_loss.item(),
            'total': total.item()
        }

        return total, components


def create_tft_model(config: Dict) -> TemporalFusionTransformer:
    """Factory function to create TFT from config."""
    return TemporalFusionTransformer(
        num_time_varying_features=config.get('num_time_varying_features', 40),
        num_static_features=config.get('num_static_features', 5),
        hidden_size=config.get('hidden_size', 128),
        lstm_layers=config.get('lstm_layers', 2),
        num_attention_heads=config.get('num_attention_heads', 4),
        dropout=config.get('dropout', 0.1),
        quantiles=config.get('quantiles', [0.1, 0.5, 0.9])
    )


# Quick test
if __name__ == '__main__':
    print("Testing Temporal Fusion Transformer...")

    # Create model
    model = TemporalFusionTransformer(
        num_time_varying_features=40,
        num_static_features=5,
        hidden_size=64,
        lstm_layers=2,
        num_attention_heads=4,
        dropout=0.1
    )

    # Test input
    batch_size = 8
    seq_len = 60

    temporal_features = torch.randn(batch_size, seq_len, 40)
    static_features = torch.randn(batch_size, 5)
    targets = torch.randn(batch_size)

    # Forward pass
    output = model(temporal_features, static_features, return_attention=True)

    print(f"Predictions shape: {output.predictions.shape}")
    print(f"Attention weights shape: {output.attention_weights.shape}")
    print(f"Hidden states shape: {output.hidden_states.shape}")

    # Test loss
    loss_fn = TFTCombinedLoss()
    loss, components = loss_fn(output.predictions, targets)
    print(f"\nLoss: {loss.item():.4f}")
    print(f"Components: {components}")

    # Test inference
    result = model.predict(temporal_features, static_features, return_all_quantiles=True)
    print(f"\nPredictions: mean={result['mean'].mean():.4f}")
    print(f"Quantiles: {list(result['quantiles'].keys())}")

    # Count parameters
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"\nTotal parameters: {total_params:,}")
    print(f"Trainable parameters: {trainable_params:,}")

    # Test attention interpretation
    interp = model.get_attention_interpretation(temporal_features[:1], static_features[:1])
    print(f"\nAttention interpretation:")
    print(f"  Attention shape: {interp['attention_weights'].shape}")
    print(f"  Top attended timesteps: {interp['attention_weights'][0].argsort()[-5:][::-1]}")

    print("\nAll TFT tests passed!")
