# python/models/gradient_boosting.py
# XGBoost and LightGBM models for stock return prediction

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
from pathlib import Path
from datetime import datetime
import json
import pickle
import warnings
from dataclasses import dataclass, asdict
from sklearn.model_selection import TimeSeriesSplit

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    warnings.warn("XGBoost not installed. Run: pip install xgboost")

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False
    warnings.warn("LightGBM not installed. Run: pip install lightgbm")

# Import CHECKPOINT_DIR - handle both package and direct execution
try:
    from .config import CHECKPOINT_DIR
except ImportError:
    # Direct execution - define CHECKPOINT_DIR locally
    CHECKPOINT_DIR = Path(__file__).parent.parent / "checkpoints"


@dataclass
class GBModelMetrics:
    """Metrics for gradient boosting model."""
    rmse: float
    mae: float
    ic: float  # Information coefficient (correlation)
    direction_accuracy: float
    sharpe_estimate: float
    feature_importance: Dict[str, float]
    cv_scores: List[float]
    best_iteration: int


@dataclass
class HyperparameterResult:
    """Result from hyperparameter search."""
    best_params: Dict
    best_score: float
    all_results: List[Dict]
    search_time_seconds: float


class GradientBoostingModels:
    """
    XGBoost and LightGBM models for stock prediction.

    Features:
    - XGBoost and LightGBM with optimized defaults for finance
    - Bayesian hyperparameter optimization
    - Walk-forward cross-validation with purging
    - Feature importance tracking
    - Model stacking with deep learning
    """

    # Default hyperparameters for financial data
    # NOTE: min_child_weight reduced from 10 to 3 to prevent underfitting
    # For cross-sectional stock data (~500 stocks/day), requiring 10+ samples
    # per leaf was too conservative and limited model capacity
    DEFAULT_XGB_PARAMS = {
        'objective': 'reg:squarederror',
        'max_depth': 6,
        'learning_rate': 0.05,
        'n_estimators': 500,
        'min_child_weight': 3,  # Reduced from 10 - prevents underfitting
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'gamma': 0.1,
        'reg_alpha': 0.1,
        'reg_lambda': 1.0,
        'random_state': 42,
        'n_jobs': -1,
        'early_stopping_rounds': 50
    }

    DEFAULT_LGB_PARAMS = {
        'objective': 'huber',  # Changed from 'regression' - more robust to outliers in financial data
        'boosting_type': 'gbdt',
        'max_depth': 6,
        'learning_rate': 0.03,  # Reduced from 0.05 - slower learning prevents early stopping issues
        'n_estimators': 1000,  # Increased from 500 - more iterations with slower learning rate
        'num_leaves': 31,
        'min_child_samples': 10,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'reg_alpha': 0.1,
        'reg_lambda': 1.0,
        'random_state': 42,
        'n_jobs': 1,  # Force single-threaded to avoid segfaults on some systems
        'force_row_wise': True,  # Helps stability
        'verbose': -1
    }

    # XGBoost search space - balanced for 300+ features
    XGB_SEARCH_SPACE = {
        'max_depth': [3, 4, 5, 6, 7],  # Removed 8 - too deep for many features
        'learning_rate': [0.01, 0.02, 0.03, 0.05],  # Removed 0.1 - too aggressive
        'min_child_weight': [10, 20, 30, 50],  # Increased - more regularization
        'subsample': [0.6, 0.7, 0.8],  # More aggressive subsampling
        'colsample_bytree': [0.5, 0.6, 0.7, 0.8],  # Lower feature sampling
        'gamma': [0.1, 0.2, 0.3],  # More pruning
        'reg_alpha': [0.1, 0.5, 1.0],  # Higher L1 regularization
        'reg_lambda': [1.0, 2.0, 5.0]  # Higher L2 regularization
    }

    # LightGBM search space - more conservative to prevent overfitting
    # with high feature counts (86 base × 4 rolling stats = 344 features)
    LGB_SEARCH_SPACE = {
        'max_depth': [3, 4, 5, 6],  # Reduced from [4-8] - prevents overfitting with many features
        'learning_rate': [0.01, 0.02, 0.03, 0.05],  # Removed 0.1 - too aggressive
        'num_leaves': [7, 15, 23, 31],  # Reduced from [15-63] - lower capacity
        'min_child_samples': [20, 30, 50, 100],  # Increased minimums - more regularization
        'subsample': [0.6, 0.7, 0.8],  # More aggressive subsampling
        'colsample_bytree': [0.5, 0.6, 0.7, 0.8],  # Lower feature sampling per tree
        'reg_alpha': [0.1, 0.5, 1.0, 2.0],  # Higher L1 regularization
        'reg_lambda': [1.0, 2.0, 5.0]  # Higher L2 regularization
    }

    def __init__(
        self,
        checkpoint_dir: Path = CHECKPOINT_DIR,
        purge_gap_days: int = 25  # P3.1: Increased from 5 to 25 (covers 21-day prediction horizon + buffer)
    ):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.purge_gap_days = purge_gap_days

        # Models
        self.xgb_model = None
        self.lgb_model = None

        # Feature info
        self.feature_names: Optional[List[str]] = None
        self.feature_importance: Dict[str, Dict[str, float]] = {}

        # Metrics
        self.metrics: Dict[str, GBModelMetrics] = {}

        # Ensure checkpoint dir exists
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def train_xgboost(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None,
        params: Optional[Dict] = None,
        sample_weight: Optional[np.ndarray] = None
    ) -> GBModelMetrics:
        """
        Train XGBoost model.

        Args:
            X_train: Training features (n_samples, n_features)
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            feature_names: Feature names for importance tracking
            params: Override default parameters
            sample_weight: Optional sample weights for training (recency weighting)

        Returns:
            Training metrics
        """
        if not HAS_XGB:
            raise ImportError("XGBoost not installed")

        self.feature_names = feature_names

        # Merge with defaults
        model_params = {**self.DEFAULT_XGB_PARAMS}
        if params:
            model_params.update(params)

        # Extract early stopping (handled separately)
        early_stopping = model_params.pop('early_stopping_rounds', 50)

        # Create model
        self.xgb_model = xgb.XGBRegressor(**model_params)

        # Train with early stopping if validation data provided
        if X_val is not None and y_val is not None:
            self.xgb_model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                sample_weight=sample_weight,
                verbose=False
            )
        else:
            self.xgb_model.fit(X_train, y_train, sample_weight=sample_weight)

        # Calculate metrics
        if X_val is not None:
            predictions = self.xgb_model.predict(X_val)
            metrics = self._calculate_metrics(y_val, predictions, 'xgboost')
        else:
            predictions = self.xgb_model.predict(X_train)
            metrics = self._calculate_metrics(y_train, predictions, 'xgboost')

        # Feature importance
        importance = self.xgb_model.feature_importances_
        if feature_names:
            metrics.feature_importance = dict(zip(feature_names, importance.tolist()))
        else:
            metrics.feature_importance = {f'f{i}': v for i, v in enumerate(importance)}

        self.metrics['xgboost'] = metrics
        self.feature_importance['xgboost'] = metrics.feature_importance

        return metrics

    def train_lightgbm(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None,
        params: Optional[Dict] = None,
        sample_weight: Optional[np.ndarray] = None
    ) -> GBModelMetrics:
        """
        Train LightGBM model.

        Args:
            X_train: Training features (n_samples, n_features)
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            feature_names: Feature names for importance tracking
            params: Override default parameters
            sample_weight: Optional sample weights for training (recency weighting)

        Returns:
            Training metrics
        """
        if not HAS_LGB:
            raise ImportError("LightGBM not installed")

        self.feature_names = feature_names

        # Merge with defaults
        model_params = {**self.DEFAULT_LGB_PARAMS}
        if params:
            model_params.update(params)

        # Create model
        self.lgb_model = lgb.LGBMRegressor(**model_params)

        # Train with early stopping if validation data provided
        # Note: Increased patience from 50 to 100 for noisy financial data
        # Early stopping can trigger too early with weak signals
        callbacks = []
        if X_val is not None and y_val is not None:
            callbacks = [lgb.early_stopping(100, verbose=False)]
            self.lgb_model.fit(
                X_train, y_train,
                eval_set=[(X_val, y_val)],
                sample_weight=sample_weight,
                callbacks=callbacks
            )
        else:
            self.lgb_model.fit(X_train, y_train, sample_weight=sample_weight)

        # Calculate metrics
        if X_val is not None:
            predictions = self.lgb_model.predict(X_val)
            metrics = self._calculate_metrics(y_val, predictions, 'lightgbm')
        else:
            predictions = self.lgb_model.predict(X_train)
            metrics = self._calculate_metrics(y_train, predictions, 'lightgbm')

        # Feature importance
        importance = self.lgb_model.feature_importances_
        if feature_names:
            metrics.feature_importance = dict(zip(feature_names, importance.tolist()))
        else:
            metrics.feature_importance = {f'f{i}': v for i, v in enumerate(importance)}

        self.metrics['lightgbm'] = metrics
        self.feature_importance['lightgbm'] = metrics.feature_importance

        return metrics

    def cross_validate(
        self,
        X: np.ndarray,
        y: np.ndarray,
        model_type: str = 'xgboost',
        n_splits: int = 5,
        feature_names: Optional[List[str]] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        """
        Walk-forward cross-validation with purging.

        Uses TimeSeriesSplit to respect temporal ordering.
        Includes purge gap to prevent look-ahead bias.

        Args:
            X: Features (n_samples, n_features)
            y: Targets
            model_type: 'xgboost' or 'lightgbm'
            n_splits: Number of CV folds
            feature_names: Feature names
            params: Model parameters

        Returns:
            Dict with CV results
        """
        tscv = TimeSeriesSplit(n_splits=n_splits)

        fold_metrics = []
        all_predictions = np.zeros(len(y))
        all_actuals = np.zeros(len(y))
        prediction_mask = np.zeros(len(y), dtype=bool)

        for fold, (train_idx, test_idx) in enumerate(tscv.split(X)):
            # P3.1: Enhanced purging to prevent lookahead bias
            # With 21-day prediction horizon, we need gap >= 21 days between train end and test start

            # Original sizes
            orig_train_size = len(train_idx)
            orig_test_size = len(test_idx)

            # Purge from training: remove samples where forward return overlaps with test period
            train_end_idx = train_idx[-1]
            purge_start = train_end_idx - self.purge_gap_days
            train_idx = train_idx[train_idx < purge_start]

            # Purge from test: remove samples too close to training (embargo)
            test_start_idx = test_idx[0]
            embargo_end = test_start_idx + self.purge_gap_days
            test_idx = test_idx[test_idx >= embargo_end]

            # Skip fold if not enough data after purging
            if len(train_idx) < 100 or len(test_idx) < 50:
                print(f"  Fold {fold + 1}: Skipped (insufficient data after purging)")
                continue

            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]

            # Train model
            if model_type == 'xgboost':
                if not HAS_XGB:
                    raise ImportError("XGBoost not installed")
                model_params = {**self.DEFAULT_XGB_PARAMS}
                if params:
                    model_params.update(params)
                model_params.pop('early_stopping_rounds', None)

                model = xgb.XGBRegressor(**model_params)
                model.fit(X_train, y_train)
            else:
                if not HAS_LGB:
                    raise ImportError("LightGBM not installed")
                model_params = {**self.DEFAULT_LGB_PARAMS}
                if params:
                    model_params.update(params)

                model = lgb.LGBMRegressor(**model_params)
                model.fit(X_train, y_train)

            # Predict
            predictions = model.predict(X_test)

            # Store predictions
            all_predictions[test_idx] = predictions
            all_actuals[test_idx] = y_test
            prediction_mask[test_idx] = True

            # Fold metrics
            fold_ic = np.corrcoef(predictions, y_test)[0, 1]
            fold_rmse = np.sqrt(np.mean((predictions - y_test) ** 2))
            fold_dir_acc = np.mean((predictions > 0) == (y_test > 0))

            fold_metrics.append({
                'fold': fold + 1,
                'train_samples': len(train_idx),
                'test_samples': len(test_idx),
                'ic': fold_ic if not np.isnan(fold_ic) else 0,
                'rmse': fold_rmse,
                'direction_accuracy': fold_dir_acc
            })

            print(f"  Fold {fold + 1}: IC={fold_ic:.4f}, RMSE={fold_rmse:.4f}, "
                  f"Dir Acc={fold_dir_acc:.2%}")

        # Overall metrics from out-of-sample predictions
        valid_mask = prediction_mask
        overall_ic = np.corrcoef(all_predictions[valid_mask], all_actuals[valid_mask])[0, 1]
        overall_rmse = np.sqrt(np.mean((all_predictions[valid_mask] - all_actuals[valid_mask]) ** 2))
        overall_dir_acc = np.mean((all_predictions[valid_mask] > 0) == (all_actuals[valid_mask] > 0))

        # Sharpe estimate from predictions
        returns = all_actuals[valid_mask]
        if len(returns) > 1:
            sharpe = np.mean(returns) / (np.std(returns) + 1e-8) * np.sqrt(252)
        else:
            sharpe = 0

        return {
            'model_type': model_type,
            'n_splits': n_splits,
            'fold_metrics': fold_metrics,
            'overall': {
                'ic': overall_ic if not np.isnan(overall_ic) else 0,
                'rmse': overall_rmse,
                'direction_accuracy': overall_dir_acc,
                'sharpe_estimate': sharpe
            },
            'cv_scores': [f['ic'] for f in fold_metrics]
        }

    def hyperparameter_search(
        self,
        X: np.ndarray,
        y: np.ndarray,
        model_type: str = 'xgboost',
        n_iter: int = 50,
        n_cv_splits: int = 3,
        feature_names: Optional[List[str]] = None,
        use_optuna: bool = True
    ) -> HyperparameterResult:
        """
        Hyperparameter search with Optuna (preferred) or random search fallback.

        Optuna uses Bayesian optimization with Tree-structured Parzen Estimator (TPE)
        which is more efficient than random search for finding good hyperparameters.

        Args:
            X: Features
            y: Targets
            model_type: 'xgboost' or 'lightgbm'
            n_iter: Number of trials
            n_cv_splits: CV splits per trial
            feature_names: Feature names
            use_optuna: Use Optuna if available, else random search

        Returns:
            HyperparameterResult with best params
        """
        start_time = datetime.now()

        # Try Optuna first
        if use_optuna:
            try:
                import optuna
                optuna.logging.set_verbosity(optuna.logging.WARNING)
                return self._optuna_search(
                    X, y, model_type, n_iter, n_cv_splits, feature_names
                )
            except ImportError:
                print("Optuna not installed. Falling back to random search.")
                print("Install with: pip install optuna")

        # Fallback to random search
        return self._random_search(X, y, model_type, n_iter, n_cv_splits, feature_names)

    def _optuna_search(
        self,
        X: np.ndarray,
        y: np.ndarray,
        model_type: str,
        n_trials: int,
        n_cv_splits: int,
        feature_names: Optional[List[str]]
    ) -> HyperparameterResult:
        """Optuna-based Bayesian hyperparameter optimization."""
        import optuna

        start_time = datetime.now()
        all_results = []

        def objective(trial):
            if model_type == 'xgboost':
                params = {
                    'max_depth': trial.suggest_int('max_depth', 3, 10),
                    'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                    'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
                    'min_child_weight': trial.suggest_int('min_child_weight', 1, 50),
                    'subsample': trial.suggest_float('subsample', 0.5, 1.0),
                    'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
                    'gamma': trial.suggest_float('gamma', 0, 1.0),
                    'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
                    'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
                }
            else:  # lightgbm
                params = {
                    'max_depth': trial.suggest_int('max_depth', 3, 10),
                    'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3, log=True),
                    'n_estimators': trial.suggest_int('n_estimators', 100, 1000),
                    'num_leaves': trial.suggest_int('num_leaves', 15, 127),
                    'min_child_samples': trial.suggest_int('min_child_samples', 5, 100),
                    'subsample': trial.suggest_float('subsample', 0.5, 1.0),
                    'colsample_bytree': trial.suggest_float('colsample_bytree', 0.5, 1.0),
                    'reg_alpha': trial.suggest_float('reg_alpha', 1e-8, 10.0, log=True),
                    'reg_lambda': trial.suggest_float('reg_lambda', 1e-8, 10.0, log=True),
                }

            try:
                cv_result = self.cross_validate(
                    X, y,
                    model_type=model_type,
                    n_splits=n_cv_splits,
                    feature_names=feature_names,
                    params=params
                )
                score = cv_result['overall']['ic']

                all_results.append({
                    'params': params,
                    'score': score,
                    'cv_scores': cv_result['cv_scores']
                })

                return score
            except Exception as e:
                print(f"Trial failed: {e}")
                return float('-inf')

        # Create study with TPE sampler (Bayesian optimization)
        sampler = optuna.samplers.TPESampler(seed=42)
        study = optuna.create_study(direction='maximize', sampler=sampler)

        print(f"\nOptuna hyperparameter search: {model_type}")
        print(f"Running {n_trials} trials with {n_cv_splits}-fold CV\n")

        study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

        search_time = (datetime.now() - start_time).total_seconds()

        print(f"\nBest IC: {study.best_value:.4f}")
        print(f"Best params: {study.best_params}")

        return HyperparameterResult(
            best_params=study.best_params,
            best_score=study.best_value,
            all_results=all_results,
            search_time_seconds=search_time
        )

    def _random_search(
        self,
        X: np.ndarray,
        y: np.ndarray,
        model_type: str,
        n_iter: int,
        n_cv_splits: int,
        feature_names: Optional[List[str]]
    ) -> HyperparameterResult:
        """Random search fallback for hyperparameter optimization."""
        start_time = datetime.now()

        search_space = self.XGB_SEARCH_SPACE if model_type == 'xgboost' else self.LGB_SEARCH_SPACE

        results = []
        best_score = -np.inf
        best_params = None

        print(f"\nRandom hyperparameter search: {model_type}")
        print(f"Testing {n_iter} configurations with {n_cv_splits}-fold CV\n")

        for i in range(n_iter):
            # Sample random parameters
            params = {k: np.random.choice(v) for k, v in search_space.items()}

            try:
                cv_result = self.cross_validate(
                    X, y,
                    model_type=model_type,
                    n_splits=n_cv_splits,
                    feature_names=feature_names,
                    params=params
                )

                score = cv_result['overall']['ic']

                results.append({
                    'params': params,
                    'score': score,
                    'cv_scores': cv_result['cv_scores']
                })

                if score > best_score:
                    best_score = score
                    best_params = params
                    print(f"  [{i+1}/{n_iter}] New best IC: {score:.4f}")

            except Exception as e:
                print(f"  [{i+1}/{n_iter}] Error: {e}")
                continue

        search_time = (datetime.now() - start_time).total_seconds()

        return HyperparameterResult(
            best_params=best_params or {},
            best_score=best_score,
            all_results=results,
            search_time_seconds=search_time
        )

    def predict(
        self,
        X: np.ndarray,
        model_type: str = 'ensemble'
    ) -> Dict[str, np.ndarray]:
        """
        Make predictions.

        Args:
            X: Features (n_samples, n_features)
            model_type: 'xgboost', 'lightgbm', or 'ensemble'

        Returns:
            Dict with predictions and uncertainty
        """
        predictions = {}

        if model_type in ['xgboost', 'ensemble'] and self.xgb_model is not None:
            predictions['xgboost'] = self.xgb_model.predict(X)

        if model_type in ['lightgbm', 'ensemble'] and self.lgb_model is not None:
            predictions['lightgbm'] = self.lgb_model.predict(X)

        if len(predictions) == 0:
            raise ValueError("No models trained")

        # Combine predictions
        if len(predictions) == 1:
            combined = list(predictions.values())[0]
            uncertainty = np.ones(len(X)) * 0.5  # Default uncertainty
        else:
            # Ensemble: average predictions
            combined = np.mean(list(predictions.values()), axis=0)
            # Uncertainty: std across models
            uncertainty = np.std(list(predictions.values()), axis=0)

        return {
            'prediction': combined,
            'uncertainty': uncertainty,
            'model_predictions': predictions
        }

    def save_models(self, prefix: str = 'gb') -> Dict[str, str]:
        """Save trained models."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        saved = {}

        if self.xgb_model is not None:
            path = self.checkpoint_dir / f'{prefix}_xgboost_{timestamp}.pkl'
            with open(path, 'wb') as f:
                pickle.dump({
                    'model': self.xgb_model,
                    'feature_names': self.feature_names,
                    'metrics': asdict(self.metrics.get('xgboost', GBModelMetrics(0,0,0,0,0,{},[], 0))),
                    'timestamp': timestamp
                }, f)
            saved['xgboost'] = str(path)
            print(f"Saved XGBoost: {path}")

        if self.lgb_model is not None:
            path = self.checkpoint_dir / f'{prefix}_lightgbm_{timestamp}.pkl'
            with open(path, 'wb') as f:
                pickle.dump({
                    'model': self.lgb_model,
                    'feature_names': self.feature_names,
                    'metrics': asdict(self.metrics.get('lightgbm', GBModelMetrics(0,0,0,0,0,{},[], 0))),
                    'timestamp': timestamp
                }, f)
            saved['lightgbm'] = str(path)
            print(f"Saved LightGBM: {path}")

        return saved

    def load_models(self, xgb_path: Optional[str] = None, lgb_path: Optional[str] = None):
        """Load trained models."""
        if xgb_path:
            with open(xgb_path, 'rb') as f:
                data = pickle.load(f)
                self.xgb_model = data['model']
                self.feature_names = data.get('feature_names')
                if data.get('metrics'):
                    self.metrics['xgboost'] = GBModelMetrics(**data['metrics'])
            print(f"Loaded XGBoost from {xgb_path}")

        if lgb_path:
            with open(lgb_path, 'rb') as f:
                data = pickle.load(f)
                self.lgb_model = data['model']
                self.feature_names = data.get('feature_names')
                if data.get('metrics'):
                    self.metrics['lightgbm'] = GBModelMetrics(**data['metrics'])
            print(f"Loaded LightGBM from {lgb_path}")

    def load_latest(self):
        """Load the most recent models."""
        # Find latest XGBoost
        xgb_files = list(self.checkpoint_dir.glob('*xgboost*.pkl'))
        if xgb_files:
            latest_xgb = max(xgb_files, key=lambda p: p.stat().st_mtime)
            self.load_models(xgb_path=str(latest_xgb))

        # Find latest LightGBM
        lgb_files = list(self.checkpoint_dir.glob('*lightgbm*.pkl'))
        if lgb_files:
            latest_lgb = max(lgb_files, key=lambda p: p.stat().st_mtime)
            self.load_models(lgb_path=str(latest_lgb))

    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        model_name: str
    ) -> GBModelMetrics:
        """Calculate evaluation metrics."""
        rmse = np.sqrt(np.mean((y_pred - y_true) ** 2))
        mae = np.mean(np.abs(y_pred - y_true))
        ic = np.corrcoef(y_pred, y_true)[0, 1]
        direction_acc = np.mean((y_pred > 0) == (y_true > 0))

        # Sharpe estimate
        if len(y_true) > 1:
            sharpe = np.mean(y_true) / (np.std(y_true) + 1e-8) * np.sqrt(252)
        else:
            sharpe = 0

        return GBModelMetrics(
            rmse=rmse,
            mae=mae,
            ic=ic if not np.isnan(ic) else 0,
            direction_accuracy=direction_acc,
            sharpe_estimate=sharpe,
            feature_importance={},
            cv_scores=[],
            best_iteration=0
        )

    def get_top_features(self, model_type: str = 'xgboost', top_n: int = 20) -> List[Tuple[str, float]]:
        """Get top N important features."""
        importance = self.feature_importance.get(model_type, {})
        sorted_features = sorted(importance.items(), key=lambda x: x[1], reverse=True)
        return sorted_features[:top_n]

    def train_ensemble(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        feature_names: Optional[List[str]] = None,
        n_models: int = 5,
        params: Optional[Dict] = None,
        sample_weight: Optional[np.ndarray] = None
    ) -> Dict:
        """
        P3.2: Train an ensemble of XGBoost models with different random seeds.

        Ensemble reduces variance and improves generalization by averaging
        predictions from multiple models trained with different randomization.

        Args:
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            feature_names: Feature names
            n_models: Number of models in ensemble
            params: Base model parameters
            sample_weight: Sample weights

        Returns:
            Dict with ensemble metrics and models
        """
        if not HAS_XGB:
            raise ImportError("XGBoost not installed")

        print(f"\n--- Training XGBoost Ensemble ({n_models} models) ---")

        self.feature_names = feature_names
        base_params = {**self.DEFAULT_XGB_PARAMS}
        if params:
            base_params.update(params)

        # Remove early stopping for ensemble members (faster training)
        base_params.pop('early_stopping_rounds', None)

        ensemble_models = []
        ensemble_predictions = []
        model_metrics = []

        for i in range(n_models):
            # Different random seed for each model
            model_params = {**base_params, 'random_state': 42 + i * 17}

            # Slightly vary hyperparameters for diversity
            if i > 0:
                model_params['subsample'] = max(0.5, base_params.get('subsample', 0.8) - 0.05 * (i % 3))
                model_params['colsample_bytree'] = max(0.4, base_params.get('colsample_bytree', 0.8) - 0.05 * (i % 3))

            model = xgb.XGBRegressor(**model_params)

            # Train with bootstrap sampling for additional diversity
            n_samples = len(X_train)
            if i > 0:
                # Bootstrap sample (with replacement) for models 2-N
                boot_idx = np.random.choice(n_samples, size=n_samples, replace=True)
                X_boot = X_train[boot_idx]
                y_boot = y_train[boot_idx]
                weight_boot = sample_weight[boot_idx] if sample_weight is not None else None
            else:
                # First model uses full training data
                X_boot, y_boot = X_train, y_train
                weight_boot = sample_weight

            model.fit(X_boot, y_boot, sample_weight=weight_boot)

            # Validate
            preds = model.predict(X_val)
            ic = np.corrcoef(preds, y_val)[0, 1]
            dir_acc = np.mean((preds > 0) == (y_val > 0))

            ensemble_models.append(model)
            ensemble_predictions.append(preds)
            model_metrics.append({'ic': ic, 'dir_acc': dir_acc})

            print(f"  Model {i+1}/{n_models}: IC={ic:.4f}, Dir Acc={dir_acc:.2%}")

        # Ensemble prediction (simple average)
        ensemble_pred = np.mean(ensemble_predictions, axis=0)
        ensemble_ic = np.corrcoef(ensemble_pred, y_val)[0, 1]
        ensemble_dir_acc = np.mean((ensemble_pred > 0) == (y_val > 0))
        ensemble_rmse = np.sqrt(np.mean((ensemble_pred - y_val) ** 2))

        print(f"\n  Ensemble: IC={ensemble_ic:.4f}, Dir Acc={ensemble_dir_acc:.2%}")

        # Store ensemble
        self.ensemble_models = ensemble_models
        self.ensemble_weights = [1.0 / n_models] * n_models  # Equal weights

        # Calculate improvement over best single model
        best_single_ic = max(m['ic'] for m in model_metrics)
        ic_improvement = ensemble_ic - best_single_ic

        return {
            'n_models': n_models,
            'ensemble_ic': ensemble_ic if not np.isnan(ensemble_ic) else 0,
            'ensemble_dir_acc': ensemble_dir_acc,
            'ensemble_rmse': ensemble_rmse,
            'best_single_ic': best_single_ic,
            'ic_improvement': ic_improvement,
            'model_metrics': model_metrics
        }

    def predict_ensemble(self, X: np.ndarray) -> np.ndarray:
        """Make predictions using the trained ensemble."""
        if not hasattr(self, 'ensemble_models') or not self.ensemble_models:
            raise ValueError("No ensemble trained. Call train_ensemble first.")

        predictions = np.array([m.predict(X) for m in self.ensemble_models])
        return np.average(predictions, axis=0, weights=self.ensemble_weights)

    def select_features(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        feature_names: List[str],
        top_n: int = 100,
        sample_weight: Optional[np.ndarray] = None
    ) -> Tuple[np.ndarray, List[str], List[int]]:
        """
        P3.3: Select top-N most important features using a quick model fit.

        Reduces feature dimensionality to combat overfitting with many features.
        Uses XGBoost feature importance to rank features.

        Args:
            X_train: Training features
            y_train: Training targets
            feature_names: Feature names
            top_n: Number of top features to select
            sample_weight: Sample weights

        Returns:
            Tuple of (selected_feature_indices, selected_feature_names, importance_scores)
        """
        if not HAS_XGB:
            raise ImportError("XGBoost not installed")

        print(f"\n--- Feature Selection: Selecting top {top_n} from {len(feature_names)} features ---")

        # Quick model fit with limited depth for stable importance
        quick_params = {
            'objective': 'reg:squarederror',
            'max_depth': 4,  # Shallow for stable importance
            'learning_rate': 0.1,
            'n_estimators': 100,  # Fewer trees
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'random_state': 42,
            'n_jobs': -1
        }

        model = xgb.XGBRegressor(**quick_params)
        model.fit(X_train, y_train, sample_weight=sample_weight)

        # Get feature importance
        importance = model.feature_importances_

        # Rank features by importance
        feature_ranking = sorted(
            enumerate(importance),
            key=lambda x: x[1],
            reverse=True
        )

        # Select top N
        top_indices = [idx for idx, _ in feature_ranking[:top_n]]
        top_names = [feature_names[idx] for idx in top_indices]
        top_importance = [importance[idx] for idx in top_indices]

        # Print top 10
        print("  Top 10 features:")
        for i, (idx, imp) in enumerate(feature_ranking[:10]):
            print(f"    {i+1}. {feature_names[idx]}: {imp:.4f}")

        # Store for later use
        self.selected_feature_indices = top_indices
        self.selected_feature_names = top_names

        return np.array(top_indices), top_names, top_importance

    def apply_feature_selection(
        self,
        X: np.ndarray,
        feature_indices: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """Apply feature selection to data using stored or provided indices."""
        if feature_indices is None:
            if not hasattr(self, 'selected_feature_indices'):
                raise ValueError("No feature selection performed. Call select_features first.")
            feature_indices = self.selected_feature_indices

        return X[:, feature_indices]

    def train_regime_models(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        regime_indicator: np.ndarray,
        X_val: Optional[np.ndarray] = None,
        y_val: Optional[np.ndarray] = None,
        regime_val: Optional[np.ndarray] = None,
        feature_names: Optional[List[str]] = None,
        params: Optional[Dict] = None,
        sample_weight: Optional[np.ndarray] = None
    ) -> Dict:
        """
        P3.4: Train separate models for different market regimes.

        High-volatility and low-volatility periods often have different
        return dynamics. Training separate models can improve performance.

        Args:
            X_train: Training features
            y_train: Training targets
            regime_indicator: Binary array (1=high vol, 0=low vol) for training
            X_val: Validation features
            y_val: Validation targets
            regime_val: Regime indicator for validation
            feature_names: Feature names
            params: Model parameters
            sample_weight: Sample weights

        Returns:
            Dict with regime model metrics
        """
        if not HAS_XGB:
            raise ImportError("XGBoost not installed")

        print("\n--- Regime-Aware Training ---")

        self.feature_names = feature_names
        base_params = {**self.DEFAULT_XGB_PARAMS}
        if params:
            base_params.update(params)
        base_params.pop('early_stopping_rounds', None)

        # Split data by regime
        high_vol_mask = regime_indicator == 1
        low_vol_mask = regime_indicator == 0

        X_high = X_train[high_vol_mask]
        y_high = y_train[high_vol_mask]
        X_low = X_train[low_vol_mask]
        y_low = y_train[low_vol_mask]

        weight_high = sample_weight[high_vol_mask] if sample_weight is not None else None
        weight_low = sample_weight[low_vol_mask] if sample_weight is not None else None

        print(f"  High-vol samples: {len(X_high)}, Low-vol samples: {len(X_low)}")

        # Train high-volatility model
        print("  Training high-volatility model...")
        model_high = xgb.XGBRegressor(**base_params)
        model_high.fit(X_high, y_high, sample_weight=weight_high)

        # Train low-volatility model
        print("  Training low-volatility model...")
        model_low = xgb.XGBRegressor(**base_params)
        model_low.fit(X_low, y_low, sample_weight=weight_low)

        # Store models
        self.regime_models = {
            'high_vol': model_high,
            'low_vol': model_low
        }

        results = {
            'high_vol_samples': len(X_high),
            'low_vol_samples': len(X_low)
        }

        # Evaluate on validation if provided
        if X_val is not None and y_val is not None and regime_val is not None:
            high_val_mask = regime_val == 1
            low_val_mask = regime_val == 0

            # High-vol predictions
            if high_val_mask.sum() > 0:
                pred_high = model_high.predict(X_val[high_val_mask])
                ic_high = np.corrcoef(pred_high, y_val[high_val_mask])[0, 1]
                dir_acc_high = np.mean((pred_high > 0) == (y_val[high_val_mask] > 0))
                results['high_vol_ic'] = ic_high if not np.isnan(ic_high) else 0
                results['high_vol_dir_acc'] = dir_acc_high
                print(f"  High-vol val: IC={ic_high:.4f}, Dir Acc={dir_acc_high:.2%}")

            # Low-vol predictions
            if low_val_mask.sum() > 0:
                pred_low = model_low.predict(X_val[low_val_mask])
                ic_low = np.corrcoef(pred_low, y_val[low_val_mask])[0, 1]
                dir_acc_low = np.mean((pred_low > 0) == (y_val[low_val_mask] > 0))
                results['low_vol_ic'] = ic_low if not np.isnan(ic_low) else 0
                results['low_vol_dir_acc'] = dir_acc_low
                print(f"  Low-vol val: IC={ic_low:.4f}, Dir Acc={dir_acc_low:.2%}")

            # Combined prediction using regime-appropriate models
            combined_pred = np.zeros(len(y_val))
            if high_val_mask.sum() > 0:
                combined_pred[high_val_mask] = model_high.predict(X_val[high_val_mask])
            if low_val_mask.sum() > 0:
                combined_pred[low_val_mask] = model_low.predict(X_val[low_val_mask])

            combined_ic = np.corrcoef(combined_pred, y_val)[0, 1]
            combined_dir_acc = np.mean((combined_pred > 0) == (y_val > 0))
            results['combined_ic'] = combined_ic if not np.isnan(combined_ic) else 0
            results['combined_dir_acc'] = combined_dir_acc
            print(f"  Combined: IC={combined_ic:.4f}, Dir Acc={combined_dir_acc:.2%}")

        return results

    def predict_regime(
        self,
        X: np.ndarray,
        regime_indicator: np.ndarray
    ) -> np.ndarray:
        """Make predictions using regime-specific models."""
        if not hasattr(self, 'regime_models'):
            raise ValueError("No regime models trained. Call train_regime_models first.")

        predictions = np.zeros(len(X))
        high_vol_mask = regime_indicator == 1
        low_vol_mask = regime_indicator == 0

        if high_vol_mask.sum() > 0:
            predictions[high_vol_mask] = self.regime_models['high_vol'].predict(X[high_vol_mask])
        if low_vol_mask.sum() > 0:
            predictions[low_vol_mask] = self.regime_models['low_vol'].predict(X[low_vol_mask])

        return predictions


# =============================================================================
# Entry points for Node.js bridge
# =============================================================================

def train_gradient_boosting(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: Optional[np.ndarray] = None,
    y_val: Optional[np.ndarray] = None,
    feature_names: Optional[List[str]] = None,
    model_type: str = 'both',
    checkpoint_dir: Optional[str] = None,
    hyperparameter_search: bool = False,
    n_search_iter: int = 30
) -> Dict:
    """
    Entry point for training gradient boosting models from Node.js.

    Args:
        X_train: Training features
        y_train: Training targets
        X_val: Validation features
        y_val: Validation targets
        feature_names: Feature names
        model_type: 'xgboost', 'lightgbm', or 'both'
        checkpoint_dir: Where to save models
        hyperparameter_search: Whether to run HP search
        n_search_iter: Number of HP search iterations

    Returns:
        Dict with training results
    """
    dir_path = Path(checkpoint_dir) if checkpoint_dir else CHECKPOINT_DIR
    gb = GradientBoostingModels(checkpoint_dir=dir_path)

    results = {
        'success': True,
        'models_trained': [],
        'metrics': {}
    }

    try:
        # Hyperparameter search if requested
        best_xgb_params = None
        best_lgb_params = None

        if hyperparameter_search:
            if model_type in ['xgboost', 'both']:
                print("Running XGBoost hyperparameter search...")
                hp_result = gb.hyperparameter_search(
                    X_train, y_train,
                    model_type='xgboost',
                    n_iter=n_search_iter
                )
                best_xgb_params = hp_result.best_params
                results['xgb_hp_search'] = asdict(hp_result)

            if model_type in ['lightgbm', 'both']:
                print("Running LightGBM hyperparameter search...")
                hp_result = gb.hyperparameter_search(
                    X_train, y_train,
                    model_type='lightgbm',
                    n_iter=n_search_iter
                )
                best_lgb_params = hp_result.best_params
                results['lgb_hp_search'] = asdict(hp_result)

        # Train models
        if model_type in ['xgboost', 'both']:
            print("\nTraining XGBoost...")
            metrics = gb.train_xgboost(
                X_train, y_train, X_val, y_val,
                feature_names=feature_names,
                params=best_xgb_params
            )
            results['models_trained'].append('xgboost')
            results['metrics']['xgboost'] = asdict(metrics)

        if model_type in ['lightgbm', 'both']:
            print("\nTraining LightGBM...")
            metrics = gb.train_lightgbm(
                X_train, y_train, X_val, y_val,
                feature_names=feature_names,
                params=best_lgb_params
            )
            results['models_trained'].append('lightgbm')
            results['metrics']['lightgbm'] = asdict(metrics)

        # Save models
        saved_paths = gb.save_models()
        results['saved_paths'] = saved_paths

        # Top features
        for model in results['models_trained']:
            results[f'{model}_top_features'] = gb.get_top_features(model, 15)

    except Exception as e:
        results['success'] = False
        results['error'] = str(e)

    return results


def predict_gradient_boosting(
    X: np.ndarray,
    model_type: str = 'ensemble',
    checkpoint_dir: Optional[str] = None
) -> Dict:
    """
    Entry point for predictions from Node.js.

    Args:
        X: Features to predict
        model_type: 'xgboost', 'lightgbm', or 'ensemble'
        checkpoint_dir: Where models are saved

    Returns:
        Dict with predictions
    """
    dir_path = Path(checkpoint_dir) if checkpoint_dir else CHECKPOINT_DIR
    gb = GradientBoostingModels(checkpoint_dir=dir_path)

    try:
        gb.load_latest()
        result = gb.predict(X, model_type=model_type)

        return {
            'success': True,
            'prediction': result['prediction'].tolist(),
            'uncertainty': result['uncertainty'].tolist(),
            'model_predictions': {k: v.tolist() for k, v in result['model_predictions'].items()}
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'prediction': [0.0] * len(X),
            'uncertainty': [1.0] * len(X)
        }


def get_available_gb_models(checkpoint_dir: Optional[str] = None) -> Dict:
    """Get list of available gradient boosting models."""
    dir_path = Path(checkpoint_dir) if checkpoint_dir else CHECKPOINT_DIR

    models = []
    for path in dir_path.glob('gb_*.pkl'):
        try:
            with open(path, 'rb') as f:
                data = pickle.load(f)
            models.append({
                'path': str(path),
                'name': path.stem,
                'timestamp': data.get('timestamp', 'unknown'),
                'metrics': data.get('metrics', {})
            })
        except Exception as e:
            continue

    return {
        'models': sorted(models, key=lambda x: x['timestamp'], reverse=True),
        'count': len(models)
    }


# Quick test
if __name__ == '__main__':
    print("Testing Gradient Boosting Models...")
    print(f"XGBoost available: {HAS_XGB}")
    print(f"LightGBM available: {HAS_LGB}")

    if not (HAS_XGB or HAS_LGB):
        print("\nInstall with: pip install xgboost lightgbm")
        exit(1)

    # Generate synthetic data
    np.random.seed(42)
    n_samples = 1000
    n_features = 20

    X = np.random.randn(n_samples, n_features)
    # Synthetic target with some predictable pattern
    y = 0.3 * X[:, 0] - 0.2 * X[:, 1] + 0.1 * X[:, 2] + np.random.randn(n_samples) * 0.5

    # Split
    split_idx = int(0.8 * n_samples)
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]

    feature_names = [f'feature_{i}' for i in range(n_features)]

    # Initialize
    gb = GradientBoostingModels()

    # Train XGBoost
    if HAS_XGB:
        print("\n--- Training XGBoost ---")
        xgb_metrics = gb.train_xgboost(X_train, y_train, X_val, y_val, feature_names)
        print(f"XGBoost IC: {xgb_metrics.ic:.4f}")
        print(f"XGBoost Direction Accuracy: {xgb_metrics.direction_accuracy:.2%}")
        print(f"Top features: {gb.get_top_features('xgboost', 5)}")

    # Train LightGBM
    if HAS_LGB:
        print("\n--- Training LightGBM ---")
        lgb_metrics = gb.train_lightgbm(X_train, y_train, X_val, y_val, feature_names)
        print(f"LightGBM IC: {lgb_metrics.ic:.4f}")
        print(f"LightGBM Direction Accuracy: {lgb_metrics.direction_accuracy:.2%}")
        print(f"Top features: {gb.get_top_features('lightgbm', 5)}")

    # Cross-validation
    print("\n--- Cross-Validation ---")
    cv_result = gb.cross_validate(X, y, model_type='xgboost' if HAS_XGB else 'lightgbm', n_splits=3)
    print(f"CV IC: {cv_result['overall']['ic']:.4f}")
    print(f"CV Direction Accuracy: {cv_result['overall']['direction_accuracy']:.2%}")

    # Ensemble prediction
    print("\n--- Ensemble Prediction ---")
    predictions = gb.predict(X_val[:5], model_type='ensemble')
    print(f"Predictions: {predictions['prediction'][:5]}")
    print(f"Uncertainty: {predictions['uncertainty'][:5]}")

    # Save
    print("\n--- Saving Models ---")
    saved = gb.save_models()
    print(f"Saved: {saved}")

    print("\nGradient Boosting test complete!")
