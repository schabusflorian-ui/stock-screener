# python/models/deep_ensemble.py
# Deep Ensemble - Combines multiple models for robust predictions

import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass
import json

from .config import CHECKPOINT_DIR, ModelConfig
from .stock_lstm import StockLSTM
from .temporal_fusion import TemporalFusionTransformer


@dataclass
class EnsembleOutput:
    """Output from ensemble prediction."""
    prediction: np.ndarray           # Point prediction
    uncertainty: np.ndarray          # Total uncertainty (epistemic + aleatoric)
    epistemic_uncertainty: np.ndarray  # Model disagreement
    aleatoric_uncertainty: np.ndarray  # Data noise (from individual models)
    model_predictions: Dict[str, np.ndarray]  # Predictions from each model
    model_weights: Dict[str, float]  # Contribution weights
    confidence: np.ndarray           # 0-1 confidence score


class DeepEnsemble:
    """
    Deep Ensemble for stock return prediction.

    Combines:
    1. LSTM model - captures local patterns
    2. Temporal Fusion Transformer - long-range dependencies
    3. Gradient Boosting (external) - traditional ML baseline

    Ensemble Methods:
    - Simple average (default)
    - Uncertainty-weighted (inverse variance weighting)
    - Regime-adaptive (different weights per market regime)
    - Stacked (meta-learner)

    Uncertainty Quantification:
    - Epistemic: Model disagreement (std across ensemble)
    - Aleatoric: Data noise (from quantile spread or variance output)
    - Total: Combined uncertainty for position sizing
    """

    def __init__(
        self,
        checkpoint_dir: Path = CHECKPOINT_DIR,
        device: str = 'cpu'
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.device = torch.device(device)

        # Model registry
        self.models: Dict[str, nn.Module] = {}
        self.model_configs: Dict[str, Dict] = {}
        self.model_metrics: Dict[str, Dict] = {}

        # Ensemble configuration
        self.ensemble_method = 'uncertainty_weighted'
        self.regime_weights = {
            'bull': {'lstm': 0.35, 'tft': 0.45, 'gb': 0.20},
            'bear': {'lstm': 0.30, 'tft': 0.30, 'gb': 0.40},
            'sideways': {'lstm': 0.35, 'tft': 0.35, 'gb': 0.30},
            'crisis': {'lstm': 0.25, 'tft': 0.25, 'gb': 0.50},  # Conservative
            'default': {'lstm': 0.35, 'tft': 0.40, 'gb': 0.25}
        }

        # Meta-learner (for stacking)
        self.meta_learner = None

    def load_models(self) -> Dict[str, bool]:
        """
        Load all available models from checkpoint directory.

        Returns dict of model_name -> success status.
        """
        results = {}

        # Load LSTM models
        lstm_files = list(self.checkpoint_dir.glob('stock_lstm*.pt'))
        if lstm_files:
            latest_lstm = max(lstm_files, key=lambda p: p.stat().st_mtime)
            try:
                self.models['lstm'] = self._load_lstm(latest_lstm)
                results['lstm'] = True
                print(f"Loaded LSTM: {latest_lstm.name}")
            except Exception as e:
                print(f"Failed to load LSTM: {e}")
                results['lstm'] = False
        else:
            results['lstm'] = False

        # Load TFT models
        tft_files = list(self.checkpoint_dir.glob('tft*.pt')) + \
                    list(self.checkpoint_dir.glob('temporal_fusion*.pt'))
        if tft_files:
            latest_tft = max(tft_files, key=lambda p: p.stat().st_mtime)
            try:
                self.models['tft'] = self._load_tft(latest_tft)
                results['tft'] = True
                print(f"Loaded TFT: {latest_tft.name}")
            except Exception as e:
                print(f"Failed to load TFT: {e}")
                results['tft'] = False
        else:
            results['tft'] = False

        # Load Gradient Boosting models
        results['gb'] = self._load_gradient_boosting()

        return results

    def _load_gradient_boosting(self) -> bool:
        """
        Load gradient boosting models (XGBoost/LightGBM).

        Returns True if at least one GB model was loaded.
        """
        try:
            from .gradient_boosting import GradientBoostingModels
            self.gb_models = GradientBoostingModels(checkpoint_dir=self.checkpoint_dir)
            self.gb_models.load_latest()

            # Check if any models were actually loaded
            has_xgb = self.gb_models.xgb_model is not None
            has_lgb = self.gb_models.lgb_model is not None

            if has_xgb or has_lgb:
                print(f"Loaded GB models: XGBoost={has_xgb}, LightGBM={has_lgb}")
                return True
            else:
                print("No gradient boosting models found in checkpoint directory")
                return False
        except ImportError as e:
            print(f"Gradient boosting not available: {e}")
            return False
        except Exception as e:
            print(f"Failed to load gradient boosting: {e}")
            return False

    def _load_lstm(self, path: Path) -> StockLSTM:
        """Load LSTM model from checkpoint."""
        checkpoint = torch.load(path, map_location=self.device)
        config = checkpoint.get('config', {})

        model = StockLSTM(
            input_size=config.get('input_size', 45),
            hidden_size=config.get('hidden_size', 128),
            num_layers=config.get('num_layers', 2),
            dropout=0,  # No dropout for inference
            output_uncertainty=config.get('output_uncertainty', True)
        )

        model.load_state_dict(checkpoint['model_state_dict'])
        model.to(self.device)
        model.eval()

        self.model_configs['lstm'] = config
        self.model_metrics['lstm'] = checkpoint.get('metrics', {})

        return model

    def _load_tft(self, path: Path) -> TemporalFusionTransformer:
        """Load TFT model from checkpoint."""
        checkpoint = torch.load(path, map_location=self.device)
        config = checkpoint.get('config', {})

        model = TemporalFusionTransformer(
            num_time_varying_features=config.get('num_time_varying_features', 40),
            num_static_features=config.get('num_static_features', 5),
            hidden_size=config.get('hidden_size', 128),
            lstm_layers=config.get('lstm_layers', 2),
            num_attention_heads=config.get('num_attention_heads', 4),
            dropout=0,  # No dropout for inference
            quantiles=config.get('quantiles', [0.1, 0.5, 0.9])
        )

        model.load_state_dict(checkpoint['model_state_dict'])
        model.to(self.device)
        model.eval()

        self.model_configs['tft'] = config
        self.model_metrics['tft'] = checkpoint.get('metrics', {})

        return model

    def predict(
        self,
        temporal_features: np.ndarray,
        static_features: Optional[np.ndarray] = None,
        regime: str = 'default',
        gb_predictions: Optional[np.ndarray] = None,
        method: Optional[str] = None
    ) -> EnsembleOutput:
        """
        Make ensemble predictions.

        Args:
            temporal_features: (batch, seq_len, num_features)
            static_features: (batch, num_static) or None
            regime: Market regime for regime-adaptive weighting
            gb_predictions: External gradient boosting predictions
            method: Override ensemble method

        Returns:
            EnsembleOutput with predictions and uncertainty
        """
        method = method or self.ensemble_method
        batch_size = temporal_features.shape[0]

        # Collect predictions from each model
        predictions = {}
        uncertainties = {}

        # LSTM prediction
        if 'lstm' in self.models:
            lstm_pred = self._predict_lstm(temporal_features)
            predictions['lstm'] = lstm_pred['mean']
            uncertainties['lstm'] = lstm_pred.get('std', np.ones(batch_size) * 0.5)

        # TFT prediction
        if 'tft' in self.models:
            tft_pred = self._predict_tft(temporal_features, static_features)
            predictions['tft'] = tft_pred['mean']
            uncertainties['tft'] = tft_pred.get('std', np.ones(batch_size) * 0.5)

        # Gradient boosting - use internal models or external predictions
        if gb_predictions is not None:
            predictions['gb'] = gb_predictions
            uncertainties['gb'] = np.ones(batch_size) * 0.5  # Default uncertainty
        elif hasattr(self, 'gb_models') and self.gb_models is not None:
            try:
                gb_pred = self._predict_gb(temporal_features)
                if gb_pred is not None:
                    predictions['gb'] = gb_pred['prediction']
                    uncertainties['gb'] = gb_pred.get('uncertainty', np.ones(batch_size) * 0.5)
            except Exception as e:
                print(f"GB prediction failed: {e}")

        if len(predictions) == 0:
            # No models available - return neutral
            return EnsembleOutput(
                prediction=np.zeros(batch_size),
                uncertainty=np.ones(batch_size),
                epistemic_uncertainty=np.ones(batch_size),
                aleatoric_uncertainty=np.ones(batch_size),
                model_predictions={},
                model_weights={},
                confidence=np.zeros(batch_size)
            )

        # Combine predictions based on method
        if method == 'simple':
            combined, weights = self._simple_average(predictions)
        elif method == 'uncertainty_weighted':
            combined, weights = self._uncertainty_weighted(predictions, uncertainties)
        elif method == 'regime_adaptive':
            combined, weights = self._regime_adaptive(predictions, regime)
        elif method == 'stacked' and self.meta_learner is not None:
            combined, weights = self._stacked(predictions)
        else:
            # Default to uncertainty-weighted
            combined, weights = self._uncertainty_weighted(predictions, uncertainties)

        # Calculate uncertainties
        epistemic = self._calculate_epistemic_uncertainty(predictions)
        aleatoric = self._calculate_aleatoric_uncertainty(uncertainties, weights)
        total_uncertainty = np.sqrt(epistemic ** 2 + aleatoric ** 2)

        # Confidence score (0-1)
        confidence = np.clip(1 - total_uncertainty, 0.1, 0.9)

        return EnsembleOutput(
            prediction=combined,
            uncertainty=total_uncertainty,
            epistemic_uncertainty=epistemic,
            aleatoric_uncertainty=aleatoric,
            model_predictions=predictions,
            model_weights=weights,
            confidence=confidence
        )

    def _predict_lstm(self, temporal_features: np.ndarray) -> Dict[str, np.ndarray]:
        """Get LSTM predictions."""
        model = self.models['lstm']
        X = torch.FloatTensor(temporal_features).to(self.device)

        with torch.no_grad():
            output = model(X)
            return {
                'mean': output.prediction.cpu().numpy(),
                'std': torch.exp(0.5 * output.log_variance).cpu().numpy()
            }

    def _predict_gb(self, temporal_features: np.ndarray) -> Optional[Dict[str, np.ndarray]]:
        """
        Get gradient boosting predictions.

        GB models expect 2D input (samples, features) not sequences.
        We use the last timestep of each sequence as the feature vector.
        """
        if not hasattr(self, 'gb_models') or self.gb_models is None:
            return None

        # Use the last timestep of each sequence for GB
        # Shape: (batch, seq_len, features) -> (batch, features)
        X_flat = temporal_features[:, -1, :]

        try:
            result = self.gb_models.predict(X_flat, model_type='ensemble')
            return {
                'prediction': result['prediction'],
                'uncertainty': result['uncertainty']
            }
        except Exception as e:
            print(f"GB prediction error: {e}")
            return None

    def _predict_tft(
        self,
        temporal_features: np.ndarray,
        static_features: Optional[np.ndarray]
    ) -> Dict[str, np.ndarray]:
        """Get TFT predictions."""
        model = self.models['tft']

        # TFT expects fewer temporal features (40) - slice if needed
        tft_config = self.model_configs.get('tft', {})
        num_temporal = tft_config.get('num_time_varying_features', 40)

        if temporal_features.shape[2] > num_temporal:
            temporal = temporal_features[:, :, :num_temporal]
        else:
            # Pad if needed
            pad_size = num_temporal - temporal_features.shape[2]
            temporal = np.pad(
                temporal_features,
                ((0, 0), (0, 0), (0, pad_size)),
                mode='constant'
            )

        X_temporal = torch.FloatTensor(temporal).to(self.device)

        if static_features is not None:
            num_static = tft_config.get('num_static_features', 5)
            if static_features.shape[1] > num_static:
                static = static_features[:, :num_static]
            else:
                pad_size = num_static - static_features.shape[1]
                static = np.pad(
                    static_features,
                    ((0, 0), (0, pad_size)),
                    mode='constant'
                )
            X_static = torch.FloatTensor(static).to(self.device)
        else:
            X_static = None

        result = model.predict(X_temporal, X_static, return_all_quantiles=True)
        return result

    def _simple_average(
        self,
        predictions: Dict[str, np.ndarray]
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """Simple average of all predictions."""
        arrays = list(predictions.values())
        combined = np.mean(arrays, axis=0)

        weights = {k: 1.0 / len(predictions) for k in predictions}
        return combined, weights

    def _uncertainty_weighted(
        self,
        predictions: Dict[str, np.ndarray],
        uncertainties: Dict[str, np.ndarray]
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Inverse variance weighting.

        Models with lower uncertainty get higher weight.
        """
        # Calculate precision (inverse variance) for each model
        precisions = {}
        for name, uncertainty in uncertainties.items():
            if name in predictions:
                precisions[name] = 1.0 / (uncertainty ** 2 + 1e-8)

        # Normalize weights
        total_precision = sum(np.mean(p) for p in precisions.values())
        weights = {
            name: np.mean(prec) / total_precision
            for name, prec in precisions.items()
        }

        # Weighted combination (element-wise for proper uncertainty handling)
        combined = np.zeros_like(list(predictions.values())[0])
        for name, pred in predictions.items():
            if name in precisions:
                # Use per-sample precision
                combined += pred * precisions[name]

        # Normalize by total precision
        total_prec_per_sample = sum(precisions.values())
        combined = combined / total_prec_per_sample

        return combined, weights

    def _regime_adaptive(
        self,
        predictions: Dict[str, np.ndarray],
        regime: str
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Use regime-specific weights.
        """
        regime = regime.lower()
        if regime not in self.regime_weights:
            regime = 'default'

        weights = self.regime_weights[regime]

        # Filter to available models
        available_weights = {
            k: v for k, v in weights.items()
            if k in predictions
        }

        # Renormalize
        total = sum(available_weights.values())
        if total > 0:
            available_weights = {k: v / total for k, v in available_weights.items()}

        # Combine
        combined = np.zeros_like(list(predictions.values())[0])
        for name, pred in predictions.items():
            if name in available_weights:
                combined += pred * available_weights[name]

        return combined, available_weights

    def _stacked(
        self,
        predictions: Dict[str, np.ndarray]
    ) -> Tuple[np.ndarray, Dict[str, float]]:
        """
        Use meta-learner to combine predictions.
        """
        if self.meta_learner is None:
            return self._simple_average(predictions)

        # Stack predictions as features for meta-learner
        features = np.column_stack(list(predictions.values()))
        combined = self.meta_learner.predict(features)

        # Meta-learner doesn't provide explicit weights
        weights = {k: 0.0 for k in predictions}
        return combined, weights

    def _calculate_epistemic_uncertainty(
        self,
        predictions: Dict[str, np.ndarray]
    ) -> np.ndarray:
        """
        Calculate epistemic uncertainty as model disagreement.

        Higher disagreement = higher uncertainty about true value.
        """
        if len(predictions) < 2:
            return np.zeros(list(predictions.values())[0].shape)

        arrays = np.array(list(predictions.values()))
        return np.std(arrays, axis=0)

    def _calculate_aleatoric_uncertainty(
        self,
        uncertainties: Dict[str, np.ndarray],
        weights: Dict[str, float]
    ) -> np.ndarray:
        """
        Calculate weighted average aleatoric uncertainty.
        """
        if len(uncertainties) == 0:
            return np.ones(1)

        # Weighted average of variances
        weighted_var = np.zeros_like(list(uncertainties.values())[0])
        for name, unc in uncertainties.items():
            w = weights.get(name, 0)
            weighted_var += w * (unc ** 2)

        return np.sqrt(weighted_var)

    def train_meta_learner(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        static_train: Optional[np.ndarray] = None
    ):
        """
        Train a meta-learner for stacking.

        Args:
            X_train: Training temporal features
            y_train: Training targets
            static_train: Static features
        """
        from sklearn.linear_model import Ridge

        # Get predictions from each model
        predictions = {}

        if 'lstm' in self.models:
            lstm_pred = self._predict_lstm(X_train)
            predictions['lstm'] = lstm_pred['mean']

        if 'tft' in self.models:
            tft_pred = self._predict_tft(X_train, static_train)
            predictions['tft'] = tft_pred['mean']

        if len(predictions) < 2:
            print("Need at least 2 models for stacking")
            return

        # Stack as features
        meta_features = np.column_stack(list(predictions.values()))

        # Train simple Ridge regression as meta-learner
        self.meta_learner = Ridge(alpha=1.0)
        self.meta_learner.fit(meta_features, y_train)

        print(f"Meta-learner trained on {len(predictions)} models")
        print(f"Coefficients: {dict(zip(predictions.keys(), self.meta_learner.coef_))}")

    def get_model_summary(self) -> Dict:
        """Get summary of loaded models."""
        summary = {
            'models_loaded': list(self.models.keys()),
            'num_models': len(self.models),
            'ensemble_method': self.ensemble_method,
            'model_metrics': {},
            'model_configs': {}
        }

        for name, metrics in self.model_metrics.items():
            summary['model_metrics'][name] = {
                'ic': metrics.get('ic', 'N/A'),
                'sharpe': metrics.get('sharpe', 'N/A'),
                'direction_accuracy': metrics.get('direction_accuracy', 'N/A')
            }

        for name, config in self.model_configs.items():
            summary['model_configs'][name] = {
                'hidden_size': config.get('hidden_size', 'N/A'),
                'num_layers': config.get('num_layers', 'N/A')
            }

        return summary

    def save_ensemble_config(self, path: Optional[Path] = None):
        """Save ensemble configuration."""
        if path is None:
            path = self.checkpoint_dir / 'ensemble_config.json'

        config = {
            'ensemble_method': self.ensemble_method,
            'regime_weights': self.regime_weights,
            'models': list(self.models.keys()),
            'model_configs': {k: str(v) for k, v in self.model_configs.items()}
        }

        with open(path, 'w') as f:
            json.dump(config, f, indent=2, default=str)

        print(f"Ensemble config saved to {path}")


def create_ensemble(checkpoint_dir: Optional[str] = None) -> DeepEnsemble:
    """
    Factory function to create and load ensemble.

    Entry point from Node.js bridge.
    """
    dir_path = Path(checkpoint_dir) if checkpoint_dir else CHECKPOINT_DIR
    ensemble = DeepEnsemble(checkpoint_dir=dir_path)
    ensemble.load_models()
    return ensemble


def ensemble_predict(
    temporal_features: np.ndarray,
    static_features: Optional[np.ndarray] = None,
    regime: str = 'default',
    gb_predictions: Optional[np.ndarray] = None,
    checkpoint_dir: Optional[str] = None
) -> Dict:
    """
    Entry point for ensemble predictions from Node.js bridge.

    Returns dict with predictions and metadata.
    """
    ensemble = create_ensemble(checkpoint_dir)
    output = ensemble.predict(
        temporal_features=temporal_features,
        static_features=static_features,
        regime=regime,
        gb_predictions=gb_predictions
    )

    return {
        'prediction': output.prediction.tolist(),
        'uncertainty': output.uncertainty.tolist(),
        'confidence': output.confidence.tolist(),
        'model_weights': output.model_weights,
        'epistemic_uncertainty': output.epistemic_uncertainty.tolist(),
        'aleatoric_uncertainty': output.aleatoric_uncertainty.tolist()
    }


# Quick test
if __name__ == '__main__':
    print("Testing Deep Ensemble...")

    ensemble = DeepEnsemble()

    # Try to load models
    results = ensemble.load_models()
    print(f"Model loading results: {results}")

    # Test with synthetic data
    batch_size = 4
    seq_len = 60
    temporal = np.random.randn(batch_size, seq_len, 45).astype(np.float32)
    static = np.random.randn(batch_size, 5).astype(np.float32)

    # Test prediction (will use whatever models are available)
    output = ensemble.predict(temporal, static)

    print(f"\nPrediction shape: {output.prediction.shape}")
    print(f"Uncertainty shape: {output.uncertainty.shape}")
    print(f"Model weights: {output.model_weights}")
    print(f"Confidence: {output.confidence}")

    # Summary
    summary = ensemble.get_model_summary()
    print(f"\nEnsemble summary:")
    print(f"  Models loaded: {summary['models_loaded']}")
    print(f"  Method: {summary['ensemble_method']}")

    print("\nDeep Ensemble test complete!")
