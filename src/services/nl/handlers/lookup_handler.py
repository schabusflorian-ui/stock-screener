# src/services/nl/handlers/lookup_handler.py
"""
Handler for direct data lookup queries.
Answers questions like "What's AAPL's P/E ratio?" or "Show me MSFT's market cap"
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class MetricValue:
    """A single metric value with context"""
    metric_name: str
    display_name: str
    value: any
    formatted_value: str
    category: str
    context: Optional[str] = None


class LookupHandler:
    """
    Handle direct data lookup queries.

    Handles queries like:
    - "What's AAPL's P/E ratio?"
    - "Show me MSFT's market cap"
    - "NVDA revenue"
    - "Tell me about GOOGL"
    """

    # Metric definitions with formatting
    METRICS = {
        # Valuation
        'pe_ratio': {'display': 'P/E Ratio', 'format': 'ratio', 'category': 'valuation'},
        'pb_ratio': {'display': 'P/B Ratio', 'format': 'ratio', 'category': 'valuation'},
        'ps_ratio': {'display': 'P/S Ratio', 'format': 'ratio', 'category': 'valuation'},
        'ev_ebitda': {'display': 'EV/EBITDA', 'format': 'ratio', 'category': 'valuation'},

        # Size
        'market_cap': {'display': 'Market Cap', 'format': 'currency_large', 'category': 'size'},
        'enterprise_value': {'display': 'Enterprise Value', 'format': 'currency_large', 'category': 'size'},

        # Profitability
        'gross_margin': {'display': 'Gross Margin', 'format': 'percent', 'category': 'profitability'},
        'operating_margin': {'display': 'Operating Margin', 'format': 'percent', 'category': 'profitability'},
        'net_margin': {'display': 'Net Margin', 'format': 'percent', 'category': 'profitability'},
        'roe': {'display': 'Return on Equity', 'format': 'percent', 'category': 'profitability'},
        'roa': {'display': 'Return on Assets', 'format': 'percent', 'category': 'profitability'},
        'roic': {'display': 'Return on Invested Capital', 'format': 'percent', 'category': 'profitability'},

        # Growth
        'revenue_growth_yoy': {'display': 'Revenue Growth (YoY)', 'format': 'percent', 'category': 'growth'},
        'eps_growth_yoy': {'display': 'EPS Growth (YoY)', 'format': 'percent', 'category': 'growth'},

        # Financial Health
        'debt_to_equity': {'display': 'Debt/Equity', 'format': 'ratio', 'category': 'financial_health'},
        'current_ratio': {'display': 'Current Ratio', 'format': 'ratio', 'category': 'financial_health'},
        'interest_coverage': {'display': 'Interest Coverage', 'format': 'ratio', 'category': 'financial_health'},

        # Dividend
        'dividend_yield': {'display': 'Dividend Yield', 'format': 'percent', 'category': 'dividend'},
        'payout_ratio': {'display': 'Payout Ratio', 'format': 'percent', 'category': 'dividend'},

        # Price
        'price': {'display': 'Stock Price', 'format': 'currency', 'category': 'price'},
        'change_percent': {'display': 'Daily Change', 'format': 'percent', 'category': 'price'},

        # Financials (from statements)
        'total_revenue': {'display': 'Revenue', 'format': 'currency_large', 'category': 'financials'},
        'net_income': {'display': 'Net Income', 'format': 'currency_large', 'category': 'financials'},
        'operating_income': {'display': 'Operating Income', 'format': 'currency_large', 'category': 'financials'},
        'eps_diluted': {'display': 'EPS (Diluted)', 'format': 'currency', 'category': 'financials'},
        'total_assets': {'display': 'Total Assets', 'format': 'currency_large', 'category': 'financials'},
        'total_debt': {'display': 'Total Debt', 'format': 'currency_large', 'category': 'financials'},
        'cash_and_equivalents': {'display': 'Cash & Equivalents', 'format': 'currency_large', 'category': 'financials'},
    }

    # Aliases for metric lookup
    METRIC_ALIASES = {
        'pe': 'pe_ratio',
        'p/e': 'pe_ratio',
        'price to earnings': 'pe_ratio',
        'pb': 'pb_ratio',
        'p/b': 'pb_ratio',
        'price to book': 'pb_ratio',
        'ps': 'ps_ratio',
        'p/s': 'ps_ratio',
        'price to sales': 'ps_ratio',
        'market cap': 'market_cap',
        'marketcap': 'market_cap',
        'cap': 'market_cap',
        'ev': 'enterprise_value',
        'margin': 'net_margin',
        'gross margin': 'gross_margin',
        'operating margin': 'operating_margin',
        'net margin': 'net_margin',
        'return on equity': 'roe',
        'return on assets': 'roa',
        'revenue growth': 'revenue_growth_yoy',
        'growth': 'revenue_growth_yoy',
        'earnings growth': 'eps_growth_yoy',
        'debt': 'debt_to_equity',
        'leverage': 'debt_to_equity',
        'dividend': 'dividend_yield',
        'yield': 'dividend_yield',
        'price': 'price',
        'stock price': 'price',
        'revenue': 'total_revenue',
        'sales': 'total_revenue',
        'earnings': 'net_income',
        'profit': 'net_income',
        'income': 'net_income',
        'eps': 'eps_diluted',
        'cash': 'cash_and_equivalents',
        'assets': 'total_assets',
    }

    def __init__(self, db=None):
        """
        Args:
            db: Database connection
        """
        self.db = db

    async def handle(self, classified_query) -> Dict:
        """
        Handle a lookup query.

        Args:
            classified_query: ClassifiedQuery with intent LOOKUP

        Returns:
            Dict with metric values
        """
        # Get symbol
        symbols = classified_query.entities.get('symbols', [])
        if not symbols:
            return {
                'type': 'error',
                'message': 'Please specify a stock symbol.'
            }

        symbol = symbols[0].upper()

        # Get requested metrics
        requested_metrics = classified_query.entities.get('metrics', [])

        # Resolve metric aliases
        metric_keys = []
        for m in requested_metrics:
            m_lower = m.lower()
            if m_lower in self.METRIC_ALIASES:
                metric_keys.append(self.METRIC_ALIASES[m_lower])
            elif m_lower in self.METRICS:
                metric_keys.append(m_lower)

        # If no specific metrics requested, return a summary
        if not metric_keys:
            return await self._get_company_summary(symbol)

        # Get specific metrics
        return await self._get_specific_metrics(symbol, metric_keys)

    async def _get_company_summary(self, symbol: str) -> Dict:
        """Get a comprehensive company summary"""
        company_data = await self._get_company_data(symbol)
        if not company_data:
            return {
                'type': 'error',
                'message': f'Could not find data for {symbol}.'
            }

        # Format key metrics by category
        metrics_by_category = {}
        for metric_name, metric_info in self.METRICS.items():
            value = company_data.get(metric_name)
            if value is not None:
                category = metric_info['category']
                if category not in metrics_by_category:
                    metrics_by_category[category] = []

                metrics_by_category[category].append(MetricValue(
                    metric_name=metric_name,
                    display_name=metric_info['display'],
                    value=value,
                    formatted_value=self._format_value(value, metric_info['format']),
                    category=category
                ))

        return {
            'type': 'company_summary',
            'symbol': symbol,
            'name': company_data.get('name', symbol),
            'sector': company_data.get('sector'),
            'industry': company_data.get('industry'),
            'description': company_data.get('description'),
            'metrics_by_category': {
                cat: [self._metric_to_dict(m) for m in metrics]
                for cat, metrics in metrics_by_category.items()
            }
        }

    async def _get_specific_metrics(self, symbol: str, metric_keys: List[str]) -> Dict:
        """Get specific requested metrics"""
        company_data = await self._get_company_data(symbol)
        if not company_data:
            return {
                'type': 'error',
                'message': f'Could not find data for {symbol}.'
            }

        metrics = []
        for metric_name in metric_keys:
            if metric_name in self.METRICS:
                metric_info = self.METRICS[metric_name]
                value = company_data.get(metric_name)

                metrics.append(MetricValue(
                    metric_name=metric_name,
                    display_name=metric_info['display'],
                    value=value,
                    formatted_value=self._format_value(value, metric_info['format']) if value is not None else 'N/A',
                    category=metric_info['category'],
                    context=self._get_metric_context(metric_name, value, company_data)
                ))

        return {
            'type': 'metric_lookup',
            'symbol': symbol,
            'name': company_data.get('name', symbol),
            'metrics': [self._metric_to_dict(m) for m in metrics],
            'summary': self._build_summary(symbol, metrics)
        }

    async def _get_company_data(self, symbol: str) -> Optional[Dict]:
        """Get all company data"""
        if not self.db:
            return None

        sql = """
            SELECT
                c.symbol, c.name, c.sector, c.industry, c.description,
                m.market_cap, m.enterprise_value,
                m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
                m.gross_margin, m.operating_margin, m.net_margin,
                m.roe, m.roa, m.roic,
                m.revenue_growth_yoy, m.eps_growth_yoy,
                m.debt_to_equity, m.current_ratio, m.interest_coverage,
                m.dividend_yield, m.payout_ratio,
                p.close as price, p.change_percent,
                f.total_revenue, f.net_income, f.operating_income,
                f.eps_diluted, f.total_assets, f.total_debt, f.cash_and_equivalents
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            LEFT JOIN (
                SELECT company_id, close, change_percent
                FROM daily_prices
                WHERE (company_id, date) IN (
                    SELECT company_id, MAX(date) FROM daily_prices GROUP BY company_id
                )
            ) p ON c.id = p.company_id
            LEFT JOIN (
                SELECT company_id, total_revenue, net_income, operating_income,
                       eps_diluted, total_assets, total_debt, cash_and_equivalents
                FROM financial_data
                WHERE (company_id, fiscal_date_ending) IN (
                    SELECT company_id, MAX(fiscal_date_ending)
                    FROM financial_data
                    WHERE statement_type = 'income_statement'
                    GROUP BY company_id
                )
            ) f ON c.id = f.company_id
            WHERE c.symbol = ? AND c.active = 1
        """

        try:
            result = self.db.execute(sql, [symbol]).fetchone()
            if not result:
                return None

            columns = [
                'symbol', 'name', 'sector', 'industry', 'description',
                'market_cap', 'enterprise_value',
                'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
                'gross_margin', 'operating_margin', 'net_margin',
                'roe', 'roa', 'roic',
                'revenue_growth_yoy', 'eps_growth_yoy',
                'debt_to_equity', 'current_ratio', 'interest_coverage',
                'dividend_yield', 'payout_ratio',
                'price', 'change_percent',
                'total_revenue', 'net_income', 'operating_income',
                'eps_diluted', 'total_assets', 'total_debt', 'cash_and_equivalents'
            ]
            return dict(zip(columns, result))

        except Exception as e:
            logger.error(f"Failed to get company data for {symbol}: {e}")
            return None

    def _format_value(self, value: any, format_type: str) -> str:
        """Format a value for display"""
        if value is None:
            return 'N/A'

        if format_type == 'ratio':
            return f"{value:.2f}x"
        elif format_type == 'percent':
            return f"{value * 100:.2f}%"
        elif format_type == 'currency':
            return f"${value:.2f}"
        elif format_type == 'currency_large':
            if value >= 1_000_000_000_000:
                return f"${value / 1_000_000_000_000:.2f}T"
            elif value >= 1_000_000_000:
                return f"${value / 1_000_000_000:.2f}B"
            elif value >= 1_000_000:
                return f"${value / 1_000_000:.2f}M"
            else:
                return f"${value:,.0f}"
        else:
            return str(value)

    def _get_metric_context(
        self,
        metric_name: str,
        value: any,
        company_data: Dict
    ) -> Optional[str]:
        """Get context for a metric value"""
        if value is None:
            return None

        contexts = {
            'pe_ratio': lambda v: 'High valuation' if v > 30 else ('Low valuation' if v < 15 else 'Moderate valuation'),
            'dividend_yield': lambda v: 'High yield' if v > 0.04 else ('No dividend' if v == 0 else 'Moderate yield'),
            'debt_to_equity': lambda v: 'High leverage' if v > 2 else ('Low leverage' if v < 0.5 else 'Moderate leverage'),
            'roe': lambda v: 'Strong returns' if v > 0.2 else ('Weak returns' if v < 0.1 else 'Average returns'),
            'revenue_growth_yoy': lambda v: 'Strong growth' if v > 0.2 else ('Declining' if v < 0 else 'Moderate growth'),
        }

        if metric_name in contexts:
            return contexts[metric_name](value)

        return None

    def _build_summary(self, symbol: str, metrics: List[MetricValue]) -> str:
        """Build a text summary of the lookup"""
        parts = [f"{symbol}:"]
        for m in metrics:
            parts.append(f"{m.display_name}: {m.formatted_value}")
        return " | ".join(parts)

    def _metric_to_dict(self, metric: MetricValue) -> Dict:
        """Convert MetricValue to dictionary"""
        return {
            'metric_name': metric.metric_name,
            'display_name': metric.display_name,
            'value': metric.value,
            'formatted_value': metric.formatted_value,
            'category': metric.category,
            'context': metric.context
        }
