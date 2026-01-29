# python/models/config.py
# Configuration for deep learning models

import os
import ast
import json
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from pathlib import Path

# Project root (relative to this file)
PROJECT_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CHECKPOINT_DIR = PROJECT_ROOT / "python" / "checkpoints"

# Database path - the main database is in data/stocks.db
DATABASE_PATH = DATA_DIR / "stocks.db"


@dataclass
class ModelConfig:
    """Configuration for deep learning models."""

    # Model architecture
    # NOTE: Capacity increased from 128/2 to 256/3 for better signal capture
    # Financial data has complex non-linear patterns requiring more capacity
    model_type: str = "lstm"  # "lstm", "transformer", "ensemble"
    hidden_size: int = 256  # Increased from 128 - more capacity for complex patterns
    num_layers: int = 3     # Increased from 2 - deeper network
    num_attention_heads: int = 8  # Increased from 4 for transformer
    dropout: float = 0.3    # Increased from 0.2 - more regularization for noisy data

    # Sequence parameters
    sequence_length: int = 60  # 60 trading days (3 months)
    prediction_horizon: int = 21  # Predict 21-day forward returns

    # Training parameters
    batch_size: int = 128   # Increased from 64 - better gradient estimates
    learning_rate: float = 5e-4  # Increased from 1e-4 - faster convergence
    weight_decay: float = 1e-4   # Increased from 1e-5 - more regularization
    epochs: int = 100
    early_stopping_patience: int = 10
    min_delta: float = 0.001

    # Data parameters
    train_ratio: float = 0.7
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    purge_gap_days: int = 5  # Gap between train/val/test to prevent leakage

    # Feature parameters
    use_technical: bool = True
    use_fundamental: bool = True
    use_alternative: bool = True
    use_factors: bool = True
    use_market: bool = True

    # Output parameters
    quantiles: List[float] = field(default_factory=lambda: [0.1, 0.5, 0.9])
    output_uncertainty: bool = True

    # Regularization
    gradient_clip_norm: float = 1.0
    label_smoothing: float = 0.0

    # Device
    device: str = "cpu"  # "cpu", "cuda", "mps"

    # Paths
    checkpoint_dir: Path = CHECKPOINT_DIR
    model_name: str = "stock_lstm"

    def __post_init__(self):
        """Validate configuration after initialization."""
        assert self.model_type in ["lstm", "tft", "transformer", "ensemble"]
        assert 0 < self.train_ratio < 1
        assert 0 < self.val_ratio < 1
        assert 0 < self.test_ratio < 1
        assert abs(self.train_ratio + self.val_ratio + self.test_ratio - 1.0) < 0.01

        # Create checkpoint directory if needed
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization."""
        return {
            k: str(v) if isinstance(v, Path) else v
            for k, v in self.__dict__.items()
        }

    @classmethod
    def from_dict(cls, d: Dict) -> "ModelConfig":
        """Create from dictionary."""
        if "checkpoint_dir" in d and isinstance(d["checkpoint_dir"], str):
            d["checkpoint_dir"] = Path(d["checkpoint_dir"])
        if "quantiles" in d and isinstance(d["quantiles"], str):
            # Use ast.literal_eval for safe parsing of Python literals
            # This only allows: strings, bytes, numbers, tuples, lists, dicts, sets, booleans, None
            # SECURITY: Never use eval() as it can execute arbitrary code
            try:
                d["quantiles"] = ast.literal_eval(d["quantiles"])
            except (ValueError, SyntaxError):
                # Fallback: try JSON parsing if ast fails
                d["quantiles"] = json.loads(d["quantiles"])
        return cls(**d)


# Feature groups for model input
FEATURE_GROUPS = {
    # Price-based features (time series)
    "price_sequence": [
        "close_return_1d",
        "close_return_5d",
        "close_return_21d",
        "volume_ratio_20d",
        "high_low_range",
        "open_close_range",
        "gap_open",
    ],

    # Technical indicators
    "technical": [
        "rsi_14",
        "macd_signal",
        "macd_histogram",
        "sma_20_ratio",
        "sma_50_ratio",
        "sma_200_ratio",
        "bb_position",
        "atr_14_pct",
        "adx_14",
        "obv_slope",
    ],

    # Fundamental features
    "fundamental": [
        "pe_ratio_zscore",
        "pb_ratio_zscore",
        "ps_ratio_zscore",
        "roe",
        "roa",
        "debt_to_equity",
        "current_ratio",
        "gross_margin",
        "revenue_growth_yoy",
        "earnings_growth_yoy",
    ],

    # Alternative data
    "alternative": [
        "news_sentiment_7d",
        "social_sentiment_7d",
        "insider_net_shares_90d",
        "short_interest_ratio",
        "congressional_net_90d",
        "institutional_ownership_delta",
    ],

    # Existing factor scores
    "factors": [
        "value_score",
        "momentum_score",
        "quality_score",
        "size_score",
        "volatility_score",
        "growth_score",
        "profitability_score",
    ],

    # Market context (shared across stocks)
    "market": [
        "vix_level",
        "vix_change_5d",
        "spy_return_21d",
        "market_regime",
        "sector_relative_strength",
    ],
}


def get_all_features() -> List[str]:
    """Get flat list of all feature names."""
    features = []
    for group in FEATURE_GROUPS.values():
        features.extend(group)
    return features


def get_feature_count() -> int:
    """Get total number of features."""
    return len(get_all_features())


# Default training configuration
DEFAULT_CONFIG = ModelConfig()

# Conservative configuration for initial testing
CONSERVATIVE_CONFIG = ModelConfig(
    hidden_size=64,
    num_layers=1,
    dropout=0.3,
    batch_size=32,
    learning_rate=5e-5,
    epochs=50,
    sequence_length=30,
)

# High-capacity configuration for full training
FULL_CONFIG = ModelConfig(
    hidden_size=256,
    num_layers=3,
    num_attention_heads=8,
    dropout=0.1,
    batch_size=128,
    learning_rate=1e-4,
    epochs=200,
    sequence_length=90,
)
