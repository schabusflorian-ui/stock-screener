# src/services/nl/handlers/portfolio_handler.py
"""
Handler for portfolio-related natural language queries.

Supports:
- Portfolio analysis and performance
- Holdings breakdown
- Sector allocation
- Risk metrics
- Comparison to benchmarks
"""

import logging
from typing import Dict, Optional
from ..classifier import ClassifiedQuery

logger = logging.getLogger(__name__)


class PortfolioHandler:
    """Handler for portfolio queries."""

    def __init__(self, db=None, portfolio_service=None):
        """
        Initialize handler.

        Args:
            db: Database connection
            portfolio_service: Portfolio service instance
        """
        self.db = db
        self.portfolio_service = portfolio_service

    async def handle(self, classified: ClassifiedQuery, user_id: str = None) -> Dict:
        """
        Handle a portfolio query.

        Args:
            classified: Classified query with entities
            user_id: Current user's ID for portfolio access

        Returns:
            Query result dictionary
        """
        query_lower = classified.original_query.lower()
        portfolio_id = classified.entities.get('portfolio_id')

        # Determine query type
        if 'performance' in query_lower or 'return' in query_lower:
            return await self._handle_performance(portfolio_id, user_id, classified)
        elif 'allocation' in query_lower or 'sector' in query_lower:
            return await self._handle_allocation(portfolio_id, user_id, classified)
        elif 'risk' in query_lower or 'volatility' in query_lower:
            return await self._handle_risk(portfolio_id, user_id, classified)
        elif 'holdings' in query_lower or 'positions' in query_lower or "what's in" in query_lower:
            return await self._handle_holdings(portfolio_id, user_id, classified)
        elif 'compare' in query_lower or 'vs' in query_lower:
            return await self._handle_comparison(portfolio_id, user_id, classified)
        elif 'rebalance' in query_lower or 'optimize' in query_lower:
            return await self._handle_rebalance(portfolio_id, user_id, classified)
        else:
            # Default: provide portfolio overview
            return await self._handle_overview(portfolio_id, user_id, classified)

    async def _handle_overview(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Get portfolio overview with key metrics."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            holdings = self._get_holdings(portfolio['id'])
            performance = self._calculate_performance(portfolio['id'])

            return {
                'type': 'portfolio_overview',
                'portfolio': {
                    'id': portfolio['id'],
                    'name': portfolio['name'],
                    'total_value': portfolio.get('total_value', 0),
                    'cash_balance': portfolio.get('cash_balance', 0),
                    'currency': portfolio.get('currency', 'USD'),
                },
                'summary': {
                    'total_positions': len(holdings),
                    'total_value': sum(h.get('market_value', 0) for h in holdings),
                    'total_gain_loss': performance.get('total_gain_loss', 0),
                    'total_return_pct': performance.get('total_return_pct', 0),
                },
                'top_holdings': holdings[:5],
                'performance': performance,
            }
        except Exception as e:
            logger.error(f"Portfolio overview failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_holdings(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Get detailed holdings list."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            holdings = self._get_holdings(portfolio['id'])

            return {
                'type': 'portfolio_holdings',
                'portfolio_name': portfolio['name'],
                'holdings': holdings,
                'total_positions': len(holdings),
                'total_value': sum(h.get('market_value', 0) for h in holdings),
            }
        except Exception as e:
            logger.error(f"Portfolio holdings failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_performance(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Get portfolio performance metrics."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            performance = self._calculate_performance(portfolio['id'])

            return {
                'type': 'portfolio_performance',
                'portfolio_name': portfolio['name'],
                'performance': performance,
                'time_periods': {
                    '1d': performance.get('daily_return', 0),
                    '1w': performance.get('weekly_return', 0),
                    '1m': performance.get('monthly_return', 0),
                    'ytd': performance.get('ytd_return', 0),
                    '1y': performance.get('yearly_return', 0),
                },
            }
        except Exception as e:
            logger.error(f"Portfolio performance failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_allocation(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Get sector/asset allocation breakdown."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            holdings = self._get_holdings(portfolio['id'])
            allocation = self._calculate_allocation(holdings)

            return {
                'type': 'portfolio_allocation',
                'portfolio_name': portfolio['name'],
                'sector_allocation': allocation.get('by_sector', {}),
                'top_concentrations': allocation.get('concentrations', []),
                'diversification_score': allocation.get('diversification_score', 0),
            }
        except Exception as e:
            logger.error(f"Portfolio allocation failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_risk(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Get portfolio risk metrics."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            risk_metrics = self._calculate_risk_metrics(portfolio['id'])

            return {
                'type': 'portfolio_risk',
                'portfolio_name': portfolio['name'],
                'risk_metrics': risk_metrics,
            }
        except Exception as e:
            logger.error(f"Portfolio risk failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_comparison(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Compare portfolio to benchmark or investor."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            # Check if comparing to an investor
            investors = classified.entities.get('investors', [])
            if investors:
                return await self._compare_to_investor(portfolio, investors[0])

            # Default: compare to benchmark
            performance = self._calculate_performance(portfolio['id'])
            benchmark = self._get_benchmark_performance(portfolio.get('benchmark_index_id'))

            return {
                'type': 'portfolio_comparison',
                'portfolio_name': portfolio['name'],
                'portfolio_return': performance.get('total_return_pct', 0),
                'benchmark_return': benchmark.get('total_return_pct', 0),
                'alpha': performance.get('total_return_pct', 0) - benchmark.get('total_return_pct', 0),
            }
        except Exception as e:
            logger.error(f"Portfolio comparison failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_rebalance(self, portfolio_id: str, user_id: str, classified: ClassifiedQuery) -> Dict:
        """Suggest portfolio rebalancing."""
        try:
            portfolio = self._get_portfolio(portfolio_id, user_id)
            if not portfolio:
                return self._portfolio_not_found_response()

            holdings = self._get_holdings(portfolio['id'])
            suggestions = self._generate_rebalance_suggestions(holdings)

            return {
                'type': 'portfolio_rebalance',
                'portfolio_name': portfolio['name'],
                'suggestions': suggestions,
                'current_allocation': self._calculate_allocation(holdings),
            }
        except Exception as e:
            logger.error(f"Portfolio rebalance failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _compare_to_investor(self, portfolio: Dict, investor_id: str) -> Dict:
        """Compare portfolio holdings to a famous investor."""
        return {
            'type': 'portfolio_investor_comparison',
            'portfolio_name': portfolio['name'],
            'investor_id': investor_id,
            'message': f'Comparing portfolio to {investor_id}',
            'overlap': [],  # Would contain overlapping holdings
            'missing': [],  # Holdings investor has but portfolio doesn't
            'extra': [],    # Holdings portfolio has but investor doesn't
        }

    def _get_portfolio(self, portfolio_id: str, user_id: str) -> Optional[Dict]:
        """Get portfolio from database."""
        if not self.db:
            return None

        try:
            if portfolio_id == 'current' or portfolio_id is None:
                # Get user's default/first portfolio
                stmt = self.db.prepare('''
                    SELECT * FROM portfolios
                    WHERE user_id = ?
                    ORDER BY created_at DESC
                    LIMIT 1
                ''')
                return stmt.get(user_id)
            else:
                stmt = self.db.prepare('SELECT * FROM portfolios WHERE id = ?')
                return stmt.get(portfolio_id)
        except Exception as e:
            logger.error(f"Failed to get portfolio: {e}")
            return None

    def _get_holdings(self, portfolio_id: int) -> list:
        """Get portfolio holdings."""
        if not self.db:
            return []

        try:
            stmt = self.db.prepare('''
                SELECT
                    h.*,
                    c.symbol,
                    c.name as company_name,
                    c.sector
                FROM holdings h
                LEFT JOIN companies c ON h.company_id = c.id
                WHERE h.portfolio_id = ?
                ORDER BY h.market_value DESC
            ''')
            return stmt.all(portfolio_id)
        except Exception as e:
            logger.error(f"Failed to get holdings: {e}")
            return []

    def _calculate_performance(self, portfolio_id: int) -> Dict:
        """Calculate portfolio performance metrics."""
        # Simplified - would use portfolio service in real implementation
        return {
            'total_gain_loss': 0,
            'total_return_pct': 0,
            'daily_return': 0,
            'weekly_return': 0,
            'monthly_return': 0,
            'ytd_return': 0,
            'yearly_return': 0,
        }

    def _calculate_allocation(self, holdings: list) -> Dict:
        """Calculate portfolio allocation by sector."""
        allocation = {'by_sector': {}, 'concentrations': [], 'diversification_score': 0}

        if not holdings:
            return allocation

        total_value = sum(h.get('market_value', 0) for h in holdings)
        if total_value == 0:
            return allocation

        # Calculate by sector
        sector_values = {}
        for h in holdings:
            sector = h.get('sector', 'Unknown')
            sector_values[sector] = sector_values.get(sector, 0) + h.get('market_value', 0)

        allocation['by_sector'] = {
            sector: round(value / total_value * 100, 2)
            for sector, value in sector_values.items()
        }

        # Calculate concentrations (top holdings by weight)
        for h in holdings[:5]:
            weight = h.get('market_value', 0) / total_value * 100
            allocation['concentrations'].append({
                'symbol': h.get('symbol'),
                'weight': round(weight, 2),
            })

        # Simple diversification score
        num_sectors = len(sector_values)
        num_positions = len(holdings)
        allocation['diversification_score'] = min(100, num_sectors * 10 + num_positions * 2)

        return allocation

    def _calculate_risk_metrics(self, portfolio_id: int) -> Dict:
        """Calculate portfolio risk metrics."""
        # Simplified - would use actual calculations in real implementation
        return {
            'volatility': 0,
            'beta': 1.0,
            'sharpe_ratio': 0,
            'max_drawdown': 0,
            'var_95': 0,
        }

    def _get_benchmark_performance(self, benchmark_id: int = None) -> Dict:
        """Get benchmark performance for comparison."""
        return {
            'total_return_pct': 0,
            'name': 'S&P 500',
        }

    def _generate_rebalance_suggestions(self, holdings: list) -> list:
        """Generate rebalancing suggestions."""
        suggestions = []

        if not holdings:
            return suggestions

        total_value = sum(h.get('market_value', 0) for h in holdings)
        if total_value == 0:
            return suggestions

        # Check for over-concentration
        for h in holdings:
            weight = h.get('market_value', 0) / total_value * 100
            if weight > 25:
                suggestions.append({
                    'type': 'reduce',
                    'symbol': h.get('symbol'),
                    'current_weight': round(weight, 2),
                    'target_weight': 15,
                    'reason': 'Over-concentrated position'
                })

        return suggestions

    def _portfolio_not_found_response(self) -> Dict:
        """Return response for portfolio not found."""
        return {
            'type': 'error',
            'message': 'Portfolio not found. Please create a portfolio first or specify a valid portfolio.',
            'suggestions': [
                'Create a new portfolio',
                'List all portfolios',
            ]
        }
