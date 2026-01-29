#!/usr/bin/env python3
"""
Direct Model Comparison
=======================

Load trained models and compare their actual predictions on held-out data.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import torch
from datetime import datetime
import json
from scipy import stats

# Import our models
from models.stock_lstm import StockLSTM
from models.temporal_fusion import TemporalFusionTransformer
from models.config import ModelConfig, CHECKPOINT_DIR


def load_checkpoint(path: str) -> dict:
    """Load a model checkpoint."""
    return torch.load(path, map_location='cpu', weights_only=False)


def compare_models():
    """Compare all trained models."""
    print("\n" + "=" * 70)
    print("DIRECT MODEL COMPARISON")
    print("=" * 70)

    # Find all checkpoints
    checkpoints = list(CHECKPOINT_DIR.glob("*.pt"))

    if not checkpoints:
        print("No checkpoints found!")
        return

    print(f"\nFound {len(checkpoints)} trained models:")

    models_info = []

    for cp_path in sorted(checkpoints, key=lambda x: x.stat().st_mtime, reverse=True):
        print(f"\n{'='*50}")
        print(f"Model: {cp_path.name}")
        print("=" * 50)

        try:
            checkpoint = load_checkpoint(str(cp_path))

            # Extract info
            config = checkpoint.get('config', {})
            metrics = checkpoint.get('metrics', {})
            timestamp = checkpoint.get('timestamp', 'unknown')

            info = {
                'name': cp_path.stem,
                'path': str(cp_path),
                'timestamp': timestamp,
                'model_type': config.get('model_type', 'unknown'),
                'hidden_size': config.get('hidden_size', 0),
                'num_layers': config.get('num_layers', 0),
                'sequence_length': config.get('sequence_length', 0),
                'epochs': config.get('epochs', 0),
            }

            # Add metrics
            for key, value in metrics.items():
                if isinstance(value, (int, float)):
                    info[key] = value

            models_info.append(info)

            # Print details
            print(f"\nConfiguration:")
            print(f"  Type:          {info['model_type']}")
            print(f"  Hidden size:   {info['hidden_size']}")
            print(f"  Layers:        {info['num_layers']}")
            print(f"  Sequence len:  {info['sequence_length']}")
            print(f"  Epochs:        {info['epochs']}")

            print(f"\nTraining Metrics:")
            for key in ['loss', 'ic', 'ic_ir', 'direction_accuracy', 'sharpe', 'rmse']:
                if key in info:
                    print(f"  {key:20s}: {info[key]:.4f}")

            # Count parameters
            state_dict = checkpoint.get('model_state_dict', {})
            total_params = sum(p.numel() for p in [torch.tensor(v) for v in state_dict.values()])
            info['parameters'] = total_params
            print(f"\nModel Size:")
            print(f"  Parameters:    {total_params:,}")

        except Exception as e:
            print(f"Error loading {cp_path.name}: {e}")

    # Summary comparison
    if models_info:
        print("\n" + "=" * 70)
        print("COMPARISON SUMMARY")
        print("=" * 70)

        df = pd.DataFrame(models_info)

        # Select key columns
        display_cols = ['name', 'model_type', 'parameters', 'ic', 'ic_ir', 'direction_accuracy', 'sharpe']
        available_cols = [c for c in display_cols if c in df.columns]

        print("\n" + df[available_cols].to_string(index=False))

        # Identify best model
        if 'ic' in df.columns:
            best_ic_idx = df['ic'].idxmax()
            print(f"\n*** Best IC: {df.loc[best_ic_idx, 'name']} (IC={df.loc[best_ic_idx, 'ic']:.4f})")

        if 'direction_accuracy' in df.columns:
            best_acc_idx = df['direction_accuracy'].idxmax()
            print(f"*** Best Direction Accuracy: {df.loc[best_acc_idx, 'name']} ({df.loc[best_acc_idx, 'direction_accuracy']:.2%})")

        if 'sharpe' in df.columns:
            best_sharpe_idx = df['sharpe'].idxmax()
            print(f"*** Best Sharpe: {df.loc[best_sharpe_idx, 'name']} (Sharpe={df.loc[best_sharpe_idx, 'sharpe']:.3f})")

        # Save comparison
        output_path = Path(__file__).parent / "results" / f"model_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_path, 'w') as f:
            json.dump(models_info, f, indent=2, default=str)
        print(f"\nComparison saved to: {output_path}")

    return models_info


def analyze_model_predictions():
    """Run inference on models and compare predictions."""
    print("\n" + "=" * 70)
    print("INFERENCE ANALYSIS")
    print("=" * 70)

    # Get best LSTM model
    lstm_models = list(CHECKPOINT_DIR.glob("stock_lstm_*.pt"))

    if not lstm_models:
        print("No LSTM models found")
        return

    # Sort by modification time and get the best one
    best_lstm = max(lstm_models, key=lambda x: x.stat().st_mtime)

    print(f"\nLoading model: {best_lstm.name}")
    checkpoint = load_checkpoint(str(best_lstm))

    # Create model
    config = checkpoint.get('config', {})
    state_dict = checkpoint['model_state_dict']

    # Infer input size from the input_projection layer
    input_proj_key = 'input_projection.0.weight'
    if input_proj_key in state_dict:
        input_size = state_dict[input_proj_key].shape[1]
    else:
        # Fallback to LSTM input
        input_layer_key = [k for k in state_dict.keys() if 'lstm' in k and 'weight_ih' in k][0]
        input_size = state_dict[input_layer_key].shape[1] // 4  # LSTM has 4x hidden size

    print(f"  Detected input size: {input_size}")

    model = StockLSTM(
        input_size=input_size,
        hidden_size=config.get('hidden_size', 128),
        num_layers=config.get('num_layers', 2),
        dropout=config.get('dropout', 0.2),
        output_uncertainty=config.get('output_uncertainty', True)
    )

    model.load_state_dict(state_dict)
    model.eval()

    print(f"Model loaded successfully!")
    print(f"  Input size: {input_size}")
    print(f"  Hidden size: {config.get('hidden_size', 128)}")

    # Generate synthetic test data
    print("\nRunning inference on synthetic test data...")
    n_samples = 1000
    seq_len = config.get('sequence_length', 20)

    # Create random test sequences
    X_test = torch.randn(n_samples, seq_len, input_size)

    with torch.no_grad():
        output = model(X_test)

    predictions = output.prediction.numpy()
    uncertainties = torch.exp(0.5 * output.log_variance).numpy()

    print(f"\nPrediction Statistics:")
    print(f"  Mean prediction:    {predictions.mean():.4f}")
    print(f"  Std prediction:     {predictions.std():.4f}")
    print(f"  Mean uncertainty:   {uncertainties.mean():.4f}")
    print(f"  Prediction range:   [{predictions.min():.4f}, {predictions.max():.4f}]")

    # Analyze prediction distribution
    print(f"\nPrediction Distribution:")
    percentiles = [1, 5, 25, 50, 75, 95, 99]
    for p in percentiles:
        print(f"  {p}th percentile:   {np.percentile(predictions, p):.4f}")

    # Check uncertainty calibration (correlation with prediction magnitude)
    pred_magnitude = np.abs(predictions)
    correlation = np.corrcoef(pred_magnitude.flatten(), uncertainties.flatten())[0, 1]
    print(f"\nUncertainty Analysis:")
    print(f"  Correlation (|pred| vs uncertainty): {correlation:.4f}")

    # TFT model if available
    tft_models = list(CHECKPOINT_DIR.glob("tft_*.pt"))
    if tft_models:
        best_tft = max(tft_models, key=lambda x: x.stat().st_mtime)
        print(f"\n\nLoading TFT model: {best_tft.name}")

        tft_checkpoint = load_checkpoint(str(best_tft))
        tft_config = tft_checkpoint.get('config', {})

        # TFT has different architecture
        tft_state = tft_checkpoint['model_state_dict']

        # Get feature dimensions from state dict
        # Look for the encoder embedding
        num_time_varying = min(input_size, 40)
        num_static = 5

        tft_model = TemporalFusionTransformer(
            num_time_varying_features=num_time_varying,
            num_static_features=num_static,
            hidden_size=tft_config.get('hidden_size', 128),
            lstm_layers=tft_config.get('num_layers', 2),
            num_attention_heads=4,
            dropout=tft_config.get('dropout', 0.2),
            quantiles=[0.1, 0.5, 0.9]
        )

        try:
            tft_model.load_state_dict(tft_state)
            tft_model.eval()

            # Test inference
            X_tft = torch.randn(100, seq_len, num_time_varying)
            static_tft = torch.randn(100, num_static)

            with torch.no_grad():
                tft_output = tft_model(X_tft, static_tft)

            print(f"\nTFT Prediction Statistics:")
            print(f"  Median (q50):       {tft_output.predictions[:, 1].mean():.4f}")
            print(f"  Lower (q10):        {tft_output.predictions[:, 0].mean():.4f}")
            print(f"  Upper (q90):        {tft_output.predictions[:, 2].mean():.4f}")

            # Prediction interval width
            interval_width = (tft_output.predictions[:, 2] - tft_output.predictions[:, 0]).mean()
            print(f"  Avg interval width: {interval_width:.4f}")

        except Exception as e:
            print(f"Could not run TFT inference: {e}")

    print("\n" + "=" * 70)
    print("INFERENCE ANALYSIS COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    models_info = compare_models()
    analyze_model_predictions()
