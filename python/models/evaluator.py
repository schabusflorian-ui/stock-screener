# python/models/evaluator.py
# Model evaluation and metrics calculation

import torch
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from scipy import stats
import json

from .config import CHECKPOINT_DIR


def calculate_ic(predictions: np.ndarray, actual: np.ndarray) -> float:
    """
    Calculate Information Coefficient (Pearson correlation).

    IC measures the linear relationship between predictions and actual returns.
    Higher IC = better predictive power.
    """
    if len(predictions) < 2:
        return 0.0

    # Remove NaN values
    mask = ~(np.isnan(predictions) | np.isnan(actual))
    if mask.sum() < 2:
        return 0.0

    return np.corrcoef(predictions[mask], actual[mask])[0, 1]


def calculate_rank_ic(predictions: np.ndarray, actual: np.ndarray) -> float:
    """
    Calculate Rank IC (Spearman correlation).

    More robust to outliers than Pearson IC.
    """
    if len(predictions) < 2:
        return 0.0

    mask = ~(np.isnan(predictions) | np.isnan(actual))
    if mask.sum() < 2:
        return 0.0

    return stats.spearmanr(predictions[mask], actual[mask])[0]


def calculate_icir(ic_series: np.ndarray) -> float:
    """
    Calculate IC Information Ratio.

    ICIR = mean(IC) / std(IC)
    Higher ICIR = more consistent predictive power.
    Target: ICIR > 0.5
    """
    if len(ic_series) < 2:
        return 0.0

    mean_ic = np.nanmean(ic_series)
    std_ic = np.nanstd(ic_series)

    if std_ic == 0:
        return 0.0

    return mean_ic / std_ic


def calculate_direction_accuracy(predictions: np.ndarray, actual: np.ndarray) -> float:
    """
    Calculate percentage of correct direction predictions.

    Target: > 52% (better than random)
    """
    if len(predictions) < 1:
        return 0.5

    mask = ~(np.isnan(predictions) | np.isnan(actual))
    if mask.sum() < 1:
        return 0.5

    correct = (np.sign(predictions[mask]) == np.sign(actual[mask]))
    return correct.mean()


def calculate_quantile_calibration(
    predictions: np.ndarray,
    stds: np.ndarray,
    actual: np.ndarray
) -> Dict[str, float]:
    """
    Check if uncertainty estimates are well-calibrated.

    For a well-calibrated model:
    - ~68% of actual values should fall within 1 std
    - ~95% of actual values should fall within 2 std
    """
    if len(predictions) < 10:
        return {'1_std': 0.5, '2_std': 0.5}

    mask = ~(np.isnan(predictions) | np.isnan(stds) | np.isnan(actual))
    preds = predictions[mask]
    sigmas = stds[mask]
    actuals = actual[mask]

    errors = np.abs(actuals - preds)

    within_1_std = (errors < sigmas).mean()
    within_2_std = (errors < 2 * sigmas).mean()

    return {
        '1_std': within_1_std,
        '2_std': within_2_std,
        '1_std_expected': 0.68,
        '2_std_expected': 0.95
    }


def calculate_sharpe_ratio(
    returns: np.ndarray,
    risk_free_rate: float = 0.02,
    periods_per_year: int = 252
) -> float:
    """
    Calculate annualized Sharpe ratio from returns.
    """
    if len(returns) < 2:
        return 0.0

    mask = ~np.isnan(returns)
    if mask.sum() < 2:
        return 0.0

    returns = returns[mask]
    daily_rf = risk_free_rate / periods_per_year

    excess_returns = returns - daily_rf
    mean_excess = excess_returns.mean()
    std_excess = excess_returns.std()

    if std_excess == 0:
        return 0.0

    return (mean_excess / std_excess) * np.sqrt(periods_per_year)


def calculate_sortino_ratio(
    returns: np.ndarray,
    risk_free_rate: float = 0.02,
    periods_per_year: int = 252
) -> float:
    """
    Calculate annualized Sortino ratio (uses downside deviation).
    """
    if len(returns) < 2:
        return 0.0

    mask = ~np.isnan(returns)
    if mask.sum() < 2:
        return 0.0

    returns = returns[mask]
    daily_rf = risk_free_rate / periods_per_year

    excess_returns = returns - daily_rf
    mean_excess = excess_returns.mean()

    # Downside deviation
    negative_returns = excess_returns[excess_returns < 0]
    if len(negative_returns) < 1:
        return 0.0

    downside_std = np.sqrt((negative_returns ** 2).mean())

    if downside_std == 0:
        return 0.0

    return (mean_excess / downside_std) * np.sqrt(periods_per_year)


def calculate_max_drawdown(equity_curve: np.ndarray) -> float:
    """
    Calculate maximum drawdown from equity curve.
    """
    if len(equity_curve) < 2:
        return 0.0

    mask = ~np.isnan(equity_curve)
    if mask.sum() < 2:
        return 0.0

    equity = equity_curve[mask]

    # Running maximum
    running_max = np.maximum.accumulate(equity)

    # Drawdown at each point
    drawdowns = (running_max - equity) / running_max

    return drawdowns.max()


def evaluate_predictions(
    predictions: np.ndarray,
    actual: np.ndarray,
    stds: Optional[np.ndarray] = None,
    dates: Optional[np.ndarray] = None
) -> Dict[str, float]:
    """
    Comprehensive evaluation of model predictions.

    Args:
        predictions: Predicted returns
        actual: Actual returns
        stds: Predicted standard deviations (for calibration check)
        dates: Dates for time-series analysis

    Returns:
        Dictionary of evaluation metrics
    """
    metrics = {}

    # Correlation-based metrics
    metrics['ic'] = calculate_ic(predictions, actual)
    metrics['rank_ic'] = calculate_rank_ic(predictions, actual)
    metrics['direction_accuracy'] = calculate_direction_accuracy(predictions, actual)

    # Error metrics
    mask = ~(np.isnan(predictions) | np.isnan(actual))
    if mask.sum() > 0:
        errors = predictions[mask] - actual[mask]
        metrics['mse'] = (errors ** 2).mean()
        metrics['rmse'] = np.sqrt(metrics['mse'])
        metrics['mae'] = np.abs(errors).mean()

    # Calibration (if uncertainty provided)
    if stds is not None:
        calibration = calculate_quantile_calibration(predictions, stds, actual)
        metrics['calibration_1std'] = calibration['1_std']
        metrics['calibration_2std'] = calibration['2_std']
        metrics['mean_predicted_std'] = np.nanmean(stds)

    # Time-series IC if dates provided
    if dates is not None:
        df = pd.DataFrame({
            'date': pd.to_datetime(dates),
            'prediction': predictions,
            'actual': actual
        })
        df = df.dropna()

        if len(df) > 0:
            # Monthly IC
            df['month'] = df['date'].dt.to_period('M')
            monthly_ic = df.groupby('month').apply(
                lambda x: calculate_ic(x['prediction'].values, x['actual'].values)
            )
            metrics['icir'] = calculate_icir(monthly_ic.values)
            metrics['ic_mean'] = monthly_ic.mean()
            metrics['ic_std'] = monthly_ic.std()

    return metrics


def get_model_metrics(checkpoint_dir: str) -> Dict:
    """
    Get metrics from all models in checkpoint directory.

    Entry point from Node.js bridge.
    """
    checkpoint_path = Path(checkpoint_dir)

    if not checkpoint_path.exists():
        return {'error': f'Directory not found: {checkpoint_dir}'}

    models = []
    for path in checkpoint_path.glob('*.pt'):
        try:
            # Load checkpoint
            checkpoint = torch.load(path, map_location='cpu')

            model_info = {
                'name': path.stem,
                'path': str(path),
                'timestamp': checkpoint.get('timestamp', 'unknown'),
                'config': checkpoint.get('config', {}),
                'metrics': checkpoint.get('metrics', {})
            }

            # Also load JSON metrics if available
            json_path = path.with_suffix('').with_suffix('.json')
            if json_path.exists():
                with open(json_path, 'r') as f:
                    json_metrics = json.load(f)
                    model_info['metrics'].update(json_metrics.get('metrics', {}))

            models.append(model_info)
        except Exception as e:
            print(f"Error loading {path}: {e}")

    # Sort by timestamp
    models.sort(key=lambda m: m.get('timestamp', ''), reverse=True)

    return {
        'models': models,
        'count': len(models),
        'latest': models[0] if models else None,
        'checkpoint_dir': str(checkpoint_path)
    }


def compare_models(
    model_a_path: str,
    model_b_path: str,
    test_data: Optional[Tuple[np.ndarray, np.ndarray]] = None
) -> Dict:
    """
    Compare two models.

    Args:
        model_a_path: Path to first model
        model_b_path: Path to second model
        test_data: Optional (X, y) tuple for live comparison

    Returns:
        Comparison results
    """
    checkpoint_a = torch.load(model_a_path, map_location='cpu')
    checkpoint_b = torch.load(model_b_path, map_location='cpu')

    metrics_a = checkpoint_a.get('metrics', {})
    metrics_b = checkpoint_b.get('metrics', {})

    comparison = {
        'model_a': {
            'path': model_a_path,
            'timestamp': checkpoint_a.get('timestamp'),
            'metrics': metrics_a
        },
        'model_b': {
            'path': model_b_path,
            'timestamp': checkpoint_b.get('timestamp'),
            'metrics': metrics_b
        },
        'comparison': {}
    }

    # Compare key metrics
    key_metrics = ['ic', 'direction_accuracy', 'rmse', 'sharpe']

    for metric in key_metrics:
        val_a = metrics_a.get(metric)
        val_b = metrics_b.get(metric)

        if val_a is not None and val_b is not None:
            if metric in ['ic', 'direction_accuracy', 'sharpe']:
                # Higher is better
                winner = 'A' if val_a > val_b else ('B' if val_b > val_a else 'tie')
            else:
                # Lower is better
                winner = 'A' if val_a < val_b else ('B' if val_b < val_a else 'tie')

            comparison['comparison'][metric] = {
                'a': val_a,
                'b': val_b,
                'winner': winner
            }

    # Overall winner
    a_wins = sum(1 for m in comparison['comparison'].values() if m['winner'] == 'A')
    b_wins = sum(1 for m in comparison['comparison'].values() if m['winner'] == 'B')

    comparison['overall_winner'] = 'A' if a_wins > b_wins else ('B' if b_wins > a_wins else 'tie')
    comparison['confidence'] = abs(a_wins - b_wins) / max(len(comparison['comparison']), 1)

    return comparison


def calculate_quintile_hit_rate(
    predictions: np.ndarray,
    actual: np.ndarray,
    n_quantiles: int = 5
) -> Dict[str, float]:
    """
    Calculate hit rate for each quintile.

    Returns hit rate for top and bottom quintiles - measures
    if high predictions correspond to high returns.
    """
    if len(predictions) < n_quantiles * 10:
        return {'top_quintile': 0.5, 'bottom_quintile': 0.5, 'spread': 0.0}

    mask = ~(np.isnan(predictions) | np.isnan(actual))
    preds = predictions[mask]
    actuals = actual[mask]

    try:
        pred_quintiles = pd.qcut(preds, n_quantiles, labels=False, duplicates='drop')
        actual_quintiles = pd.qcut(actuals, n_quantiles, labels=False, duplicates='drop')
    except ValueError:
        return {'top_quintile': 0.5, 'bottom_quintile': 0.5, 'spread': 0.0}

    top_q = n_quantiles - 1

    # Top quintile hit rate: % of top predictions that are in top actual returns
    top_mask = pred_quintiles == top_q
    top_hit_rate = (actual_quintiles[top_mask] == top_q).mean() if top_mask.sum() > 0 else 0.5

    # Bottom quintile hit rate
    bottom_mask = pred_quintiles == 0
    bottom_hit_rate = (actual_quintiles[bottom_mask] == 0).mean() if bottom_mask.sum() > 0 else 0.5

    # Long-short spread: average return of top quintile minus bottom quintile
    top_return = actuals[top_mask].mean() if top_mask.sum() > 0 else 0
    bottom_return = actuals[bottom_mask].mean() if bottom_mask.sum() > 0 else 0
    spread = top_return - bottom_return

    return {
        'top_quintile': float(top_hit_rate),
        'bottom_quintile': float(bottom_hit_rate),
        'spread': float(spread),
        'top_avg_return': float(top_return),
        'bottom_avg_return': float(bottom_return)
    }


def bootstrap_confidence_interval(
    predictions: np.ndarray,
    actual: np.ndarray,
    metric_fn: callable,
    n_bootstrap: int = 1000,
    confidence: float = 0.95,
    block_size: int = 21
) -> Dict[str, float]:
    """
    Calculate bootstrap confidence interval for a metric.

    Uses block bootstrap to preserve time-series autocorrelation.

    Args:
        predictions: Predicted values
        actual: Actual values
        metric_fn: Function that takes (predictions, actual) and returns float
        n_bootstrap: Number of bootstrap samples
        confidence: Confidence level (default 95%)
        block_size: Size of blocks for block bootstrap

    Returns:
        Dictionary with mean, lower CI, upper CI, and std
    """
    n = len(predictions)
    if n < block_size * 2:
        return {'mean': metric_fn(predictions, actual), 'ci_lower': np.nan, 'ci_upper': np.nan}

    bootstrap_values = []

    for _ in range(n_bootstrap):
        # Block bootstrap
        n_blocks = int(np.ceil(n / block_size))
        indices = []

        for _ in range(n_blocks):
            start_idx = np.random.randint(0, n - block_size + 1)
            indices.extend(range(start_idx, start_idx + block_size))

        indices = np.array(indices[:n])  # Trim to original size

        # Calculate metric on bootstrap sample
        boot_preds = predictions[indices]
        boot_actual = actual[indices]

        try:
            value = metric_fn(boot_preds, boot_actual)
            if not np.isnan(value):
                bootstrap_values.append(value)
        except:
            pass

    if len(bootstrap_values) < 100:
        return {'mean': metric_fn(predictions, actual), 'ci_lower': np.nan, 'ci_upper': np.nan}

    alpha = 1 - confidence
    ci_lower = np.percentile(bootstrap_values, alpha / 2 * 100)
    ci_upper = np.percentile(bootstrap_values, (1 - alpha / 2) * 100)

    return {
        'mean': float(np.mean(bootstrap_values)),
        'ci_lower': float(ci_lower),
        'ci_upper': float(ci_upper),
        'std': float(np.std(bootstrap_values)),
        'n_valid_samples': len(bootstrap_values)
    }


def calculate_regime_metrics(
    predictions: np.ndarray,
    actual: np.ndarray,
    regime_labels: np.ndarray
) -> Dict[str, Dict[str, float]]:
    """
    Calculate metrics stratified by market regime.

    Args:
        predictions: Model predictions
        actual: Actual returns
        regime_labels: Array of regime labels ('bull', 'bear', 'high_vol', 'crisis')

    Returns:
        Dictionary with metrics per regime
    """
    results = {}

    for regime in ['bull', 'bear', 'high_vol', 'crisis', 'all']:
        if regime == 'all':
            mask = np.ones(len(predictions), dtype=bool)
        else:
            mask = np.array(regime_labels) == regime

        if mask.sum() < 10:
            results[regime] = {
                'n_samples': int(mask.sum()),
                'ic': np.nan,
                'rank_ic': np.nan,
                'direction_accuracy': np.nan,
                'status': 'insufficient_data'
            }
            continue

        preds = predictions[mask]
        rets = actual[mask]

        results[regime] = {
            'n_samples': int(mask.sum()),
            'ic': float(calculate_ic(preds, rets)),
            'rank_ic': float(calculate_rank_ic(preds, rets)),
            'direction_accuracy': float(calculate_direction_accuracy(preds, rets)),
            'mean_return': float(np.nanmean(rets)),
            'mean_prediction': float(np.nanmean(preds)),
            'return_std': float(np.nanstd(rets)),
            'status': 'ok'
        }

    return results


def calculate_overfitting_metrics(
    train_predictions: np.ndarray,
    train_actual: np.ndarray,
    test_predictions: np.ndarray,
    test_actual: np.ndarray,
    fold_metrics: Optional[List[Dict]] = None
) -> Dict[str, float]:
    """
    Calculate overfitting detection metrics.

    Args:
        train_predictions: Predictions on training data
        train_actual: Actual values on training data
        test_predictions: Predictions on test data
        test_actual: Actual values on test data
        fold_metrics: Optional list of per-fold metrics for stability calculation

    Returns:
        Dictionary with overfitting metrics
    """
    # Calculate ICs
    train_ic = calculate_ic(train_predictions, train_actual)
    test_ic = calculate_ic(test_predictions, test_actual)

    # IC Gap
    ic_gap = (train_ic - test_ic) / train_ic if train_ic > 0 else np.nan

    # Sharpe ratios
    train_returns = np.sign(train_predictions) * train_actual
    test_returns = np.sign(test_predictions) * test_actual

    train_sharpe = calculate_sharpe_ratio(train_returns)
    test_sharpe = calculate_sharpe_ratio(test_returns)

    # Walk-Forward Efficiency
    wfe = test_sharpe / train_sharpe if train_sharpe > 0 else np.nan

    # Parameter stability (if fold metrics provided)
    stability = np.nan
    if fold_metrics and len(fold_metrics) >= 3:
        fold_sharpes = [f.get('sharpe', f.get('test_sharpe', 0)) for f in fold_metrics]
        fold_sharpes = [s for s in fold_sharpes if s is not None and not np.isnan(s)]
        if len(fold_sharpes) >= 3:
            cv = np.std(fold_sharpes) / abs(np.mean(fold_sharpes)) if np.mean(fold_sharpes) != 0 else 0
            stability = 1 - cv

    return {
        'train_ic': float(train_ic),
        'test_ic': float(test_ic),
        'ic_gap': float(ic_gap) if not np.isnan(ic_gap) else None,
        'train_sharpe': float(train_sharpe),
        'test_sharpe': float(test_sharpe),
        'wfe': float(wfe) if not np.isnan(wfe) else None,
        'stability': float(stability) if not np.isnan(stability) else None
    }


# Quick test
if __name__ == '__main__':
    print("Testing evaluator...")

    # Test metrics
    np.random.seed(42)
    predictions = np.random.randn(1000) * 0.02
    actual = predictions * 0.3 + np.random.randn(1000) * 0.02  # Some correlation
    stds = np.ones(1000) * 0.02

    metrics = evaluate_predictions(predictions, actual, stds)
    print("\nEvaluation metrics:")
    for k, v in metrics.items():
        print(f"  {k}: {v:.4f}")

    # Test quintile hit rate
    print("\nQuintile hit rate:")
    quintile_metrics = calculate_quintile_hit_rate(predictions, actual)
    for k, v in quintile_metrics.items():
        print(f"  {k}: {v:.4f}")

    # Test bootstrap CI
    print("\nBootstrap CI for IC:")
    ci = bootstrap_confidence_interval(predictions, actual, calculate_ic, n_bootstrap=500)
    print(f"  IC: {ci['mean']:.4f} [{ci['ci_lower']:.4f}, {ci['ci_upper']:.4f}]")

    # Test model metrics
    model_metrics = get_model_metrics(str(CHECKPOINT_DIR))
    print(f"\nModels found: {model_metrics['count']}")

    print("\nEvaluator test complete!")
