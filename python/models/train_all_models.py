# python/models/train_all_models.py
"""
Comprehensive training script for all ML models.

This script trains:
1. XGBoost model with Optuna hyperparameter tuning
2. LightGBM model with Optuna hyperparameter tuning
3. LSTM model with walk-forward validation
4. (Optional) TFT model

All models are saved to the checkpoints directory for use by the ensemble.

Usage:
    python train_all_models.py --start-date 2018-01-01 --end-date 2024-01-01
    python train_all_models.py --quick  # Quick training for testing
"""

import argparse
import time
from datetime import datetime
from pathlib import Path
import json
import sys

import numpy as np
import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.config import ModelConfig, CHECKPOINT_DIR
from models.feature_engine import FeatureEngine
from models.gradient_boosting import GradientBoostingModels, train_gradient_boosting
from models.trainer import ModelTrainer, train_model


def print_banner(title: str):
    """Print a formatted banner."""
    print("\n" + "=" * 70)
    print(f"  {title}")
    print("=" * 70 + "\n")


def train_gradient_boosting_models(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    feature_names: list,
    dates_train: np.ndarray = None,
    hp_search_trials: int = 50,
    use_optuna: bool = True,
    enable_p3: bool = False,  # P3: Enable feature selection and ensemble
    top_n_features: int = 100  # P3.3: Number of features to select
) -> dict:
    """
    Train XGBoost and LightGBM models with hyperparameter optimization.

    Args:
        dates_train: Optional array of dates for sample recency weighting.
                    More recent samples get higher weight.

    Returns dict with training results and saved model paths.
    """
    print_banner("GRADIENT BOOSTING TRAINING")

    results = {
        'xgboost': None,
        'lightgbm': None,
        'saved_paths': {}
    }

    gb = GradientBoostingModels(checkpoint_dir=CHECKPOINT_DIR)

    # ============================================
    # Sample Recency Weighting
    # ============================================
    # More recent samples are more relevant for predicting future returns.
    # We use exponential decay: weight = exp(-lambda * days_ago)
    sample_weights = None
    if dates_train is not None:
        try:
            # Convert to Series for consistent handling (dates_train may be Index or array)
            dates_series = pd.Series(dates_train)
            dates_numeric = pd.to_datetime(dates_series).astype(np.int64) // 10**9  # Convert to seconds
            max_date = dates_numeric.max()
            days_ago = (max_date - dates_numeric) / (24 * 3600)  # Convert to days

            # P1.4: Exponential decay with half-life of ~1.5 years (548 days)
            # Lambda = ln(2) / half_life = 0.693 / 548 ≈ 0.00126
            # This gives 2-3x weight to recent data vs 4+ year old data
            # Rationale: Recent market regimes are more predictive of near-future
            decay_lambda = 0.00126
            sample_weights = np.exp(-decay_lambda * days_ago).values  # Convert to numpy

            # Normalize to sum to n_samples (so effective sample size is preserved)
            sample_weights = sample_weights * len(sample_weights) / sample_weights.sum()

            print(f"Sample weighting: min={sample_weights.min():.3f}, max={sample_weights.max():.3f}")
            print(f"  Oldest samples weight: {sample_weights.min():.3f}x, newest: {sample_weights.max():.3f}x")
        except Exception as e:
            print(f"Warning: Could not compute sample weights: {e}")
            sample_weights = None

    # Flatten sequences for GB models with rolling statistics
    # Previously we used only the last timestep, losing 59 days of temporal info
    # Now we compute: [last_timestep_features, mean, std, trend_slope]
    # This gives GB models access to temporal patterns
    def flatten_with_rolling_stats(X: np.ndarray) -> np.ndarray:
        """
        Flatten sequences while preserving temporal information.

        For each feature, computes:
        - Last value (most recent)
        - Mean over sequence
        - Std over sequence (volatility)
        - Trend slope (linear regression coefficient)

        X shape: (samples, seq_len, features)
        Output: (samples, features * 4)
        """
        n_samples, seq_len, n_features = X.shape

        # Last timestep values
        last_values = X[:, -1, :]

        # Rolling mean
        mean_values = X.mean(axis=1)

        # Rolling std (volatility)
        std_values = X.std(axis=1)

        # Trend slope (approximate using first and last quartile means)
        first_quarter = X[:, :seq_len//4, :].mean(axis=1)
        last_quarter = X[:, -seq_len//4:, :].mean(axis=1)
        trend_values = (last_quarter - first_quarter) / (seq_len * 0.5)  # Normalized slope

        # Combine: [last, mean, std, trend] for each feature
        return np.concatenate([last_values, mean_values, std_values, trend_values], axis=1)

    X_train_flat = flatten_with_rolling_stats(X_train)
    X_val_flat = flatten_with_rolling_stats(X_val)

    # Update feature names to reflect the new structure
    feature_suffixes = ['_last', '_mean', '_std', '_trend']
    expanded_feature_names = []
    for suffix in feature_suffixes:
        expanded_feature_names.extend([f"{name}{suffix}" for name in feature_names])

    print(f"Training data shape: {X_train_flat.shape} (4x original features)")
    print(f"Validation data shape: {X_val_flat.shape}")
    print(f"Original features: {len(feature_names)}, Expanded: {len(expanded_feature_names)}")

    # Train XGBoost
    print("\n--- XGBoost ---")
    try:
        if hp_search_trials > 0:
            print(f"Running hyperparameter search ({hp_search_trials} trials)...")
            hp_result = gb.hyperparameter_search(
                X_train_flat, y_train,
                model_type='xgboost',
                n_iter=hp_search_trials,
                n_cv_splits=3,
                feature_names=expanded_feature_names,
                use_optuna=use_optuna
            )
            best_params = hp_result.best_params
            print(f"Best XGBoost params: {best_params}")
        else:
            best_params = None

        xgb_metrics = gb.train_xgboost(
            X_train_flat, y_train,
            X_val_flat, y_val,
            feature_names=expanded_feature_names,
            params=best_params,
            sample_weight=sample_weights
        )

        results['xgboost'] = {
            'ic': xgb_metrics.ic,
            'direction_accuracy': xgb_metrics.direction_accuracy,
            'rmse': xgb_metrics.rmse,
            'top_features': gb.get_top_features('xgboost', 10)
        }
        print(f"XGBoost IC: {xgb_metrics.ic:.4f}")
        print(f"XGBoost Direction Accuracy: {xgb_metrics.direction_accuracy:.2%}")

    except Exception as e:
        print(f"XGBoost training failed: {e}")
        results['xgboost'] = {'error': str(e)}

    # Train LightGBM
    print("\n--- LightGBM ---")
    try:
        if hp_search_trials > 0:
            print(f"Running hyperparameter search ({hp_search_trials} trials)...")
            hp_result = gb.hyperparameter_search(
                X_train_flat, y_train,
                model_type='lightgbm',
                n_iter=hp_search_trials,
                n_cv_splits=3,
                feature_names=expanded_feature_names,
                use_optuna=use_optuna
            )
            best_params = hp_result.best_params
            print(f"Best LightGBM params: {best_params}")
        else:
            best_params = None

        lgb_metrics = gb.train_lightgbm(
            X_train_flat, y_train,
            X_val_flat, y_val,
            feature_names=expanded_feature_names,
            params=best_params,
            sample_weight=sample_weights
        )

        results['lightgbm'] = {
            'ic': lgb_metrics.ic,
            'direction_accuracy': lgb_metrics.direction_accuracy,
            'rmse': lgb_metrics.rmse,
            'top_features': gb.get_top_features('lightgbm', 10)
        }
        print(f"LightGBM IC: {lgb_metrics.ic:.4f}")
        print(f"LightGBM Direction Accuracy: {lgb_metrics.direction_accuracy:.2%}")

    except Exception as e:
        print(f"LightGBM training failed: {e}")
        results['lightgbm'] = {'error': str(e)}

    # Save models
    try:
        saved = gb.save_models(prefix='gb')
        results['saved_paths'] = saved
        print(f"\nSaved models: {saved}")
    except Exception as e:
        print(f"Failed to save GB models: {e}")

    # ============================================
    # P3 Improvements (optional)
    # ============================================
    if enable_p3:
        print_banner("P3 IMPROVEMENTS")

        # P3.3: Feature Selection
        print("\n--- P3.3: Feature Selection ---")
        try:
            feature_indices, selected_names, _ = gb.select_features(
                X_train_flat, y_train,
                feature_names=expanded_feature_names,
                top_n=top_n_features,
                sample_weight=sample_weights
            )

            # Apply feature selection
            X_train_selected = X_train_flat[:, feature_indices]
            X_val_selected = X_val_flat[:, feature_indices]

            print(f"  Reduced features: {X_train_flat.shape[1]} -> {X_train_selected.shape[1]}")

            # Retrain XGBoost with selected features
            print("\n  Retraining XGBoost with selected features...")
            xgb_metrics_selected = gb.train_xgboost(
                X_train_selected, y_train,
                X_val_selected, y_val,
                feature_names=selected_names,
                params=results.get('xgboost', {}).get('best_params'),
                sample_weight=sample_weights
            )
            print(f"  XGBoost (selected features) IC: {xgb_metrics_selected.ic:.4f}")
            print(f"  XGBoost (selected features) Dir Acc: {xgb_metrics_selected.direction_accuracy:.2%}")

            results['xgboost_selected'] = {
                'ic': xgb_metrics_selected.ic,
                'direction_accuracy': xgb_metrics_selected.direction_accuracy,
                'n_features': len(selected_names)
            }
        except Exception as e:
            print(f"  Feature selection failed: {e}")

        # P3.2: Ensemble Training
        print("\n--- P3.2: Ensemble Training ---")
        try:
            ensemble_result = gb.train_ensemble(
                X_train_flat, y_train,
                X_val_flat, y_val,
                feature_names=expanded_feature_names,
                n_models=5,
                sample_weight=sample_weights
            )

            results['ensemble'] = {
                'ic': ensemble_result['ensemble_ic'],
                'direction_accuracy': ensemble_result['ensemble_dir_acc'],
                'n_models': ensemble_result['n_models'],
                'ic_improvement': ensemble_result['ic_improvement']
            }
        except Exception as e:
            print(f"  Ensemble training failed: {e}")

    return results


def compare_configurations(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    X_test: np.ndarray,
    y_test: np.ndarray,
    feature_names: list,
    dates_train: np.ndarray = None,
    hp_search_trials: int = 20
) -> dict:
    """
    Compare multiple model configurations to find the best one.

    Tests:
    1. XGBoost with all features
    2. XGBoost with top-100 features
    3. XGBoost with top-50 features
    4. XGBoost ensemble with feature selection

    Returns dict with best configuration and all results.
    """
    print_banner("CONFIGURATION COMPARISON")

    from models.gradient_boosting import GradientBoostingModels

    gb = GradientBoostingModels(checkpoint_dir=CHECKPOINT_DIR)

    # Flatten sequences for GB models
    def flatten_with_rolling_stats(X: np.ndarray) -> np.ndarray:
        n_samples, seq_len, n_features = X.shape
        last_values = X[:, -1, :]
        mean_values = X.mean(axis=1)
        std_values = X.std(axis=1)
        first_quarter = X[:, :seq_len//4, :].mean(axis=1)
        last_quarter = X[:, -seq_len//4:, :].mean(axis=1)
        trend_values = (last_quarter - first_quarter) / (seq_len * 0.5)
        return np.concatenate([last_values, mean_values, std_values, trend_values], axis=1)

    X_train_flat = flatten_with_rolling_stats(X_train)
    X_val_flat = flatten_with_rolling_stats(X_val)
    X_test_flat = flatten_with_rolling_stats(X_test)

    # Feature names
    feature_suffixes = ['_last', '_mean', '_std', '_trend']
    expanded_feature_names = []
    for suffix in feature_suffixes:
        expanded_feature_names.extend([f"{name}{suffix}" for name in feature_names])

    # Sample weights
    sample_weights = None
    if dates_train is not None:
        try:
            dates_series = pd.Series(dates_train)
            dates_numeric = pd.to_datetime(dates_series).astype(np.int64) // 10**9
            max_date = dates_numeric.max()
            days_ago = (max_date - dates_numeric) / (24 * 3600)
            decay_lambda = 0.00126
            sample_weights = np.exp(-decay_lambda * days_ago).values
            sample_weights = sample_weights * len(sample_weights) / sample_weights.sum()
        except Exception as e:
            print(f"Warning: Could not compute sample weights: {e}")

    configs = []
    print(f"Training data: {X_train_flat.shape}, Val: {X_val_flat.shape}, Test: {X_test_flat.shape}")

    # Config 1: All features
    print("\n--- Config 1: XGBoost with all features ---")
    try:
        hp_result = gb.hyperparameter_search(
            X_train_flat, y_train,
            model_type='xgboost',
            n_iter=hp_search_trials,
            n_cv_splits=3,
            feature_names=expanded_feature_names,
            use_optuna=False
        )
        metrics = gb.train_xgboost(
            X_train_flat, y_train,
            X_val_flat, y_val,
            feature_names=expanded_feature_names,
            params=hp_result.best_params,
            sample_weight=sample_weights
        )
        # Test set evaluation
        test_pred = gb.xgb_model.predict(X_test_flat)
        test_ic = np.corrcoef(test_pred, y_test)[0, 1]
        test_dir_acc = np.mean((test_pred > 0) == (y_test > 0))

        configs.append({
            'name': 'XGBoost_all_features',
            'n_features': X_train_flat.shape[1],
            'val_ic': metrics.ic,
            'val_dir_acc': metrics.direction_accuracy,
            'test_ic': test_ic if not np.isnan(test_ic) else 0,
            'test_dir_acc': test_dir_acc,
            'params': hp_result.best_params
        })
        print(f"  Val IC: {metrics.ic:.4f}, Test IC: {test_ic:.4f}")
    except Exception as e:
        print(f"  Failed: {e}")

    # Config 2: Top 100 features
    print("\n--- Config 2: XGBoost with top 100 features ---")
    try:
        feature_indices, selected_names, _ = gb.select_features(
            X_train_flat, y_train,
            feature_names=expanded_feature_names,
            top_n=100,
            sample_weight=sample_weights
        )
        X_train_sel = X_train_flat[:, feature_indices]
        X_val_sel = X_val_flat[:, feature_indices]
        X_test_sel = X_test_flat[:, feature_indices]

        hp_result = gb.hyperparameter_search(
            X_train_sel, y_train,
            model_type='xgboost',
            n_iter=hp_search_trials,
            n_cv_splits=3,
            feature_names=selected_names,
            use_optuna=False
        )
        metrics = gb.train_xgboost(
            X_train_sel, y_train,
            X_val_sel, y_val,
            feature_names=selected_names,
            params=hp_result.best_params,
            sample_weight=sample_weights
        )
        test_pred = gb.xgb_model.predict(X_test_sel)
        test_ic = np.corrcoef(test_pred, y_test)[0, 1]
        test_dir_acc = np.mean((test_pred > 0) == (y_test > 0))

        configs.append({
            'name': 'XGBoost_top100_features',
            'n_features': 100,
            'val_ic': metrics.ic,
            'val_dir_acc': metrics.direction_accuracy,
            'test_ic': test_ic if not np.isnan(test_ic) else 0,
            'test_dir_acc': test_dir_acc,
            'params': hp_result.best_params,
            'feature_indices': feature_indices.tolist()
        })
        print(f"  Val IC: {metrics.ic:.4f}, Test IC: {test_ic:.4f}")
    except Exception as e:
        print(f"  Failed: {e}")

    # Config 3: Top 50 features
    print("\n--- Config 3: XGBoost with top 50 features ---")
    try:
        feature_indices, selected_names, _ = gb.select_features(
            X_train_flat, y_train,
            feature_names=expanded_feature_names,
            top_n=50,
            sample_weight=sample_weights
        )
        X_train_sel = X_train_flat[:, feature_indices]
        X_val_sel = X_val_flat[:, feature_indices]
        X_test_sel = X_test_flat[:, feature_indices]

        hp_result = gb.hyperparameter_search(
            X_train_sel, y_train,
            model_type='xgboost',
            n_iter=hp_search_trials,
            n_cv_splits=3,
            feature_names=selected_names,
            use_optuna=False
        )
        metrics = gb.train_xgboost(
            X_train_sel, y_train,
            X_val_sel, y_val,
            feature_names=selected_names,
            params=hp_result.best_params,
            sample_weight=sample_weights
        )
        test_pred = gb.xgb_model.predict(X_test_sel)
        test_ic = np.corrcoef(test_pred, y_test)[0, 1]
        test_dir_acc = np.mean((test_pred > 0) == (y_test > 0))

        configs.append({
            'name': 'XGBoost_top50_features',
            'n_features': 50,
            'val_ic': metrics.ic,
            'val_dir_acc': metrics.direction_accuracy,
            'test_ic': test_ic if not np.isnan(test_ic) else 0,
            'test_dir_acc': test_dir_acc,
            'params': hp_result.best_params,
            'feature_indices': feature_indices.tolist()
        })
        print(f"  Val IC: {metrics.ic:.4f}, Test IC: {test_ic:.4f}")
    except Exception as e:
        print(f"  Failed: {e}")

    # Find best config by test IC
    if configs:
        best_config = max(configs, key=lambda x: x['test_ic'])
        print(f"\n{'='*60}")
        print(f"BEST CONFIGURATION: {best_config['name']}")
        print(f"  Test IC: {best_config['test_ic']:.4f}")
        print(f"  Test Direction Accuracy: {best_config['test_dir_acc']:.2%}")
        print(f"  Features: {best_config['n_features']}")
        print(f"{'='*60}")

        return {
            'configs': configs,
            'best_config': best_config
        }

    return {'configs': configs, 'best_config': None}


def train_lstm_model(
    start_date: str,
    end_date: str,
    epochs: int = 100,
    walk_forward: bool = True
) -> dict:
    """
    Train LSTM model with walk-forward validation.
    """
    print_banner("LSTM TRAINING")

    config = ModelConfig(
        model_type='lstm',
        epochs=epochs,
        batch_size=64,
        hidden_size=128,
        num_layers=2,
        dropout=0.3,
        sequence_length=60
    )

    trainer = ModelTrainer(config=config)

    result = trainer.train(
        start_date=start_date,
        end_date=end_date,
        walk_forward=walk_forward,
        n_folds=5
    )

    return {
        'model_path': result.model_path,
        'best_val_loss': result.best_val_loss,
        'final_metrics': result.final_metrics,
        'walk_forward_results': result.walk_forward_results,
        'training_time': result.training_time_seconds
    }


def main():
    parser = argparse.ArgumentParser(description='Train all ML models')
    parser.add_argument('--start-date', type=str, default='2018-01-01',
                        help='Training start date')
    parser.add_argument('--end-date', type=str, default='2024-01-01',
                        help='Training end date')
    parser.add_argument('--quick', action='store_true',
                        help='Quick training mode (fewer trials, epochs)')
    parser.add_argument('--skip-gb', action='store_true',
                        help='Skip gradient boosting training')
    parser.add_argument('--skip-lstm', action='store_true',
                        help='Skip LSTM training')
    parser.add_argument('--hp-trials', type=int, default=50,
                        help='Number of hyperparameter search trials')
    parser.add_argument('--epochs', type=int, default=100,
                        help='Number of training epochs for LSTM')
    parser.add_argument('--no-optuna', action='store_true',
                        help='Use random search instead of Optuna')
    parser.add_argument('--enable-p3', action='store_true',
                        help='Enable P3 improvements (feature selection, ensemble)')
    parser.add_argument('--top-n-features', type=int, default=100,
                        help='Number of top features for P3.3 feature selection')
    parser.add_argument('--max-symbols', type=int, default=0,
                        help='Maximum symbols to use (0=all available, default based on --quick)')
    parser.add_argument('--compare-configs', action='store_true',
                        help='Compare multiple configurations to find best model')

    args = parser.parse_args()

    # Quick mode overrides
    if args.quick:
        args.hp_trials = 10
        args.epochs = 20

    print_banner("ML MODEL TRAINING PIPELINE")
    print(f"Start date: {args.start_date}")
    print(f"End date: {args.end_date}")
    print(f"HP search trials: {args.hp_trials}")
    print(f"LSTM epochs: {args.epochs}")
    print(f"Using Optuna: {not args.no_optuna}")

    start_time = time.time()
    all_results = {}

    # Prepare data once for GB models
    if not args.skip_gb:
        print("\nPreparing data...")
        fe = FeatureEngine()

        # Get symbols with enough history
        # SURVIVORSHIP BIAS: include_inactive=True (default) ensures we train on
        # ALL companies including those that were later delisted/bankrupt.
        # This prevents the model from only learning from "survivors".
        symbols = fe.get_available_symbols(min_history_days=504)  # ~2 years

        # Verify survivorship bias handling
        symbols_active_only = fe.get_available_symbols(min_history_days=504, include_inactive=False)
        inactive_count = len(symbols) - len(symbols_active_only)
        print(f"Found {len(symbols)} symbols ({inactive_count} inactive/delisted included for survivorship bias handling)")

        # Determine max symbols to use
        if args.max_symbols > 0:
            max_symbols = args.max_symbols
        elif args.quick:
            max_symbols = 50
        else:
            max_symbols = None  # Use all available

        if max_symbols and max_symbols < len(symbols):
            symbols = symbols[:max_symbols]

        print(f"Using {len(symbols)} symbols for training")

        # Prepare data
        splits = fe.prepare_data(
            symbols=symbols,
            start_date=args.start_date,
            end_date=args.end_date
        )

        X_train, y_train, dates_train, _ = splits['train']
        X_val, y_val, _, _ = splits['val']
        X_test, y_test, _, _ = splits['test']

        # Get feature names
        feature_names = [f'feature_{i}' for i in range(X_train.shape[2])]

        # Configuration comparison mode
        if args.compare_configs:
            config_results = compare_configurations(
                X_train, y_train,
                X_val, y_val,
                X_test, y_test,
                feature_names,
                dates_train=dates_train,
                hp_search_trials=args.hp_trials
            )
            all_results['config_comparison'] = config_results
        else:
            # Train GB models (pass dates for sample recency weighting)
            gb_results = train_gradient_boosting_models(
                X_train, y_train,
                X_val, y_val,
                feature_names,
                dates_train=dates_train,
                hp_search_trials=args.hp_trials,
                use_optuna=not args.no_optuna,
                enable_p3=args.enable_p3,
                top_n_features=args.top_n_features
            )
            all_results['gradient_boosting'] = gb_results

    # Train LSTM
    if not args.skip_lstm:
        lstm_results = train_lstm_model(
            start_date=args.start_date,
            end_date=args.end_date,
            epochs=args.epochs,
            walk_forward=True
        )
        all_results['lstm'] = lstm_results

    # Summary
    total_time = time.time() - start_time
    print_banner("TRAINING COMPLETE")
    print(f"Total time: {total_time / 60:.1f} minutes")

    # Save results summary
    results_path = CHECKPOINT_DIR / f"training_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_path, 'w') as f:
        # Convert numpy types for JSON serialization
        def convert(obj):
            if isinstance(obj, np.ndarray):
                return obj.tolist()
            if isinstance(obj, (np.float32, np.float64)):
                return float(obj)
            if isinstance(obj, (np.int32, np.int64)):
                return int(obj)
            return obj

        json.dump(all_results, f, indent=2, default=convert)

    print(f"\nResults saved to: {results_path}")

    # Print summary
    print("\n--- Summary ---")
    if 'gradient_boosting' in all_results:
        gb = all_results['gradient_boosting']
        if gb.get('xgboost') and 'ic' in gb['xgboost']:
            print(f"XGBoost IC: {gb['xgboost']['ic']:.4f}")
        if gb.get('lightgbm') and 'ic' in gb['lightgbm']:
            print(f"LightGBM IC: {gb['lightgbm']['ic']:.4f}")

    if 'lstm' in all_results:
        lstm = all_results['lstm']
        if lstm.get('final_metrics'):
            print(f"LSTM IC: {lstm['final_metrics'].get('ic', 0):.4f}")
            print(f"LSTM Sharpe: {lstm['final_metrics'].get('sharpe', 0):.4f}")
            print(f"LSTM WFE: {lstm['final_metrics'].get('walk_forward_efficiency_ic', 0):.1%}")

    return all_results


if __name__ == '__main__':
    main()
