# python/explainability/shap_explainer.py
"""
Model Explainability using SHAP (SHapley Additive exPlanations).

Provides model-agnostic explanations for ML predictions:
- SHAP values for individual predictions
- Global feature importance
- Feature interaction analysis
- Model comparison and diagnostics

Supports:
- XGBoost / LightGBM (TreeExplainer)
- Deep Learning models (DeepExplainer/GradientExplainer)
- Any model (KernelExplainer - slower but universal)
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field, asdict
from pathlib import Path
import json
import warnings
from datetime import datetime

try:
    import shap
    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False
    warnings.warn("SHAP not installed. Run: pip install shap")

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

try:
    import lightgbm as lgb
    HAS_LGB = True
except ImportError:
    HAS_LGB = False

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


@dataclass
class FeatureImportance:
    """Feature importance results."""
    feature_names: List[str]
    importance_values: List[float]
    importance_type: str  # 'shap', 'gain', 'permutation'
    model_type: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict:
        # Create ranking list sorted by importance
        sorted_idx = np.argsort(self.importance_values)[::-1]
        ranking = [
            {'feature': self.feature_names[i], 'importance': float(self.importance_values[i])}
            for i in sorted_idx
        ]
        return {
            'features': dict(zip(self.feature_names, self.importance_values)),
            'feature_importance': dict(zip(self.feature_names, self.importance_values)),
            'ranking': ranking,
            'importance_type': self.importance_type,
            'model_type': self.model_type,
            'timestamp': self.timestamp,
            'top_10': dict(zip(
                self.feature_names[:10],
                self.importance_values[:10]
            ))
        }

    def get_top_n(self, n: int = 10) -> Dict[str, float]:
        """Get top N most important features."""
        sorted_idx = np.argsort(self.importance_values)[::-1][:n]
        return {
            self.feature_names[i]: self.importance_values[i]
            for i in sorted_idx
        }


@dataclass
class ExplanationResult:
    """Result of explaining a single prediction."""
    prediction: float
    base_value: float
    shap_values: Dict[str, float]
    feature_values: Dict[str, float]
    top_positive_features: List[Tuple[str, float]]
    top_negative_features: List[Tuple[str, float]]
    model_type: str
    symbol: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict:
        return {
            'prediction': self.prediction,
            'base_value': self.base_value,
            'shap_values': self.shap_values,
            'feature_values': self.feature_values,
            'top_positive': self.top_positive_features,
            'top_negative': self.top_negative_features,
            'model_type': self.model_type,
            'symbol': self.symbol,
            'timestamp': self.timestamp,
            'explanation_summary': self._generate_summary()
        }

    def _generate_summary(self) -> str:
        """Generate human-readable explanation summary."""
        summary_parts = []

        if self.top_positive_features:
            top_pos = self.top_positive_features[0]
            summary_parts.append(
                f"Main bullish factor: {top_pos[0]} (contributes +{top_pos[1]:.4f})"
            )

        if self.top_negative_features:
            top_neg = self.top_negative_features[0]
            summary_parts.append(
                f"Main bearish factor: {top_neg[0]} (contributes {top_neg[1]:.4f})"
            )

        direction = "bullish" if self.prediction > self.base_value else "bearish"
        summary_parts.append(
            f"Overall prediction is {direction} relative to baseline"
        )

        return " | ".join(summary_parts)


class ModelExplainer:
    """
    Universal model explainer using SHAP.

    Automatically selects the best explainer type based on the model:
    - TreeExplainer for XGBoost/LightGBM (fast, exact)
    - DeepExplainer for PyTorch models
    - KernelExplainer for any model (slower)
    """

    def __init__(
        self,
        model: Any,
        model_type: str = 'auto',
        feature_names: Optional[List[str]] = None,
        background_data: Optional[np.ndarray] = None,
        n_background_samples: int = 100
    ):
        """
        Initialize explainer.

        Args:
            model: Trained model (XGBoost, LightGBM, PyTorch, or sklearn)
            model_type: 'xgboost', 'lightgbm', 'pytorch', 'sklearn', or 'auto'
            feature_names: Names of features
            background_data: Background data for SHAP (required for some explainers)
            n_background_samples: Number of background samples to use
        """
        if not HAS_SHAP:
            raise ImportError("SHAP not installed. Run: pip install shap")

        self.model = model
        self.model_type = self._detect_model_type(model) if model_type == 'auto' else model_type
        self.feature_names = feature_names
        self.background_data = background_data
        self.n_background_samples = n_background_samples

        # Create appropriate explainer
        self.explainer = self._create_explainer()

    def _detect_model_type(self, model: Any) -> str:
        """Auto-detect model type."""
        model_class = type(model).__name__

        if HAS_XGB and isinstance(model, (xgb.XGBRegressor, xgb.XGBClassifier, xgb.Booster)):
            return 'xgboost'
        elif HAS_LGB and isinstance(model, (lgb.LGBMRegressor, lgb.LGBMClassifier, lgb.Booster)):
            return 'lightgbm'
        elif HAS_TORCH and isinstance(model, torch.nn.Module):
            return 'pytorch'
        elif hasattr(model, 'predict'):
            return 'sklearn'
        else:
            return 'generic'

    def _create_explainer(self) -> Any:
        """Create appropriate SHAP explainer."""
        if self.model_type in ['xgboost', 'lightgbm']:
            # TreeExplainer is fast and exact for tree models
            return shap.TreeExplainer(self.model)

        elif self.model_type == 'pytorch':
            if self.background_data is None:
                raise ValueError("background_data required for PyTorch models")

            # Sample background data
            if len(self.background_data) > self.n_background_samples:
                idx = np.random.choice(
                    len(self.background_data),
                    self.n_background_samples,
                    replace=False
                )
                background = self.background_data[idx]
            else:
                background = self.background_data

            background_tensor = torch.FloatTensor(background)
            return shap.DeepExplainer(self.model, background_tensor)

        else:
            # KernelExplainer works with any model
            if self.background_data is None:
                raise ValueError("background_data required for generic models")

            # Sample background data
            if len(self.background_data) > self.n_background_samples:
                idx = np.random.choice(
                    len(self.background_data),
                    self.n_background_samples,
                    replace=False
                )
                background = self.background_data[idx]
            else:
                background = self.background_data

            # Create prediction function
            if hasattr(self.model, 'predict_proba'):
                predict_fn = lambda x: self.model.predict_proba(x)[:, 1]
            else:
                predict_fn = self.model.predict

            return shap.KernelExplainer(predict_fn, background)

    def explain(
        self,
        X: np.ndarray,
        feature_names: Optional[List[str]] = None
    ) -> List[ExplanationResult]:
        """
        Explain predictions for given samples.

        Args:
            X: Feature matrix (n_samples, n_features)
            feature_names: Optional feature names override

        Returns:
            List of ExplanationResult for each sample
        """
        feature_names = feature_names or self.feature_names
        if feature_names is None:
            feature_names = [f"feature_{i}" for i in range(X.shape[1])]

        # Get SHAP values
        if self.model_type == 'pytorch':
            X_tensor = torch.FloatTensor(X)
            shap_values = self.explainer.shap_values(X_tensor)
            if isinstance(shap_values, list):
                shap_values = shap_values[0]
            shap_values = shap_values.numpy() if hasattr(shap_values, 'numpy') else np.array(shap_values)
        else:
            shap_values = self.explainer.shap_values(X)
            if isinstance(shap_values, list):
                shap_values = shap_values[0]

        # Get base value
        if hasattr(self.explainer, 'expected_value'):
            base_value = self.explainer.expected_value
            if isinstance(base_value, np.ndarray):
                base_value = base_value[0]
        else:
            base_value = 0.0

        # Get predictions
        if self.model_type == 'pytorch':
            self.model.eval()
            with torch.no_grad():
                predictions = self.model(torch.FloatTensor(X)).numpy().flatten()
        elif hasattr(self.model, 'predict'):
            predictions = self.model.predict(X)
        else:
            predictions = np.sum(shap_values, axis=1) + base_value

        # Build results
        results = []
        for i in range(len(X)):
            sv = shap_values[i]
            fv = X[i]

            # Get top positive and negative features
            sorted_idx = np.argsort(sv)
            top_neg_idx = sorted_idx[:5]
            top_pos_idx = sorted_idx[-5:][::-1]

            top_positive = [
                (feature_names[j], float(sv[j]))
                for j in top_pos_idx if sv[j] > 0
            ]
            top_negative = [
                (feature_names[j], float(sv[j]))
                for j in top_neg_idx if sv[j] < 0
            ]

            result = ExplanationResult(
                prediction=float(predictions[i]),
                base_value=float(base_value),
                shap_values={feature_names[j]: float(sv[j]) for j in range(len(sv))},
                feature_values={feature_names[j]: float(fv[j]) for j in range(len(fv))},
                top_positive_features=top_positive,
                top_negative_features=top_negative,
                model_type=self.model_type
            )
            results.append(result)

        return results

    def get_feature_importance(
        self,
        X: np.ndarray,
        feature_names: Optional[List[str]] = None,
        method: str = 'mean_abs'
    ) -> FeatureImportance:
        """
        Compute global feature importance from SHAP values.

        Args:
            X: Feature matrix for computing SHAP values
            feature_names: Feature names
            method: 'mean_abs' (mean absolute SHAP) or 'mean' (mean SHAP)

        Returns:
            FeatureImportance object
        """
        feature_names = feature_names or self.feature_names
        if feature_names is None:
            feature_names = [f"feature_{i}" for i in range(X.shape[1])]

        # Compute SHAP values
        if self.model_type == 'pytorch':
            X_tensor = torch.FloatTensor(X)
            shap_values = self.explainer.shap_values(X_tensor)
            if isinstance(shap_values, list):
                shap_values = shap_values[0]
            shap_values = np.array(shap_values)
        else:
            shap_values = self.explainer.shap_values(X)
            if isinstance(shap_values, list):
                shap_values = shap_values[0]

        # Compute importance
        if method == 'mean_abs':
            importance = np.abs(shap_values).mean(axis=0)
        else:
            importance = shap_values.mean(axis=0)

        # Sort by importance
        sorted_idx = np.argsort(importance)[::-1]
        sorted_names = [feature_names[i] for i in sorted_idx]
        sorted_importance = [float(importance[i]) for i in sorted_idx]

        return FeatureImportance(
            feature_names=sorted_names,
            importance_values=sorted_importance,
            importance_type='shap_' + method,
            model_type=self.model_type
        )

    def get_interaction_values(
        self,
        X: np.ndarray,
        feature_names: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Compute SHAP interaction values (for tree models only).

        Args:
            X: Feature matrix
            feature_names: Feature names

        Returns:
            Dictionary with interaction information
        """
        if self.model_type not in ['xgboost', 'lightgbm']:
            return {
                'error': 'Interaction values only available for tree models',
                'model_type': self.model_type
            }

        feature_names = feature_names or self.feature_names
        if feature_names is None:
            feature_names = [f"feature_{i}" for i in range(X.shape[1])]

        # Compute interaction values
        interaction_values = self.explainer.shap_interaction_values(X)

        # Get mean absolute interaction for each pair
        mean_interaction = np.abs(interaction_values).mean(axis=0)

        # Find top interactions (excluding diagonal)
        n_features = len(feature_names)
        interactions = []
        for i in range(n_features):
            for j in range(i + 1, n_features):
                interactions.append({
                    'feature_1': feature_names[i],
                    'feature_2': feature_names[j],
                    'interaction_strength': float(mean_interaction[i, j])
                })

        # Sort by strength
        interactions.sort(key=lambda x: x['interaction_strength'], reverse=True)

        return {
            'top_interactions': interactions[:10],
            'total_interactions_computed': len(interactions),
            'model_type': self.model_type
        }


def explain_prediction(
    model: Any,
    X: np.ndarray,
    feature_names: Optional[List[str]] = None,
    background_data: Optional[np.ndarray] = None,
    model_type: str = 'auto'
) -> List[Dict]:
    """
    Convenience function to explain predictions.

    Args:
        model: Trained model
        X: Features to explain
        feature_names: Feature names
        background_data: Background data for SHAP
        model_type: Model type

    Returns:
        List of explanation dictionaries
    """
    explainer = ModelExplainer(
        model=model,
        model_type=model_type,
        feature_names=feature_names,
        background_data=background_data
    )

    results = explainer.explain(X, feature_names)
    return [r.to_dict() for r in results]


def get_feature_importance(
    model: Any,
    X: np.ndarray,
    feature_names: Optional[List[str]] = None,
    background_data: Optional[np.ndarray] = None,
    model_type: str = 'auto'
) -> Dict:
    """
    Convenience function to get feature importance.

    Args:
        model: Trained model
        X: Features for computing importance
        feature_names: Feature names
        background_data: Background data
        model_type: Model type

    Returns:
        Feature importance dictionary
    """
    explainer = ModelExplainer(
        model=model,
        model_type=model_type,
        feature_names=feature_names,
        background_data=background_data
    )

    importance = explainer.get_feature_importance(X, feature_names)
    return importance.to_dict()


def get_shap_summary(
    model: Any,
    X: np.ndarray,
    feature_names: Optional[List[str]] = None,
    background_data: Optional[np.ndarray] = None,
    model_type: str = 'auto',
    max_display: int = 20
) -> Dict:
    """
    Get comprehensive SHAP summary for a model.

    Args:
        model: Trained model
        X: Features
        feature_names: Feature names
        background_data: Background data
        model_type: Model type
        max_display: Max features to include

    Returns:
        Summary dictionary
    """
    explainer = ModelExplainer(
        model=model,
        model_type=model_type,
        feature_names=feature_names,
        background_data=background_data
    )

    # Get feature importance
    importance = explainer.get_feature_importance(X, feature_names)

    # Get sample explanations
    n_samples = min(5, len(X))
    sample_idx = np.random.choice(len(X), n_samples, replace=False)
    sample_explanations = explainer.explain(X[sample_idx], feature_names)

    # Get interactions if tree model
    interactions = None
    if explainer.model_type in ['xgboost', 'lightgbm']:
        try:
            interactions = explainer.get_interaction_values(X[:100], feature_names)
        except Exception:
            pass

    return {
        'model_type': explainer.model_type,
        'n_samples_analyzed': len(X),
        'n_features': X.shape[1],
        'feature_importance': importance.to_dict(),
        'sample_explanations': [e.to_dict() for e in sample_explanations],
        'interactions': interactions,
        'timestamp': datetime.now().isoformat()
    }


# Additional utility functions for specific use cases

def explain_stock_prediction(
    model: Any,
    features: np.ndarray,
    symbol: str,
    feature_names: List[str],
    background_data: np.ndarray,
    model_type: str = 'auto'
) -> Dict:
    """
    Explain prediction for a specific stock.

    Args:
        model: Trained model
        features: Feature vector for the stock
        symbol: Stock symbol
        feature_names: Feature names
        background_data: Background data
        model_type: Model type

    Returns:
        Explanation dictionary with stock context
    """
    if features.ndim == 1:
        features = features.reshape(1, -1)

    explainer = ModelExplainer(
        model=model,
        model_type=model_type,
        feature_names=feature_names,
        background_data=background_data
    )

    results = explainer.explain(features, feature_names)
    result = results[0]
    result.symbol = symbol

    explanation = result.to_dict()

    # Add stock-specific interpretation
    explanation['interpretation'] = _generate_stock_interpretation(
        symbol, result.prediction, result.base_value,
        result.top_positive_features, result.top_negative_features
    )

    # Add top_contributors combining positive and negative features sorted by absolute value
    all_contributors = [
        {'feature': f, 'contribution': v, 'direction': 'positive'}
        for f, v in result.top_positive_features
    ] + [
        {'feature': f, 'contribution': v, 'direction': 'negative'}
        for f, v in result.top_negative_features
    ]
    all_contributors.sort(key=lambda x: abs(x['contribution']), reverse=True)
    explanation['top_contributors'] = all_contributors

    return explanation


def _generate_stock_interpretation(
    symbol: str,
    prediction: float,
    base_value: float,
    top_positive: List[Tuple[str, float]],
    top_negative: List[Tuple[str, float]]
) -> str:
    """Generate human-readable interpretation for stock prediction."""
    direction = "outperform" if prediction > base_value else "underperform"
    magnitude = abs(prediction - base_value)

    interpretation = f"{symbol} is expected to {direction} "

    if magnitude > 0.05:
        interpretation += "significantly "
    elif magnitude > 0.02:
        interpretation += "moderately "
    else:
        interpretation += "slightly "

    interpretation += f"(predicted return: {prediction:.2%}). "

    if top_positive:
        pos_features = [f[0] for f in top_positive[:3]]
        interpretation += f"Key bullish factors: {', '.join(pos_features)}. "

    if top_negative:
        neg_features = [f[0] for f in top_negative[:3]]
        interpretation += f"Key bearish factors: {', '.join(neg_features)}."

    return interpretation


def compare_models(
    models: Dict[str, Any],
    X: np.ndarray,
    feature_names: Optional[List[str]] = None,
    background_data: Optional[np.ndarray] = None
) -> Dict:
    """
    Compare feature importance across multiple models.

    Args:
        models: Dictionary of {model_name: model}
        X: Features
        feature_names: Feature names
        background_data: Background data

    Returns:
        Comparison results
    """
    results = {}

    for name, model in models.items():
        try:
            explainer = ModelExplainer(
                model=model,
                feature_names=feature_names,
                background_data=background_data
            )
            importance = explainer.get_feature_importance(X, feature_names)
            results[name] = {
                'top_10_features': importance.get_top_n(10),
                'model_type': explainer.model_type
            }
        except Exception as e:
            results[name] = {'error': str(e)}

    # Find common important features
    all_top_features = []
    for name, result in results.items():
        if 'top_10_features' in result:
            all_top_features.extend(result['top_10_features'].keys())

    from collections import Counter
    common_features = Counter(all_top_features).most_common(10)

    return {
        'model_comparisons': results,
        'common_important_features': [f[0] for f in common_features],
        'n_models': len(models),
        'timestamp': datetime.now().isoformat()
    }


# Entry point for testing
if __name__ == "__main__":
    print("Testing SHAP Explainer...")

    if not HAS_SHAP:
        print("SHAP not installed. Skipping tests.")
        exit(1)

    # Test with XGBoost
    if HAS_XGB:
        print("\nTesting with XGBoost...")
        np.random.seed(42)

        # Generate synthetic data
        n_samples = 500
        n_features = 10
        X = np.random.randn(n_samples, n_features)
        y = 0.3 * X[:, 0] - 0.2 * X[:, 1] + 0.1 * X[:, 2] + np.random.randn(n_samples) * 0.1

        feature_names = [f"feature_{i}" for i in range(n_features)]

        # Train model
        model = xgb.XGBRegressor(n_estimators=50, max_depth=3, random_state=42)
        model.fit(X[:400], y[:400])

        # Create explainer
        explainer = ModelExplainer(model, feature_names=feature_names)

        # Explain sample
        explanations = explainer.explain(X[400:405], feature_names)
        print(f"\nSample explanation:")
        print(f"  Prediction: {explanations[0].prediction:.4f}")
        print(f"  Base value: {explanations[0].base_value:.4f}")
        print(f"  Top positive: {explanations[0].top_positive_features[:3]}")
        print(f"  Top negative: {explanations[0].top_negative_features[:3]}")

        # Get feature importance
        importance = explainer.get_feature_importance(X[400:500], feature_names)
        print(f"\nFeature importance (top 5):")
        for name, value in importance.get_top_n(5).items():
            print(f"  {name}: {value:.4f}")

        # Test convenience functions
        summary = get_shap_summary(model, X[400:500], feature_names)
        print(f"\nSummary computed for {summary['n_samples_analyzed']} samples")

        print("\nXGBoost test complete!")

    else:
        print("XGBoost not installed, skipping XGBoost tests")

    print("\nSHAP Explainer tests complete!")
