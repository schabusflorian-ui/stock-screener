# src/services/nl/query_engine.py
"""
Main Natural Language Query Engine.
Orchestrates query classification and handler routing.

Now with LLM-powered response enhancement for natural language insights.
Enhanced with response caching for repeated queries.
"""

import logging
import hashlib
from typing import Dict, Optional
from dataclasses import dataclass

from .classifier import QueryClassifier, QueryIntent, ClassifiedQuery
from .handlers import (
    ScreenerHandler,
    SimilarityHandler,
    HistoricalHandler,
    ComparisonHandler,
    DriverHandler,
    LookupHandler,
    PortfolioHandler,
    InvestorHandler,
    SentimentHandler,
    TechnicalHandler,
)
from .response_enhancer import ResponseEnhancer

# Import caching
try:
    from ..ai.cache import get_nl_query_cache, ResponseCache
    CACHE_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False
    ResponseCache = None

logger = logging.getLogger(__name__)


@dataclass
class QueryResult:
    """Result of a natural language query"""
    success: bool
    intent: str
    result: Dict
    query_interpretation: Optional[str] = None
    suggestions: Optional[list] = None
    confirmation: Optional[str] = None  # Human-friendly confirmation of what we understood
    confidence: Optional[str] = None  # Confidence level: 'high', 'medium', 'low'
    confidence_reason: Optional[str] = None  # Why confidence is at this level


class QueryEngine:
    """
    Main orchestrator for natural language queries.

    Routes classified queries to appropriate handlers and
    formats results for the frontend.
    """

    def __init__(self, db=None, router=None, enable_cache: bool = True):
        """
        Initialize the query engine.

        Args:
            db: Database connection
            router: LLM router for complex classification and response enhancement
            enable_cache: Whether to enable response caching
        """
        self.db = db
        self.router = router

        # Initialize caching
        self.cache = None
        if enable_cache and CACHE_AVAILABLE:
            self.cache = get_nl_query_cache()
            logger.info("NL query caching enabled")

        # Initialize components
        self.classifier = QueryClassifier(router=router, db=db)
        self.enhancer = ResponseEnhancer(router=router)

        # Initialize handlers
        self.handlers = {
            QueryIntent.SCREEN: ScreenerHandler(db=db, router=router),
            QueryIntent.LOOKUP: LookupHandler(db=db, router=router),
            QueryIntent.COMPARE: ComparisonHandler(db=db),
            QueryIntent.HISTORICAL: HistoricalHandler(db=db),
            QueryIntent.SIMILARITY: SimilarityHandler(db=db),
            QueryIntent.DRIVER: DriverHandler(db=db, router=router),
            QueryIntent.RANKING: ScreenerHandler(db=db, router=router),  # Reuse screener
            QueryIntent.PORTFOLIO: PortfolioHandler(db=db),
            QueryIntent.INVESTOR: InvestorHandler(db=db),
            QueryIntent.SENTIMENT: SentimentHandler(db=db, router=router),
            QueryIntent.TECHNICAL: TechnicalHandler(db=db, router=router),
            # These would need LLM support for full implementation
            QueryIntent.EXPLANATION: None,
            QueryIntent.CALCULATION: None,
        }

    def _make_cache_key(self, query_text: str, context: Optional[Dict]) -> str:
        """Create a cache key from query and context."""
        key_parts = [query_text.lower().strip()]
        if context:
            # Include relevant context in key
            if context.get('current_symbol'):
                key_parts.append(f"sym:{context['current_symbol']}")
            if context.get('page_type'):
                key_parts.append(f"page:{context['page_type']}")
        key_string = "|".join(key_parts)
        return f"nl_query_{hashlib.md5(key_string.encode()).hexdigest()}"

    async def query(self, query_text: str, context: Optional[Dict] = None, use_cache: bool = True) -> QueryResult:
        """
        Process a natural language query.

        Args:
            query_text: The user's natural language query
            context: Optional context (e.g., current company being viewed)
            use_cache: Whether to use cached results if available

        Returns:
            QueryResult with the query results
        """
        # Check cache first
        cache_key = None
        if use_cache and self.cache:
            cache_key = self._make_cache_key(query_text, context)
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                logger.debug(f"Cache hit for query: {query_text[:30]}...")
                # Add cache indicator to result
                cached_result.result['from_cache'] = True
                return cached_result

        try:
            # Classify the query (classifier is synchronous)
            classified = self.classifier.classify(query_text)

            logger.info(f"Query classified as {classified.intent.value}: {query_text[:50]}...")

            # Add context to classification if provided
            if context:
                classified = self._enrich_with_context(classified, context)

            # Route to appropriate handler
            result = await self._route_query(classified)

            # Generate natural language summary (with 3s timeout + fallback)
            # This runs in parallel-ish: we get data first, then try to enhance
            if result.get('type') != 'error':
                try:
                    summary = await self.enhancer.generate_summary(
                        result,
                        classified.intent.value,
                        query_text
                    )
                    if summary:
                        result['summary'] = summary
                except Exception as e:
                    logger.warning(f"Summary generation failed: {e}")
                    # Use fallback summary
                    result['summary'] = self.enhancer._generate_fallback_summary(
                        result,
                        classified.intent.value
                    )

            # Enhance result with deeper LLM insights if available (optional, can be slower)
            if self.router and result.get('type') != 'error':
                result = await self.enhancer.enhance(
                    result,
                    classified.intent.value,
                    query_text
                )

            # Build human-friendly confirmation
            confirmation = self._build_confirmation(classified, context)

            # Assess confidence
            confidence, confidence_reason = self._assess_confidence(classified, result)

            query_result = QueryResult(
                success=True,
                intent=classified.intent.value,
                result=result,
                query_interpretation=self._build_interpretation(classified),
                suggestions=self._get_follow_up_suggestions(classified, result, context),
                confirmation=confirmation,
                confidence=confidence,
                confidence_reason=confidence_reason
            )

            # Cache successful results (except for time-sensitive lookups)
            if cache_key and self.cache and classified.intent not in [QueryIntent.LOOKUP]:
                # Use shorter TTL for screen/ranking queries (data changes more frequently)
                ttl = 900 if classified.intent in [QueryIntent.SCREEN, QueryIntent.RANKING] else 1800
                self.cache.set(cache_key, query_result, ttl)
                logger.debug(f"Cached query result: {query_text[:30]}... (TTL: {ttl}s)")

            return query_result

        except Exception as e:
            logger.error(f"Query processing failed: {e}")
            return QueryResult(
                success=False,
                intent='error',
                result={'type': 'error', 'message': str(e)},
                suggestions=self._get_error_suggestions(query_text)
            )

    async def _route_query(self, classified: ClassifiedQuery) -> Dict:
        """Route query to the appropriate handler"""
        handler = self.handlers.get(classified.intent)

        if handler is None:
            # Handle intents without dedicated handlers
            if classified.intent == QueryIntent.EXPLANATION:
                return await self._handle_explanation(classified)
            elif classified.intent == QueryIntent.CALCULATION:
                return await self._handle_calculation(classified)
            elif classified.intent == QueryIntent.UNKNOWN:
                return await self._handle_unknown(classified)
            else:
                return {
                    'type': 'error',
                    'message': f'Handler not implemented for intent: {classified.intent.value}'
                }

        return await handler.handle(classified)

    def _enrich_with_context(
        self,
        classified: ClassifiedQuery,
        context: Dict
    ) -> ClassifiedQuery:
        """Enrich classification with context"""
        # If viewing a company, add it to entities
        if 'current_symbol' in context:
            if not classified.entities.get('symbols'):
                classified.entities['symbols'] = [context['current_symbol']]

        # If on a specific page, adjust intent if ambiguous
        if 'page_type' in context:
            page = context['page_type']
            if page == 'comparison' and classified.intent == QueryIntent.LOOKUP:
                classified.intent = QueryIntent.COMPARE

        return classified

    async def _handle_explanation(self, classified: ClassifiedQuery) -> Dict:
        """Handle explanation queries using LLM"""
        # Get relevant data first
        symbols = classified.entities.get('symbols', [])
        data = None

        if symbols:
            lookup = LookupHandler(db=self.db)
            try:
                data = await lookup._get_company_data(symbols[0])
            except Exception as e:
                logger.warning(f"Failed to get company data: {e}")

        # If LLM available, use it for rich explanation
        if self.router:
            try:
                from ..ai.llm.base import TaskType

                prompt = self._build_explanation_prompt(classified, data)
                response = self.router.route(
                    TaskType.ANALYSIS,
                    prompt=prompt,
                    temperature=0.3
                )

                return {
                    'type': 'explanation',
                    'query': classified.original_query,
                    'symbols': symbols,
                    'explanation': response.content,
                    'data_used': data,
                    'source': 'llm'
                }
            except Exception as e:
                logger.warning(f"LLM explanation failed, using fallback: {e}")

        # Fallback: Generate rule-based explanation
        return self._generate_fallback_explanation(classified, data)

    def _generate_fallback_explanation(self, classified: ClassifiedQuery, data: Optional[Dict]) -> Dict:
        """Generate explanation without LLM"""
        query_lower = classified.original_query.lower()
        symbols = classified.entities.get('symbols', [])

        explanation_parts = []

        # Check for common "why" patterns
        if 'pe' in query_lower or 'p/e' in query_lower:
            if data and data.get('pe_ratio'):
                pe = data['pe_ratio']
                if pe > 25:
                    explanation_parts.append(f"The P/E ratio of {pe:.1f} is relatively high, which could indicate:")
                    explanation_parts.append("- High growth expectations from investors")
                    explanation_parts.append("- Premium valuation due to competitive advantages")
                    explanation_parts.append("- Recent earnings decline (temporarily inflating P/E)")
                elif pe < 15:
                    explanation_parts.append(f"The P/E ratio of {pe:.1f} is relatively low, which could suggest:")
                    explanation_parts.append("- The stock may be undervalued")
                    explanation_parts.append("- Concerns about future earnings growth")
                    explanation_parts.append("- Cyclical industry at a low point")
                else:
                    explanation_parts.append(f"The P/E ratio of {pe:.1f} is in a moderate range, suggesting fair valuation relative to peers.")

        elif 'margin' in query_lower or 'profitability' in query_lower:
            if data:
                net_margin = data.get('net_margin')
                if net_margin:
                    explanation_parts.append(f"Net margin of {net_margin*100:.1f}% reflects:")
                    if net_margin > 0.15:
                        explanation_parts.append("- Strong pricing power or operational efficiency")
                        explanation_parts.append("- Competitive moat allowing premium pricing")
                    elif net_margin > 0.05:
                        explanation_parts.append("- Moderate profitability typical for the industry")
                    else:
                        explanation_parts.append("- Thin margins indicating competitive pressure")
                        explanation_parts.append("- Possible need for scale improvements")

        elif 'dividend' in query_lower:
            if data and data.get('dividend_yield'):
                div_yield = data['dividend_yield']
                explanation_parts.append(f"Dividend yield of {div_yield*100:.2f}% indicates:")
                if div_yield > 0.04:
                    explanation_parts.append("- High income potential but verify sustainability")
                elif div_yield > 0.02:
                    explanation_parts.append("- Moderate dividend with potential for growth")
                else:
                    explanation_parts.append("- Focus on growth over income distribution")

        if not explanation_parts:
            explanation_parts = [
                f"This query requires analysis of: {classified.original_query}",
                "",
                "For a detailed explanation, consider:",
                "- Checking the specific metrics mentioned",
                "- Comparing to industry peers",
                "- Reviewing historical trends"
            ]

        return {
            'type': 'explanation',
            'query': classified.original_query,
            'symbols': symbols,
            'explanation': '\n'.join(explanation_parts),
            'data_used': data,
            'source': 'rule-based'
        }

    async def _handle_calculation(self, classified: ClassifiedQuery) -> Dict:
        """Handle calculation queries - valuation scenarios, fair value, etc."""
        query_lower = classified.original_query.lower()
        symbols = classified.entities.get('symbols', [])

        # Try to identify calculation type
        calc_type = self._identify_calculation_type(query_lower)

        if not symbols:
            return {
                'type': 'calculation',
                'message': 'Please specify a stock symbol for the calculation.',
                'query': classified.original_query,
                'suggestions': [
                    "Try: 'What would AAPL be worth at 25x earnings?'",
                    "Or: 'Calculate NVDA fair value'"
                ]
            }

        symbol = symbols[0]

        if calc_type == 'pe_valuation':
            return await self._calculate_pe_valuation(symbol, classified)
        elif calc_type == 'ev_ebitda':
            return await self._calculate_ev_ebitda(symbol, classified)
        elif calc_type == 'fair_value':
            return await self._calculate_fair_value(symbol, classified)
        elif calc_type == 'upside_downside':
            return await self._calculate_upside_downside(symbol, classified)
        else:
            # Default to PE-based valuation if numbers found
            numbers = classified.entities.get('numbers', [])
            if numbers:
                return await self._calculate_pe_valuation(symbol, classified)

            return {
                'type': 'calculation',
                'query': classified.original_query,
                'symbol': symbol,
                'message': 'Please specify the calculation parameters.',
                'suggestions': [
                    f"What would {symbol} be worth at 20x earnings?",
                    f"Calculate {symbol} upside to fair value",
                    f"What's {symbol}'s implied value at 15x EV/EBITDA?"
                ]
            }

    def _identify_calculation_type(self, query: str) -> str:
        """Identify the type of calculation requested"""
        if any(x in query for x in ['pe', 'p/e', 'earnings multiple', 'times earnings']):
            return 'pe_valuation'
        elif any(x in query for x in ['ev/ebitda', 'ev ebitda', 'enterprise value']):
            return 'ev_ebitda'
        elif any(x in query for x in ['fair value', 'intrinsic', 'dcf', 'discounted']):
            return 'fair_value'
        elif any(x in query for x in ['upside', 'downside', 'potential', 'target']):
            return 'upside_downside'
        elif any(x in query for x in ['worth', 'value at', 'traded at', 'priced at']):
            return 'pe_valuation'  # Default to PE
        return 'unknown'

    async def _calculate_ev_ebitda(self, symbol: str, classified: ClassifiedQuery) -> Dict:
        """Calculate value based on EV/EBITDA multiple"""
        lookup = LookupHandler(db=self.db)

        try:
            data = await lookup._get_company_data(symbol)
        except Exception as e:
            return {'type': 'error', 'message': f'Failed to get data for {symbol}: {e}'}

        if not data:
            return {'type': 'error', 'message': f'No data available for {symbol}'}

        # Extract target multiple
        import re
        ev_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:x|times?)?\s*(?:ev/?ebitda|ev)', classified.original_query.lower())
        target_multiple = float(ev_match.group(1)) if ev_match else 12.0  # Default 12x

        ebitda = data.get('ebitda')
        current_ev = data.get('enterprise_value')
        shares = data.get('shares_outstanding')

        if ebitda and shares:
            # Assume net debt from enterprise value - market cap
            market_cap = data.get('market_cap', 0)
            net_debt = current_ev - market_cap if current_ev and market_cap else 0

            target_ev = ebitda * target_multiple
            target_equity = target_ev - net_debt
            target_price = target_equity / shares if shares else 0

            current_price = data.get('price', 0)
            change_pct = ((target_price - current_price) / current_price * 100) if current_price else 0

            return {
                'type': 'calculation_result',
                'symbol': symbol,
                'calculation': 'ev_ebitda_valuation',
                'inputs': {
                    'ebitda': ebitda,
                    'target_multiple': target_multiple,
                    'current_ev': current_ev,
                    'net_debt': net_debt,
                    'current_price': current_price
                },
                'result': {
                    'target_ev': target_ev,
                    'target_equity': target_equity,
                    'target_price': round(target_price, 2),
                    'change_percent': round(change_pct, 1)
                },
                'explanation': f"At {target_multiple}x EV/EBITDA, {symbol} would be worth ${target_price:.2f} ({change_pct:+.1f}% from current ${current_price:.2f})"
            }

        return {
            'type': 'calculation',
            'message': f'Missing EBITDA data for {symbol}',
            'query': classified.original_query
        }

    async def _calculate_fair_value(self, symbol: str, classified: ClassifiedQuery) -> Dict:
        """Calculate fair value using multiple methods"""
        lookup = LookupHandler(db=self.db)

        try:
            data = await lookup._get_company_data(symbol)
        except Exception as e:
            return {'type': 'error', 'message': f'Failed to get data for {symbol}: {e}'}

        if not data:
            return {'type': 'error', 'message': f'No data available for {symbol}'}

        valuations = []
        current_price = data.get('price', 0)

        # PE-based (assuming sector average of 20x)
        eps = data.get('eps_diluted')
        if eps and eps > 0:
            pe_fair = eps * 20
            valuations.append({'method': 'PE (20x)', 'value': pe_fair})

        # PEG-based (assuming 1x PEG)
        earnings_growth = data.get('earnings_growth', 0.15)
        if eps and eps > 0 and earnings_growth > 0:
            target_pe = earnings_growth * 100  # PEG of 1
            peg_fair = eps * min(target_pe, 35)  # Cap at 35x
            valuations.append({'method': 'PEG (1x)', 'value': peg_fair})

        # DCF simplified (if revenue growth data available)
        revenue = data.get('revenue')
        net_margin = data.get('net_margin', 0.1)
        if revenue and net_margin:
            # Very simplified: 10x forward earnings
            forward_earnings = revenue * net_margin * 1.1  # 10% growth
            shares = data.get('shares_outstanding', 1)
            dcf_estimate = (forward_earnings * 15) / shares if shares else 0
            if dcf_estimate > 0:
                valuations.append({'method': 'DCF (simplified)', 'value': dcf_estimate})

        if not valuations:
            return {
                'type': 'calculation',
                'message': f'Insufficient data to calculate fair value for {symbol}',
                'query': classified.original_query
            }

        avg_fair_value = sum(v['value'] for v in valuations) / len(valuations)
        upside = ((avg_fair_value - current_price) / current_price * 100) if current_price else 0

        return {
            'type': 'calculation_result',
            'symbol': symbol,
            'calculation': 'fair_value',
            'inputs': {
                'current_price': current_price,
                'eps': eps,
                'earnings_growth': earnings_growth
            },
            'result': {
                'methods': valuations,
                'average_fair_value': round(avg_fair_value, 2),
                'upside_percent': round(upside, 1)
            },
            'explanation': f"Fair value estimate for {symbol}: ${avg_fair_value:.2f} ({upside:+.1f}% vs current ${current_price:.2f})"
        }

    async def _calculate_upside_downside(self, symbol: str, classified: ClassifiedQuery) -> Dict:
        """Calculate potential upside/downside scenarios"""
        # Use fair value calculation as base
        result = await self._calculate_fair_value(symbol, classified)

        if result.get('type') != 'calculation_result':
            return result

        fair_value = result['result']['average_fair_value']
        current_price = result['inputs']['current_price']

        # Add scenario analysis
        scenarios = {
            'bull_case': fair_value * 1.25,
            'base_case': fair_value,
            'bear_case': fair_value * 0.75
        }

        for case, value in scenarios.items():
            scenarios[case] = {
                'price': round(value, 2),
                'change_percent': round((value - current_price) / current_price * 100, 1)
            }

        result['result']['scenarios'] = scenarios
        result['calculation'] = 'upside_downside'
        result['explanation'] = (
            f"{symbol} scenarios: "
            f"Bull ${scenarios['bull_case']['price']:.2f} ({scenarios['bull_case']['change_percent']:+.1f}%), "
            f"Base ${scenarios['base_case']['price']:.2f} ({scenarios['base_case']['change_percent']:+.1f}%), "
            f"Bear ${scenarios['bear_case']['price']:.2f} ({scenarios['bear_case']['change_percent']:+.1f}%)"
        )

        return result

    async def _calculate_pe_valuation(self, symbol: str, classified: ClassifiedQuery) -> Dict:
        """Calculate value based on PE multiple - enhanced version"""
        lookup = LookupHandler(db=self.db)

        try:
            data = await lookup._get_company_data(symbol)
        except Exception as e:
            return {'type': 'error', 'message': f'Failed to get data for {symbol}: {e}'}

        if not data:
            return {'type': 'error', 'message': f'No data available for {symbol}'}

        # Extract target PE
        import re
        pe_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:x|times?)?\s*(?:pe|p/e|earnings|multiple)?', classified.original_query.lower())
        target_pe = float(pe_match.group(1)) if pe_match else None

        # If no PE specified, try to find reasonable default
        if not target_pe:
            current_pe = data.get('pe_ratio')
            if current_pe:
                target_pe = round(current_pe * 1.1, 0)  # 10% premium
            else:
                target_pe = 20.0  # Market average

        eps = data.get('eps_diluted')
        current_price = data.get('price')

        if eps and eps > 0 and current_price:
            target_price = eps * target_pe
            change_pct = ((target_price - current_price) / current_price) * 100

            return {
                'type': 'calculation_result',
                'symbol': symbol,
                'calculation': 'target_price_from_pe',
                'inputs': {
                    'eps': round(eps, 2),
                    'target_pe': target_pe,
                    'current_price': round(current_price, 2),
                    'current_pe': round(data.get('pe_ratio', 0), 1)
                },
                'result': {
                    'target_price': round(target_price, 2),
                    'change_percent': round(change_pct, 1)
                },
                'explanation': f"At {target_pe}x earnings, {symbol} would be worth ${target_price:.2f} ({change_pct:+.1f}% from current ${current_price:.2f})"
            }

        return {
            'type': 'calculation',
            'message': f'Missing earnings data for {symbol}',
            'query': classified.original_query,
            'data_available': {k: v for k, v in (data or {}).items() if v is not None}
        }

    async def _handle_unknown(self, classified: ClassifiedQuery) -> Dict:
        """
        Handle unknown intents with LLM fallback.

        This is the systemic solution: when we can't classify a query,
        we ask the LLM to help interpret and respond appropriately.
        """
        symbols = classified.entities.get('symbols', [])
        metrics = classified.entities.get('metrics', [])

        # Try to get any available data for context
        context_data = None
        if symbols:
            lookup = LookupHandler(db=self.db)
            try:
                context_data = await lookup._get_company_data(symbols[0])
            except Exception as e:
                logger.warning(f"Failed to get context data: {e}")

        # If we have an LLM router, use it for intelligent response
        if self.router:
            try:
                return await self._llm_handle_query(classified, context_data)
            except Exception as e:
                logger.warning(f"LLM handling failed: {e}")

        # Fallback to static response
        return {
            'type': 'unknown',
            'message': "I'm not sure how to interpret that query.",
            'query': classified.original_query,
            'suggestions': [
                "Try asking about a specific stock: 'What's AAPL's P/E ratio?'",
                "Screen for stocks: 'Show me undervalued tech stocks'",
                "Compare companies: 'Compare MSFT to GOOGL'",
                "Find similar stocks: 'Find stocks like COST'",
            ]
        }

    async def _llm_handle_query(self, classified: ClassifiedQuery, context_data: Optional[Dict]) -> Dict:
        """
        Use LLM to intelligently handle queries we couldn't classify.

        This provides the 'systemic solution' for handling any investment question.
        """
        from ..ai.llm.base import TaskType

        symbols = classified.entities.get('symbols', [])
        query = classified.original_query

        # Build context-rich prompt
        prompt = f"""You are an investment analyst assistant. Answer this question:

Question: {query}

"""
        if context_data:
            symbol = context_data.get('symbol', symbols[0] if symbols else 'Unknown')
            prompt += f"""
Available data for {symbol}:
- Name: {context_data.get('name', 'N/A')}
- Sector: {context_data.get('sector', 'N/A')}
- Price: ${context_data.get('price', 'N/A')}
- Market Cap: ${self._format_large_number(context_data.get('market_cap'))}
- P/E Ratio: {context_data.get('pe_ratio', 'N/A')}
- Revenue: ${self._format_large_number(context_data.get('total_revenue'))}
- Net Income: ${self._format_large_number(context_data.get('net_income'))}
- Operating Income: ${self._format_large_number(context_data.get('operating_income'))}
- NOPAT (calculated): ${self._format_large_number(context_data.get('nopat'))}
- EBIT: ${self._format_large_number(context_data.get('ebit'))}
- EBITDA: ${self._format_large_number(context_data.get('ebitda'))}
- Free Cash Flow: ${self._format_large_number(context_data.get('free_cash_flow'))}
- ROE: {self._format_percent(context_data.get('roe'))}
- ROIC: {self._format_percent(context_data.get('roic'))}
- Net Margin: {self._format_percent(context_data.get('net_margin'))}
- Debt to Equity: {context_data.get('debt_to_equity', 'N/A')}
"""
        else:
            prompt += "\nNo specific company data available.\n"

        prompt += """
Instructions:
1. If asked about a specific metric, provide its value from the data above (if available)
2. If the metric isn't available, explain what it means and suggest alternatives
3. If asked a general question, provide a helpful investment-focused answer
4. Be concise but informative (2-4 sentences)
5. If you calculate something, show your work briefly

Response:"""

        try:
            response = self.router.route(
                TaskType.ANALYSIS,
                prompt=prompt,
                temperature=0.3,
                max_tokens=500
            )

            return {
                'type': 'llm_response',
                'query': query,
                'symbols': symbols,
                'answer': response.content.strip(),
                'data_used': context_data,
                'source': 'llm',
                'suggestions': self._get_follow_up_suggestions_from_query(query, symbols)
            }

        except Exception as e:
            logger.error(f"LLM query handling failed: {e}")
            raise

    def _format_large_number(self, value) -> str:
        """Format large numbers for display"""
        if value is None:
            return 'N/A'
        try:
            value = float(value)
            if value >= 1_000_000_000_000:
                return f"{value / 1_000_000_000_000:.2f}T"
            elif value >= 1_000_000_000:
                return f"{value / 1_000_000_000:.2f}B"
            elif value >= 1_000_000:
                return f"{value / 1_000_000:.2f}M"
            else:
                return f"{value:,.0f}"
        except:
            return 'N/A'

    def _format_percent(self, value) -> str:
        """Format percentage values"""
        if value is None:
            return 'N/A'
        try:
            return f"{float(value) * 100:.1f}%"
        except:
            return 'N/A'

    def _get_follow_up_suggestions_from_query(self, query: str, symbols: list) -> list:
        """Generate follow-up suggestions based on the query"""
        suggestions = []
        query_lower = query.lower()

        if symbols:
            symbol = symbols[0]
            if 'nopat' in query_lower or 'roic' in query_lower:
                suggestions = [
                    f"What is {symbol}'s ROIC compared to peers?",
                    f"Show {symbol}'s profitability metrics",
                    f"How has {symbol}'s capital efficiency changed?",
                ]
            elif 'revenue' in query_lower or 'sales' in query_lower:
                suggestions = [
                    f"What's driving {symbol}'s revenue growth?",
                    f"Compare {symbol}'s revenue to competitors",
                    f"Show {symbol}'s revenue trend over 5 years",
                ]
            elif 'margin' in query_lower or 'profit' in query_lower:
                suggestions = [
                    f"Why are {symbol}'s margins at this level?",
                    f"Compare {symbol}'s margins to industry average",
                    f"How have {symbol}'s margins changed over time?",
                ]
            else:
                suggestions = [
                    f"What's {symbol}'s valuation?",
                    f"Show all metrics for {symbol}",
                    f"Find stocks similar to {symbol}",
                ]
        else:
            suggestions = [
                "Try asking about a specific stock",
                "Screen for stocks with certain criteria",
                "Compare two or more stocks",
            ]

        return suggestions[:3]

    def _build_interpretation(self, classified: ClassifiedQuery) -> str:
        """Build human-readable interpretation of the query"""
        parts = [f"Intent: {classified.intent.value}"]

        if classified.entities.get('symbols'):
            parts.append(f"Symbols: {', '.join(classified.entities['symbols'])}")

        if classified.entities.get('metrics'):
            parts.append(f"Metrics: {', '.join(classified.entities['metrics'])}")

        if classified.entities.get('sectors'):
            parts.append(f"Sectors: {', '.join(classified.entities['sectors'])}")

        if classified.entities.get('qualifiers'):
            parts.append(f"Qualifiers: {', '.join(classified.entities['qualifiers'])}")

        return " | ".join(parts)

    def _build_explanation_prompt(
        self,
        classified: ClassifiedQuery,
        data: Optional[Dict]
    ) -> str:
        """Build prompt for explanation generation"""
        prompt = f"Answer this investment question concisely: {classified.original_query}\n\n"

        if data:
            prompt += "Relevant data:\n"
            for key, value in data.items():
                if value is not None and key not in ['symbol', 'name', 'description']:
                    prompt += f"- {key}: {value}\n"

        prompt += "\nProvide a clear, factual explanation in 2-3 sentences."
        return prompt

    def _get_follow_up_suggestions(
        self,
        classified: ClassifiedQuery,
        result: Dict,
        context: Optional[Dict] = None
    ) -> list:
        """Get relevant, context-aware follow-up suggestions"""
        suggestions = []
        symbols = classified.entities.get('symbols', [])
        context_symbol = context.get('current_symbol') if context else None

        # Make suggestions more natural and context-specific
        if classified.intent == QueryIntent.LOOKUP and symbols:
            symbol = symbols[0]
            suggestions = [
                f"How does {symbol} compare to its main competitors?",
                f"What companies are similar to {symbol}?",
                f"Show me {symbol}'s revenue trend over the past 5 years",
            ]
            # Add context-specific suggestion
            if context_symbol and context_symbol != symbol:
                suggestions.append(f"Compare {symbol} to {context_symbol}")

        elif classified.intent == QueryIntent.SCREEN:
            filters = result.get('filters_applied', [])
            count = result.get('results_count', 0)
            if count > 20:
                suggestions.append("Narrow results by adding a P/E filter")
                suggestions.append("Focus on large-cap stocks only")
            elif count > 0:
                top = result.get('results', [{}])[0]
                if top.get('symbol'):
                    suggestions.append(f"Tell me more about {top['symbol']}")
            suggestions.append("Sort these by dividend yield instead")

        elif classified.intent == QueryIntent.COMPARE:
            symbols_compared = [c.get('symbol') for c in result.get('companies', [])]
            if symbols_compared:
                suggestions = [
                    f"Which is better for dividend income?",
                    f"Compare their growth rates over the past 3 years",
                    f"What are the key risks for each?",
                ]

        elif classified.intent == QueryIntent.SIMILARITY:
            target = result.get('target_symbol')
            similar = result.get('similar_stocks', [])
            if target:
                suggestions = [f"What makes {target} unique compared to these?"]
                if similar:
                    suggestions.append(f"Compare {target} with {similar[0].get('symbol', 'the top match')}")
                suggestions.append(f"What's driving {target}'s recent performance?")

        elif classified.intent == QueryIntent.HISTORICAL:
            symbol = symbols[0] if symbols else context_symbol
            if symbol:
                suggestions = [
                    f"Why did {symbol}'s margins change?",
                    f"Compare {symbol}'s growth to the sector average",
                    f"What's the outlook for {symbol}?",
                ]

        elif classified.intent == QueryIntent.EXPLANATION:
            if symbols:
                suggestions = [
                    f"Is {symbols[0]} fairly valued?",
                    f"What are the risks for {symbols[0]}?",
                    f"Compare {symbols[0]} to industry peers",
                ]

        elif classified.intent == QueryIntent.CALCULATION:
            if symbols:
                symbol = symbols[0]
                suggestions = [
                    f"What's {symbol}'s fair value using DCF?",
                    f"Calculate {symbol}'s value at 15x earnings",
                    f"What's the upside if {symbol} grows earnings 20%?",
                ]

        # Add a general contextual suggestion if we have context
        if context_symbol and not suggestions:
            suggestions = [
                f"What's {context_symbol}'s current valuation?",
                f"Find stocks similar to {context_symbol}",
                f"How has {context_symbol} performed this year?",
            ]

        return suggestions[:4]  # Limit to 4 suggestions

    def _build_confirmation(self, classified: ClassifiedQuery, context: Optional[Dict] = None) -> str:
        """Build a natural, conversational confirmation of what we understood"""
        intent = classified.intent
        symbols = classified.entities.get('symbols', [])
        metrics = classified.entities.get('metrics', [])
        sectors = classified.entities.get('sectors', [])
        qualifiers = classified.entities.get('qualifiers', [])

        # Build natural confirmations based on intent
        if intent == QueryIntent.LOOKUP:
            if symbols:
                if metrics:
                    return f"Looking up {', '.join(metrics)} for {symbols[0]}..."
                return f"Getting information about {symbols[0]}..."
            return "Looking up stock information..."

        elif intent == QueryIntent.SCREEN:
            parts = []
            if sectors:
                parts.append(f"in {', '.join(sectors)}")
            if 'undervalued' in qualifiers:
                parts.append("that appear undervalued")
            elif 'overvalued' in qualifiers:
                parts.append("that might be overvalued")
            if 'dividend' in ' '.join(qualifiers).lower():
                parts.append("with strong dividends")
            context_str = ' '.join(parts) if parts else "matching your criteria"
            return f"Screening for stocks {context_str}..."

        elif intent == QueryIntent.COMPARE:
            if len(symbols) >= 2:
                return f"Comparing {symbols[0]} with {symbols[1]}..."
            elif symbols:
                return f"Finding comparisons for {symbols[0]}..."
            return "Setting up a comparison..."

        elif intent == QueryIntent.SIMILARITY:
            if symbols:
                return f"Finding stocks similar to {symbols[0]}..."
            return "Searching for similar stocks..."

        elif intent == QueryIntent.HISTORICAL:
            if symbols:
                return f"Analyzing {symbols[0]}'s historical performance..."
            return "Looking at historical trends..."

        elif intent == QueryIntent.DRIVER:
            if symbols:
                return f"Identifying what's driving {symbols[0]}'s performance..."
            return "Analyzing performance drivers..."

        elif intent == QueryIntent.EXPLANATION:
            if symbols:
                return f"Explaining the key factors for {symbols[0]}..."
            return "Preparing an explanation..."

        elif intent == QueryIntent.CALCULATION:
            if symbols:
                return f"Running valuation calculations for {symbols[0]}..."
            return "Calculating..."

        elif intent == QueryIntent.RANKING:
            metric = metrics[0] if metrics else 'overall score'
            return f"Ranking stocks by {metric}..."

        elif intent == QueryIntent.PORTFOLIO:
            return "Analyzing your portfolio..."

        elif intent == QueryIntent.INVESTOR:
            investors = classified.entities.get('investors', [])
            if investors:
                # Get display name for the investor
                from .handlers.investor_handler import INVESTOR_DISPLAY_NAMES
                investor_name = INVESTOR_DISPLAY_NAMES.get(investors[0], investors[0])
                return f"Looking up {investor_name}'s holdings..."
            return "Searching investor information..."

        return "Processing your question..."

    def _assess_confidence(self, classified: ClassifiedQuery, result: Dict) -> tuple:
        """
        Assess confidence level in the response.
        Returns (confidence_level, reason)
        """
        confidence = 'high'
        reasons = []

        # Check if we understood the intent well
        if classified.intent == QueryIntent.UNKNOWN:
            return ('low', "I wasn't sure what you were asking for")

        # Check data availability
        if result.get('type') == 'error':
            return ('low', result.get('message', 'Data unavailable'))

        # Check if we found the requested entities
        symbols = classified.entities.get('symbols', [])
        if symbols:
            # Check if data was actually found
            if result.get('symbol') or result.get('companies') or result.get('results'):
                reasons.append('data available')
            else:
                confidence = 'medium'
                reasons.append('limited data found')
        else:
            # No specific symbol - might be a general query
            if classified.intent in [QueryIntent.SCREEN, QueryIntent.RANKING]:
                pass  # These don't need symbols
            else:
                confidence = 'medium'
                reasons.append('no specific stock identified')

        # Check result quality
        if result.get('source') == 'rule-based':
            if confidence == 'high':
                confidence = 'medium'
            reasons.append('using basic analysis')
        elif result.get('source') == 'llm':
            reasons.append('AI-powered analysis')

        # Check for missing data in results
        if result.get('missing_data'):
            confidence = 'medium' if confidence == 'high' else 'low'
            reasons.append('some metrics unavailable')

        # Screen results confidence
        if classified.intent == QueryIntent.SCREEN:
            count = result.get('results_count', 0)
            if count == 0:
                confidence = 'medium'
                reasons.append('no matches found')
            elif count > 100:
                reasons.append('many matches - consider refining')

        # Build reason string
        if not reasons:
            reason = "Good data coverage for this query"
        else:
            reason = reasons[0].capitalize()
            if len(reasons) > 1:
                reason += f" ({', '.join(reasons[1:])})"

        return (confidence, reason)

    def _get_error_suggestions(self, query_text: str) -> list:
        """Get suggestions after an error"""
        return [
            "Try rephrasing your question",
            "Specify a stock symbol (e.g., AAPL, MSFT)",
            "Ask about specific metrics (P/E ratio, market cap)",
            "Examples: 'Show me dividend stocks', 'Compare AAPL to MSFT'",
        ]

    def get_example_queries(self) -> Dict[str, list]:
        """Get example queries by intent type"""
        return {
            'screen': [
                "Show me undervalued tech stocks",
                "Find high dividend stocks with low debt",
                "Top 10 stocks by revenue growth",
            ],
            'lookup': [
                "What's AAPL's P/E ratio?",
                "Show me NVDA's market cap",
                "Tell me about MSFT",
            ],
            'compare': [
                "Compare AAPL to MSFT",
                "How does NVDA compare to AMD?",
                "GOOGL vs META on valuation",
            ],
            'historical': [
                "How has AAPL's revenue changed over 5 years?",
                "Show TSLA's margin history",
                "NVDA's growth trend",
            ],
            'similarity': [
                "Find stocks like COST",
                "What's similar to AAPL?",
                "Stocks with similar profile to NVDA",
            ],
            'driver': [
                "What's driving NVDA's growth?",
                "Explain AAPL's profitability",
                "Why is TSLA's margin declining?",
            ],
            'portfolio': [
                "Analyze my portfolio",
                "Show portfolio performance",
                "What's my portfolio risk?",
            ],
            'investor': [
                "Show Warren Buffett's holdings",
                "What stocks does Buffett own?",
                "Compare my portfolio to Buffett's",
            ],
        }

    def get_cache_stats(self) -> Optional[Dict]:
        """Get cache statistics."""
        if self.cache:
            return self.cache.get_stats()
        return None

    def clear_cache(self):
        """Clear the query cache."""
        if self.cache:
            self.cache.clear()
            logger.info("NL query cache cleared")

    def invalidate_cache(self, pattern: str = None):
        """Invalidate cache entries, optionally by pattern."""
        if self.cache:
            if pattern:
                self.cache.invalidate_pattern(pattern)
            else:
                self.cache.clear()
