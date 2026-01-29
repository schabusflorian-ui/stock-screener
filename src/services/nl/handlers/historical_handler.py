# src/services/nl/handlers/historical_handler.py
"""
Handler for historical data queries.
Translates queries like "Compare AAPL's margins to 5 years ago" or
"How has NVDA's revenue grown over time?"
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


@dataclass
class HistoricalPeriod:
    """A time period for historical comparison"""
    start_date: str
    end_date: str
    label: str  # e.g., "5 years ago", "2020", "Q1 2023"


@dataclass
class MetricTimeSeries:
    """Time series data for a metric"""
    metric_name: str
    display_name: str
    data_points: List[Dict]  # [{date, value, period_label}]
    change_summary: Dict  # {absolute_change, percent_change, direction}


class HistoricalHandler:
    """
    Handle historical data and trend queries.

    Handles queries like:
    - "How has AAPL's revenue changed over 5 years?"
    - "Compare MSFT's margins to 3 years ago"
    - "Show NVDA's P/E ratio history"
    - "What was GOOGL's market cap in 2020?"
    """

    # Period keywords to parse
    PERIOD_PATTERNS = {
        '1 year': 365,
        'one year': 365,
        'a year': 365,
        '2 years': 730,
        'two years': 730,
        '3 years': 1095,
        'three years': 1095,
        '5 years': 1825,
        'five years': 1825,
        '10 years': 3650,
        'ten years': 3650,
        'decade': 3650,
        '6 months': 180,
        'six months': 180,
        'quarter': 90,
        '3 months': 90,
        'month': 30,
        'ytd': 'ytd',
        'year to date': 'ytd',
    }

    # Metrics available for historical queries
    HISTORICAL_METRICS = {
        # Revenue/Income
        'revenue': {'table': 'financial_data', 'field': 'total_revenue', 'display': 'Revenue'},
        'total_revenue': {'table': 'financial_data', 'field': 'total_revenue', 'display': 'Revenue'},
        'net_income': {'table': 'financial_data', 'field': 'net_income', 'display': 'Net Income'},
        'operating_income': {'table': 'financial_data', 'field': 'operating_income', 'display': 'Operating Income'},
        'gross_profit': {'table': 'financial_data', 'field': 'gross_profit', 'display': 'Gross Profit'},
        'ebitda': {'table': 'financial_data', 'field': 'ebitda', 'display': 'EBITDA'},

        # Margins
        'gross_margin': {'table': 'calculated_metrics', 'field': 'gross_margin', 'display': 'Gross Margin'},
        'operating_margin': {'table': 'calculated_metrics', 'field': 'operating_margin', 'display': 'Operating Margin'},
        'net_margin': {'table': 'calculated_metrics', 'field': 'net_margin', 'display': 'Net Margin'},

        # Returns
        'roe': {'table': 'calculated_metrics', 'field': 'roe', 'display': 'ROE'},
        'roa': {'table': 'calculated_metrics', 'field': 'roa', 'display': 'ROA'},
        'roic': {'table': 'calculated_metrics', 'field': 'roic', 'display': 'ROIC'},

        # Per share
        'eps': {'table': 'financial_data', 'field': 'eps_diluted', 'display': 'EPS'},
        'book_value': {'table': 'financial_data', 'field': 'book_value_per_share', 'display': 'Book Value/Share'},

        # Valuation
        'pe_ratio': {'table': 'calculated_metrics', 'field': 'pe_ratio', 'display': 'P/E Ratio'},
        'pb_ratio': {'table': 'calculated_metrics', 'field': 'pb_ratio', 'display': 'P/B Ratio'},
        'ps_ratio': {'table': 'calculated_metrics', 'field': 'ps_ratio', 'display': 'P/S Ratio'},

        # Dividend
        'dividend': {'table': 'financial_data', 'field': 'dividends_paid', 'display': 'Dividends'},
        'dividend_yield': {'table': 'calculated_metrics', 'field': 'dividend_yield', 'display': 'Dividend Yield'},

        # Balance sheet
        'total_assets': {'table': 'financial_data', 'field': 'total_assets', 'display': 'Total Assets'},
        'total_debt': {'table': 'financial_data', 'field': 'total_debt', 'display': 'Total Debt'},
        'cash': {'table': 'financial_data', 'field': 'cash_and_equivalents', 'display': 'Cash'},

        # Market
        'market_cap': {'table': 'daily_prices', 'field': 'market_cap', 'display': 'Market Cap'},
        'price': {'table': 'daily_prices', 'field': 'close', 'display': 'Stock Price'},
    }

    def __init__(self, db=None):
        """
        Args:
            db: Database connection for executing queries
        """
        self.db = db

    async def handle(self, classified_query) -> Dict:
        """
        Handle a historical query.

        Args:
            classified_query: ClassifiedQuery with intent HISTORICAL

        Returns:
            Dict with historical data and analysis
        """
        # Get symbol
        symbols = classified_query.entities.get('symbols', [])
        if not symbols:
            return {
                'type': 'error',
                'message': 'Please specify a stock symbol for historical analysis.'
            }

        symbol = symbols[0].upper()

        # Get metrics to analyze
        metrics = classified_query.entities.get('metrics', [])
        if not metrics:
            # Default to revenue and earnings
            metrics = ['revenue', 'net_income', 'eps']

        # Parse time period
        period = self._parse_period(classified_query.original_query)

        # Fetch historical data
        results = []
        for metric in metrics:
            metric_lower = metric.lower().replace(' ', '_')
            if metric_lower in self.HISTORICAL_METRICS:
                time_series = await self._get_metric_history(
                    symbol, metric_lower, period
                )
                if time_series:
                    results.append(time_series)

        if not results:
            return {
                'type': 'error',
                'message': f'No historical data found for {symbol}.'
            }

        return {
            'type': 'historical_results',
            'symbol': symbol,
            'period': {
                'start': period.start_date,
                'end': period.end_date,
                'label': period.label
            },
            'metrics': [self._time_series_to_dict(ts) for ts in results],
            'summary': self._build_summary(symbol, results)
        }

    def _parse_period(self, query: str) -> HistoricalPeriod:
        """Parse time period from query"""
        query_lower = query.lower()
        today = datetime.now()

        # Check for specific year mentions
        import re
        year_match = re.search(r'\b(20[0-2]\d)\b', query)
        if year_match:
            year = int(year_match.group(1))
            return HistoricalPeriod(
                start_date=f"{year}-01-01",
                end_date=f"{year}-12-31",
                label=str(year)
            )

        # Check for period patterns
        for pattern, days in self.PERIOD_PATTERNS.items():
            if pattern in query_lower:
                if days == 'ytd':
                    return HistoricalPeriod(
                        start_date=f"{today.year}-01-01",
                        end_date=today.strftime('%Y-%m-%d'),
                        label='Year to Date'
                    )
                else:
                    start = today - timedelta(days=days)
                    return HistoricalPeriod(
                        start_date=start.strftime('%Y-%m-%d'),
                        end_date=today.strftime('%Y-%m-%d'),
                        label=pattern
                    )

        # Default to 5 years
        start = today - timedelta(days=1825)
        return HistoricalPeriod(
            start_date=start.strftime('%Y-%m-%d'),
            end_date=today.strftime('%Y-%m-%d'),
            label='5 years'
        )

    async def _get_metric_history(
        self,
        symbol: str,
        metric: str,
        period: HistoricalPeriod
    ) -> Optional[MetricTimeSeries]:
        """Get historical data for a metric"""
        if not self.db:
            return None

        metric_info = self.HISTORICAL_METRICS.get(metric)
        if not metric_info:
            return None

        table = metric_info['table']
        field = metric_info['field']
        display_name = metric_info['display']

        # Build query based on table type
        if table == 'financial_data':
            sql = f"""
                SELECT
                    f.fiscal_date_ending as date,
                    f.{field} as value,
                    f.fiscal_period as period_label
                FROM financial_data f
                JOIN companies c ON f.company_id = c.id
                WHERE c.symbol = ?
                AND f.statement_type = 'income_statement'
                AND f.fiscal_date_ending BETWEEN ? AND ?
                AND f.{field} IS NOT NULL
                ORDER BY f.fiscal_date_ending ASC
            """
        elif table == 'daily_prices':
            sql = f"""
                SELECT
                    p.date,
                    p.{field} as value,
                    strftime('%Y-%m', p.date) as period_label
                FROM daily_prices p
                JOIN companies c ON p.company_id = c.id
                WHERE c.symbol = ?
                AND p.date BETWEEN ? AND ?
                AND p.{field} IS NOT NULL
                ORDER BY p.date ASC
            """
        else:
            # calculated_metrics - need historical snapshots
            # For now, return current value only
            sql = f"""
                SELECT
                    date('now') as date,
                    m.{field} as value,
                    'Current' as period_label
                FROM calculated_metrics m
                JOIN companies c ON m.company_id = c.id
                WHERE c.symbol = ?
                AND m.{field} IS NOT NULL
            """

        try:
            if table == 'calculated_metrics':
                results = self.db.execute(sql, [symbol]).fetchall()
            else:
                results = self.db.execute(
                    sql, [symbol, period.start_date, period.end_date]
                ).fetchall()

            if not results:
                return None

            data_points = [
                {'date': row[0], 'value': row[1], 'period_label': row[2]}
                for row in results
            ]

            # Calculate change summary
            change_summary = self._calculate_change(data_points)

            return MetricTimeSeries(
                metric_name=metric,
                display_name=display_name,
                data_points=data_points,
                change_summary=change_summary
            )

        except Exception as e:
            logger.error(f"Failed to get historical data for {metric}: {e}")
            return None

    def _calculate_change(self, data_points: List[Dict]) -> Dict:
        """Calculate the change over the time period"""
        if len(data_points) < 2:
            return {
                'absolute_change': None,
                'percent_change': None,
                'direction': 'unchanged',
                'periods': len(data_points)
            }

        first_value = data_points[0]['value']
        last_value = data_points[-1]['value']

        if first_value is None or last_value is None:
            return {
                'absolute_change': None,
                'percent_change': None,
                'direction': 'unknown',
                'periods': len(data_points)
            }

        absolute_change = last_value - first_value

        if first_value != 0:
            percent_change = (absolute_change / abs(first_value)) * 100
        else:
            percent_change = None

        if absolute_change > 0:
            direction = 'increased'
        elif absolute_change < 0:
            direction = 'decreased'
        else:
            direction = 'unchanged'

        return {
            'absolute_change': absolute_change,
            'percent_change': percent_change,
            'direction': direction,
            'periods': len(data_points),
            'first_value': first_value,
            'last_value': last_value,
            'first_date': data_points[0]['date'],
            'last_date': data_points[-1]['date']
        }

    def _time_series_to_dict(self, ts: MetricTimeSeries) -> Dict:
        """Convert MetricTimeSeries to dictionary"""
        return {
            'metric_name': ts.metric_name,
            'display_name': ts.display_name,
            'data_points': ts.data_points,
            'change_summary': ts.change_summary
        }

    def _build_summary(self, symbol: str, results: List[MetricTimeSeries]) -> str:
        """Build a text summary of the historical analysis"""
        summaries = []

        for ts in results:
            change = ts.change_summary
            if change['direction'] == 'increased':
                if change['percent_change']:
                    summaries.append(
                        f"{ts.display_name} increased by {change['percent_change']:.1f}%"
                    )
                else:
                    summaries.append(f"{ts.display_name} increased")
            elif change['direction'] == 'decreased':
                if change['percent_change']:
                    summaries.append(
                        f"{ts.display_name} decreased by {abs(change['percent_change']):.1f}%"
                    )
                else:
                    summaries.append(f"{ts.display_name} decreased")
            else:
                summaries.append(f"{ts.display_name} remained stable")

        if summaries:
            return f"For {symbol}: " + "; ".join(summaries)
        return f"Historical data retrieved for {symbol}"
