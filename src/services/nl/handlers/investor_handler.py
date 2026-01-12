# src/services/nl/handlers/investor_handler.py
"""
Handler for famous investor-related natural language queries.

Supports:
- Showing investor holdings (13F filings)
- Recent trades and changes
- Historical positions
- Comparing to user's portfolio
"""

import logging
from typing import Dict, List, Optional
from ..classifier import ClassifiedQuery

logger = logging.getLogger(__name__)


# Canonical investor IDs to display names
INVESTOR_DISPLAY_NAMES = {
    'warren_buffett': 'Warren Buffett (Berkshire Hathaway)',
    'michael_burry': 'Michael Burry (Scion Asset Management)',
    'ray_dalio': 'Ray Dalio (Bridgewater Associates)',
    'bill_ackman': 'Bill Ackman (Pershing Square)',
    'carl_icahn': 'Carl Icahn',
    'george_soros': 'George Soros',
    'stanley_druckenmiller': 'Stanley Druckenmiller (Duquesne)',
    'david_tepper': 'David Tepper (Appaloosa)',
    'steve_cohen': 'Steve Cohen (Point72)',
    'david_einhorn': 'David Einhorn (Greenlight Capital)',
    'dan_loeb': 'Dan Loeb (Third Point)',
    'seth_klarman': 'Seth Klarman (Baupost Group)',
    'howard_marks': 'Howard Marks (Oaktree Capital)',
}


class InvestorHandler:
    """Handler for famous investor queries."""

    def __init__(self, db=None, investor_service=None):
        """
        Initialize handler.

        Args:
            db: Database connection
            investor_service: Investor service instance
        """
        self.db = db
        self.investor_service = investor_service

    async def handle(self, classified: ClassifiedQuery) -> Dict:
        """
        Handle an investor query.

        Args:
            classified: Classified query with entities

        Returns:
            Query result dictionary
        """
        query_lower = classified.original_query.lower()
        investors = classified.entities.get('investors', [])

        if not investors:
            return self._list_investors_response()

        investor_id = investors[0]

        # Determine query type
        if 'buy' in query_lower or 'bought' in query_lower or 'new' in query_lower:
            return await self._handle_new_positions(investor_id, classified)
        elif 'sell' in query_lower or 'sold' in query_lower or 'exit' in query_lower:
            return await self._handle_exits(investor_id, classified)
        elif 'change' in query_lower or 'activity' in query_lower or 'trade' in query_lower:
            return await self._handle_activity(investor_id, classified)
        elif 'top' in query_lower or 'largest' in query_lower or 'biggest' in query_lower:
            return await self._handle_top_holdings(investor_id, classified)
        elif 'history' in query_lower or 'historical' in query_lower:
            return await self._handle_history(investor_id, classified)
        elif 'own' in query_lower or 'hold' in query_lower or 'have' in query_lower:
            # Check if asking about a specific stock
            symbols = classified.entities.get('symbols', [])
            if symbols:
                return await self._handle_specific_holding(investor_id, symbols[0], classified)
            return await self._handle_holdings(investor_id, classified)
        else:
            # Default: show holdings
            return await self._handle_holdings(investor_id, classified)

    async def _handle_holdings(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's current holdings."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            holdings = self._get_holdings(investor['id'])

            return {
                'type': 'investor_holdings',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                    'cik': investor.get('cik'),
                    'latest_filing_date': investor.get('latest_filing_date'),
                },
                'holdings': holdings[:20],  # Top 20 positions
                'total_positions': len(holdings),
                'total_value': sum(h.get('market_value', 0) for h in holdings),
                'filing_date': investor.get('latest_filing_date'),
            }
        except Exception as e:
            logger.error(f"Investor holdings failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_top_holdings(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's top holdings by value."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            # Extract limit from query
            limit = 10
            numbers = classified.entities.get('numbers', [])
            if numbers:
                limit = int(numbers[0][0])

            holdings = self._get_holdings(investor['id'], limit=limit)

            return {
                'type': 'investor_top_holdings',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                },
                'top_holdings': holdings,
                'filing_date': investor.get('latest_filing_date'),
            }
        except Exception as e:
            logger.error(f"Top holdings failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_new_positions(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's new positions (buys)."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            holdings = self._get_holdings_by_change(investor['id'], 'NEW')

            return {
                'type': 'investor_new_positions',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                },
                'new_positions': holdings,
                'count': len(holdings),
                'filing_date': investor.get('latest_filing_date'),
            }
        except Exception as e:
            logger.error(f"New positions failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_exits(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's exited positions (sells)."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            holdings = self._get_holdings_by_change(investor['id'], 'SOLD')

            return {
                'type': 'investor_exits',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                },
                'exits': holdings,
                'count': len(holdings),
                'filing_date': investor.get('latest_filing_date'),
            }
        except Exception as e:
            logger.error(f"Exits failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_activity(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's recent trading activity."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            # Get all changes
            new_positions = self._get_holdings_by_change(investor['id'], 'NEW')
            increases = self._get_holdings_by_change(investor['id'], 'INCREASED')
            decreases = self._get_holdings_by_change(investor['id'], 'DECREASED')
            exits = self._get_holdings_by_change(investor['id'], 'SOLD')

            return {
                'type': 'investor_activity',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                },
                'activity': {
                    'new_positions': new_positions[:5],
                    'increased': increases[:5],
                    'decreased': decreases[:5],
                    'exits': exits[:5],
                },
                'summary': {
                    'new_count': len(new_positions),
                    'increased_count': len(increases),
                    'decreased_count': len(decreases),
                    'exit_count': len(exits),
                },
                'filing_date': investor.get('latest_filing_date'),
            }
        except Exception as e:
            logger.error(f"Activity failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_specific_holding(self, investor_id: str, symbol: str, classified: ClassifiedQuery) -> Dict:
        """Check if investor owns a specific stock."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            holding = self._get_holding_by_symbol(investor['id'], symbol)

            if holding:
                return {
                    'type': 'investor_specific_holding',
                    'investor': {
                        'id': investor_id,
                        'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                    },
                    'owns': True,
                    'holding': holding,
                    'message': f"Yes, {INVESTOR_DISPLAY_NAMES.get(investor_id, investor_id)} owns {symbol}",
                }
            else:
                return {
                    'type': 'investor_specific_holding',
                    'investor': {
                        'id': investor_id,
                        'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                    },
                    'owns': False,
                    'holding': None,
                    'message': f"No, {INVESTOR_DISPLAY_NAMES.get(investor_id, investor_id)} does not appear to own {symbol} based on latest 13F filing",
                }
        except Exception as e:
            logger.error(f"Specific holding check failed: {e}")
            return {'type': 'error', 'message': str(e)}

    async def _handle_history(self, investor_id: str, classified: ClassifiedQuery) -> Dict:
        """Get investor's filing history."""
        try:
            investor = self._get_investor(investor_id)
            if not investor:
                return self._investor_not_found_response(investor_id)

            filings = self._get_filing_history(investor['id'])

            return {
                'type': 'investor_history',
                'investor': {
                    'id': investor_id,
                    'name': INVESTOR_DISPLAY_NAMES.get(investor_id, investor.get('name', investor_id)),
                },
                'filings': filings,
                'filing_count': len(filings),
            }
        except Exception as e:
            logger.error(f"History failed: {e}")
            return {'type': 'error', 'message': str(e)}

    def _get_investor(self, canonical_id: str) -> Optional[Dict]:
        """Get investor from database by canonical ID."""
        if not self.db:
            return None

        try:
            # Map canonical ID to potential name patterns
            name_patterns = {
                'warren_buffett': ['berkshire', 'buffett'],
                'michael_burry': ['scion', 'burry'],
                'ray_dalio': ['bridgewater', 'dalio'],
                'bill_ackman': ['pershing', 'ackman'],
                'carl_icahn': ['icahn'],
                'george_soros': ['soros'],
                'stanley_druckenmiller': ['duquesne', 'druckenmiller'],
                'david_tepper': ['appaloosa', 'tepper'],
                'steve_cohen': ['point72', 'cohen'],
                'david_einhorn': ['greenlight', 'einhorn'],
                'dan_loeb': ['third point', 'loeb'],
                'seth_klarman': ['baupost', 'klarman'],
                'howard_marks': ['oaktree', 'marks'],
            }

            patterns = name_patterns.get(canonical_id, [canonical_id])

            for pattern in patterns:
                stmt = self.db.prepare('''
                    SELECT * FROM famous_investors
                    WHERE LOWER(name) LIKE ?
                    OR LOWER(fund_name) LIKE ?
                    LIMIT 1
                ''')
                result = stmt.get(f'%{pattern}%', f'%{pattern}%')
                if result:
                    return result

            return None
        except Exception as e:
            logger.error(f"Failed to get investor: {e}")
            return None

    def _get_holdings(self, investor_id: int, limit: int = 100) -> List[Dict]:
        """Get investor holdings from database."""
        if not self.db:
            return []

        try:
            stmt = self.db.prepare('''
                SELECT
                    ih.*,
                    c.symbol,
                    c.name as company_name,
                    c.sector
                FROM investor_holdings ih
                LEFT JOIN companies c ON ih.company_id = c.id
                LEFT JOIN famous_investors fi ON ih.investor_id = fi.id
                WHERE ih.investor_id = ?
                AND ih.filing_date = fi.latest_filing_date
                ORDER BY ih.market_value DESC
                LIMIT ?
            ''')
            return stmt.all(investor_id, limit)
        except Exception as e:
            logger.error(f"Failed to get holdings: {e}")
            return []

    def _get_holdings_by_change(self, investor_id: int, change_type: str) -> List[Dict]:
        """Get holdings filtered by change type."""
        if not self.db:
            return []

        try:
            stmt = self.db.prepare('''
                SELECT
                    ih.*,
                    c.symbol,
                    c.name as company_name,
                    c.sector
                FROM investor_holdings ih
                LEFT JOIN companies c ON ih.company_id = c.id
                LEFT JOIN famous_investors fi ON ih.investor_id = fi.id
                WHERE ih.investor_id = ?
                AND ih.filing_date = fi.latest_filing_date
                AND ih.change_type = ?
                ORDER BY ih.market_value DESC
            ''')
            return stmt.all(investor_id, change_type)
        except Exception as e:
            logger.error(f"Failed to get holdings by change: {e}")
            return []

    def _get_holding_by_symbol(self, investor_id: int, symbol: str) -> Optional[Dict]:
        """Get specific holding by symbol."""
        if not self.db:
            return None

        try:
            stmt = self.db.prepare('''
                SELECT
                    ih.*,
                    c.symbol,
                    c.name as company_name,
                    c.sector
                FROM investor_holdings ih
                LEFT JOIN companies c ON ih.company_id = c.id
                LEFT JOIN famous_investors fi ON ih.investor_id = fi.id
                WHERE ih.investor_id = ?
                AND ih.filing_date = fi.latest_filing_date
                AND UPPER(c.symbol) = UPPER(?)
                LIMIT 1
            ''')
            return stmt.get(investor_id, symbol)
        except Exception as e:
            logger.error(f"Failed to get holding by symbol: {e}")
            return None

    def _get_filing_history(self, investor_id: int) -> List[Dict]:
        """Get investor's filing history."""
        if not self.db:
            return []

        try:
            stmt = self.db.prepare('''
                SELECT *
                FROM investor_filings
                WHERE investor_id = ?
                ORDER BY filing_date DESC
                LIMIT 8
            ''')
            return stmt.all(investor_id)
        except Exception as e:
            logger.error(f"Failed to get filing history: {e}")
            return []

    def _list_investors_response(self) -> Dict:
        """Return list of available investors."""
        return {
            'type': 'investor_list',
            'message': "Here are the famous investors you can ask about:",
            'investors': [
                {'id': k, 'name': v}
                for k, v in INVESTOR_DISPLAY_NAMES.items()
            ],
            'suggestions': [
                "Show me Buffett's holdings",
                "What stocks does Michael Burry own?",
                "What did Bill Ackman buy recently?",
            ]
        }

    def _investor_not_found_response(self, investor_id: str) -> Dict:
        """Return response for investor not found."""
        return {
            'type': 'error',
            'message': f"Investor '{investor_id}' not found in database. They may not have 13F filings tracked yet.",
            'suggestions': [
                "List all available investors",
                "Search for a different investor",
            ]
        }
