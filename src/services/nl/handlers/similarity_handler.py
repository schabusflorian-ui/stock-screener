# src/services/nl/handlers/similarity_handler.py
"""
Handler for finding similar stocks.
Translates queries like "Find stocks like COST" into similarity searches.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SimilarityWeights:
    """Weights for different similarity factors"""
    financial_profile: float = 0.25  # Margins, growth, returns
    valuation: float = 0.20          # P/E, P/B, P/S
    size: float = 0.15               # Market cap
    sector: float = 0.20             # Same sector/industry
    business: float = 0.20           # Operating characteristics


@dataclass
class SimilarStock:
    """A stock similar to the target"""
    symbol: str
    name: str
    sector: str
    industry: str
    similarity_score: float
    match_reasons: List[str]
    metrics: Dict


class SimilarityHandler:
    """
    Find stocks similar to a given reference stock.

    Uses multiple factors:
    - Financial profile (margins, growth, returns)
    - Valuation (P/E, P/B, P/S)
    - Size (market cap)
    - Sector/Industry
    - Business characteristics
    """

    # Metric groups for similarity calculation
    FINANCIAL_METRICS = [
        'gross_margin', 'operating_margin', 'net_margin',
        'roe', 'roa', 'roic',
        'revenue_growth_yoy', 'eps_growth_yoy'
    ]

    VALUATION_METRICS = [
        'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda'
    ]

    BUSINESS_METRICS = [
        'asset_turnover', 'inventory_turnover',
        'debt_to_equity', 'current_ratio',
        'dividend_yield', 'payout_ratio'
    ]

    def __init__(self, db=None):
        """
        Args:
            db: Database connection for executing queries
        """
        self.db = db

    async def handle(self, classified_query) -> Dict:
        """
        Handle a similarity query.

        Args:
            classified_query: ClassifiedQuery with intent SIMILARITY

        Returns:
            Dict with similar stocks and explanation
        """
        # Get target symbol
        symbols = classified_query.entities.get('symbols', [])
        if not symbols:
            return {
                'type': 'error',
                'message': 'Please specify a stock symbol to find similar stocks for.'
            }

        target_symbol = symbols[0].upper()

        # Get optional focus areas from query
        focus = self._extract_focus(classified_query)
        weights = self._build_weights(focus)

        # Get limit
        limit = classified_query.parameters.get('limit', 10)

        # Find similar stocks
        similar_stocks = await self._find_similar(target_symbol, weights, limit)

        if not similar_stocks:
            return {
                'type': 'error',
                'message': f'Could not find data for {target_symbol} or no similar stocks found.'
            }

        return {
            'type': 'similarity_results',
            'target_symbol': target_symbol,
            'focus_areas': focus,
            'weights_used': {
                'financial_profile': weights.financial_profile,
                'valuation': weights.valuation,
                'size': weights.size,
                'sector': weights.sector,
                'business': weights.business
            },
            'results_count': len(similar_stocks),
            'similar_stocks': [self._stock_to_dict(s) for s in similar_stocks]
        }

    def _extract_focus(self, classified_query) -> List[str]:
        """Extract focus areas from the query"""
        query_lower = classified_query.original_query.lower()
        focus = []

        # Check for focus keywords
        focus_patterns = {
            'valuation': ['valuation', 'value', 'cheap', 'expensive', 'p/e', 'pe ratio'],
            'growth': ['growth', 'growing', 'fast-growing', 'high growth'],
            'dividend': ['dividend', 'yield', 'income', 'payout'],
            'profitability': ['profitable', 'margin', 'profitability', 'earnings'],
            'size': ['size', 'market cap', 'large', 'small', 'mid cap'],
            'sector': ['sector', 'industry', 'business', 'same sector'],
            'quality': ['quality', 'blue chip', 'strong', 'stable']
        }

        for focus_type, patterns in focus_patterns.items():
            if any(p in query_lower for p in patterns):
                focus.append(focus_type)

        return focus if focus else ['balanced']

    def _build_weights(self, focus: List[str]) -> SimilarityWeights:
        """Build weights based on focus areas"""
        weights = SimilarityWeights()

        if 'balanced' in focus or not focus:
            return weights

        # Adjust weights based on focus
        for f in focus:
            if f == 'valuation':
                weights.valuation = 0.40
                weights.financial_profile = 0.15
            elif f == 'growth':
                weights.financial_profile = 0.40
                weights.valuation = 0.15
            elif f == 'dividend':
                weights.business = 0.35
                weights.valuation = 0.25
            elif f == 'profitability':
                weights.financial_profile = 0.40
                weights.business = 0.20
            elif f == 'size':
                weights.size = 0.35
                weights.sector = 0.25
            elif f == 'sector':
                weights.sector = 0.40
                weights.size = 0.20
            elif f == 'quality':
                weights.financial_profile = 0.35
                weights.business = 0.25

        # Normalize weights to sum to 1
        total = (weights.financial_profile + weights.valuation +
                 weights.size + weights.sector + weights.business)
        if total > 0:
            weights.financial_profile /= total
            weights.valuation /= total
            weights.size /= total
            weights.sector /= total
            weights.business /= total

        return weights

    async def _find_similar(
        self,
        target_symbol: str,
        weights: SimilarityWeights,
        limit: int
    ) -> List[SimilarStock]:
        """Find stocks similar to the target"""
        if not self.db:
            return []

        # Get target company data
        target_data = await self._get_company_data(target_symbol)
        if not target_data:
            return []

        # Get all candidate companies
        candidates = await self._get_all_candidates(target_symbol)

        # Calculate similarity scores
        similar_stocks = []
        for candidate in candidates:
            score, reasons = self._calculate_similarity(target_data, candidate, weights)
            if score > 0:
                similar_stocks.append(SimilarStock(
                    symbol=candidate['symbol'],
                    name=candidate['name'],
                    sector=candidate['sector'],
                    industry=candidate['industry'],
                    similarity_score=score,
                    match_reasons=reasons,
                    metrics={
                        'market_cap': candidate.get('market_cap'),
                        'pe_ratio': candidate.get('pe_ratio'),
                        'dividend_yield': candidate.get('dividend_yield'),
                        'revenue_growth_yoy': candidate.get('revenue_growth_yoy'),
                        'net_margin': candidate.get('net_margin'),
                        'roe': candidate.get('roe')
                    }
                ))

        # Sort by similarity score
        similar_stocks.sort(key=lambda x: x.similarity_score, reverse=True)

        return similar_stocks[:limit]

    async def _get_company_data(self, symbol: str) -> Optional[Dict]:
        """Get company data for similarity calculation"""
        sql = """
            SELECT
                c.symbol, c.name, c.sector, c.industry,
                m.market_cap, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
                m.gross_margin, m.operating_margin, m.net_margin,
                m.roe, m.roa, m.roic,
                m.revenue_growth_yoy, m.eps_growth_yoy,
                m.debt_to_equity, m.current_ratio,
                m.dividend_yield, m.payout_ratio,
                m.asset_turnover, m.inventory_turnover
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            WHERE c.symbol = ? AND c.active = 1
        """

        try:
            result = self.db.execute(sql, [symbol]).fetchone()
            if result:
                columns = [
                    'symbol', 'name', 'sector', 'industry',
                    'market_cap', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
                    'gross_margin', 'operating_margin', 'net_margin',
                    'roe', 'roa', 'roic',
                    'revenue_growth_yoy', 'eps_growth_yoy',
                    'debt_to_equity', 'current_ratio',
                    'dividend_yield', 'payout_ratio',
                    'asset_turnover', 'inventory_turnover'
                ]
                return dict(zip(columns, result))
            return None
        except Exception as e:
            logger.error(f"Failed to get company data for {symbol}: {e}")
            return None

    async def _get_all_candidates(self, exclude_symbol: str) -> List[Dict]:
        """Get all candidate companies for comparison"""
        sql = """
            SELECT
                c.symbol, c.name, c.sector, c.industry,
                m.market_cap, m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
                m.gross_margin, m.operating_margin, m.net_margin,
                m.roe, m.roa, m.roic,
                m.revenue_growth_yoy, m.eps_growth_yoy,
                m.debt_to_equity, m.current_ratio,
                m.dividend_yield, m.payout_ratio,
                m.asset_turnover, m.inventory_turnover
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            WHERE c.symbol != ? AND c.active = 1
            AND m.market_cap IS NOT NULL
        """

        try:
            results = self.db.execute(sql, [exclude_symbol]).fetchall()
            columns = [
                'symbol', 'name', 'sector', 'industry',
                'market_cap', 'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
                'gross_margin', 'operating_margin', 'net_margin',
                'roe', 'roa', 'roic',
                'revenue_growth_yoy', 'eps_growth_yoy',
                'debt_to_equity', 'current_ratio',
                'dividend_yield', 'payout_ratio',
                'asset_turnover', 'inventory_turnover'
            ]
            return [dict(zip(columns, row)) for row in results]
        except Exception as e:
            logger.error(f"Failed to get candidate companies: {e}")
            return []

    def _calculate_similarity(
        self,
        target: Dict,
        candidate: Dict,
        weights: SimilarityWeights
    ) -> Tuple[float, List[str]]:
        """Calculate similarity score between target and candidate"""
        reasons = []
        scores = {}

        # 1. Sector/Industry similarity
        sector_score = 0.0
        if target['sector'] == candidate['sector']:
            sector_score = 0.7
            reasons.append(f"Same sector: {target['sector']}")
            if target['industry'] == candidate['industry']:
                sector_score = 1.0
                reasons[-1] = f"Same industry: {target['industry']}"
        scores['sector'] = sector_score

        # 2. Size similarity (log scale for market cap)
        size_score = self._calculate_size_similarity(
            target.get('market_cap'),
            candidate.get('market_cap')
        )
        if size_score > 0.7:
            reasons.append("Similar market cap")
        scores['size'] = size_score

        # 3. Financial profile similarity
        financial_score = self._calculate_metric_group_similarity(
            target, candidate, self.FINANCIAL_METRICS
        )
        if financial_score > 0.7:
            reasons.append("Similar financial profile")
        scores['financial_profile'] = financial_score

        # 4. Valuation similarity
        valuation_score = self._calculate_metric_group_similarity(
            target, candidate, self.VALUATION_METRICS
        )
        if valuation_score > 0.7:
            reasons.append("Similar valuation")
        scores['valuation'] = valuation_score

        # 5. Business characteristics similarity
        business_score = self._calculate_metric_group_similarity(
            target, candidate, self.BUSINESS_METRICS
        )
        if business_score > 0.7:
            reasons.append("Similar business characteristics")
        scores['business'] = business_score

        # Calculate weighted total
        total_score = (
            scores['sector'] * weights.sector +
            scores['size'] * weights.size +
            scores['financial_profile'] * weights.financial_profile +
            scores['valuation'] * weights.valuation +
            scores['business'] * weights.business
        )

        return total_score, reasons

    def _calculate_size_similarity(
        self,
        target_cap: Optional[float],
        candidate_cap: Optional[float]
    ) -> float:
        """Calculate size similarity using log scale"""
        if not target_cap or not candidate_cap:
            return 0.0

        if target_cap <= 0 or candidate_cap <= 0:
            return 0.0

        # Use log ratio - closer to 0 = more similar
        log_ratio = abs(math.log10(target_cap) - math.log10(candidate_cap))

        # Convert to similarity score (0-1)
        # log_ratio of 0 = perfect match, 1 = 10x difference, 2 = 100x difference
        similarity = max(0, 1 - (log_ratio / 2))

        return similarity

    def _calculate_metric_group_similarity(
        self,
        target: Dict,
        candidate: Dict,
        metrics: List[str]
    ) -> float:
        """Calculate similarity for a group of metrics"""
        similarities = []

        for metric in metrics:
            target_val = target.get(metric)
            candidate_val = candidate.get(metric)

            if target_val is not None and candidate_val is not None:
                sim = self._calculate_metric_similarity(target_val, candidate_val, metric)
                similarities.append(sim)

        if not similarities:
            return 0.0

        return sum(similarities) / len(similarities)

    def _calculate_metric_similarity(
        self,
        target_val: float,
        candidate_val: float,
        metric_name: str
    ) -> float:
        """Calculate similarity for a single metric"""
        # Handle zero/negative cases
        if target_val == 0 and candidate_val == 0:
            return 1.0

        # Use percentage difference capped at certain thresholds
        if target_val == 0:
            return 0.0

        pct_diff = abs(target_val - candidate_val) / abs(target_val)

        # Different tolerance for different metrics
        tolerance = self._get_metric_tolerance(metric_name)

        # Convert to similarity (0-1)
        similarity = max(0, 1 - (pct_diff / tolerance))

        return similarity

    def _get_metric_tolerance(self, metric_name: str) -> float:
        """Get tolerance threshold for metric similarity"""
        # Higher tolerance = more forgiving differences
        tolerances = {
            # Margins typically within 20% to be "similar"
            'gross_margin': 0.5,
            'operating_margin': 0.5,
            'net_margin': 0.5,

            # Returns within 30%
            'roe': 0.5,
            'roa': 0.5,
            'roic': 0.5,

            # Growth can vary more
            'revenue_growth_yoy': 1.0,
            'eps_growth_yoy': 1.0,

            # Valuation metrics
            'pe_ratio': 0.5,
            'pb_ratio': 0.5,
            'ps_ratio': 0.5,
            'ev_ebitda': 0.5,

            # Balance sheet ratios
            'debt_to_equity': 0.5,
            'current_ratio': 0.3,

            # Dividend
            'dividend_yield': 0.5,
            'payout_ratio': 0.5,

            # Turnover
            'asset_turnover': 0.5,
            'inventory_turnover': 0.5
        }

        return tolerances.get(metric_name, 0.5)

    def _stock_to_dict(self, stock: SimilarStock) -> Dict:
        """Convert SimilarStock to dictionary"""
        return {
            'symbol': stock.symbol,
            'name': stock.name,
            'sector': stock.sector,
            'industry': stock.industry,
            'similarity_score': round(stock.similarity_score, 3),
            'match_reasons': stock.match_reasons,
            'metrics': stock.metrics
        }
