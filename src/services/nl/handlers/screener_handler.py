# src/services/nl/handlers/screener_handler.py
"""
Handler for natural language screening queries.
Translates queries like "Show me undervalued tech stocks" into database queries.
"""

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ScreenerFilter:
    """A filter condition for the screener"""
    field: str
    operator: str  # '>', '<', '>=', '<=', '=', 'in', 'between', 'is_not_null'
    value: any
    display_name: str = None

    def to_sql_condition(self, table_alias: str = 'm') -> str:
        """Convert to SQL WHERE clause condition"""
        col = f"{table_alias}.{self.field}"

        if self.operator == 'in':
            if isinstance(self.value, list):
                values = ', '.join([f"'{v}'" if isinstance(v, str) else str(v) for v in self.value])
                return f"{col} IN ({values})"
            return f"{col} = '{self.value}'"
        elif self.operator == 'between':
            return f"{col} BETWEEN {self.value[0]} AND {self.value[1]}"
        elif self.operator == 'is_not_null':
            return f"{col} IS NOT NULL"
        else:
            if isinstance(self.value, str):
                return f"{col} {self.operator} '{self.value}'"
            return f"{col} {self.operator} {self.value}"

    def to_display(self) -> str:
        """Human readable filter description"""
        name = self.display_name or self.field.replace('_', ' ').title()

        op_map = {
            '>': 'greater than',
            '<': 'less than',
            '>=': 'at least',
            '<=': 'at most',
            '=': 'equals',
            'in': 'is one of',
            'between': 'between',
            'is_not_null': 'has data for'
        }

        op_text = op_map.get(self.operator, self.operator)

        if self.operator == 'in':
            values = self.value if isinstance(self.value, list) else [self.value]
            return f"{name} {op_text} [{', '.join(str(v) for v in values)}]"
        elif self.operator == 'between':
            return f"{name} {op_text} {self.value[0]} and {self.value[1]}"
        elif self.operator == 'is_not_null':
            return f"{name}"
        else:
            # Format percentages nicely
            if isinstance(self.value, float) and abs(self.value) < 1:
                return f"{name} {op_text} {self.value * 100:.1f}%"
            return f"{name} {op_text} {self.value}"


@dataclass
class ScreenerQuery:
    """Complete screener query"""
    filters: List[ScreenerFilter] = field(default_factory=list)
    sort_by: str = 'market_cap'
    sort_order: str = 'DESC'
    limit: int = 50
    explanation: str = None


class ScreenerHandler:
    """
    Handle natural language screening queries.

    Translates queries like:
    - "Show me undervalued tech stocks"
    - "Find high dividend stocks with low debt"
    - "Companies with growing revenue and high margins"
    """

    # Mapping from common terms to actual database field names
    FIELD_MAPPINGS = {
        # Valuation
        'pe': 'pe_ratio',
        'pe_ratio': 'pe_ratio',
        'pb': 'pb_ratio',
        'pb_ratio': 'pb_ratio',
        'ps': 'ps_ratio',
        'ps_ratio': 'ps_ratio',
        'ev_ebitda': 'ev_ebitda',

        # Profitability
        'margin': 'net_margin',
        'net_margin': 'net_margin',
        'gross_margin': 'gross_margin',
        'operating_margin': 'operating_margin',
        'roe': 'roe',
        'return_on_equity': 'roe',
        'roa': 'roa',
        'roic': 'roic',

        # Growth
        'revenue_growth': 'revenue_growth_yoy',
        'earnings_growth': 'eps_growth_yoy',
        'sales_growth': 'revenue_growth_yoy',

        # Dividend
        'dividend': 'dividend_yield',
        'dividend_yield': 'dividend_yield',
        'yield': 'dividend_yield',
        'payout_ratio': 'payout_ratio',

        # Size
        'market_cap': 'market_cap',
        'size': 'market_cap',

        # Balance sheet
        'debt': 'debt_to_equity',
        'debt_to_equity': 'debt_to_equity',
        'leverage': 'debt_to_equity',
        'current_ratio': 'current_ratio',

        # Sector/Industry
        'sector': 'sector',
        'industry': 'industry',
    }

    # Display names for fields
    FIELD_DISPLAY_NAMES = {
        'pe_ratio': 'P/E Ratio',
        'pb_ratio': 'P/B Ratio',
        'ps_ratio': 'P/S Ratio',
        'ev_ebitda': 'EV/EBITDA',
        'dividend_yield': 'Dividend Yield',
        'payout_ratio': 'Payout Ratio',
        'gross_margin': 'Gross Margin',
        'operating_margin': 'Operating Margin',
        'net_margin': 'Net Margin',
        'roe': 'Return on Equity',
        'roa': 'Return on Assets',
        'roic': 'Return on Invested Capital',
        'revenue_growth_yoy': 'Revenue Growth (YoY)',
        'eps_growth_yoy': 'EPS Growth (YoY)',
        'market_cap': 'Market Cap',
        'debt_to_equity': 'Debt to Equity',
        'current_ratio': 'Current Ratio',
        'sector': 'Sector',
        'industry': 'Industry',
    }

    # Common screening presets
    PRESETS = {
        'undervalued': [
            ScreenerFilter('pe_ratio', '<', 15, 'P/E Ratio'),
            ScreenerFilter('pe_ratio', '>', 0, 'P/E Ratio'),  # Exclude negative
            ScreenerFilter('pb_ratio', '<', 2, 'P/B Ratio'),
        ],
        'value': [
            ScreenerFilter('pe_ratio', '<', 18, 'P/E Ratio'),
            ScreenerFilter('pe_ratio', '>', 0, 'P/E Ratio'),
            ScreenerFilter('dividend_yield', '>', 0.02, 'Dividend Yield'),
        ],
        'growth': [
            ScreenerFilter('revenue_growth_yoy', '>', 0.15, 'Revenue Growth'),
            ScreenerFilter('eps_growth_yoy', '>', 0.10, 'EPS Growth'),
        ],
        'high dividend': [
            ScreenerFilter('dividend_yield', '>', 0.03, 'Dividend Yield'),
            ScreenerFilter('payout_ratio', '<', 0.8, 'Payout Ratio'),
        ],
        'quality': [
            ScreenerFilter('roe', '>', 0.15, 'ROE'),
            ScreenerFilter('debt_to_equity', '<', 1.0, 'Debt/Equity'),
            ScreenerFilter('net_margin', '>', 0.10, 'Net Margin'),
        ],
        'dividend growth': [
            ScreenerFilter('dividend_yield', '>', 0.015, 'Dividend Yield'),
            ScreenerFilter('payout_ratio', '<', 0.70, 'Payout Ratio'),
            ScreenerFilter('revenue_growth_yoy', '>', 0.05, 'Revenue Growth'),
        ],
        'small cap': [
            ScreenerFilter('market_cap', '<', 2_000_000_000, 'Market Cap'),
            ScreenerFilter('market_cap', '>', 300_000_000, 'Market Cap'),
        ],
        'large cap': [
            ScreenerFilter('market_cap', '>', 10_000_000_000, 'Market Cap'),
        ],
        'profitable': [
            ScreenerFilter('net_margin', '>', 0.05, 'Net Margin'),
            ScreenerFilter('roe', '>', 0.10, 'ROE'),
        ],
        'low debt': [
            ScreenerFilter('debt_to_equity', '<', 0.5, 'Debt/Equity'),
        ],
        'high margin': [
            ScreenerFilter('gross_margin', '>', 0.40, 'Gross Margin'),
            ScreenerFilter('operating_margin', '>', 0.20, 'Operating Margin'),
        ],
    }

    def __init__(self, db=None, router=None):
        """
        Args:
            db: Database connection for executing queries
            router: LLM router for complex filter extraction
        """
        self.db = db
        self.router = router

    async def handle(self, classified_query) -> Dict:
        """
        Handle a screening query.

        Args:
            classified_query: ClassifiedQuery with intent SCREEN

        Returns:
            Dict with results and explanation
        """
        # Build screener query from classified query
        screener_query = self._build_screener_query(classified_query)

        # Execute screen
        results = await self._execute_screen(screener_query)

        return {
            'type': 'screen_results',
            'query_interpretation': screener_query.explanation,
            'filters_applied': [f.to_display() for f in screener_query.filters],
            'sort_by': screener_query.sort_by,
            'sort_order': screener_query.sort_order,
            'results_count': len(results),
            'results': results,
        }

    def _build_screener_query(self, classified_query) -> ScreenerQuery:
        """Build screener query from classified query"""
        filters = []
        query_lower = classified_query.original_query.lower()

        # Check for preset matches
        for preset_name, preset_filters in self.PRESETS.items():
            if preset_name in query_lower:
                filters.extend(preset_filters)

        # Add filters from classification parameters
        if classified_query.parameters.get('filters'):
            for f in classified_query.parameters['filters']:
                field = self.FIELD_MAPPINGS.get(f['field'], f['field'])
                display_name = self.FIELD_DISPLAY_NAMES.get(field, field.replace('_', ' ').title())
                filters.append(ScreenerFilter(
                    field=field,
                    operator=f.get('operator', '>'),
                    value=f.get('value', 0),
                    display_name=display_name
                ))

        # Add sector filter if specified
        if classified_query.entities.get('sectors'):
            filters.append(ScreenerFilter(
                field='sector',
                operator='in',
                value=classified_query.entities['sectors'],
                display_name='Sector'
            ))

        # Remove duplicate filters (keep the more restrictive one)
        filters = self._deduplicate_filters(filters)

        # Determine sort
        sort_by = 'market_cap'
        sort_order = 'DESC'

        if classified_query.entities.get('metrics'):
            metric = classified_query.entities['metrics'][0]
            sort_by = self.FIELD_MAPPINGS.get(metric, metric)

        qualifiers = classified_query.entities.get('qualifiers', [])
        if any(q in qualifiers for q in ['low', 'lowest', 'cheap', 'cheapest']):
            sort_order = 'ASC'

        # Get limit
        limit = classified_query.parameters.get('limit', 50)

        # Build explanation
        explanation = self._build_explanation(classified_query.original_query, filters)

        return ScreenerQuery(
            filters=filters,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=limit,
            explanation=explanation
        )

    def _deduplicate_filters(self, filters: List[ScreenerFilter]) -> List[ScreenerFilter]:
        """Remove duplicate filters, keeping the most restrictive"""
        seen = {}
        for f in filters:
            key = f.field
            if key not in seen:
                seen[key] = f
            else:
                # For same-direction comparisons, keep the more restrictive
                existing = seen[key]
                if f.operator == existing.operator:
                    if f.operator in ('>', '>='):
                        if f.value > existing.value:
                            seen[key] = f
                    elif f.operator in ('<', '<='):
                        if f.value < existing.value:
                            seen[key] = f
                else:
                    # Different operators on same field - keep both (creates range)
                    seen[key + '_2'] = f

        return list(seen.values())

    async def _execute_screen(self, screener_query: ScreenerQuery) -> List[Dict]:
        """Execute the screen against the database"""
        if not self.db:
            return []

        # Build SQL query
        where_clauses = []
        for f in screener_query.filters:
            if f.field == 'sector':
                where_clauses.append(f.to_sql_condition('c'))
            else:
                where_clauses.append(f.to_sql_condition('m'))

        where_sql = ' AND '.join(where_clauses) if where_clauses else '1=1'

        sql = f"""
            SELECT
                c.symbol,
                c.name,
                c.sector,
                c.industry,
                m.market_cap,
                m.pe_ratio,
                m.pb_ratio,
                m.ps_ratio,
                m.dividend_yield,
                m.roe,
                m.roic,
                m.net_margin,
                m.gross_margin,
                m.revenue_growth_yoy,
                m.debt_to_equity,
                p.close as price,
                p.change_percent
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            LEFT JOIN (
                SELECT company_id, close, change_percent
                FROM daily_prices
                WHERE (company_id, date) IN (
                    SELECT company_id, MAX(date) FROM daily_prices GROUP BY company_id
                )
            ) p ON c.id = p.company_id
            WHERE c.active = 1
            AND {where_sql}
            ORDER BY m.{screener_query.sort_by} {screener_query.sort_order}
            LIMIT {screener_query.limit}
        """

        try:
            results = self.db.execute(sql).fetchall()
            columns = ['symbol', 'name', 'sector', 'industry', 'market_cap',
                      'pe_ratio', 'pb_ratio', 'ps_ratio', 'dividend_yield',
                      'roe', 'roic', 'net_margin', 'gross_margin',
                      'revenue_growth_yoy', 'debt_to_equity', 'price', 'change_percent']
            return [dict(zip(columns, row)) for row in results]
        except Exception as e:
            logger.error(f"Screen execution failed: {e}")
            return []

    def _build_explanation(self, original_query: str, filters: List[ScreenerFilter]) -> str:
        """Build human-readable explanation"""
        if not filters:
            return f"Searching for all stocks matching: {original_query}"

        filter_descriptions = [f.to_display() for f in filters]
        return f"Searching for stocks where: {' AND '.join(filter_descriptions)}"

    def get_preset_names(self) -> List[str]:
        """Get available preset screen names"""
        return list(self.PRESETS.keys())

    def apply_preset(self, preset_name: str, additional_filters: List[ScreenerFilter] = None) -> ScreenerQuery:
        """Apply a preset screen with optional additional filters"""
        filters = list(self.PRESETS.get(preset_name, []))
        if additional_filters:
            filters.extend(additional_filters)

        return ScreenerQuery(
            filters=filters,
            explanation=f"Preset screen: {preset_name}"
        )
