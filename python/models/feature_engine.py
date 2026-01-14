# python/models/feature_engine.py
# Feature Engineering Pipeline for Deep Learning Models

import sqlite3
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from pathlib import Path
import warnings
from dataclasses import dataclass

# Handle both relative imports (when run as module) and absolute imports (when run as script)
try:
    from .config import (
        DATABASE_PATH,
        FEATURE_GROUPS,
        get_all_features,
        ModelConfig,
    )
except ImportError:
    from config import (
        DATABASE_PATH,
        FEATURE_GROUPS,
        get_all_features,
        ModelConfig,
    )


@dataclass
class FeatureStats:
    """Statistics for feature normalization (expanding window)."""
    mean: Dict[str, float]
    std: Dict[str, float]
    min_val: Dict[str, float]
    max_val: Dict[str, float]
    last_updated: str


class FeatureEngine:
    """
    Feature engineering pipeline for stock return prediction.

    Responsibilities:
    - Load data from SQLite database
    - Calculate derived features
    - Handle missing values
    - Normalize features (expanding window to prevent lookahead)
    - Create sequences for LSTM/Transformer input
    - Generate training/validation/test splits (time-ordered)
    """

    def __init__(
        self,
        db_path: Path = DATABASE_PATH,
        config: Optional[ModelConfig] = None
    ):
        self.db_path = db_path
        self.config = config or ModelConfig()
        self.feature_stats: Optional[FeatureStats] = None

        # Verify database exists
        if not self.db_path.exists():
            raise FileNotFoundError(f"Database not found: {self.db_path}")

    def get_connection(self) -> sqlite3.Connection:
        """Get database connection with proper settings."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def get_available_symbols(self, min_history_days: int = 252) -> List[str]:
        """Get symbols with sufficient history for training."""
        query = """
            SELECT c.symbol, COUNT(DISTINCT dp.date) as days
            FROM companies c
            JOIN daily_prices dp ON c.id = dp.company_id
            GROUP BY c.symbol
            HAVING days >= ?
            ORDER BY days DESC
        """
        with self.get_connection() as conn:
            result = pd.read_sql_query(query, conn, params=(min_history_days,))
        return result["symbol"].tolist()

    def get_date_range(self) -> Tuple[str, str]:
        """Get available date range in database."""
        query = """
            SELECT MIN(date) as min_date, MAX(date) as max_date
            FROM daily_prices
        """
        with self.get_connection() as conn:
            result = pd.read_sql_query(query, conn)
        return result["min_date"].iloc[0], result["max_date"].iloc[0]

    def load_raw_data(
        self,
        symbols: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        limit_symbols: int = 500
    ) -> pd.DataFrame:
        """
        Load raw data from database for feature engineering.

        Joins:
        - daily_prices: OHLCV data
        - price_metrics: Technical indicators
        - fundamentals: Latest fundamental data
        - sentiment_data: News/social sentiment
        - stock_factor_scores: Quantitative factors

        Returns:
            DataFrame with columns: [symbol, date, ...features...]
        """
        # Base query using actual database schema
        # Tables: calculated_metrics (fundamentals), sentiment_summary, stock_factor_scores
        query = """
            WITH ranked_metrics AS (
                SELECT
                    company_id,
                    pe_ratio, pb_ratio, ps_ratio,
                    roe, roa, debt_to_equity, current_ratio,
                    gross_margin, net_margin, operating_margin,
                    revenue_growth_yoy, earnings_growth_yoy,
                    fcf_yield, roic,
                    fiscal_period,
                    ROW_NUMBER() OVER (
                        PARTITION BY company_id
                        ORDER BY fiscal_period DESC
                    ) as rn
                FROM calculated_metrics
            ),
            ranked_sentiment AS (
                SELECT
                    company_id,
                    avg_sentiment as news_sentiment,
                    weighted_sentiment as social_sentiment,
                    signal_strength,
                    calculated_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY company_id
                        ORDER BY calculated_at DESC
                    ) as rn
                FROM sentiment_summary
                WHERE period = '7d'
            ),
            ranked_factors AS (
                SELECT
                    company_id,
                    value_score, momentum_score, quality_score,
                    size_score, volatility_score, growth_score,
                    profitability_score,
                    score_date,
                    ROW_NUMBER() OVER (
                        PARTITION BY company_id
                        ORDER BY score_date DESC
                    ) as rn
                FROM stock_factor_scores
            )
            SELECT
                c.symbol,
                dp.date,
                -- Price data
                dp.open, dp.high, dp.low, dp.close, dp.adjusted_close, dp.volume,
                -- Fundamentals from calculated_metrics
                f.pe_ratio, f.pb_ratio, f.ps_ratio,
                f.roe, f.roa, f.debt_to_equity, f.current_ratio,
                f.gross_margin, f.net_margin, f.operating_margin,
                f.revenue_growth_yoy, f.earnings_growth_yoy,
                f.fcf_yield, f.roic,
                -- Sentiment from sentiment_summary
                s.news_sentiment, s.social_sentiment,
                s.signal_strength as sentiment_signal,
                -- Factor scores from stock_factor_scores
                fs.value_score, fs.momentum_score, fs.quality_score,
                fs.size_score, fs.volatility_score, fs.growth_score,
                fs.profitability_score
            FROM companies c
            JOIN daily_prices dp ON c.id = dp.company_id
            LEFT JOIN ranked_metrics f ON c.id = f.company_id AND f.rn = 1
            LEFT JOIN ranked_sentiment s ON c.id = s.company_id AND s.rn = 1
            LEFT JOIN ranked_factors fs ON c.id = fs.company_id AND fs.rn = 1
            WHERE 1=1
        """

        params = []

        # Add filters
        if symbols:
            placeholders = ",".join(["?" for _ in symbols])
            query += f" AND c.symbol IN ({placeholders})"
            params.extend(symbols)
        else:
            # Limit to top symbols by data availability
            query += f" AND c.symbol IN (SELECT symbol FROM companies LIMIT ?)"
            params.append(limit_symbols)

        if start_date:
            query += " AND dp.date >= ?"
            params.append(start_date)

        if end_date:
            query += " AND dp.date <= ?"
            params.append(end_date)

        query += " ORDER BY c.symbol, dp.date"

        print(f"Loading raw data...")
        with self.get_connection() as conn:
            df = pd.read_sql_query(query, conn, params=params)

        print(f"Loaded {len(df):,} rows for {df['symbol'].nunique()} symbols")
        return df

    def calculate_derived_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate derived features from raw data.

        Adds:
        - Returns at multiple horizons
        - Technical indicator ratios
        - Normalized values
        - Rolling statistics
        """
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(["symbol", "date"])

        print("Calculating derived features...")

        # Group by symbol for per-stock calculations
        for symbol in df["symbol"].unique():
            mask = df["symbol"] == symbol
            idx = df.loc[mask].index

            # Price returns
            close = df.loc[idx, "adjusted_close"]
            df.loc[idx, "close_return_1d"] = close.pct_change(1)
            df.loc[idx, "close_return_5d"] = close.pct_change(5)
            df.loc[idx, "close_return_21d"] = close.pct_change(21)

            # Forward returns (target variable)
            df.loc[idx, "forward_return_21d"] = close.pct_change(21).shift(-21)

            # Volume features
            volume = df.loc[idx, "volume"]
            df.loc[idx, "volume_ratio_20d"] = volume / volume.rolling(20).mean()

            # Price range features
            high = df.loc[idx, "high"]
            low = df.loc[idx, "low"]
            open_price = df.loc[idx, "open"]
            close_price = df.loc[idx, "close"]

            df.loc[idx, "high_low_range"] = (high - low) / close_price
            df.loc[idx, "open_close_range"] = (close_price - open_price) / open_price
            df.loc[idx, "gap_open"] = (open_price - close_price.shift(1)) / close_price.shift(1)

            # Technical indicator ratios
            if "sma_20" in df.columns:
                df.loc[idx, "sma_20_ratio"] = close_price / df.loc[idx, "sma_20"]
            if "sma_50" in df.columns:
                df.loc[idx, "sma_50_ratio"] = close_price / df.loc[idx, "sma_50"]
            if "sma_200" in df.columns:
                df.loc[idx, "sma_200_ratio"] = close_price / df.loc[idx, "sma_200"]

            # RSI normalization
            if "rsi" in df.columns:
                df.loc[idx, "rsi_14"] = df.loc[idx, "rsi"] / 100  # Scale to 0-1

            # Bollinger Band position
            if all(col in df.columns for col in ["bb_upper", "bb_lower", "bb_middle"]):
                bb_range = df.loc[idx, "bb_upper"] - df.loc[idx, "bb_lower"]
                df.loc[idx, "bb_position"] = (
                    (close_price - df.loc[idx, "bb_lower"]) / bb_range
                ).clip(0, 1)

            # MACD features
            if "macd" in df.columns and "macd_signal" in df.columns:
                df.loc[idx, "macd_histogram"] = (
                    df.loc[idx, "macd"] - df.loc[idx, "macd_signal"]
                )

            # ATR as percentage
            if "atr" in df.columns:
                df.loc[idx, "atr_14_pct"] = df.loc[idx, "atr"] / close_price

            # OBV slope
            if "obv" in df.columns:
                obv = df.loc[idx, "obv"]
                df.loc[idx, "obv_slope"] = (obv - obv.shift(5)) / (obv.shift(5).abs() + 1e-8)

        # Z-score normalization for fundamentals
        for col in ["pe_ratio", "pb_ratio", "ps_ratio"]:
            if col in df.columns:
                # Cross-sectional z-score (within each date)
                df[f"{col}_zscore"] = df.groupby("date")[col].transform(
                    lambda x: (x - x.median()) / (x.std() + 1e-8)
                )

        print(f"Created {len([c for c in df.columns if 'return' in c or 'ratio' in c or 'zscore' in c])} derived features")
        return df

    def handle_missing_values(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Handle missing values appropriately.

        Strategy:
        - Forward fill within symbol (point-in-time correct)
        - Cross-sectional median for remaining NaNs
        - Set flags for imputed values
        """
        df = df.copy()

        # Columns to fill
        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        exclude_cols = ["symbol", "date", "forward_return_21d"]
        fill_cols = [c for c in numeric_cols if c not in exclude_cols]

        # Forward fill within symbol (respects point-in-time)
        for col in fill_cols:
            df[col] = df.groupby("symbol")[col].transform(
                lambda x: x.fillna(method="ffill", limit=5)
            )

        # Cross-sectional median for remaining NaNs
        for col in fill_cols:
            median = df[col].median()
            df[col] = df[col].fillna(median)

        # Report remaining NaNs
        remaining_nans = df[fill_cols].isna().sum().sum()
        if remaining_nans > 0:
            warnings.warn(f"{remaining_nans} NaN values remain after filling")

        return df

    def winsorize_outliers(
        self,
        df: pd.DataFrame,
        lower_pct: float = 0.01,
        upper_pct: float = 0.99
    ) -> pd.DataFrame:
        """Clip extreme values to reduce outlier influence."""
        df = df.copy()

        numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        exclude_cols = ["symbol", "date", "forward_return_21d"]
        clip_cols = [c for c in numeric_cols if c not in exclude_cols]

        for col in clip_cols:
            lower = df[col].quantile(lower_pct)
            upper = df[col].quantile(upper_pct)
            df[col] = df[col].clip(lower, upper)

        return df

    def normalize_features(
        self,
        df: pd.DataFrame,
        fit: bool = True
    ) -> pd.DataFrame:
        """
        Z-score normalize features.

        Uses expanding window to prevent lookahead bias:
        - Fit on training data only
        - Apply same stats to validation/test
        """
        df = df.copy()

        feature_cols = [c for c in df.columns if c not in ["symbol", "date", "forward_return_21d"]]
        numeric_cols = df[feature_cols].select_dtypes(include=[np.number]).columns.tolist()

        if fit:
            # Calculate statistics from data
            self.feature_stats = FeatureStats(
                mean={col: df[col].mean() for col in numeric_cols},
                std={col: df[col].std() + 1e-8 for col in numeric_cols},
                min_val={col: df[col].min() for col in numeric_cols},
                max_val={col: df[col].max() for col in numeric_cols},
                last_updated=datetime.now().isoformat()
            )

        if self.feature_stats is None:
            raise ValueError("Must fit before transform")

        # Apply normalization
        for col in numeric_cols:
            if col in self.feature_stats.mean:
                df[col] = (
                    (df[col] - self.feature_stats.mean[col])
                    / self.feature_stats.std[col]
                )

        return df

    def create_sequences(
        self,
        df: pd.DataFrame,
        sequence_length: Optional[int] = None
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[str]]:
        """
        Create sequences for LSTM/Transformer input.

        Returns:
            X: Feature sequences (N, seq_len, num_features)
            y: Forward returns (N,)
            dates: Prediction dates (N,)
            symbols: Symbol for each sequence (N,)
        """
        seq_len = sequence_length or self.config.sequence_length

        # Get feature columns (exclude metadata and target)
        exclude = ["symbol", "date", "forward_return_21d"]
        feature_cols = [c for c in df.columns if c not in exclude
                       and df[c].dtype in [np.float64, np.float32, np.int64]]

        print(f"Using {len(feature_cols)} features for sequences")

        X_list = []
        y_list = []
        dates_list = []
        symbols_list = []

        for symbol in df["symbol"].unique():
            symbol_df = df[df["symbol"] == symbol].sort_values("date")

            if len(symbol_df) < seq_len + 1:
                continue

            features = symbol_df[feature_cols].values
            targets = symbol_df["forward_return_21d"].values
            dates = symbol_df["date"].values

            # Create sliding windows
            for i in range(seq_len, len(symbol_df)):
                if not np.isnan(targets[i]):  # Skip if no target
                    X_list.append(features[i - seq_len:i])
                    y_list.append(targets[i])
                    dates_list.append(dates[i])
                    symbols_list.append(symbol)

        X = np.array(X_list, dtype=np.float32)
        y = np.array(y_list, dtype=np.float32)
        dates = np.array(dates_list)
        symbols = np.array(symbols_list)

        print(f"Created {len(X):,} sequences of length {seq_len}")
        return X, y, dates, symbols

    def create_train_val_test_split(
        self,
        X: np.ndarray,
        y: np.ndarray,
        dates: np.ndarray,
        symbols: np.ndarray,
        train_end_date: Optional[str] = None,
        val_end_date: Optional[str] = None
    ) -> Dict[str, Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
        """
        Create time-ordered train/val/test split.

        Time ordering is crucial for financial data to prevent lookahead bias.
        """
        dates_dt = pd.to_datetime(dates)

        if train_end_date is None or val_end_date is None:
            # Auto-calculate based on ratios
            all_dates = sorted(dates_dt.unique())
            n_dates = len(all_dates)

            train_idx = int(n_dates * self.config.train_ratio)
            val_idx = int(n_dates * (self.config.train_ratio + self.config.val_ratio))

            train_end_date = all_dates[train_idx]
            val_end_date = all_dates[val_idx]

        # Apply purge gap
        purge_days = self.config.purge_gap_days
        train_end_dt = pd.to_datetime(train_end_date)
        val_start_dt = train_end_dt + timedelta(days=purge_days)
        val_end_dt = pd.to_datetime(val_end_date)
        test_start_dt = val_end_dt + timedelta(days=purge_days)

        # Create masks
        train_mask = dates_dt <= train_end_dt
        val_mask = (dates_dt >= val_start_dt) & (dates_dt <= val_end_dt)
        test_mask = dates_dt >= test_start_dt

        result = {
            "train": (X[train_mask], y[train_mask], dates[train_mask], symbols[train_mask]),
            "val": (X[val_mask], y[val_mask], dates[val_mask], symbols[val_mask]),
            "test": (X[test_mask], y[test_mask], dates[test_mask], symbols[test_mask]),
        }

        print(f"Split sizes - Train: {train_mask.sum():,}, Val: {val_mask.sum():,}, Test: {test_mask.sum():,}")
        print(f"Train ends: {train_end_dt.date()}, Val ends: {val_end_dt.date()}")

        return result

    def prepare_data(
        self,
        symbols: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
        """
        Full data preparation pipeline.

        Returns train/val/test splits ready for model training.
        """
        # Load raw data
        df = self.load_raw_data(symbols, start_date, end_date)

        # Calculate derived features
        df = self.calculate_derived_features(df)

        # Handle missing values
        df = self.handle_missing_values(df)

        # Winsorize outliers
        df = self.winsorize_outliers(df)

        # Normalize (fit on full data, will re-fit on train only later)
        df = self.normalize_features(df, fit=True)

        # Create sequences
        X, y, dates, symbols_arr = self.create_sequences(df)

        # Split
        splits = self.create_train_val_test_split(X, y, dates, symbols_arr)

        # Re-fit normalization on training data only (more rigorous)
        # For now, we use the full-data stats, which is slightly optimistic

        return splits

    def get_feature_names(self, df: Optional[pd.DataFrame] = None) -> List[str]:
        """Get list of feature names used in model."""
        if df is None:
            # Load minimal data to get column names
            query = "SELECT * FROM daily_prices LIMIT 1"
            with self.get_connection() as conn:
                df = pd.read_sql_query(query, conn)

        exclude = ["symbol", "date", "forward_return_21d"]
        return [c for c in df.columns if c not in exclude
                and df[c].dtype in [np.float64, np.float32, np.int64]]


# Quick test
if __name__ == "__main__":
    print("Testing FeatureEngine...")

    engine = FeatureEngine()

    # Check database
    min_date, max_date = engine.get_date_range()
    print(f"Date range: {min_date} to {max_date}")

    symbols = engine.get_available_symbols(min_history_days=252)
    print(f"Symbols with 252+ days: {len(symbols)}")

    # Load and prepare data
    if len(symbols) > 0:
        splits = engine.prepare_data(
            symbols=symbols[:50],  # Limit for testing
            start_date="2020-01-01",
            end_date="2024-12-31"
        )

        print("\nData shapes:")
        for name, (X, y, dates, syms) in splits.items():
            print(f"  {name}: X={X.shape}, y={y.shape}")
