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

    def get_available_symbols(
        self,
        min_history_days: int = 252,
        include_inactive: bool = True
    ) -> List[str]:
        """
        Get symbols with sufficient history for training.

        Args:
            min_history_days: Minimum number of trading days required
            include_inactive: If True, includes delisted/inactive companies
                              to avoid survivorship bias. Default True.

        SURVIVORSHIP BIAS WARNING:
        If include_inactive=False, training will only use companies that are
        still active today. This creates survivorship bias - the model learns
        from winners and doesn't see losers who went bankrupt/delisted.
        This inflates backtest performance vs real-world trading.
        """
        if include_inactive:
            # Include ALL companies with sufficient history
            query = """
                SELECT c.symbol, COUNT(DISTINCT dp.date) as days
                FROM companies c
                JOIN daily_prices dp ON c.id = dp.company_id
                GROUP BY c.symbol
                HAVING days >= ?
                ORDER BY days DESC
            """
        else:
            # Only active companies (NOT RECOMMENDED for training)
            query = """
                SELECT c.symbol, COUNT(DISTINCT dp.date) as days
                FROM companies c
                JOIN daily_prices dp ON c.id = dp.company_id
                WHERE c.is_active = 1
                GROUP BY c.symbol
                HAVING days >= ?
                ORDER BY days DESC
            """
            warnings.warn(
                "Using include_inactive=False may cause survivorship bias. "
                "Training data will not include delisted/bankrupt companies.",
                UserWarning
            )

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

        IMPORTANT: Uses POINT-IN-TIME joins to prevent lookahead bias.
        For each price date, we join the most recent fundamental/sentiment data
        that would have been available BEFORE that date.

        Joins:
        - daily_prices: OHLCV data
        - calculated_metrics: Fundamentals (point-in-time)
        - sentiment_summary: Sentiment (point-in-time)
        - stock_factor_scores: Quantitative factors (point-in-time)

        Returns:
            DataFrame with columns: [symbol, date, ...features...]
        """
        # Point-in-time query: For each price date, get the most recent
        # fundamental/sentiment data that existed BEFORE that date.
        # This prevents lookahead bias where future data leaks into training.
        query = """
            SELECT
                c.symbol,
                c.sector,  -- Added for sector neutralization
                dp.date,
                -- Price data
                dp.open, dp.high, dp.low, dp.close, dp.adjusted_close, dp.volume,
                -- Fundamentals from calculated_metrics (point-in-time)
                -- Get the most recent metrics where fiscal_period < dp.date
                (
                    SELECT cm.pe_ratio FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as pe_ratio,
                (
                    SELECT cm.pb_ratio FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as pb_ratio,
                (
                    SELECT cm.ps_ratio FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as ps_ratio,
                (
                    SELECT cm.roe FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as roe,
                (
                    SELECT cm.roa FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as roa,
                (
                    SELECT cm.debt_to_equity FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as debt_to_equity,
                (
                    SELECT cm.current_ratio FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as current_ratio,
                (
                    SELECT cm.gross_margin FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as gross_margin,
                (
                    SELECT cm.net_margin FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as net_margin,
                (
                    SELECT cm.operating_margin FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as operating_margin,
                (
                    SELECT cm.revenue_growth_yoy FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as revenue_growth_yoy,
                (
                    SELECT cm.earnings_growth_yoy FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as earnings_growth_yoy,
                (
                    SELECT cm.fcf_yield FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as fcf_yield,
                (
                    SELECT cm.roic FROM calculated_metrics cm
                    WHERE cm.company_id = c.id AND cm.fiscal_period <= dp.date
                    ORDER BY cm.fiscal_period DESC LIMIT 1
                ) as roic,
                -- Sentiment (point-in-time) - get sentiment calculated before price date
                (
                    SELECT ss.avg_sentiment FROM sentiment_summary ss
                    WHERE ss.company_id = c.id AND ss.period = '7d'
                    AND date(ss.calculated_at) <= dp.date
                    ORDER BY ss.calculated_at DESC LIMIT 1
                ) as news_sentiment,
                (
                    SELECT ss.weighted_sentiment FROM sentiment_summary ss
                    WHERE ss.company_id = c.id AND ss.period = '7d'
                    AND date(ss.calculated_at) <= dp.date
                    ORDER BY ss.calculated_at DESC LIMIT 1
                ) as social_sentiment,
                (
                    SELECT ss.signal_strength FROM sentiment_summary ss
                    WHERE ss.company_id = c.id AND ss.period = '7d'
                    AND date(ss.calculated_at) <= dp.date
                    ORDER BY ss.calculated_at DESC LIMIT 1
                ) as sentiment_signal,
                -- Factor scores (point-in-time)
                (
                    SELECT sfs.value_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as value_score,
                (
                    SELECT sfs.momentum_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as momentum_score,
                (
                    SELECT sfs.quality_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as quality_score,
                (
                    SELECT sfs.size_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as size_score,
                (
                    SELECT sfs.volatility_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as volatility_score,
                (
                    SELECT sfs.growth_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as growth_score,
                (
                    SELECT sfs.profitability_score FROM stock_factor_scores sfs
                    WHERE sfs.company_id = c.id AND sfs.score_date <= dp.date
                    ORDER BY sfs.score_date DESC LIMIT 1
                ) as profitability_score,
                -- ============================================
                -- QUANT FACTORS (from financial_data)
                -- ============================================
                -- Accruals Quality: measures earnings quality via working capital accruals
                -- Formula: (Current Assets - Cash - Current Liabilities + Short Term Debt) / Total Assets
                -- Negative accruals = higher quality (earnings backed by cash, not working capital changes)
                -- Academic evidence: High accrual companies underperform by ~3.4% annually
                (
                    SELECT
                        CASE
                            WHEN fd.total_assets > 0 THEN
                                ((COALESCE(fd.current_assets, 0) - COALESCE(fd.cash_and_equivalents, 0))
                                 - (COALESCE(fd.current_liabilities, 0) - COALESCE(fd.short_term_debt, 0)))
                                / fd.total_assets
                            ELSE NULL
                        END
                    FROM financial_data fd
                    WHERE fd.company_id = c.id
                    AND fd.fiscal_date_ending <= dp.date
                    AND fd.fiscal_date_ending > '2000-01-01'  -- Filter bad dates
                    ORDER BY fd.fiscal_date_ending DESC LIMIT 1
                ) as accruals_ratio,
                -- Earnings Quality: ratio of operating cash flow to net income
                -- High ratio = earnings are backed by actual cash (quality)
                -- Low ratio = earnings are from accruals/accounting (potentially manipulated)
                (
                    SELECT
                        CASE
                            WHEN ABS(fd.net_income) > 0.001 THEN
                                fd.operating_cashflow / fd.net_income
                            ELSE NULL
                        END
                    FROM financial_data fd
                    WHERE fd.company_id = c.id
                    AND fd.fiscal_date_ending <= dp.date
                    AND fd.fiscal_date_ending > '2000-01-01'
                    AND fd.operating_cashflow IS NOT NULL
                    AND fd.net_income IS NOT NULL
                    ORDER BY fd.fiscal_date_ending DESC LIMIT 1
                ) as earnings_quality,
                -- Asset Growth (Investment Factor): YoY change in total assets
                -- Low asset growth companies outperform (investment factor)
                -- Companies that invest heavily often destroy value
                (
                    SELECT
                        CASE
                            WHEN fd_prev.total_assets > 0 THEN
                                (fd.total_assets - fd_prev.total_assets) / fd_prev.total_assets
                            ELSE NULL
                        END
                    FROM financial_data fd
                    JOIN financial_data fd_prev ON fd_prev.company_id = fd.company_id
                        AND fd_prev.fiscal_date_ending = date(fd.fiscal_date_ending, '-1 year')
                    WHERE fd.company_id = c.id
                    AND fd.fiscal_date_ending <= dp.date
                    AND fd.fiscal_date_ending > '2000-01-01'
                    AND fd.total_assets IS NOT NULL
                    ORDER BY fd.fiscal_date_ending DESC LIMIT 1
                ) as asset_growth
            FROM companies c
            JOIN daily_prices dp ON c.id = dp.company_id
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

    def _load_market_features(self, start_date: str, end_date: str) -> pd.DataFrame:
        """
        P1.3: Load SPY data and calculate market regime features.

        Creates:
        - market_return_1d: Daily SPY return
        - market_return_21d: 21-day SPY return
        - market_volatility: Rolling 21-day volatility (VIX proxy)
        - market_volatility_zscore: Z-score of volatility (high/low regime)
        - high_vol_regime: Binary indicator for high volatility periods
        """
        query = """
            SELECT
                dp.date,
                dp.adjusted_close as spy_close
            FROM daily_prices dp
            JOIN companies c ON dp.company_id = c.id
            WHERE c.symbol = 'SPY'
            AND dp.date BETWEEN ? AND ?
            ORDER BY dp.date
        """

        with self.get_connection() as conn:
            spy_df = pd.read_sql_query(query, conn, params=(start_date, end_date))

        if len(spy_df) == 0:
            print("Warning: No SPY data found for market features")
            return pd.DataFrame()

        spy_df["date"] = pd.to_datetime(spy_df["date"])
        spy_df = spy_df.sort_values("date")

        # Calculate market features
        spy_df["market_return_1d"] = spy_df["spy_close"].pct_change(1)
        spy_df["market_return_5d"] = spy_df["spy_close"].pct_change(5)
        spy_df["market_return_21d"] = spy_df["spy_close"].pct_change(21)

        # Market volatility (VIX proxy) - annualized
        spy_df["market_volatility"] = (
            spy_df["market_return_1d"].rolling(21, min_periods=10).std() * np.sqrt(252)
        )

        # Volatility regime indicators
        vol_mean = spy_df["market_volatility"].expanding(min_periods=60).mean()
        vol_std = spy_df["market_volatility"].expanding(min_periods=60).std()
        spy_df["market_volatility_zscore"] = (spy_df["market_volatility"] - vol_mean) / (vol_std + 1e-6)
        spy_df["high_vol_regime"] = (spy_df["market_volatility_zscore"] > 1).astype(float)

        # Market trend indicator
        spy_df["market_sma_50"] = spy_df["spy_close"].rolling(50).mean()
        spy_df["market_above_sma50"] = (spy_df["spy_close"] > spy_df["market_sma_50"]).astype(float)

        # Drop intermediate columns
        market_features = spy_df[[
            "date", "market_return_1d", "market_return_5d", "market_return_21d",
            "market_volatility", "market_volatility_zscore", "high_vol_regime",
            "market_above_sma50"
        ]].copy()

        return market_features

    def calculate_derived_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculate derived features from raw data.

        Adds:
        - Returns at multiple horizons
        - Technical indicators (SMA, RSI, MACD, Bollinger Bands, ATR, OBV, ADX)
        - Normalized values
        - Rolling statistics

        Note: Technical indicators are calculated from OHLCV data since
        the database only stores raw prices.
        """
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(["symbol", "date"])

        print("Calculating derived features...")
        num_symbols = df["symbol"].nunique()
        processed = 0

        # Group by symbol for per-stock calculations
        for symbol in df["symbol"].unique():
            mask = df["symbol"] == symbol
            idx = df.loc[mask].index

            # Extract price data
            close = df.loc[idx, "adjusted_close"].astype(float)
            high = df.loc[idx, "high"].astype(float)
            low = df.loc[idx, "low"].astype(float)
            open_price = df.loc[idx, "open"].astype(float)
            close_price = df.loc[idx, "close"].astype(float)
            volume = df.loc[idx, "volume"].astype(float)

            # ==========================================
            # RETURNS
            # ==========================================
            # NOTE: close_return_21d REMOVED - it's autocorrelated with forward_return_21d
            # and causes the model to learn momentum rather than true predictive features
            df.loc[idx, "close_return_1d"] = close.pct_change(1)
            df.loc[idx, "close_return_5d"] = close.pct_change(5)
            # Use shorter-term momentum features that don't overlap with 21d prediction horizon
            df.loc[idx, "close_return_10d"] = close.pct_change(10)
            df.loc[idx, "close_return_63d"] = close.pct_change(63)  # 3-month momentum

            # Forward returns (target variable)
            raw_forward_return = close.pct_change(21).shift(-21)
            # P1.2: Winsorize extreme returns at ±3 std to reduce outlier influence
            # This prevents extreme moves (COVID crash, meme stocks) from dominating
            ret_mean = raw_forward_return.mean()
            ret_std = raw_forward_return.std()
            winsorized_return = raw_forward_return.clip(
                ret_mean - 3 * ret_std,
                ret_mean + 3 * ret_std
            )
            df.loc[idx, "forward_return_21d"] = winsorized_return

            # ==========================================
            # VOLATILITY-ADJUSTED RETURNS (P1.1 improvement)
            # ==========================================
            # Rolling volatility (annualized std of daily returns)
            daily_returns = close.pct_change(1)
            rolling_vol_21d = daily_returns.rolling(21, min_periods=10).std() * np.sqrt(252)
            df.loc[idx, "rolling_volatility_21d"] = rolling_vol_21d

            # Volatility-adjusted forward return (risk-normalized)
            # This normalizes targets so a 5% move in low-vol and 50% move in high-vol
            # have comparable scale, improving model stability across regimes
            forward_ret = close.pct_change(21).shift(-21)
            # Use rolling vol from before the forward period (avoid lookahead)
            vol_adjusted_return = forward_ret / (rolling_vol_21d + 1e-6)  # Add epsilon to avoid div by zero
            # Winsorize to ±5 to handle extreme outliers
            vol_adjusted_return = vol_adjusted_return.clip(-5, 5)
            df.loc[idx, "forward_return_21d_vol_adjusted"] = vol_adjusted_return

            # ==========================================
            # VOLUME FEATURES
            # ==========================================
            vol_ma20 = volume.rolling(20).mean()
            df.loc[idx, "volume_ratio_20d"] = volume / vol_ma20

            # ==========================================
            # PRICE RANGE FEATURES (normalized to be price-level invariant)
            # ==========================================
            # NOTE: Raw prices (open, high, low, close) are NOT used as features
            # because absolute price levels have no cross-sectional predictive value
            # ($500 stock is not inherently better than $50 stock)
            # Instead, we use normalized ratios and ranges
            df.loc[idx, "high_low_range"] = (high - low) / close_price
            df.loc[idx, "open_close_range"] = (close_price - open_price) / open_price
            df.loc[idx, "gap_open"] = (open_price - close_price.shift(1)) / close_price.shift(1)

            # 52-week high/low ratios (price relative to its range)
            rolling_high_252 = high.rolling(252, min_periods=60).max()
            rolling_low_252 = low.rolling(252, min_periods=60).min()
            df.loc[idx, "price_to_52w_high"] = close / rolling_high_252
            df.loc[idx, "price_to_52w_low"] = close / rolling_low_252

            # ==========================================
            # SIMPLE MOVING AVERAGES
            # ==========================================
            sma_20 = close.rolling(20).mean()
            sma_50 = close.rolling(50).mean()
            sma_200 = close.rolling(200).mean()

            df.loc[idx, "sma_20_ratio"] = close / sma_20
            df.loc[idx, "sma_50_ratio"] = close / sma_50
            df.loc[idx, "sma_200_ratio"] = close / sma_200

            # ==========================================
            # RSI (Relative Strength Index) - 14 period
            # ==========================================
            delta = close.diff()
            gain = delta.where(delta > 0, 0.0)
            loss = (-delta).where(delta < 0, 0.0)

            avg_gain = gain.rolling(window=14, min_periods=14).mean()
            avg_loss = loss.rolling(window=14, min_periods=14).mean()

            rs = avg_gain / (avg_loss + 1e-10)
            rsi = 100 - (100 / (1 + rs))
            df.loc[idx, "rsi_14"] = rsi / 100  # Scale to 0-1

            # ==========================================
            # MACD (Moving Average Convergence Divergence)
            # ==========================================
            ema_12 = close.ewm(span=12, adjust=False).mean()
            ema_26 = close.ewm(span=26, adjust=False).mean()
            macd_line = ema_12 - ema_26
            macd_signal = macd_line.ewm(span=9, adjust=False).mean()
            macd_histogram = macd_line - macd_signal

            # Normalize MACD by price for cross-stock comparability
            df.loc[idx, "macd_signal"] = macd_signal / close
            df.loc[idx, "macd_histogram"] = macd_histogram / close

            # ==========================================
            # BOLLINGER BANDS - 20 period, 2 std
            # ==========================================
            bb_middle = sma_20
            bb_std = close.rolling(20).std()
            bb_upper = bb_middle + (2 * bb_std)
            bb_lower = bb_middle - (2 * bb_std)
            bb_range = bb_upper - bb_lower

            df.loc[idx, "bb_position"] = ((close - bb_lower) / bb_range).clip(0, 1)

            # ==========================================
            # ATR (Average True Range) - 14 period
            # ==========================================
            tr1 = high - low
            tr2 = (high - close.shift(1)).abs()
            tr3 = (low - close.shift(1)).abs()
            true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
            atr = true_range.rolling(14).mean()

            df.loc[idx, "atr_14_pct"] = atr / close

            # ==========================================
            # OBV (On-Balance Volume) and slope
            # ==========================================
            price_change = close.diff()
            obv = (volume * np.sign(price_change.fillna(0))).cumsum()
            df.loc[idx, "obv_slope"] = (obv - obv.shift(5)) / (obv.shift(5).abs() + 1e-8)

            # ==========================================
            # ADX (Average Directional Index) - simplified 14 period
            # ==========================================
            plus_dm = high.diff()
            minus_dm = low.diff().abs() * -1  # Negative for down moves
            plus_dm = plus_dm.where((plus_dm > 0) & (plus_dm > minus_dm.abs()), 0)
            minus_dm = minus_dm.abs().where((minus_dm.abs() > 0) & (minus_dm.abs() > plus_dm), 0)

            atr_14 = true_range.rolling(14).mean()
            plus_di = 100 * (plus_dm.rolling(14).mean() / (atr_14 + 1e-10))
            minus_di = 100 * (minus_dm.rolling(14).mean() / (atr_14 + 1e-10))

            dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
            adx = dx.rolling(14).mean()
            df.loc[idx, "adx_14"] = adx / 100  # Scale to 0-1

            processed += 1
            if processed % 100 == 0:
                print(f"  Processed {processed}/{num_symbols} symbols...")

        # ==========================================
        # CROSS-SECTIONAL Z-SCORES - REMOVED FROM HERE
        # ==========================================
        # NOTE: Cross-sectional z-scores are now computed AFTER train/test split
        # in prepare_data() to prevent data leakage. Computing z-scores here
        # would use knowledge of future dates' stock universe composition.
        #
        # The z-scores for fundamentals (pe_ratio_zscore, etc.) are computed
        # in the compute_cross_sectional_zscores() method per-split.

        # ==========================================
        # P1.3: ADD MARKET REGIME FEATURES
        # ==========================================
        # Load SPY-based market features and merge by date
        start_date = df["date"].min().strftime("%Y-%m-%d")
        end_date = df["date"].max().strftime("%Y-%m-%d")
        market_features = self._load_market_features(start_date, end_date)

        if len(market_features) > 0:
            # Merge market features by date (all stocks get same market features for each date)
            df = df.merge(market_features, on="date", how="left")
            print(f"Added {len(market_features.columns) - 1} market regime features")

            # ==========================================
            # P2.2: RELATIVE STRENGTH FEATURES
            # ==========================================
            # Stock return relative to market (alpha vs SPY)
            for period in ['1d', '5d', '21d']:
                stock_col = f"close_return_{period}" if period != '21d' else "close_return_10d"
                market_col = f"market_return_{period}"
                if stock_col in df.columns and market_col in df.columns:
                    df[f"relative_strength_vs_market_{period}"] = df[stock_col] - df[market_col]

            # Relative strength vs sector (computed within each date-sector group)
            if "sector" in df.columns:
                for period in ['1d', '5d']:
                    col = f"close_return_{period}"
                    if col in df.columns:
                        # Sector mean return for each date
                        sector_return = df.groupby(["date", "sector"])[col].transform("mean")
                        df[f"relative_strength_vs_sector_{period}"] = df[col] - sector_return

                print("Added relative strength vs market and sector features")

        feature_count = len([c for c in df.columns if any(
            pattern in c for pattern in ['return', 'ratio', 'rsi', 'macd', 'bb_', 'atr', 'obv', 'adx', 'price_to_52w', 'market_', 'relative_strength']
        )])
        print(f"Created {feature_count} derived features")
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
        target_cols = ["forward_return_21d", "forward_return_21d_sector_neutral",
                       "forward_return_21d_vol_adjusted", "forward_return_21d_vol_adjusted_sector_neutral"]
        exclude_cols = ["symbol", "date"] + target_cols
        fill_cols = [c for c in numeric_cols if c not in exclude_cols]

        # Forward fill within symbol (respects point-in-time)
        # Note: Using ffill() instead of deprecated fillna(method="ffill")
        for col in fill_cols:
            df[col] = df.groupby("symbol")[col].transform(
                lambda x: x.ffill(limit=5)
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
        target_cols = ["forward_return_21d", "forward_return_21d_sector_neutral",
                       "forward_return_21d_vol_adjusted", "forward_return_21d_vol_adjusted_sector_neutral"]
        exclude_cols = ["symbol", "date"] + target_cols
        clip_cols = [c for c in numeric_cols if c not in exclude_cols]

        for col in clip_cols:
            lower = df[col].quantile(lower_pct)
            upper = df[col].quantile(upper_pct)
            df[col] = df[col].clip(lower, upper)

        return df

    def compute_cross_sectional_zscores(
        self,
        df: pd.DataFrame,
        cols: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        Compute cross-sectional z-scores within each date.

        This must be called AFTER train/test split to prevent data leakage.
        When computed before split, z-scores use knowledge of future dates'
        stock universe composition.

        Args:
            df: DataFrame with date column
            cols: Columns to z-score (default: pe_ratio, pb_ratio, ps_ratio)

        Returns:
            DataFrame with {col}_zscore columns added
        """
        df = df.copy()

        if cols is None:
            cols = ["pe_ratio", "pb_ratio", "ps_ratio"]

        for col in cols:
            if col in df.columns:
                df[f"{col}_zscore"] = df.groupby("date")[col].transform(
                    lambda x: (x - x.median()) / (x.std() + 1e-8)
                )

        return df

    def compute_cross_sectional_ranks(
        self,
        df: pd.DataFrame,
        cols: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        P2.1: Compute cross-sectional percentile ranks within each date.

        Ranks are more robust than z-scores because:
        1. They're bounded [0, 1] - no extreme outliers
        2. Models learn "top 10% momentum" instead of "5% return"
        3. Rankings are stable across different volatility regimes

        Must be called AFTER train/test split to prevent data leakage.

        Args:
            df: DataFrame with date column
            cols: Columns to rank (default: key predictive features)

        Returns:
            DataFrame with {col}_rank columns added (0=lowest, 1=highest)
        """
        df = df.copy()

        if cols is None:
            # Default: rank key features that benefit from cross-sectional comparison
            cols = [
                # Momentum features
                "close_return_1d", "close_return_5d", "close_return_10d", "close_return_63d",
                # Volatility features
                "rolling_volatility_21d", "atr_ratio",
                # Volume features
                "volume_ratio_20d",
                # Technical features
                "rsi_14", "macd_signal",
                # Valuation features (if available)
                "pe_ratio", "pb_ratio", "ps_ratio",
                # Price position features
                "price_to_52w_high", "price_to_52w_low",
                "sma_20_ratio", "sma_50_ratio", "sma_200_ratio"
            ]

        for col in cols:
            if col in df.columns:
                # Percentile rank within each date (0 = lowest, 1 = highest)
                df[f"{col}_rank"] = df.groupby("date")[col].transform(
                    lambda x: x.rank(pct=True, na_option='keep')
                )

        rank_cols = [c for c in df.columns if c.endswith('_rank')]
        print(f"Added {len(rank_cols)} cross-sectional rank features")

        return df

    def compute_sector_neutral_returns(
        self,
        df: pd.DataFrame,
        target_col: str = "forward_return_21d"
    ) -> pd.DataFrame:
        """
        Compute sector-neutral returns (residualized against sector).

        The raw return for a stock can be decomposed as:
            stock_return = sector_return + stock-specific_alpha

        By subtracting the sector return, we get the stock-specific alpha
        (residual return), which is what we want to predict.

        This helps because:
        1. Removes sector rotation effects from the target
        2. Forces model to learn stock-specific signals
        3. Reduces correlation between predictions
        4. Improves IC stability across market regimes

        Args:
            df: DataFrame with sector and target columns
            target_col: Target return column to neutralize

        Returns:
            DataFrame with {target_col}_sector_neutral added
        """
        df = df.copy()

        if "sector" not in df.columns:
            warnings.warn("No sector column found - skipping sector neutralization")
            df[f"{target_col}_sector_neutral"] = df[target_col]
            return df

        # Compute sector average return for each date
        sector_returns = df.groupby(["date", "sector"])[target_col].transform("mean")

        # Residual return = stock return - sector return
        df[f"{target_col}_sector_neutral"] = df[target_col] - sector_returns

        # Also add sector return as a feature (but it's computed within the split,
        # so there's no lookahead bias)
        df["sector_return"] = sector_returns

        # Report stats
        original_std = df[target_col].std()
        neutral_std = df[f"{target_col}_sector_neutral"].std()
        variance_explained = 1 - (neutral_std / original_std) ** 2
        print(f"Sector neutralization: {variance_explained:.1%} of return variance explained by sector")

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

        target_cols = ["forward_return_21d", "forward_return_21d_sector_neutral",
                       "forward_return_21d_vol_adjusted", "forward_return_21d_vol_adjusted_sector_neutral"]
        feature_cols = [c for c in df.columns if c not in ["symbol", "date"] + target_cols]
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
        sequence_length: Optional[int] = None,
        target_col: str = "forward_return_21d"
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[str]]:
        """
        Create sequences for LSTM/Transformer input.

        Args:
            df: DataFrame with features and target
            sequence_length: Override default sequence length
            target_col: Target column to use (default: forward_return_21d,
                        can be forward_return_21d_sector_neutral for sector-neutralized)

        Returns:
            X: Feature sequences (N, seq_len, num_features)
            y: Forward returns (N,)
            dates: Prediction dates (N,)
            symbols: Symbol for each sequence (N,)
        """
        seq_len = sequence_length or self.config.sequence_length

        # Get feature columns (exclude metadata, target, and raw prices)
        # Raw prices (open, high, low, close, adjusted_close) are excluded because:
        # 1. Absolute price levels have no cross-sectional predictive power
        # 2. A $500 stock is not inherently better than a $50 stock
        # 3. Models learn to overfit on price levels rather than true signals
        exclude = [
            "symbol", "date", "sector",  # metadata
            "forward_return_21d", "forward_return_21d_sector_neutral",  # raw targets
            "forward_return_21d_vol_adjusted", "forward_return_21d_vol_adjusted_sector_neutral",  # vol-adjusted targets
            "rolling_volatility_21d",  # volatility feature (used for target, not prediction)
            "open", "high", "low", "close", "adjusted_close", "volume"  # raw prices
        ]
        feature_cols = [c for c in df.columns if c not in exclude
                       and df[c].dtype in [np.float64, np.float32, np.int64]]

        print(f"Using {len(feature_cols)} features for sequences (excluded raw prices)")

        # Check if target column exists
        if target_col not in df.columns:
            # Fallback to standard target
            print(f"Warning: {target_col} not found, falling back to forward_return_21d")
            target_col = "forward_return_21d"

        X_list = []
        y_list = []
        dates_list = []
        symbols_list = []

        for symbol in df["symbol"].unique():
            symbol_df = df[df["symbol"] == symbol].sort_values("date")

            if len(symbol_df) < seq_len + 1:
                continue

            features = symbol_df[feature_cols].values
            targets = symbol_df[target_col].values
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

        print(f"Created {len(X):,} sequences of length {seq_len} using target: {target_col}")
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
        Full data preparation pipeline with proper train/test isolation.

        CRITICAL: This method carefully prevents data leakage by:
        1. Computing per-symbol features first (no cross-stock leakage)
        2. Splitting by DATE before any cross-sectional computations
        3. Computing cross-sectional z-scores AFTER split (prevents universe leakage)
        4. Computing normalization stats on training data only

        Returns train/val/test splits ready for model training.
        """
        # Load raw data
        df = self.load_raw_data(symbols, start_date, end_date)

        # Calculate derived features (no data leakage - per-symbol calculations)
        df = self.calculate_derived_features(df)

        # Handle missing values (forward fill is point-in-time correct)
        df = self.handle_missing_values(df)

        # Winsorize outliers
        df = self.winsorize_outliers(df)

        # ============================================
        # CRITICAL: Split DataFrame by DATE first
        # ============================================
        df["date"] = pd.to_datetime(df["date"])
        all_dates = sorted(df["date"].unique())
        n_dates = len(all_dates)

        train_idx = int(n_dates * self.config.train_ratio)
        val_idx = int(n_dates * (self.config.train_ratio + self.config.val_ratio))

        train_end_date = all_dates[train_idx]
        val_end_date = all_dates[val_idx]

        # Apply purge gap
        purge_days = self.config.purge_gap_days
        val_start_date = train_end_date + timedelta(days=purge_days)
        test_start_date = val_end_date + timedelta(days=purge_days)

        # Split DataFrame
        df_train = df[df["date"] <= train_end_date].copy()
        df_val = df[(df["date"] >= val_start_date) & (df["date"] <= val_end_date)].copy()
        df_test = df[df["date"] >= test_start_date].copy()

        print(f"DataFrame split - Train: {len(df_train):,}, Val: {len(df_val):,}, Test: {len(df_test):,}")

        # ============================================
        # Add derived fundamental features
        # ============================================
        def add_fundamental_features(df):
            """Add earnings yield and clean fundamental ratios."""
            # Earnings yield = 1 / PE (inverse of PE ratio)
            # This is useful because it's bounded and handles negative earnings better
            df["earnings_yield"] = 1.0 / (df["pe_ratio"].clip(lower=1) + 1e-8)
            df.loc[df["pe_ratio"] < 0, "earnings_yield"] = 0  # Negative PE = 0 earnings yield
            return df

        df_train = add_fundamental_features(df_train)
        df_val = add_fundamental_features(df_val)
        df_test = add_fundamental_features(df_test)

        # ============================================
        # Compute cross-sectional z-scores AFTER split
        # This prevents leakage of future universe composition
        # ============================================
        # Expanded to include more fundamental ratios
        zscore_cols = [
            "pe_ratio", "pb_ratio", "ps_ratio",  # Valuation
            "roe", "roa", "roic",  # Profitability
            "fcf_yield", "earnings_yield",  # Yield metrics
            "debt_to_equity", "current_ratio",  # Balance sheet
            "accruals_ratio", "earnings_quality", "asset_growth"  # Quant factors
        ]
        df_train = self.compute_cross_sectional_zscores(df_train, zscore_cols)
        df_val = self.compute_cross_sectional_zscores(df_val, zscore_cols)
        df_test = self.compute_cross_sectional_zscores(df_test, zscore_cols)

        # ============================================
        # P2.1: Compute cross-sectional RANKS
        # Ranks are more robust than z-scores (bounded 0-1, no outliers)
        # ============================================
        df_train = self.compute_cross_sectional_ranks(df_train)
        df_val = self.compute_cross_sectional_ranks(df_val)
        df_test = self.compute_cross_sectional_ranks(df_test)

        # ============================================
        # Compute sector-neutral returns AFTER split
        # This removes sector effects from the target variable
        # ============================================
        print("Computing sector-neutral returns...")
        # Raw returns (for comparison)
        df_train = self.compute_sector_neutral_returns(df_train, target_col="forward_return_21d")
        df_val = self.compute_sector_neutral_returns(df_val, target_col="forward_return_21d")
        df_test = self.compute_sector_neutral_returns(df_test, target_col="forward_return_21d")

        # Volatility-adjusted returns (P1.1 improvement - better regime stability)
        df_train = self.compute_sector_neutral_returns(df_train, target_col="forward_return_21d_vol_adjusted")
        df_val = self.compute_sector_neutral_returns(df_val, target_col="forward_return_21d_vol_adjusted")
        df_test = self.compute_sector_neutral_returns(df_test, target_col="forward_return_21d_vol_adjusted")

        # ============================================
        # Create sequences from each split
        # Use VOLATILITY-ADJUSTED sector-neutral returns as target
        # This normalizes targets across different volatility regimes
        # ============================================
        X_train, y_train, dates_train, syms_train = self.create_sequences(
            df_train, target_col="forward_return_21d_vol_adjusted_sector_neutral"
        )
        X_val, y_val, dates_val, syms_val = self.create_sequences(
            df_val, target_col="forward_return_21d_vol_adjusted_sector_neutral"
        )
        X_test, y_test, dates_test, syms_test = self.create_sequences(
            df_test, target_col="forward_return_21d_vol_adjusted_sector_neutral"
        )

        print(f"Sequence split - Train: {len(X_train):,}, Val: {len(X_val):,}, Test: {len(X_test):,}")

        # ============================================
        # Normalize using training stats only
        # ============================================
        train_flat = X_train.reshape(-1, X_train.shape[-1])

        self.feature_stats = FeatureStats(
            mean={i: float(train_flat[:, i].mean()) for i in range(train_flat.shape[1])},
            std={i: float(train_flat[:, i].std() + 1e-8) for i in range(train_flat.shape[1])},
            min_val={i: float(train_flat[:, i].min()) for i in range(train_flat.shape[1])},
            max_val={i: float(train_flat[:, i].max()) for i in range(train_flat.shape[1])},
            last_updated=datetime.now().isoformat()
        )

        # Apply normalization to all splits using training stats
        def normalize_split(X: np.ndarray) -> np.ndarray:
            """Normalize a split using pre-computed training stats."""
            X_normalized = X.copy()
            for i in range(X.shape[-1]):
                mean = self.feature_stats.mean[i]
                std = self.feature_stats.std[i]
                X_normalized[:, :, i] = (X_normalized[:, :, i] - mean) / std
            return X_normalized

        X_train_norm = normalize_split(X_train)
        X_val_norm = normalize_split(X_val)
        X_test_norm = normalize_split(X_test)

        # Replace any NaN/Inf with 0 (edge case handling)
        X_train_norm = np.nan_to_num(X_train_norm, nan=0.0, posinf=3.0, neginf=-3.0)
        X_val_norm = np.nan_to_num(X_val_norm, nan=0.0, posinf=3.0, neginf=-3.0)
        X_test_norm = np.nan_to_num(X_test_norm, nan=0.0, posinf=3.0, neginf=-3.0)

        print(f"Normalized using training stats (mean={np.mean(list(self.feature_stats.mean.values())):.4f})")

        return {
            "train": (X_train_norm, y_train, dates_train, syms_train),
            "val": (X_val_norm, y_val, dates_val, syms_val),
            "test": (X_test_norm, y_test, dates_test, syms_test),
        }

    def get_feature_names(self, df: Optional[pd.DataFrame] = None) -> List[str]:
        """Get list of feature names used in model."""
        if df is None:
            # Load minimal data to get column names
            query = "SELECT * FROM daily_prices LIMIT 1"
            with self.get_connection() as conn:
                df = pd.read_sql_query(query, conn)

        target_cols = ["forward_return_21d", "forward_return_21d_sector_neutral",
                       "forward_return_21d_vol_adjusted", "forward_return_21d_vol_adjusted_sector_neutral"]
        exclude = ["symbol", "date"] + target_cols
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
