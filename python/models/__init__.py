# python/models/__init__.py
# Deep Learning Models for Stock Return Prediction

from .config import ModelConfig, FEATURE_GROUPS, CHECKPOINT_DIR
from .feature_engine import FeatureEngine
from .stock_lstm import StockLSTM, GaussianNLLLoss, CombinedLoss
from .temporal_fusion import TemporalFusionTransformer, QuantileLoss
from .deep_ensemble import DeepEnsemble, EnsembleOutput, create_ensemble
from .trainer import ModelTrainer, train_model
from .serve import ModelServer, predict_batch, get_model_metrics
from .evaluator import (
    evaluate_predictions,
    calculate_ic,
    calculate_rank_ic,
    calculate_icir,
    calculate_direction_accuracy,
    calculate_sharpe_ratio,
    calculate_sortino_ratio,
    calculate_max_drawdown,
    compare_models
)

__version__ = '0.1.0'
__all__ = [
    # Config
    'ModelConfig',
    'FEATURE_GROUPS',
    'CHECKPOINT_DIR',
    # Feature Engineering
    'FeatureEngine',
    # Models
    'StockLSTM',
    'TemporalFusionTransformer',
    'DeepEnsemble',
    'EnsembleOutput',
    # Training
    'ModelTrainer',
    'train_model',
    # Inference
    'ModelServer',
    'predict_batch',
    'get_model_metrics',
    'create_ensemble',
    # Evaluation
    'evaluate_predictions',
    'calculate_ic',
    'calculate_rank_ic',
    'calculate_icir',
    'calculate_direction_accuracy',
    'calculate_sharpe_ratio',
    'calculate_sortino_ratio',
    'calculate_max_drawdown',
    'compare_models',
    # Loss Functions
    'GaussianNLLLoss',
    'CombinedLoss',
    'QuantileLoss',
]
