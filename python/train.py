#!/usr/bin/env python3
# python/train.py
# Training script for deep learning stock prediction models

import argparse
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

# Add models to path
sys.path.insert(0, str(Path(__file__).parent))

from models.config import ModelConfig, CHECKPOINT_DIR, DATABASE_PATH
from models.trainer import ModelTrainer, train_model
from models.feature_engine import FeatureEngine


def register_model_with_api(api_url, model_name, model_type, result, config,
                            start_date, end_date, auto_promote=False, verbose=False):
    """
    Register trained model with the Node.js MLOps API.

    Args:
        api_url: Base URL of the API server
        model_name: Name for the model in registry
        model_type: Type of model (lstm, tft, etc.)
        result: Training result object
        config: Model configuration
        start_date: Training start date
        end_date: Training end date
        auto_promote: Whether to attempt auto-promotion
        verbose: Print detailed output

    Returns:
        dict: API response or None on failure
    """
    # Generate version string
    version = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Extract metrics from result
    metrics = {}
    if result.final_metrics:
        metrics = {
            'ic': result.final_metrics.get('ic'),
            'direction_accuracy': result.final_metrics.get('direction_accuracy'),
            'rmse': result.final_metrics.get('rmse'),
            'mae': result.final_metrics.get('mae'),
            'calibration': result.final_metrics.get('calibration'),
            'train_loss': result.final_metrics.get('train_loss'),
            'test_loss': result.final_metrics.get('test_loss', result.best_val_loss),
        }

        # Calculate walk-forward efficiency if available
        if result.walk_forward_results:
            train_ic = result.final_metrics.get('train_ic', 0)
            test_ic = result.final_metrics.get('ic', 0)
            if train_ic and train_ic > 0:
                metrics['walk_forward_efficiency'] = test_ic / train_ic

            # Average metrics across folds
            fold_ics = [f['metrics'].get('ic', 0) for f in result.walk_forward_results]
            fold_dirs = [f['metrics'].get('direction_accuracy', 0) for f in result.walk_forward_results]
            if fold_ics:
                import statistics
                metrics['ic_mean'] = statistics.mean(fold_ics)
                metrics['ic_std'] = statistics.stdev(fold_ics) if len(fold_ics) > 1 else 0
                metrics['icir'] = metrics['ic_mean'] / metrics['ic_std'] if metrics['ic_std'] > 0 else 0
            if fold_dirs:
                metrics['direction_accuracy_mean'] = statistics.mean(fold_dirs)

    # Build registration payload
    payload = {
        'model_name': model_name,
        'version': version,
        'model_type': model_type,
        'checkpoint_path': result.model_path,
        'training_time': result.training_time_seconds,
        'metrics': metrics,
        'config': config.to_dict() if hasattr(config, 'to_dict') else {},
        'validation_period': {
            'start': start_date,
            'end': end_date or datetime.now().strftime('%Y-%m-%d')
        },
        'auto_promote': auto_promote
    }

    # Send to webhook endpoint
    url = f"{api_url}/api/mlops/training/webhook"
    data = {
        'event': 'training_completed',
        'model_name': model_name,
        'model_type': model_type,
        'checkpoint_path': result.model_path,
        'metrics': metrics,
        'config': payload['config'],
        'training_time': result.training_time_seconds,
        'auto_register': True,
        'auto_promote': auto_promote,
        'version': version,
        'validation_period': payload['validation_period']
    }

    try:
        if verbose:
            print(f"\nRegistering model with API: {url}")
            print(f"Payload: {json.dumps(data, indent=2, default=str)}")

        req = urllib.request.Request(
            url,
            data=json.dumps(data, default=str).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            response_data = json.loads(response.read().decode('utf-8'))

            if response_data.get('success'):
                print(f"\n[AUTO-REGISTER] Model registered successfully!")
                print(f"  Model: {model_name} v{version}")
                print(f"  Status: {response_data.get('data', {}).get('status', 'staged')}")

                registration = response_data.get('data', {}).get('registration', {})
                if registration:
                    print(f"  Registry ID: {registration.get('id')}")
                    if registration.get('promoted'):
                        print(f"  Auto-promoted to PRODUCTION")
                    else:
                        print(f"  Status: STAGED (pending promotion)")

                if response_data.get('data', {}).get('drift_reference_initialized'):
                    print(f"  Drift monitoring: Reference initialized")

                return response_data
            else:
                print(f"\n[AUTO-REGISTER] Registration failed: {response_data.get('error')}")
                return None

    except urllib.error.URLError as e:
        print(f"\n[AUTO-REGISTER] API connection error: {e}")
        print(f"  Make sure the Node.js server is running at {api_url}")
        return None
    except urllib.error.HTTPError as e:
        print(f"\n[AUTO-REGISTER] HTTP error {e.code}: {e.reason}")
        try:
            error_body = e.read().decode('utf-8')
            print(f"  Response: {error_body}")
        except:
            pass
        return None
    except Exception as e:
        print(f"\n[AUTO-REGISTER] Unexpected error: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description='Train deep learning models for stock return prediction',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  # Quick test training
  python train.py --quick

  # Full training with walk-forward validation
  python train.py --start-date 2015-01-01 --walk-forward

  # Train LSTM with specific config
  python train.py --model lstm --epochs 100 --batch-size 64

  # Train on specific symbols
  python train.py --symbols AAPL,MSFT,GOOGL

  # Check data availability
  python train.py --check-data

  # Train and auto-register with MLOps service
  python train.py --model lstm --walk-forward --auto-register

  # Train and auto-promote if validation passes
  python train.py --model lstm --walk-forward --auto-register --auto-promote

  # Train with custom model name and API URL
  python train.py --model tft --auto-register --model-name my_tft_v2 --api-url http://localhost:3001
        '''
    )

    # Model configuration
    parser.add_argument('--model', type=str, default='lstm',
                       choices=['lstm', 'tft', 'transformer', 'ensemble'],
                       help='Model type to train: lstm, tft (Temporal Fusion Transformer), transformer, ensemble (default: lstm)')
    parser.add_argument('--hidden-size', type=int, default=128,
                       help='Hidden layer size (default: 128)')
    parser.add_argument('--num-layers', type=int, default=2,
                       help='Number of layers (default: 2)')
    parser.add_argument('--dropout', type=float, default=0.2,
                       help='Dropout rate (default: 0.2)')
    parser.add_argument('--sequence-length', type=int, default=60,
                       help='Sequence length in trading days (default: 60)')

    # Training configuration
    parser.add_argument('--epochs', type=int, default=100,
                       help='Number of training epochs (default: 100)')
    parser.add_argument('--batch-size', type=int, default=64,
                       help='Batch size (default: 64)')
    parser.add_argument('--learning-rate', type=float, default=1e-4,
                       help='Learning rate (default: 0.0001)')
    parser.add_argument('--early-stopping', type=int, default=10,
                       help='Early stopping patience (default: 10)')

    # Data configuration
    parser.add_argument('--start-date', type=str, default='2015-01-01',
                       help='Training start date (default: 2015-01-01)')
    parser.add_argument('--end-date', type=str, default=None,
                       help='Training end date (default: latest)')
    parser.add_argument('--symbols', type=str, default=None,
                       help='Comma-separated list of symbols to train on')
    parser.add_argument('--max-symbols', type=int, default=500,
                       help='Maximum number of symbols (default: 500)')

    # Validation configuration
    parser.add_argument('--walk-forward', action='store_true',
                       help='Use walk-forward validation')
    parser.add_argument('--n-folds', type=int, default=5,
                       help='Number of walk-forward folds (default: 5)')

    # Auto-registration options
    parser.add_argument('--auto-register', action='store_true',
                       help='Automatically register model with MLOps service after training')
    parser.add_argument('--api-url', type=str, default='http://localhost:3001',
                       help='Node.js API server URL for auto-registration (default: http://localhost:3001)')
    parser.add_argument('--model-name', type=str, default=None,
                       help='Model name for registration (default: model type)')
    parser.add_argument('--auto-promote', action='store_true',
                       help='Attempt auto-promotion to production if validation passes')

    # Other options
    parser.add_argument('--quick', action='store_true',
                       help='Quick test with minimal epochs')
    parser.add_argument('--check-data', action='store_true',
                       help='Check data availability and exit')
    parser.add_argument('--verbose', action='store_true',
                       help='Verbose output')
    parser.add_argument('--output', type=str, default=None,
                       help='Output JSON file for results')

    args = parser.parse_args()

    # Quick mode overrides
    if args.quick:
        args.epochs = 5
        args.batch_size = 32
        args.max_symbols = 50
        args.n_folds = 2
        print("Quick mode: minimal training for testing")

    # Check data mode
    if args.check_data:
        check_data_availability()
        return

    # Parse symbols
    symbols = None
    if args.symbols:
        symbols = [s.strip() for s in args.symbols.split(',')]

    # Build config
    config = ModelConfig(
        model_type=args.model,
        hidden_size=args.hidden_size,
        num_layers=args.num_layers,
        dropout=args.dropout,
        sequence_length=args.sequence_length,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        early_stopping_patience=args.early_stopping
    )

    print("\n" + "=" * 60)
    print("DEEP LEARNING MODEL TRAINING")
    print("=" * 60)
    print(f"Model: {args.model}")
    print(f"Hidden size: {args.hidden_size}")
    print(f"Epochs: {args.epochs}")
    print(f"Date range: {args.start_date} to {args.end_date or 'latest'}")
    print(f"Walk-forward: {args.walk_forward}")
    if symbols:
        print(f"Symbols: {len(symbols)}")
    print("=" * 60 + "\n")

    # Create trainer and train
    trainer = ModelTrainer(config=config)

    try:
        result = trainer.train(
            symbols=symbols,
            start_date=args.start_date,
            end_date=args.end_date,
            walk_forward=args.walk_forward,
            n_folds=args.n_folds
        )

        # Print results
        print("\n" + "=" * 60)
        print("TRAINING RESULTS")
        print("=" * 60)
        print(f"Model saved: {result.model_path}")
        print(f"Best validation loss: {result.best_val_loss:.6f}")
        print(f"Training time: {result.training_time_seconds:.1f}s")

        if result.final_metrics:
            print("\nFinal Test Metrics:")
            for key, value in result.final_metrics.items():
                if isinstance(value, float):
                    print(f"  {key}: {value:.4f}")
                else:
                    print(f"  {key}: {value}")

        if result.walk_forward_results:
            print("\nWalk-Forward Results:")
            for fold in result.walk_forward_results:
                metrics = fold['metrics']
                print(f"  Fold {fold['fold']}: IC={metrics.get('ic', 0):.4f}, "
                      f"Dir Acc={metrics.get('direction_accuracy', 0):.2%}")

        print("=" * 60 + "\n")

        # Save to output file if specified
        if args.output:
            output_data = {
                'model_path': result.model_path,
                'best_val_loss': result.best_val_loss,
                'training_time_seconds': result.training_time_seconds,
                'final_metrics': result.final_metrics,
                'config': config.to_dict(),
                'timestamp': datetime.now().isoformat()
            }
            with open(args.output, 'w') as f:
                json.dump(output_data, f, indent=2, default=str)
            print(f"Results saved to: {args.output}")

        # Auto-register with MLOps API if requested
        if args.auto_register:
            model_name = args.model_name or args.model
            register_result = register_model_with_api(
                api_url=args.api_url,
                model_name=model_name,
                model_type=args.model,
                result=result,
                config=config,
                start_date=args.start_date,
                end_date=args.end_date,
                auto_promote=args.auto_promote,
                verbose=args.verbose
            )
            if register_result is None:
                print("\nWARNING: Model trained successfully but auto-registration failed")
                print("You can manually register using: POST /api/mlops/models/register")

        return 0

    except Exception as e:
        print(f"\nERROR: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        return 1


def check_data_availability():
    """Check data availability in the database."""
    print("\n" + "=" * 60)
    print("DATA AVAILABILITY CHECK")
    print("=" * 60)

    # Check database exists
    if not DATABASE_PATH.exists():
        print(f"ERROR: Database not found at {DATABASE_PATH}")
        return

    print(f"Database: {DATABASE_PATH}")

    # Initialize feature engine
    engine = FeatureEngine()

    # Get date range
    try:
        min_date, max_date = engine.get_date_range()
        print(f"Date range: {min_date} to {max_date}")
    except Exception as e:
        print(f"ERROR getting date range: {e}")
        return

    # Get symbols with sufficient history
    try:
        symbols_252 = engine.get_available_symbols(min_history_days=252)
        symbols_500 = engine.get_available_symbols(min_history_days=500)
        symbols_1000 = engine.get_available_symbols(min_history_days=1000)

        print(f"\nSymbols with sufficient history:")
        print(f"  252+ days (1 year): {len(symbols_252)}")
        print(f"  500+ days (2 years): {len(symbols_500)}")
        print(f"  1000+ days (4 years): {len(symbols_1000)}")
    except Exception as e:
        print(f"ERROR getting symbols: {e}")
        return

    # Try loading sample data
    print("\nSample data check:")
    try:
        sample_symbols = symbols_252[:5] if symbols_252 else []
        if sample_symbols:
            df = engine.load_raw_data(
                symbols=sample_symbols,
                start_date='2023-01-01',
                end_date='2024-01-01'
            )
            print(f"  Loaded {len(df):,} rows")
            print(f"  Columns: {len(df.columns)}")

            # Check for key columns
            key_cols = ['close', 'volume', 'pe_ratio', 'news_sentiment', 'value_score']
            for col in key_cols:
                if col in df.columns:
                    non_null = df[col].notna().sum()
                    print(f"  {col}: {non_null:,} non-null ({non_null/len(df)*100:.1f}%)")
        else:
            print("  No symbols with sufficient history")
    except Exception as e:
        print(f"ERROR loading sample data: {e}")

    print("\n" + "=" * 60)

    # Recommendations
    print("\nRecommendations:")
    if len(symbols_500) >= 100:
        print("  OK: Sufficient data for training")
        print(f"  Suggested command: python train.py --start-date 2020-01-01 --walk-forward")
    elif len(symbols_252) >= 50:
        print("  WARNING: Limited data - use shorter training period")
        print(f"  Suggested command: python train.py --start-date 2022-01-01 --epochs 50")
    else:
        print("  ERROR: Insufficient data for training")
        print("  Please run data fetching scripts first")

    print("=" * 60 + "\n")


if __name__ == '__main__':
    sys.exit(main())
