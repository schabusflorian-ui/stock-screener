# src/services/nl/handlers/driver_handler.py
"""
Handler for driver analysis queries.
Answers questions like "What's driving NVDA's revenue growth?"
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Driver:
    """A business driver or factor"""
    name: str
    category: str  # revenue, margin, growth, etc.
    impact: str  # positive, negative, neutral
    magnitude: str  # high, medium, low
    evidence: List[str]
    data_points: Dict


class DriverHandler:
    """
    Analyze what's driving a company's performance.

    Handles queries like:
    - "What's driving NVDA's revenue growth?"
    - "Why is AAPL's margin declining?"
    - "Explain MSFT's profitability"
    """

    # Driver analysis categories
    DRIVER_CATEGORIES = {
        'revenue': {
            'metrics': ['revenue_growth_yoy', 'total_revenue'],
            'segments': True,
            'question': 'What is driving revenue?'
        },
        'margin': {
            'metrics': ['gross_margin', 'operating_margin', 'net_margin'],
            'trends': True,
            'question': 'What is affecting margins?'
        },
        'growth': {
            'metrics': ['revenue_growth_yoy', 'eps_growth_yoy', 'book_value_growth'],
            'historical': True,
            'question': 'What is driving growth?'
        },
        'profitability': {
            'metrics': ['roe', 'roa', 'roic', 'net_margin'],
            'decomposition': True,
            'question': 'What is driving profitability?'
        },
        'valuation': {
            'metrics': ['pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda'],
            'relative': True,
            'question': 'What is driving valuation?'
        }
    }

    def __init__(self, db=None, router=None):
        """
        Args:
            db: Database connection
            router: LLM router for analysis
        """
        self.db = db
        self.router = router

    async def handle(self, classified_query) -> Dict:
        """
        Handle a driver analysis query.

        Args:
            classified_query: ClassifiedQuery with intent DRIVER

        Returns:
            Dict with driver analysis
        """
        # Get symbol
        symbols = classified_query.entities.get('symbols', [])
        if not symbols:
            return {
                'type': 'error',
                'message': 'Please specify a stock symbol for driver analysis.'
            }

        symbol = symbols[0].upper()

        # Determine what to analyze
        focus = self._determine_focus(classified_query)

        # Get company data
        company_data = await self._get_company_data(symbol)
        if not company_data:
            return {
                'type': 'error',
                'message': f'Could not find data for {symbol}.'
            }

        # Get historical data for trends
        historical_data = await self._get_historical_data(symbol)

        # Get segment data if available
        segment_data = await self._get_segment_data(symbol)

        # Analyze drivers
        drivers = self._analyze_drivers(
            company_data, historical_data, segment_data, focus
        )

        # Build explanation
        explanation = self._build_explanation(symbol, drivers, focus)

        return {
            'type': 'driver_analysis',
            'symbol': symbol,
            'company_name': company_data.get('name', symbol),
            'focus_area': focus,
            'drivers': [self._driver_to_dict(d) for d in drivers],
            'key_metrics': self._extract_key_metrics(company_data, focus),
            'trends': self._extract_trends(historical_data, focus),
            'explanation': explanation
        }

    def _determine_focus(self, classified_query) -> str:
        """Determine what aspect to analyze"""
        query_lower = classified_query.original_query.lower()

        focus_keywords = {
            'revenue': ['revenue', 'sales', 'top line', 'topline'],
            'margin': ['margin', 'margins', 'profitability', 'profit margin'],
            'growth': ['growth', 'growing', 'expansion'],
            'profitability': ['profit', 'earnings', 'roe', 'returns'],
            'valuation': ['valuation', 'value', 'price', 'multiple', 'pe', 'p/e']
        }

        for focus, keywords in focus_keywords.items():
            if any(kw in query_lower for kw in keywords):
                return focus

        # Default to revenue if not specific
        return 'revenue'

    async def _get_company_data(self, symbol: str) -> Optional[Dict]:
        """Get current company data"""
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
                m.debt_to_equity, m.current_ratio,
                m.dividend_yield, m.payout_ratio
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
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
                'debt_to_equity', 'current_ratio',
                'dividend_yield', 'payout_ratio'
            ]
            return dict(zip(columns, result))

        except Exception as e:
            logger.error(f"Failed to get company data for {symbol}: {e}")
            return None

    async def _get_historical_data(self, symbol: str) -> List[Dict]:
        """Get historical financial data for trend analysis"""
        if not self.db:
            return []

        sql = """
            SELECT
                f.fiscal_date_ending,
                f.fiscal_period,
                f.total_revenue,
                f.gross_profit,
                f.operating_income,
                f.net_income,
                f.eps_diluted
            FROM financial_data f
            JOIN companies c ON f.company_id = c.id
            WHERE c.symbol = ?
            AND f.statement_type = 'income_statement'
            AND f.total_revenue IS NOT NULL
            ORDER BY f.fiscal_date_ending DESC
            LIMIT 20
        """

        try:
            results = self.db.execute(sql, [symbol]).fetchall()
            columns = [
                'fiscal_date_ending', 'fiscal_period',
                'total_revenue', 'gross_profit', 'operating_income',
                'net_income', 'eps_diluted'
            ]
            return [dict(zip(columns, row)) for row in results]

        except Exception as e:
            logger.error(f"Failed to get historical data for {symbol}: {e}")
            return []

    async def _get_segment_data(self, symbol: str) -> List[Dict]:
        """Get segment revenue breakdown if available"""
        if not self.db:
            return []

        sql = """
            SELECT
                s.segment_name,
                s.segment_type,
                s.revenue,
                s.fiscal_date_ending
            FROM segment_data s
            JOIN companies c ON s.company_id = c.id
            WHERE c.symbol = ?
            ORDER BY s.fiscal_date_ending DESC, s.revenue DESC
            LIMIT 20
        """

        try:
            results = self.db.execute(sql, [symbol]).fetchall()
            columns = ['segment_name', 'segment_type', 'revenue', 'fiscal_date_ending']
            return [dict(zip(columns, row)) for row in results]
        except:
            # Table might not exist
            return []

    def _analyze_drivers(
        self,
        company_data: Dict,
        historical_data: List[Dict],
        segment_data: List[Dict],
        focus: str
    ) -> List[Driver]:
        """Analyze and identify key drivers"""
        drivers = []

        if focus == 'revenue':
            drivers.extend(self._analyze_revenue_drivers(
                company_data, historical_data, segment_data
            ))
        elif focus == 'margin':
            drivers.extend(self._analyze_margin_drivers(
                company_data, historical_data
            ))
        elif focus == 'growth':
            drivers.extend(self._analyze_growth_drivers(
                company_data, historical_data
            ))
        elif focus == 'profitability':
            drivers.extend(self._analyze_profitability_drivers(
                company_data, historical_data
            ))
        elif focus == 'valuation':
            drivers.extend(self._analyze_valuation_drivers(
                company_data
            ))

        return drivers

    def _analyze_revenue_drivers(
        self,
        company_data: Dict,
        historical_data: List[Dict],
        segment_data: List[Dict]
    ) -> List[Driver]:
        """Analyze revenue drivers"""
        drivers = []

        # Check revenue growth
        growth = company_data.get('revenue_growth_yoy')
        if growth is not None:
            impact = 'positive' if growth > 0 else 'negative'
            magnitude = 'high' if abs(growth) > 0.2 else ('medium' if abs(growth) > 0.1 else 'low')

            drivers.append(Driver(
                name='Year-over-Year Revenue Growth',
                category='growth',
                impact=impact,
                magnitude=magnitude,
                evidence=[f"Revenue growth of {growth * 100:.1f}% YoY"],
                data_points={'revenue_growth_yoy': growth}
            ))

        # Check sector
        sector = company_data.get('sector')
        if sector:
            drivers.append(Driver(
                name=f'{sector} Sector Dynamics',
                category='sector',
                impact='neutral',
                magnitude='medium',
                evidence=[f"Company operates in {sector} sector"],
                data_points={'sector': sector}
            ))

        # Analyze historical trend
        if len(historical_data) >= 4:
            revenues = [h.get('total_revenue') for h in historical_data if h.get('total_revenue')]
            if len(revenues) >= 4:
                # Compare recent to older
                recent_avg = sum(revenues[:2]) / 2
                older_avg = sum(revenues[-2:]) / 2
                if older_avg > 0:
                    trend = (recent_avg - older_avg) / older_avg
                    impact = 'positive' if trend > 0 else 'negative'
                    drivers.append(Driver(
                        name='Revenue Trend',
                        category='trend',
                        impact=impact,
                        magnitude='medium',
                        evidence=[f"Revenue trend: {trend * 100:.1f}% over analyzed period"],
                        data_points={'trend_percent': trend}
                    ))

        # Segment analysis if available
        if segment_data:
            segment_names = list(set(s['segment_name'] for s in segment_data))[:3]
            drivers.append(Driver(
                name='Business Segments',
                category='segments',
                impact='neutral',
                magnitude='medium',
                evidence=[f"Key segments: {', '.join(segment_names)}"],
                data_points={'segments': segment_names}
            ))

        return drivers

    def _analyze_margin_drivers(
        self,
        company_data: Dict,
        historical_data: List[Dict]
    ) -> List[Driver]:
        """Analyze margin drivers"""
        drivers = []

        # Gross margin
        gross_margin = company_data.get('gross_margin')
        if gross_margin is not None:
            level = 'high' if gross_margin > 0.5 else ('medium' if gross_margin > 0.3 else 'low')
            drivers.append(Driver(
                name='Gross Margin',
                category='margin',
                impact='positive' if gross_margin > 0.4 else 'neutral',
                magnitude=level,
                evidence=[f"Gross margin of {gross_margin * 100:.1f}%"],
                data_points={'gross_margin': gross_margin}
            ))

        # Operating margin
        op_margin = company_data.get('operating_margin')
        if op_margin is not None:
            impact = 'positive' if op_margin > 0.15 else ('neutral' if op_margin > 0.05 else 'negative')
            drivers.append(Driver(
                name='Operating Efficiency',
                category='margin',
                impact=impact,
                magnitude='medium',
                evidence=[f"Operating margin of {op_margin * 100:.1f}%"],
                data_points={'operating_margin': op_margin}
            ))

        # Net margin
        net_margin = company_data.get('net_margin')
        if net_margin is not None:
            impact = 'positive' if net_margin > 0.1 else ('neutral' if net_margin > 0 else 'negative')
            drivers.append(Driver(
                name='Net Profitability',
                category='margin',
                impact=impact,
                magnitude='medium',
                evidence=[f"Net margin of {net_margin * 100:.1f}%"],
                data_points={'net_margin': net_margin}
            ))

        return drivers

    def _analyze_growth_drivers(
        self,
        company_data: Dict,
        historical_data: List[Dict]
    ) -> List[Driver]:
        """Analyze growth drivers"""
        drivers = []

        # Revenue growth
        rev_growth = company_data.get('revenue_growth_yoy')
        if rev_growth is not None:
            drivers.append(Driver(
                name='Revenue Growth',
                category='growth',
                impact='positive' if rev_growth > 0.1 else ('neutral' if rev_growth > 0 else 'negative'),
                magnitude='high' if abs(rev_growth) > 0.2 else 'medium',
                evidence=[f"Revenue growth of {rev_growth * 100:.1f}%"],
                data_points={'revenue_growth_yoy': rev_growth}
            ))

        # EPS growth
        eps_growth = company_data.get('eps_growth_yoy')
        if eps_growth is not None:
            drivers.append(Driver(
                name='Earnings Growth',
                category='growth',
                impact='positive' if eps_growth > 0.1 else ('neutral' if eps_growth > 0 else 'negative'),
                magnitude='high' if abs(eps_growth) > 0.2 else 'medium',
                evidence=[f"EPS growth of {eps_growth * 100:.1f}%"],
                data_points={'eps_growth_yoy': eps_growth}
            ))

        return drivers

    def _analyze_profitability_drivers(
        self,
        company_data: Dict,
        historical_data: List[Dict]
    ) -> List[Driver]:
        """Analyze profitability drivers"""
        drivers = []

        # ROE
        roe = company_data.get('roe')
        if roe is not None:
            drivers.append(Driver(
                name='Return on Equity',
                category='profitability',
                impact='positive' if roe > 0.15 else ('neutral' if roe > 0.1 else 'negative'),
                magnitude='high' if roe > 0.2 else 'medium',
                evidence=[f"ROE of {roe * 100:.1f}%"],
                data_points={'roe': roe}
            ))

        # ROIC
        roic = company_data.get('roic')
        if roic is not None:
            drivers.append(Driver(
                name='Return on Invested Capital',
                category='profitability',
                impact='positive' if roic > 0.12 else ('neutral' if roic > 0.08 else 'negative'),
                magnitude='high' if roic > 0.15 else 'medium',
                evidence=[f"ROIC of {roic * 100:.1f}%"],
                data_points={'roic': roic}
            ))

        # Leverage impact
        debt_equity = company_data.get('debt_to_equity')
        if debt_equity is not None:
            impact = 'negative' if debt_equity > 2 else ('neutral' if debt_equity > 1 else 'positive')
            drivers.append(Driver(
                name='Financial Leverage',
                category='leverage',
                impact=impact,
                magnitude='medium',
                evidence=[f"Debt/Equity ratio of {debt_equity:.2f}"],
                data_points={'debt_to_equity': debt_equity}
            ))

        return drivers

    def _analyze_valuation_drivers(self, company_data: Dict) -> List[Driver]:
        """Analyze valuation drivers"""
        drivers = []

        # P/E ratio
        pe = company_data.get('pe_ratio')
        if pe is not None and pe > 0:
            level = 'high' if pe > 30 else ('medium' if pe > 15 else 'low')
            drivers.append(Driver(
                name='Earnings Multiple',
                category='valuation',
                impact='neutral',
                magnitude=level,
                evidence=[f"P/E ratio of {pe:.1f}x"],
                data_points={'pe_ratio': pe}
            ))

        # Growth expectations
        rev_growth = company_data.get('revenue_growth_yoy')
        if rev_growth is not None and pe is not None:
            peg_estimate = pe / (rev_growth * 100) if rev_growth > 0 else None
            if peg_estimate:
                drivers.append(Driver(
                    name='Growth Expectations',
                    category='valuation',
                    impact='positive' if peg_estimate < 1.5 else 'neutral',
                    magnitude='medium',
                    evidence=[f"Implied PEG of {peg_estimate:.2f}"],
                    data_points={'implied_peg': peg_estimate}
                ))

        return drivers

    def _extract_key_metrics(self, company_data: Dict, focus: str) -> Dict:
        """Extract key metrics relevant to the focus area"""
        category_info = self.DRIVER_CATEGORIES.get(focus, {})
        metric_names = category_info.get('metrics', [])

        return {
            metric: company_data.get(metric)
            for metric in metric_names
            if company_data.get(metric) is not None
        }

    def _extract_trends(self, historical_data: List[Dict], focus: str) -> List[Dict]:
        """Extract trend data"""
        if not historical_data:
            return []

        return [
            {
                'period': h.get('fiscal_period'),
                'date': h.get('fiscal_date_ending'),
                'revenue': h.get('total_revenue'),
                'net_income': h.get('net_income')
            }
            for h in historical_data[:8]
        ]

    def _build_explanation(
        self,
        symbol: str,
        drivers: List[Driver],
        focus: str
    ) -> str:
        """Build a text explanation of the drivers"""
        if not drivers:
            return f"Unable to identify clear drivers for {symbol}'s {focus}."

        positive_drivers = [d for d in drivers if d.impact == 'positive']
        negative_drivers = [d for d in drivers if d.impact == 'negative']

        parts = [f"Analysis of {symbol}'s {focus}:"]

        if positive_drivers:
            parts.append(f"Positive factors: {', '.join(d.name for d in positive_drivers)}")

        if negative_drivers:
            parts.append(f"Negative factors: {', '.join(d.name for d in negative_drivers)}")

        return " ".join(parts)

    def _driver_to_dict(self, driver: Driver) -> Dict:
        """Convert Driver to dictionary"""
        return {
            'name': driver.name,
            'category': driver.category,
            'impact': driver.impact,
            'magnitude': driver.magnitude,
            'evidence': driver.evidence,
            'data_points': driver.data_points
        }
