# python/models/serve.py
# Inference server for stock prediction models

import torch
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union
from pathlib import Path
from datetime import datetime
import json
import warnings

# Handle both relative imports (when run as module) and absolute imports (when run as script)
try:
    from .config import CHECKPOINT_DIR, DATABASE_PATH, ModelConfig
    from .feature_engine import FeatureEngine
    from .stock_lstm import StockLSTM
except ImportError:
    from config import CHECKPOINT_DIR, DATABASE_PATH, ModelConfig
    from feature_engine import FeatureEngine
    from stock_lstm import StockLSTM


class ModelServer:
    """
    Serves predictions from trained models.

    Features:
    - Loads and caches models
    - Handles feature preparation
    - Batched predictions
    - Uncertainty estimates
    - Graceful error handling
    """

    def __init__(
        self,
        checkpoint_dir: Path = CHECKPOINT_DIR,
        device: Optional[str] = None
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.feature_engine = FeatureEngine()

        # Device selection
        if device:
            self.device = torch.device(device)
        elif torch.cuda.is_available():
            self.device = torch.device('cuda')
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            self.device = torch.device('mps')
        else:
            self.device = torch.device('cpu')

        # Model cache
        self.models: Dict[str, torch.nn.Module] = {}
        self.model_configs: Dict[str, Dict] = {}

        # Feature cache (expensive to compute)
        self.feature_cache: Dict[str, pd.DataFrame] = {}
        self.cache_ttl = 3600  # 1 hour

    def load_model(self, model_name: str = 'latest') -> torch.nn.Module:
        """Load a trained model."""
        if model_name in self.models:
            return self.models[model_name]

        # Find model file
        if model_name == 'latest':
            model_files = list(self.checkpoint_dir.glob('*.pt'))
            if not model_files:
                raise FileNotFoundError(f"No models found in {self.checkpoint_dir}")
            model_path = max(model_files, key=lambda p: p.stat().st_mtime)
        else:
            model_path = self.checkpoint_dir / f"{model_name}.pt"
            if not model_path.exists():
                raise FileNotFoundError(f"Model not found: {model_path}")

        print(f"Loading model: {model_path}")

        # Load checkpoint
        checkpoint = torch.load(model_path, map_location=self.device)

        # Get config
        config_dict = checkpoint.get('config', {})
        self.model_configs[model_name] = config_dict

        # Create model
        model = StockLSTM(
            input_size=config_dict.get('input_size', 45),
            hidden_size=config_dict.get('hidden_size', 128),
            num_layers=config_dict.get('num_layers', 2),
            dropout=0,  # No dropout for inference
            output_uncertainty=config_dict.get('output_uncertainty', True)
        )

        # Load weights
        model.load_state_dict(checkpoint['model_state_dict'])
        model.to(self.device)
        model.eval()

        self.models[model_name] = model
        return model

    def predict(
        self,
        symbols: Union[str, List[str]],
        as_of_date: str,
        model_name: str = 'latest',
        return_uncertainty: bool = True,
        return_attributions: bool = False
    ) -> Dict[str, Dict]:
        """
        Make predictions for given symbols.

        Args:
            symbols: Stock symbol(s)
            as_of_date: Date for prediction (YYYY-MM-DD)
            model_name: Which model to use
            return_uncertainty: Include uncertainty estimates
            return_attributions: Include feature attributions

        Returns:
            Dictionary mapping symbol to prediction results
        """
        if isinstance(symbols, str):
            symbols = [symbols]

        # Load model
        model = self.load_model(model_name)
        config = self.model_configs.get(model_name, {})
        seq_len = config.get('sequence_length', 60)

        # Prepare features
        features = self._prepare_features(symbols, as_of_date, seq_len)

        results = {}

        for symbol in symbols:
            if symbol not in features:
                results[symbol] = {
                    'expected_return': 0.0,
                    'uncertainty': 1.0,
                    'confidence': 0.0,
                    'model_type': 'none',
                    'error': 'Insufficient data'
                }
                continue

            # Get sequence
            X = features[symbol]  # (1, seq_len, n_features)
            X_tensor = torch.FloatTensor(X).to(self.device)

            with torch.no_grad():
                output = model(X_tensor, return_attention=return_attributions)

                prediction = output.prediction.cpu().numpy()[0]
                std = np.exp(0.5 * output.log_variance.cpu().numpy()[0])

                result = {
                    'expected_return': float(prediction),
                    'uncertainty': float(std),
                    'confidence': float(max(0, min(1, 1 - std))),
                    'model_type': 'lstm'
                }

                if return_attributions and output.attention_weights is not None:
                    # Attention weights show which timesteps are important
                    result['temporal_attention'] = output.attention_weights.cpu().numpy()[0].tolist()

                results[symbol] = result

        return results

    def _prepare_features(
        self,
        symbols: List[str],
        as_of_date: str,
        seq_len: int
    ) -> Dict[str, np.ndarray]:
        """
        Prepare features for prediction.

        Returns dictionary mapping symbol to feature array.
        """
        # Calculate date range needed
        end_date = as_of_date
        # Need seq_len trading days + buffer
        start_date = pd.Timestamp(as_of_date) - pd.Timedelta(days=seq_len * 2)
        start_date = start_date.strftime('%Y-%m-%d')

        # Load raw data
        try:
            df = self.feature_engine.load_raw_data(
                symbols=symbols,
                start_date=start_date,
                end_date=end_date
            )
        except Exception as e:
            warnings.warn(f"Failed to load data: {e}")
            return {}

        if df.empty:
            return {}

        # Calculate derived features
        df = self.feature_engine.calculate_derived_features(df)
        df = self.feature_engine.handle_missing_values(df)
        df = self.feature_engine.winsorize_outliers(df)
        df = self.feature_engine.normalize_features(df, fit=True)

        # Extract sequences
        features = {}
        exclude_cols = ['symbol', 'date', 'forward_return_21d']
        feature_cols = [c for c in df.columns if c not in exclude_cols
                       and df[c].dtype in [np.float64, np.float32, np.int64]]

        for symbol in symbols:
            symbol_df = df[df['symbol'] == symbol].sort_values('date')

            if len(symbol_df) < seq_len:
                continue

            # Take last seq_len rows
            seq_df = symbol_df.tail(seq_len)
            X = seq_df[feature_cols].values

            # Reshape to (1, seq_len, n_features)
            features[symbol] = X.reshape(1, seq_len, -1)

        return features

    def get_available_models(self) -> List[Dict]:
        """Get list of available models."""
        models = []
        for path in self.checkpoint_dir.glob('*.pt'):
            try:
                checkpoint = torch.load(path, map_location='cpu')
                models.append({
                    'name': path.stem,
                    'path': str(path),
                    'config': checkpoint.get('config', {}),
                    'metrics': checkpoint.get('metrics', {}),
                    'timestamp': checkpoint.get('timestamp', 'unknown')
                })
            except Exception as e:
                warnings.warn(f"Failed to load model info: {path}: {e}")

        return sorted(models, key=lambda m: m.get('timestamp', ''), reverse=True)

    def get_model_metrics(self, model_name: str = 'latest') -> Optional[Dict]:
        """Get metrics for a specific model."""
        if model_name == 'latest':
            models = self.get_available_models()
            if not models:
                return None
            return models[0].get('metrics')

        model_path = self.checkpoint_dir / f"{model_name}.pt"
        if not model_path.exists():
            return None

        checkpoint = torch.load(model_path, map_location='cpu')
        return checkpoint.get('metrics')


# Global server instance
_server: Optional[ModelServer] = None


def get_server() -> ModelServer:
    """Get or create the model server singleton."""
    global _server
    if _server is None:
        _server = ModelServer()
    return _server


def predict_batch(
    symbols: List[str],
    as_of_date: str,
    model_type: str = 'ensemble',
    return_uncertainty: bool = True,
    return_attributions: bool = False
) -> Dict[str, Dict]:
    """
    Entry point for batch predictions from Node.js bridge.

    Args:
        symbols: List of stock symbols
        as_of_date: Prediction date
        model_type: 'lstm', 'transformer', or 'ensemble'
        return_uncertainty: Include uncertainty estimates
        return_attributions: Include feature attributions

    Returns:
        Dictionary mapping symbol to prediction results
    """
    server = get_server()

    try:
        # For now, we only have LSTM
        # Later: add transformer and ensemble logic
        model_name = 'latest'

        return server.predict(
            symbols=symbols,
            as_of_date=as_of_date,
            model_name=model_name,
            return_uncertainty=return_uncertainty,
            return_attributions=return_attributions
        )

    except FileNotFoundError:
        # No trained model - return neutral predictions
        return {
            symbol: {
                'expected_return': 0.0,
                'uncertainty': 1.0,
                'confidence': 0.0,
                'model_type': 'none',
                'error': 'No trained model available'
            }
            for symbol in symbols
        }

    except Exception as e:
        # Error - return error for all symbols
        return {
            symbol: {
                'expected_return': 0.0,
                'uncertainty': 1.0,
                'confidence': 0.0,
                'model_type': 'none',
                'error': str(e)
            }
            for symbol in symbols
        }


def get_model_metrics(checkpoint_dir: Optional[str] = None) -> Dict:
    """
    Get metrics for all available models.

    Entry point from Node.js bridge.
    """
    if checkpoint_dir:
        server = ModelServer(checkpoint_dir=Path(checkpoint_dir))
    else:
        server = get_server()

    models = server.get_available_models()

    return {
        'models': models,
        'count': len(models),
        'latest': models[0] if models else None
    }


# Quick test
if __name__ == '__main__':
    print("Testing ModelServer...")

    server = ModelServer()

    # List available models
    models = server.get_available_models()
    print(f"Available models: {len(models)}")

    if models:
        for m in models[:3]:
            print(f"  - {m['name']}: {m.get('timestamp', 'unknown')}")

        # Test prediction
        result = server.predict(
            symbols=['AAPL', 'MSFT'],
            as_of_date='2024-01-15'
        )
        print(f"\nPredictions:")
        for symbol, pred in result.items():
            print(f"  {symbol}: return={pred['expected_return']:.4f}, "
                  f"uncertainty={pred['uncertainty']:.4f}")
    else:
        print("No models found - train a model first")

    print("\nServer test complete")
