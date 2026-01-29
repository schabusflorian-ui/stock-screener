# python/models/trainer.py
# Training pipeline for deep learning models

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from torch.optim.lr_scheduler import CosineAnnealingLR, ReduceLROnPlateau
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
from typing import Dict, List, Tuple, Optional, Callable
from pathlib import Path
from datetime import datetime
import json
import warnings
from dataclasses import dataclass, asdict
from tqdm import tqdm

from .config import ModelConfig, CHECKPOINT_DIR
from .feature_engine import FeatureEngine
from .stock_lstm import StockLSTM, CombinedLoss, GaussianNLLLoss
from .temporal_fusion import TemporalFusionTransformer, QuantileLoss


@dataclass
class TrainingMetrics:
    """Metrics from a training epoch."""
    epoch: int
    train_loss: float
    val_loss: float
    train_mse: float
    val_mse: float
    train_ic: float  # Pearson Information Coefficient
    val_ic: float
    train_spearman_ic: float  # Spearman IC (rank correlation) - more robust
    val_spearman_ic: float
    train_direction_acc: float
    val_direction_acc: float
    learning_rate: float


@dataclass
class TrainingResult:
    """Complete training result."""
    model_path: str
    best_epoch: int
    best_val_loss: float
    final_metrics: Dict
    training_history: List[Dict]
    config: Dict
    training_time_seconds: float
    walk_forward_results: Optional[List[Dict]] = None


class EarlyStopping:
    """Early stopping to prevent overfitting."""

    def __init__(
        self,
        patience: int = 10,
        min_delta: float = 0.001,
        mode: str = 'min'
    ):
        self.patience = patience
        self.min_delta = min_delta
        self.mode = mode
        self.counter = 0
        self.best_score = None
        self.should_stop = False

    def __call__(self, score: float) -> bool:
        if self.best_score is None:
            self.best_score = score
            return False

        if self.mode == 'min':
            improved = score < self.best_score - self.min_delta
        else:
            improved = score > self.best_score + self.min_delta

        if improved:
            self.best_score = score
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True

        return self.should_stop


class ModelTrainer:
    """
    Training pipeline for stock prediction models.

    Features:
    - Walk-forward validation (time-ordered splits)
    - Early stopping
    - Learning rate scheduling
    - Gradient clipping
    - Metric tracking
    - Checkpoint management
    - Multiple model architectures (LSTM, TFT)
    """

    def __init__(
        self,
        config: Optional[ModelConfig] = None,
        device: Optional[str] = None
    ):
        self.config = config or ModelConfig()

        # Device selection
        if device:
            self.device = torch.device(device)
        elif torch.cuda.is_available():
            self.device = torch.device('cuda')
        elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
            self.device = torch.device('mps')
        else:
            self.device = torch.device('cpu')

        print(f"Using device: {self.device}")

        self.feature_engine = FeatureEngine(config=self.config)
        self.training_history = []

    def _create_model(self, input_size: int) -> nn.Module:
        """Create model based on config.model_type."""
        model_type = self.config.model_type.lower()

        if model_type == 'lstm':
            model = StockLSTM(
                input_size=input_size,
                hidden_size=self.config.hidden_size,
                num_layers=self.config.num_layers,
                dropout=self.config.dropout,
                output_uncertainty=self.config.output_uncertainty
            )
        elif model_type in ['tft', 'transformer']:
            # TFT requires more specific feature counts
            # We'll use input_size for time-varying, and estimate static
            num_time_varying = min(input_size, 40)  # TFT typically uses 40
            num_static = 5  # Standard static feature count

            model = TemporalFusionTransformer(
                num_time_varying_features=num_time_varying,
                num_static_features=num_static,
                hidden_size=self.config.hidden_size,
                lstm_layers=self.config.num_layers,
                num_attention_heads=4,
                dropout=self.config.dropout,
                quantiles=self.config.quantiles
            )
        elif model_type == 'ensemble':
            # For ensemble, we train LSTM by default
            # The ensemble combiner uses pre-trained models
            model = StockLSTM(
                input_size=input_size,
                hidden_size=self.config.hidden_size,
                num_layers=self.config.num_layers,
                dropout=self.config.dropout,
                output_uncertainty=self.config.output_uncertainty
            )
        else:
            raise ValueError(f"Unknown model type: {model_type}")

        return model.to(self.device)

    def _get_loss_function(self) -> nn.Module:
        """Get loss function based on model type."""
        model_type = self.config.model_type.lower()

        if model_type in ['tft', 'transformer']:
            return QuantileLoss(quantiles=self.config.quantiles)
        else:
            return CombinedLoss()

    def _get_model_prefix(self) -> str:
        """Get model filename prefix based on type."""
        model_type = self.config.model_type.lower()

        if model_type in ['tft', 'transformer']:
            return 'tft'
        elif model_type == 'ensemble':
            return 'ensemble_lstm'
        else:
            return 'stock_lstm'

    def train(
        self,
        symbols: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        walk_forward: bool = True,
        n_folds: int = 5
    ) -> TrainingResult:
        """
        Train the model.

        Args:
            symbols: List of symbols to train on (None = all available)
            start_date: Training start date
            end_date: Training end date
            walk_forward: Use walk-forward validation
            n_folds: Number of walk-forward folds

        Returns:
            TrainingResult with model path and metrics
        """
        start_time = datetime.now()
        print(f"\n{'='*60}")
        print(f"TRAINING START: {start_time.isoformat()}")
        print(f"{'='*60}\n")

        # Prepare data
        print("Preparing data...")
        splits = self.feature_engine.prepare_data(
            symbols=symbols,
            start_date=start_date,
            end_date=end_date
        )

        if walk_forward:
            result = self._train_walk_forward(splits, n_folds)
        else:
            result = self._train_single_split(splits)

        # Training time
        training_time = (datetime.now() - start_time).total_seconds()
        result.training_time_seconds = training_time

        print(f"\n{'='*60}")
        print(f"TRAINING COMPLETE")
        print(f"Time: {training_time:.1f}s")
        print(f"Best validation loss: {result.best_val_loss:.6f}")
        print(f"Model saved: {result.model_path}")
        print(f"{'='*60}\n")

        return result

    def _train_single_split(
        self,
        splits: Dict[str, Tuple]
    ) -> TrainingResult:
        """Train on a single train/val/test split."""
        X_train, y_train, _, _ = splits['train']
        X_val, y_val, _, _ = splits['val']
        X_test, y_test, _, _ = splits['test']

        # Get input size from data
        input_size = X_train.shape[2]

        # Create model using factory method
        model = self._create_model(input_size)
        print(f"Created {self.config.model_type} model with {sum(p.numel() for p in model.parameters()):,} parameters")

        # Train
        history = self._train_model(
            model, X_train, y_train, X_val, y_val
        )

        # Evaluate on test
        test_metrics = self._evaluate(model, X_test, y_test)

        # Save model
        model_path = self._save_model(model, test_metrics)

        return TrainingResult(
            model_path=str(model_path),
            best_epoch=history[-1]['epoch'] if history else 0,
            best_val_loss=min(h['val_loss'] for h in history) if history else float('inf'),
            final_metrics=test_metrics,
            training_history=history,
            config=self.config.to_dict(),
            training_time_seconds=0
        )

    def _train_walk_forward(
        self,
        splits: Dict[str, Tuple],
        n_folds: int = 5
    ) -> TrainingResult:
        """
        Walk-forward training with expanding window.

        For each fold:
        1. Train on data up to fold boundary
        2. Validate on next period
        3. Test on held-out period

        This simulates real trading where we only have past data.
        """
        print(f"\nWalk-forward training with {n_folds} folds...")

        # Combine all data and re-split by date
        all_X = np.concatenate([
            splits['train'][0],
            splits['val'][0],
            splits['test'][0]
        ])
        all_y = np.concatenate([
            splits['train'][1],
            splits['val'][1],
            splits['test'][1]
        ])
        all_dates = np.concatenate([
            splits['train'][2],
            splits['val'][2],
            splits['test'][2]
        ])

        # Sort by date
        sort_idx = np.argsort(all_dates)
        all_X = all_X[sort_idx]
        all_y = all_y[sort_idx]
        all_dates = all_dates[sort_idx]

        # Create fold boundaries
        n_samples = len(all_X)
        fold_size = n_samples // (n_folds + 1)  # +1 for initial train set

        fold_results = []
        best_model = None
        best_val_loss = float('inf')
        all_history = []

        input_size = all_X.shape[2]

        for fold in range(n_folds):
            print(f"\n--- Fold {fold + 1}/{n_folds} ---")

            # Expanding window: train on all data up to this point
            train_end = (fold + 1) * fold_size
            val_start = train_end + self.config.purge_gap_days
            val_end = val_start + fold_size

            if val_end > n_samples:
                break

            X_train = all_X[:train_end]
            y_train = all_y[:train_end]
            X_val = all_X[val_start:val_end]
            y_val = all_y[val_start:val_end]

            print(f"  Train samples: {len(X_train):,}")
            print(f"  Val samples: {len(X_val):,}")

            # Create fresh model for each fold using factory method
            model = self._create_model(input_size)

            # Train
            history = self._train_model(
                model, X_train, y_train, X_val, y_val,
                epochs=self.config.epochs // 2  # Fewer epochs per fold
            )

            all_history.extend(history)

            # Evaluate
            val_metrics = self._evaluate(model, X_val, y_val)
            fold_results.append({
                'fold': fold + 1,
                'train_samples': len(X_train),
                'val_samples': len(X_val),
                'metrics': val_metrics
            })

            # Track best model
            if val_metrics['loss'] < best_val_loss:
                best_val_loss = val_metrics['loss']
                best_model = model

            print(f"  Val loss: {val_metrics['loss']:.6f}")
            print(f"  Val IC (Pearson): {val_metrics['ic']:.4f}")
            print(f"  Val IC (Spearman): {val_metrics.get('spearman_ic', 0):.4f}")

        # Calculate walk-forward efficiency
        # WFE measures how well in-sample performance translates to out-of-sample
        # WFE = OOS Sharpe / IS Sharpe; values > 0.5 suggest reasonable generalization
        train_sharpes = [r['metrics']['sharpe'] for r in fold_results if r['metrics']['sharpe'] > 0]
        test_sharpes = [r['metrics']['sharpe'] for r in fold_results]

        if train_sharpes and test_sharpes:
            avg_train_sharpe = np.mean(train_sharpes)
            avg_test_sharpe = np.mean(test_sharpes)
            wfe = avg_test_sharpe / avg_train_sharpe if avg_train_sharpe > 0 else 0
        else:
            wfe = 0

        # Also calculate IC-based WFE (more stable for prediction models)
        train_ics = [r['metrics']['ic'] for r in fold_results if r['metrics']['ic'] > 0]
        test_ics = [r['metrics']['ic'] for r in fold_results]
        if train_ics and test_ics:
            avg_train_ic = np.mean(train_ics)
            avg_test_ic = np.mean(test_ics)
            wfe_ic = avg_test_ic / avg_train_ic if avg_train_ic > 0 else 0
        else:
            wfe_ic = 0

        # Spearman IC-based WFE (most robust for quant)
        train_spearman_ics = [r['metrics'].get('spearman_ic', 0) for r in fold_results
                             if r['metrics'].get('spearman_ic', 0) > 0]
        test_spearman_ics = [r['metrics'].get('spearman_ic', 0) for r in fold_results]
        if train_spearman_ics and test_spearman_ics:
            avg_train_spearman = np.mean(train_spearman_ics)
            avg_test_spearman = np.mean(test_spearman_ics)
            wfe_spearman = avg_test_spearman / avg_train_spearman if avg_train_spearman > 0 else 0
        else:
            wfe_spearman = 0

        print(f"\nWalk-Forward Efficiency (Sharpe): {wfe * 100:.1f}%")
        print(f"Walk-Forward Efficiency (Pearson IC): {wfe_ic * 100:.1f}%")
        print(f"Walk-Forward Efficiency (Spearman IC): {wfe_spearman * 100:.1f}%")

        # WFE QUALITY THRESHOLDS
        # These thresholds help identify overfitting
        # Use Spearman IC-based WFE as primary metric (more robust)
        WFE_MIN_THRESHOLD = 0.3  # Below 30% suggests severe overfitting
        WFE_WARN_THRESHOLD = 0.5  # Below 50% is concerning

        # Use Spearman WFE if available, fall back to Pearson WFE
        wfe_metric = wfe_spearman if wfe_spearman > 0 else wfe_ic

        model_quality = "good"
        if wfe_metric < WFE_MIN_THRESHOLD:
            print(f"⚠️  WARNING: WFE ({wfe_metric:.1%}) below minimum threshold ({WFE_MIN_THRESHOLD:.0%})")
            print("    Model shows signs of severe overfitting. Consider:")
            print("    - Reducing model complexity (hidden_size, num_layers)")
            print("    - Increasing dropout")
            print("    - Using more training data")
            print("    - Adding regularization")
            model_quality = "poor"
        elif wfe_metric < WFE_WARN_THRESHOLD:
            print(f"⚠️  CAUTION: WFE ({wfe_metric:.1%}) below warning threshold ({WFE_WARN_THRESHOLD:.0%})")
            print("    Model may be overfitting. Monitor out-of-sample performance closely.")
            model_quality = "caution"

        # Save best model (or skip if quality is too poor)
        if best_model is not None:
            final_metrics = self._evaluate(
                best_model,
                splits['test'][0],
                splits['test'][1]
            )
            final_metrics['walk_forward_efficiency'] = wfe
            final_metrics['walk_forward_efficiency_ic'] = wfe_ic
            final_metrics['walk_forward_efficiency_spearman'] = wfe_spearman
            final_metrics['model_quality'] = model_quality

            if model_quality == "poor":
                print("\n❌ Model quality too poor - saving with '_overfit' suffix")
                # Still save, but mark as potentially overfit
                self.config.model_name = f"{self.config.model_name}_overfit"

            model_path = self._save_model(best_model, final_metrics)
        else:
            model_path = ""
            final_metrics = {'model_quality': 'failed'}

        return TrainingResult(
            model_path=str(model_path),
            best_epoch=0,
            best_val_loss=best_val_loss,
            final_metrics=final_metrics,
            training_history=all_history,
            config=self.config.to_dict(),
            training_time_seconds=0,
            walk_forward_results=fold_results
        )

    def _train_model(
        self,
        model: nn.Module,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
        epochs: Optional[int] = None
    ) -> List[Dict]:
        """Core training loop supporting LSTM and TFT."""
        epochs = epochs or self.config.epochs
        is_tft = self.config.model_type.lower() in ['tft', 'transformer']

        # Create data loaders
        train_dataset = TensorDataset(
            torch.FloatTensor(X_train),
            torch.FloatTensor(y_train)
        )
        val_dataset = TensorDataset(
            torch.FloatTensor(X_val),
            torch.FloatTensor(y_val)
        )

        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            drop_last=True
        )
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config.batch_size,
            shuffle=False
        )

        # Loss function (different for TFT vs LSTM)
        criterion = self._get_loss_function()

        # Optimizer
        optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay
        )

        # Scheduler
        scheduler = CosineAnnealingLR(
            optimizer,
            T_max=epochs,
            eta_min=self.config.learning_rate / 10
        )

        # Early stopping
        early_stopping = EarlyStopping(
            patience=self.config.early_stopping_patience,
            min_delta=self.config.min_delta
        )

        history = []
        best_val_loss = float('inf')
        best_state = None

        for epoch in range(epochs):
            # Training
            model.train()
            train_losses = []
            train_preds = []
            train_targets = []

            for X_batch, y_batch in train_loader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                optimizer.zero_grad()

                output = model(X_batch)

                # Handle different model outputs
                if is_tft:
                    # TFT outputs quantiles - use median for prediction
                    loss = criterion(output.predictions, y_batch)
                    predictions = output.predictions[:, 1]  # Median (q50)
                else:
                    # LSTM outputs prediction + log_variance
                    loss, _ = criterion(
                        output.prediction,
                        output.log_variance,
                        y_batch
                    )
                    predictions = output.prediction

                loss.backward()

                # Gradient clipping
                torch.nn.utils.clip_grad_norm_(
                    model.parameters(),
                    self.config.gradient_clip_norm
                )

                optimizer.step()

                train_losses.append(loss.item())
                train_preds.extend(predictions.detach().cpu().numpy())
                train_targets.extend(y_batch.cpu().numpy())

            # Validation
            model.eval()
            val_losses = []
            val_preds = []
            val_targets = []

            with torch.no_grad():
                for X_batch, y_batch in val_loader:
                    X_batch = X_batch.to(self.device)
                    y_batch = y_batch.to(self.device)

                    output = model(X_batch)

                    # Handle different model outputs
                    if is_tft:
                        loss = criterion(output.predictions, y_batch)
                        predictions = output.predictions[:, 1]  # Median
                    else:
                        loss, _ = criterion(
                            output.prediction,
                            output.log_variance,
                            y_batch
                        )
                        predictions = output.prediction

                    val_losses.append(loss.item())
                    val_preds.extend(predictions.cpu().numpy())
                    val_targets.extend(y_batch.cpu().numpy())

            # Calculate metrics
            train_loss = np.mean(train_losses)
            val_loss = np.mean(val_losses)

            # Pearson IC (traditional)
            train_ic = np.corrcoef(train_preds, train_targets)[0, 1]
            val_ic = np.corrcoef(val_preds, val_targets)[0, 1]

            # Spearman IC (more robust - primary metric for quant)
            train_spearman_ic, _ = spearmanr(train_preds, train_targets)
            val_spearman_ic, _ = spearmanr(val_preds, val_targets)

            train_mse = np.mean((np.array(train_preds) - np.array(train_targets)) ** 2)
            val_mse = np.mean((np.array(val_preds) - np.array(val_targets)) ** 2)

            train_dir_acc = np.mean(
                (np.array(train_preds) > 0) == (np.array(train_targets) > 0)
            )
            val_dir_acc = np.mean(
                (np.array(val_preds) > 0) == (np.array(val_targets) > 0)
            )

            current_lr = optimizer.param_groups[0]['lr']

            metrics = TrainingMetrics(
                epoch=epoch + 1,
                train_loss=train_loss,
                val_loss=val_loss,
                train_mse=train_mse,
                val_mse=val_mse,
                train_ic=train_ic if not np.isnan(train_ic) else 0,
                val_ic=val_ic if not np.isnan(val_ic) else 0,
                train_spearman_ic=train_spearman_ic if not np.isnan(train_spearman_ic) else 0,
                val_spearman_ic=val_spearman_ic if not np.isnan(val_spearman_ic) else 0,
                train_direction_acc=train_dir_acc,
                val_direction_acc=val_dir_acc,
                learning_rate=current_lr
            )
            history.append(asdict(metrics))

            # Print progress
            if (epoch + 1) % 5 == 0 or epoch == 0:
                print(
                    f"Epoch {epoch + 1:3d}: "
                    f"train_loss={train_loss:.4f}, val_loss={val_loss:.4f}, "
                    f"val_SpearmanIC={val_spearman_ic:.4f}, val_dir_acc={val_dir_acc:.2%}"
                )

            # Save best model
            if val_loss < best_val_loss:
                best_val_loss = val_loss
                best_state = model.state_dict().copy()

            # Learning rate scheduling
            scheduler.step()

            # Early stopping
            if early_stopping(val_loss):
                print(f"Early stopping at epoch {epoch + 1}")
                break

        # Restore best model
        if best_state is not None:
            model.load_state_dict(best_state)

        return history

    def _evaluate(
        self,
        model: nn.Module,
        X: np.ndarray,
        y: np.ndarray
    ) -> Dict:
        """Evaluate model on a dataset."""
        model.eval()
        is_tft = self.config.model_type.lower() in ['tft', 'transformer']

        dataset = TensorDataset(
            torch.FloatTensor(X),
            torch.FloatTensor(y)
        )
        loader = DataLoader(dataset, batch_size=self.config.batch_size)

        all_preds = []
        all_targets = []
        all_stds = []
        losses = []

        criterion = self._get_loss_function()
        nll_criterion = GaussianNLLLoss()

        with torch.no_grad():
            for X_batch, y_batch in loader:
                X_batch = X_batch.to(self.device)
                y_batch = y_batch.to(self.device)

                output = model(X_batch)

                if is_tft:
                    # TFT - use quantile loss and derive std from quantile spread
                    loss = criterion(output.predictions, y_batch)
                    predictions = output.predictions[:, 1]  # Median (q50)
                    # Approximate std from interquantile range
                    q90 = output.predictions[:, 2]
                    q10 = output.predictions[:, 0]
                    stds = (q90 - q10) / 2.56  # ~2 * 1.28 for 10-90 percentile
                else:
                    # LSTM
                    loss = nll_criterion(
                        output.prediction,
                        output.log_variance,
                        y_batch
                    )
                    predictions = output.prediction
                    stds = torch.exp(0.5 * output.log_variance)

                losses.append(loss.item())
                all_preds.extend(predictions.cpu().numpy())
                all_targets.extend(y_batch.cpu().numpy())
                all_stds.extend(stds.cpu().numpy())

        preds = np.array(all_preds)
        targets = np.array(all_targets)
        stds = np.array(all_stds)

        # ==========================================
        # BASIC METRICS
        # ==========================================
        # Pearson IC (linear correlation)
        ic = np.corrcoef(preds, targets)[0, 1]

        # Spearman IC (rank correlation) - MORE ROBUST for financial data
        # Less sensitive to outliers and captures monotonic relationships
        # This is the primary metric used by most quant funds
        spearman_ic, _ = spearmanr(preds, targets)

        mse = np.mean((preds - targets) ** 2)
        rmse = np.sqrt(mse)
        mae = np.mean(np.abs(preds - targets))
        direction_acc = np.mean((preds > 0) == (targets > 0))

        # IC Information Ratio (use Spearman for stability)
        ic_ir = spearman_ic / (np.std(preds) + 1e-8)

        # Calibration: check if std estimates are reasonable
        within_1_std = np.mean(np.abs(preds - targets) < stds)

        # ==========================================
        # RETURN-BASED METRICS
        # ==========================================
        # Simulate strategy returns based on predictions
        # Long when prediction > 0, short when < 0
        strategy_returns = np.sign(preds) * targets

        # Sharpe Ratio (annualized, assuming 21-day forward returns)
        # Since targets are 21-day returns, we annualize by sqrt(252/21) ~ sqrt(12)
        if len(strategy_returns) > 1:
            sharpe = np.mean(strategy_returns) / (np.std(strategy_returns) + 1e-8) * np.sqrt(12)
        else:
            sharpe = 0

        # Sortino Ratio (penalizes only downside volatility)
        downside_returns = strategy_returns[strategy_returns < 0]
        if len(downside_returns) > 0:
            downside_std = np.std(downside_returns)
            sortino = np.mean(strategy_returns) / (downside_std + 1e-8) * np.sqrt(12)
        else:
            sortino = sharpe  # No downside = use Sharpe

        # ==========================================
        # DRAWDOWN METRICS
        # ==========================================
        # Simulate equity curve from strategy returns
        cumulative_returns = np.cumprod(1 + strategy_returns)
        running_max = np.maximum.accumulate(cumulative_returns)
        drawdowns = (cumulative_returns - running_max) / running_max

        max_drawdown = np.min(drawdowns)  # Most negative
        avg_drawdown = np.mean(drawdowns[drawdowns < 0]) if np.any(drawdowns < 0) else 0

        # Calmar Ratio (return / max drawdown)
        total_return = cumulative_returns[-1] - 1 if len(cumulative_returns) > 0 else 0
        calmar = total_return / (abs(max_drawdown) + 1e-8) if max_drawdown < 0 else total_return

        # ==========================================
        # TAIL RISK METRICS
        # ==========================================
        # Value at Risk (5% and 1%)
        var_5 = np.percentile(strategy_returns, 5)
        var_1 = np.percentile(strategy_returns, 1)

        # Conditional VaR (Expected Shortfall) - average of worst 5%
        cvar_5 = np.mean(strategy_returns[strategy_returns <= var_5]) if np.any(strategy_returns <= var_5) else var_5

        # Skewness and Kurtosis
        if len(strategy_returns) > 2:
            skewness = float(pd.Series(strategy_returns).skew())
            kurtosis = float(pd.Series(strategy_returns).kurtosis())
        else:
            skewness = 0
            kurtosis = 0

        # ==========================================
        # PREDICTION QUALITY METRICS
        # ==========================================
        # Rank IC (Spearman correlation) - already computed above as spearman_ic
        rank_ic = spearman_ic

        # Hit rate by quintile (top 20% predictions should have best returns)
        pred_quintiles = pd.qcut(preds, 5, labels=False, duplicates='drop')
        if len(np.unique(pred_quintiles)) == 5:
            quintile_returns = pd.DataFrame({'pred_q': pred_quintiles, 'ret': targets}).groupby('pred_q')['ret'].mean()
            top_quintile_return = quintile_returns.iloc[-1] if len(quintile_returns) > 0 else 0
            bottom_quintile_return = quintile_returns.iloc[0] if len(quintile_returns) > 0 else 0
            long_short_spread = top_quintile_return - bottom_quintile_return
        else:
            top_quintile_return = 0
            bottom_quintile_return = 0
            long_short_spread = 0

        return {
            # Basic metrics
            'loss': np.mean(losses),
            'mse': mse,
            'rmse': rmse,
            'mae': mae,
            'ic': ic if not np.isnan(ic) else 0,
            'spearman_ic': spearman_ic if not np.isnan(spearman_ic) else 0,  # Primary metric for quant
            'rank_ic': rank_ic if not np.isnan(rank_ic) else 0,  # Alias for spearman_ic
            'ic_ir': ic_ir if not np.isnan(ic_ir) else 0,
            'direction_accuracy': direction_acc,
            # Return metrics
            'sharpe': sharpe,
            'sortino': sortino,
            'calmar': calmar,
            'total_return': total_return,
            # Drawdown metrics
            'max_drawdown': max_drawdown,
            'avg_drawdown': avg_drawdown,
            # Tail risk metrics
            'var_5': var_5,
            'var_1': var_1,
            'cvar_5': cvar_5,
            'skewness': skewness,
            'kurtosis': kurtosis,
            # Prediction quality
            'long_short_spread': long_short_spread,
            'top_quintile_return': top_quintile_return,
            'bottom_quintile_return': bottom_quintile_return,
            # Calibration
            'calibration_1std': within_1_std,
            'mean_predicted_std': np.mean(stds),
            'n_samples': len(preds)
        }

    def _save_model(
        self,
        model: nn.Module,
        metrics: Dict
    ) -> Path:
        """Save model checkpoint."""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        prefix = self._get_model_prefix()
        model_name = f"{prefix}_{timestamp}"
        model_path = CHECKPOINT_DIR / f"{model_name}.pt"

        # Ensure directory exists
        CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)

        # Save checkpoint
        checkpoint = {
            'model_state_dict': model.state_dict(),
            'config': self.config.to_dict(),
            'metrics': metrics,
            'timestamp': timestamp
        }

        torch.save(checkpoint, model_path)
        print(f"Model saved: {model_path}")

        # Also save metrics as JSON for easy inspection
        metrics_path = CHECKPOINT_DIR / f"{model_name}_metrics.json"
        with open(metrics_path, 'w') as f:
            json.dump({
                'config': self.config.to_dict(),
                'metrics': metrics,
                'timestamp': timestamp
            }, f, indent=2, default=str)

        return model_path


def train_model(
    start_date: str = '2015-01-01',
    end_date: Optional[str] = None,
    model_type: str = 'lstm',
    epochs: int = 100,
    batch_size: int = 64,
    validation_split: float = 0.15,
    walk_forward: bool = True,
    verbose: bool = True,
    checkpoint_dir: Optional[str] = None,
    **kwargs
) -> Dict:
    """
    Entry point for training from Node.js bridge.

    Returns training results as dictionary.
    """
    # Build config
    config = ModelConfig(
        model_type=model_type,
        epochs=epochs,
        batch_size=batch_size,
        val_ratio=validation_split,
        **{k: v for k, v in kwargs.items() if hasattr(ModelConfig, k)}
    )

    if checkpoint_dir:
        config.checkpoint_dir = Path(checkpoint_dir)

    # Create trainer and train
    trainer = ModelTrainer(config=config)

    result = trainer.train(
        start_date=start_date,
        end_date=end_date,
        walk_forward=walk_forward,
        n_folds=5
    )

    # Convert to serializable dict
    return {
        'success': True,
        'model_path': result.model_path,
        'best_epoch': result.best_epoch,
        'best_val_loss': result.best_val_loss,
        'final_metrics': result.final_metrics,
        'training_history': result.training_history[-10:],  # Last 10 epochs
        'training_time_seconds': result.training_time_seconds,
        'walk_forward_results': result.walk_forward_results
    }


# Quick test
if __name__ == '__main__':
    print("Testing ModelTrainer...")

    config = ModelConfig(
        epochs=5,  # Quick test
        batch_size=32,
        hidden_size=64,
        sequence_length=30
    )

    trainer = ModelTrainer(config=config)

    # This requires actual data in the database
    # result = trainer.train(start_date='2020-01-01', end_date='2024-01-01')
    # print(f"Training result: {result}")

    print("Trainer initialized successfully")
