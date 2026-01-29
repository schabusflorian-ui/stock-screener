# python/benchmarks/regime_classifier.py
# Market regime classification for benchmark analysis

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import sqlite3


class RegimeClassifier:
    """
    Classify market regimes for stratified model evaluation.

    Regimes:
    - bull: SPY > SMA200
    - bear: SPY < SMA200
    - high_vol: VIX > 25
    - crisis: Specific periods (COVID, 2022 bear)
    """

    # Known crisis periods
    CRISIS_PERIODS = {
        'covid_crash': ('2020-02-20', '2020-03-23'),
        'covid_recovery_vol': ('2020-03-24', '2020-06-01'),
        'bear_2022': ('2022-01-03', '2022-10-12'),
        'banking_crisis_2023': ('2023-03-08', '2023-03-20'),
    }

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.spy_data = None
        self.vix_data = None

    def load_market_data(self, start_date: str, end_date: str) -> bool:
        """Load SPY and VIX data for regime classification."""
        conn = sqlite3.connect(self.db_path)

        try:
            # Load SPY data
            spy_query = """
                SELECT dp.date, dp.close, dp.adjusted_close
                FROM daily_prices dp
                JOIN companies c ON dp.company_id = c.id
                WHERE c.symbol = 'SPY'
                AND dp.date >= ? AND dp.date <= ?
                ORDER BY dp.date
            """
            self.spy_data = pd.read_sql_query(
                spy_query, conn,
                params=(start_date, end_date),
                parse_dates=['date']
            )

            # Try to load VIX data (may not exist)
            vix_query = """
                SELECT dp.date, dp.close as vix_close
                FROM daily_prices dp
                JOIN companies c ON dp.company_id = c.id
                WHERE c.symbol IN ('VIX', '^VIX', 'VIXY')
                AND dp.date >= ? AND dp.date <= ?
                ORDER BY dp.date
            """
            try:
                self.vix_data = pd.read_sql_query(
                    vix_query, conn,
                    params=(start_date, end_date),
                    parse_dates=['date']
                )
            except:
                # Create synthetic VIX from SPY volatility if not available
                self.vix_data = self._estimate_vix_from_spy()

            conn.close()
            return len(self.spy_data) > 0

        except Exception as e:
            print(f"Error loading market data: {e}")
            conn.close()
            return False

    def _estimate_vix_from_spy(self) -> pd.DataFrame:
        """Estimate VIX-like volatility from SPY returns."""
        if self.spy_data is None or len(self.spy_data) == 0:
            return pd.DataFrame()

        df = self.spy_data.copy()
        df['returns'] = df['adjusted_close'].pct_change()
        # 20-day rolling volatility, annualized
        df['vix_close'] = df['returns'].rolling(20).std() * np.sqrt(252) * 100
        return df[['date', 'vix_close']].dropna()

    def calculate_sma(self, window: int = 200) -> pd.Series:
        """Calculate SMA for SPY."""
        if self.spy_data is None:
            return pd.Series()
        return self.spy_data['adjusted_close'].rolling(window).mean()

    def classify_regime(self, date: str) -> str:
        """
        Classify the market regime for a specific date.

        Priority: crisis > high_vol > bear > bull
        """
        date_dt = pd.to_datetime(date)

        # Check for crisis periods first
        for crisis_name, (start, end) in self.CRISIS_PERIODS.items():
            start_dt = pd.to_datetime(start)
            end_dt = pd.to_datetime(end)
            if start_dt <= date_dt <= end_dt:
                return 'crisis'

        # Get VIX for date
        if self.vix_data is not None and len(self.vix_data) > 0:
            vix_row = self.vix_data[self.vix_data['date'] == date_dt]
            if len(vix_row) > 0:
                vix_value = vix_row['vix_close'].iloc[0]
                if vix_value > 25:
                    return 'high_vol'

        # Check bull/bear using SMA200
        if self.spy_data is not None and len(self.spy_data) > 0:
            spy_row = self.spy_data[self.spy_data['date'] == date_dt]
            if len(spy_row) > 0:
                spy_price = spy_row['adjusted_close'].iloc[0]
                sma200 = self.calculate_sma(200)
                sma_row = sma200[self.spy_data['date'] == date_dt]
                if len(sma_row) > 0 and not np.isnan(sma_row.iloc[0]):
                    if spy_price < sma_row.iloc[0]:
                        return 'bear'

        return 'bull'

    def classify_all_dates(self, dates: List[str]) -> Dict[str, str]:
        """Classify regimes for all provided dates."""
        return {date: self.classify_regime(date) for date in dates}

    def get_regime_labels(self, start_date: str, end_date: str) -> pd.DataFrame:
        """
        Get regime labels for all trading days in range.

        Returns DataFrame with columns: date, regime, spy_price, sma200, vix
        """
        if not self.load_market_data(start_date, end_date):
            return pd.DataFrame()

        # Build regime DataFrame
        df = self.spy_data.copy()
        df['sma200'] = self.calculate_sma(200)

        # Merge VIX data
        if self.vix_data is not None and len(self.vix_data) > 0:
            df = df.merge(self.vix_data, on='date', how='left')
        else:
            df['vix_close'] = np.nan

        # Classify each date
        df['regime'] = df['date'].apply(lambda d: self.classify_regime(d.strftime('%Y-%m-%d')))

        return df[['date', 'regime', 'adjusted_close', 'sma200', 'vix_close']]

    def get_regime_summary(self, start_date: str, end_date: str) -> Dict:
        """Get summary statistics for each regime in the period."""
        df = self.get_regime_labels(start_date, end_date)

        if len(df) == 0:
            return {'error': 'No data available'}

        summary = {
            'total_days': len(df),
            'date_range': {
                'start': df['date'].min().strftime('%Y-%m-%d'),
                'end': df['date'].max().strftime('%Y-%m-%d')
            },
            'regimes': {}
        }

        for regime in ['bull', 'bear', 'high_vol', 'crisis']:
            regime_df = df[df['regime'] == regime]
            if len(regime_df) > 0:
                summary['regimes'][regime] = {
                    'days': len(regime_df),
                    'percentage': len(regime_df) / len(df) * 100,
                    'periods': self._count_continuous_periods(regime_df),
                    'avg_spy': regime_df['adjusted_close'].mean(),
                    'avg_vix': regime_df['vix_close'].mean() if not regime_df['vix_close'].isna().all() else None
                }
            else:
                summary['regimes'][regime] = {
                    'days': 0,
                    'percentage': 0,
                    'periods': 0
                }

        # Check for crisis period coverage
        summary['crisis_periods_included'] = []
        for crisis_name, (start, end) in self.CRISIS_PERIODS.items():
            start_dt = pd.to_datetime(start)
            end_dt = pd.to_datetime(end)
            date_min = df['date'].min()
            date_max = df['date'].max()

            if start_dt <= date_max and end_dt >= date_min:
                summary['crisis_periods_included'].append(crisis_name)

        return summary

    def _count_continuous_periods(self, df: pd.DataFrame) -> int:
        """Count number of continuous periods in regime."""
        if len(df) == 0:
            return 0

        dates = df['date'].sort_values()
        periods = 1
        prev_date = dates.iloc[0]

        for date in dates.iloc[1:]:
            if (date - prev_date).days > 5:  # Allow for weekends
                periods += 1
            prev_date = date

        return periods


def calculate_regime_metrics(
    predictions: np.ndarray,
    returns: np.ndarray,
    regime_labels: np.ndarray
) -> Dict[str, Dict[str, float]]:
    """
    Calculate metrics stratified by regime.

    Args:
        predictions: Model predictions
        returns: Actual returns
        regime_labels: Regime label for each sample ('bull', 'bear', 'high_vol', 'crisis')

    Returns:
        Dictionary with metrics per regime
    """
    from .evaluator import calculate_ic, calculate_rank_ic, calculate_direction_accuracy

    results = {}

    for regime in ['bull', 'bear', 'high_vol', 'crisis', 'all']:
        if regime == 'all':
            mask = np.ones(len(predictions), dtype=bool)
        else:
            mask = regime_labels == regime

        if mask.sum() < 10:
            results[regime] = {
                'n_samples': int(mask.sum()),
                'ic': None,
                'rank_ic': None,
                'direction_accuracy': None,
                'status': 'insufficient_data'
            }
            continue

        preds = predictions[mask]
        rets = returns[mask]

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


# Quick test
if __name__ == '__main__':
    import os

    # Find database
    db_path = os.path.join(os.path.dirname(__file__), '../../data/stocks.db')

    if os.path.exists(db_path):
        print("Testing RegimeClassifier...")

        classifier = RegimeClassifier(db_path)
        summary = classifier.get_regime_summary('2015-01-01', '2025-12-31')

        print(f"\nTotal days: {summary.get('total_days', 0)}")
        print(f"Date range: {summary.get('date_range', {})}")

        print("\nRegime breakdown:")
        for regime, stats in summary.get('regimes', {}).items():
            print(f"  {regime}: {stats['days']} days ({stats['percentage']:.1f}%)")

        print(f"\nCrisis periods included: {summary.get('crisis_periods_included', [])}")
    else:
        print(f"Database not found at {db_path}")
