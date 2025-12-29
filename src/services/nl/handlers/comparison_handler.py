# src/services/nl/handlers/comparison_handler.py
"""
Handler for comparison queries.
Translates queries like "Compare AAPL to MSFT" or
"How does NVDA stack up against AMD?"
"""

import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class ComparisonMetric:
    """A metric comparison between companies"""
    metric_name: str
    display_name: str
    values: Dict[str, float]  # {symbol: value}
    winner: Optional[str]
    winner_reason: str
    category: str  # valuation, profitability, growth, etc.


@dataclass
class CompanyProfile:
    """Company data for comparison"""
    symbol: str
    name: str
    sector: str
    industry: str
    metrics: Dict


class ComparisonHandler:
    """
    Handle comparison queries between companies.

    Handles queries like:
    - "Compare AAPL to MSFT"
    - "How does NVDA stack up against AMD?"
    - "GOOGL vs META"
    - "Compare tech giants"
    """

    # Metrics to compare by category
    COMPARISON_CATEGORIES = {
        'valuation': {
            'pe_ratio': {'display': 'P/E Ratio', 'lower_better': True},
            'pb_ratio': {'display': 'P/B Ratio', 'lower_better': True},
            'ps_ratio': {'display': 'P/S Ratio', 'lower_better': True},
            'ev_ebitda': {'display': 'EV/EBITDA', 'lower_better': True},
        },
        'profitability': {
            'gross_margin': {'display': 'Gross Margin', 'lower_better': False},
            'operating_margin': {'display': 'Operating Margin', 'lower_better': False},
            'net_margin': {'display': 'Net Margin', 'lower_better': False},
            'roe': {'display': 'ROE', 'lower_better': False},
            'roic': {'display': 'ROIC', 'lower_better': False},
        },
        'growth': {
            'revenue_growth_yoy': {'display': 'Revenue Growth', 'lower_better': False},
            'eps_growth_yoy': {'display': 'EPS Growth', 'lower_better': False},
        },
        'financial_health': {
            'debt_to_equity': {'display': 'Debt/Equity', 'lower_better': True},
            'current_ratio': {'display': 'Current Ratio', 'lower_better': False},
            'interest_coverage': {'display': 'Interest Coverage', 'lower_better': False},
        },
        'dividend': {
            'dividend_yield': {'display': 'Dividend Yield', 'lower_better': False},
            'payout_ratio': {'display': 'Payout Ratio', 'lower_better': True},
        },
        'size': {
            'market_cap': {'display': 'Market Cap', 'lower_better': None},
            'enterprise_value': {'display': 'Enterprise Value', 'lower_better': None},
        }
    }

    # Focus keywords to category mapping
    FOCUS_KEYWORDS = {
        'value': ['valuation'],
        'valuation': ['valuation'],
        'cheap': ['valuation'],
        'expensive': ['valuation'],
        'profit': ['profitability'],
        'profitability': ['profitability'],
        'margin': ['profitability'],
        'growth': ['growth'],
        'growing': ['growth'],
        'debt': ['financial_health'],
        'leverage': ['financial_health'],
        'health': ['financial_health'],
        'dividend': ['dividend'],
        'yield': ['dividend'],
        'income': ['dividend'],
        'size': ['size'],
    }

    def __init__(self, db=None):
        """
        Args:
            db: Database connection for executing queries
        """
        self.db = db

    async def handle(self, classified_query) -> Dict:
        """
        Handle a comparison query.

        Args:
            classified_query: ClassifiedQuery with intent COMPARE

        Returns:
            Dict with comparison results
        """
        # Get symbols to compare
        symbols = classified_query.entities.get('symbols', [])
        if len(symbols) < 2:
            return {
                'type': 'error',
                'message': 'Please specify at least two stock symbols to compare.'
            }

        symbols = [s.upper() for s in symbols[:5]]  # Limit to 5 companies

        # Determine focus areas
        focus_categories = self._extract_focus(classified_query)

        # Get company profiles
        profiles = await self._get_company_profiles(symbols)
        if len(profiles) < 2:
            missing = set(symbols) - set(p.symbol for p in profiles)
            return {
                'type': 'error',
                'message': f'Could not find data for: {", ".join(missing)}'
            }

        # Run comparisons
        comparisons = self._run_comparisons(profiles, focus_categories)

        # Determine overall assessment
        overall = self._build_overall_assessment(profiles, comparisons)

        return {
            'type': 'comparison_results',
            'companies': [self._profile_to_dict(p) for p in profiles],
            'focus_areas': focus_categories,
            'comparisons': [self._comparison_to_dict(c) for c in comparisons],
            'category_winners': self._get_category_winners(comparisons),
            'overall_assessment': overall
        }

    def _extract_focus(self, classified_query) -> List[str]:
        """Extract focus categories from the query"""
        query_lower = classified_query.original_query.lower()
        categories = set()

        for keyword, cats in self.FOCUS_KEYWORDS.items():
            if keyword in query_lower:
                categories.update(cats)

        # If no specific focus, compare all categories
        if not categories:
            return list(self.COMPARISON_CATEGORIES.keys())

        return list(categories)

    async def _get_company_profiles(self, symbols: List[str]) -> List[CompanyProfile]:
        """Get company profiles for comparison"""
        if not self.db:
            return []

        profiles = []
        for symbol in symbols:
            profile = await self._get_single_profile(symbol)
            if profile:
                profiles.append(profile)

        return profiles

    async def _get_single_profile(self, symbol: str) -> Optional[CompanyProfile]:
        """Get a single company profile"""
        sql = """
            SELECT
                c.symbol, c.name, c.sector, c.industry,
                m.market_cap, m.enterprise_value,
                m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
                m.gross_margin, m.operating_margin, m.net_margin,
                m.roe, m.roa, m.roic,
                m.revenue_growth_yoy, m.eps_growth_yoy,
                m.debt_to_equity, m.current_ratio, m.interest_coverage,
                m.dividend_yield, m.payout_ratio,
                p.close as price, p.change_percent
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            LEFT JOIN (
                SELECT company_id, close, change_percent
                FROM daily_prices
                WHERE (company_id, date) IN (
                    SELECT company_id, MAX(date) FROM daily_prices GROUP BY company_id
                )
            ) p ON c.id = p.company_id
            WHERE c.symbol = ? AND c.active = 1
        """

        try:
            result = self.db.execute(sql, [symbol]).fetchone()
            if not result:
                return None

            columns = [
                'symbol', 'name', 'sector', 'industry',
                'market_cap', 'enterprise_value',
                'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
                'gross_margin', 'operating_margin', 'net_margin',
                'roe', 'roa', 'roic',
                'revenue_growth_yoy', 'eps_growth_yoy',
                'debt_to_equity', 'current_ratio', 'interest_coverage',
                'dividend_yield', 'payout_ratio',
                'price', 'change_percent'
            ]
            data = dict(zip(columns, result))

            return CompanyProfile(
                symbol=data['symbol'],
                name=data['name'],
                sector=data['sector'],
                industry=data['industry'],
                metrics={k: v for k, v in data.items() if k not in ['symbol', 'name', 'sector', 'industry']}
            )

        except Exception as e:
            logger.error(f"Failed to get profile for {symbol}: {e}")
            return None

    def _run_comparisons(
        self,
        profiles: List[CompanyProfile],
        categories: List[str]
    ) -> List[ComparisonMetric]:
        """Run metric comparisons across all categories"""
        comparisons = []

        for category in categories:
            if category not in self.COMPARISON_CATEGORIES:
                continue

            for metric_name, metric_info in self.COMPARISON_CATEGORIES[category].items():
                comparison = self._compare_metric(
                    profiles, metric_name, metric_info, category
                )
                if comparison:
                    comparisons.append(comparison)

        return comparisons

    def _compare_metric(
        self,
        profiles: List[CompanyProfile],
        metric_name: str,
        metric_info: Dict,
        category: str
    ) -> Optional[ComparisonMetric]:
        """Compare a single metric across companies"""
        values = {}
        for profile in profiles:
            value = profile.metrics.get(metric_name)
            if value is not None:
                values[profile.symbol] = value

        if len(values) < 2:
            return None

        # Determine winner
        winner = None
        winner_reason = ""
        lower_better = metric_info.get('lower_better')

        if lower_better is not None:
            if lower_better:
                winner = min(values, key=values.get)
                winner_reason = f"Lowest {metric_info['display']}"
            else:
                winner = max(values, key=values.get)
                winner_reason = f"Highest {metric_info['display']}"

        return ComparisonMetric(
            metric_name=metric_name,
            display_name=metric_info['display'],
            values=values,
            winner=winner,
            winner_reason=winner_reason,
            category=category
        )

    def _get_category_winners(
        self,
        comparisons: List[ComparisonMetric]
    ) -> Dict[str, Dict]:
        """Get the winner for each category"""
        category_scores = {}

        for comp in comparisons:
            if comp.winner:
                if comp.category not in category_scores:
                    category_scores[comp.category] = {}
                if comp.winner not in category_scores[comp.category]:
                    category_scores[comp.category][comp.winner] = 0
                category_scores[comp.category][comp.winner] += 1

        winners = {}
        for category, scores in category_scores.items():
            if scores:
                winner = max(scores, key=scores.get)
                winners[category] = {
                    'winner': winner,
                    'metrics_won': scores[winner],
                    'total_metrics': sum(scores.values())
                }

        return winners

    def _build_overall_assessment(
        self,
        profiles: List[CompanyProfile],
        comparisons: List[ComparisonMetric]
    ) -> Dict:
        """Build overall assessment of the comparison"""
        # Count wins per company
        win_counts = {p.symbol: 0 for p in profiles}
        for comp in comparisons:
            if comp.winner and comp.winner in win_counts:
                win_counts[comp.winner] += 1

        total_metrics = len([c for c in comparisons if c.winner])

        # Determine overall leader
        if win_counts:
            leader = max(win_counts, key=win_counts.get)
            leader_wins = win_counts[leader]
        else:
            leader = None
            leader_wins = 0

        # Build summary
        summary_parts = []
        for profile in profiles:
            wins = win_counts.get(profile.symbol, 0)
            summary_parts.append(f"{profile.symbol}: {wins}/{total_metrics} metrics")

        return {
            'leader': leader,
            'leader_wins': leader_wins,
            'total_metrics_compared': total_metrics,
            'win_counts': win_counts,
            'summary': "; ".join(summary_parts)
        }

    def _profile_to_dict(self, profile: CompanyProfile) -> Dict:
        """Convert CompanyProfile to dictionary"""
        return {
            'symbol': profile.symbol,
            'name': profile.name,
            'sector': profile.sector,
            'industry': profile.industry,
            'metrics': profile.metrics
        }

    def _comparison_to_dict(self, comp: ComparisonMetric) -> Dict:
        """Convert ComparisonMetric to dictionary"""
        return {
            'metric_name': comp.metric_name,
            'display_name': comp.display_name,
            'values': comp.values,
            'winner': comp.winner,
            'winner_reason': comp.winner_reason,
            'category': comp.category
        }
