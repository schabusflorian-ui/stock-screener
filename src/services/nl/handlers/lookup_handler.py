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

        # Profitability (stored as percentages: 46.9 = 46.9%)
        'gross_margin': {'display': 'Gross Margin', 'format': 'percent_raw', 'category': 'profitability'},
        'operating_margin': {'display': 'Operating Margin', 'format': 'percent_raw', 'category': 'profitability'},
        'net_margin': {'display': 'Net Margin', 'format': 'percent_raw', 'category': 'profitability'},
        'roe': {'display': 'Return on Equity', 'format': 'percent_raw', 'category': 'profitability'},
        'roa': {'display': 'Return on Assets', 'format': 'percent_raw', 'category': 'profitability'},
        'roic': {'display': 'Return on Invested Capital', 'format': 'percent_raw', 'category': 'profitability'},

        # Growth (stored as percentages: 3.95 = 3.95%)
        'revenue_growth_yoy': {'display': 'Revenue Growth (YoY)', 'format': 'percent_raw', 'category': 'growth'},
        'eps_growth_yoy': {'display': 'EPS Growth (YoY)', 'format': 'percent_raw', 'category': 'growth'},

        # Financial Health
        'debt_to_equity': {'display': 'Debt/Equity', 'format': 'ratio', 'category': 'financial_health'},
        'current_ratio': {'display': 'Current Ratio', 'format': 'ratio', 'category': 'financial_health'},
        'interest_coverage': {'display': 'Interest Coverage', 'format': 'ratio', 'category': 'financial_health'},

        # Dividend (stored as decimal: 0.38 = 38%)
        'dividend_yield': {'display': 'Dividend Yield', 'format': 'percent', 'category': 'dividend'},

        # Price
        'price': {'display': 'Stock Price', 'format': 'currency', 'category': 'price'},

        # Financials (from statements)
        'total_revenue': {'display': 'Revenue', 'format': 'currency_large', 'category': 'financials'},
        'net_income': {'display': 'Net Income', 'format': 'currency_large', 'category': 'financials'},
        'operating_income': {'display': 'Operating Income', 'format': 'currency_large', 'category': 'financials'},
        'nopat': {'display': 'NOPAT', 'format': 'currency_large', 'category': 'financials'},
        'ebit': {'display': 'EBIT', 'format': 'currency_large', 'category': 'financials'},
        'ebitda': {'display': 'EBITDA', 'format': 'currency_large', 'category': 'financials'},
        'free_cash_flow': {'display': 'Free Cash Flow', 'format': 'currency_large', 'category': 'financials'},
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
        # New aliases for additional metrics
        'nopat': 'nopat',
        'net operating profit': 'nopat',
        'net operating profit after tax': 'nopat',
        'ebit': 'ebit',
        'operating profit': 'ebit',
        'earnings before interest and tax': 'ebit',
        'ebitda': 'ebitda',
        'earnings before interest tax depreciation': 'ebitda',
        'fcf': 'free_cash_flow',
        'free cash flow': 'free_cash_flow',
        'cash flow': 'free_cash_flow',
        'beta': 'beta',
        'volatility': 'volatility',
        'vol': 'volatility',
        'roic': 'roic',
        'return on invested capital': 'roic',
        'total debt': 'total_debt',
    }

    def __init__(self, db=None, router=None):
        """
        Args:
            db: Database connection
            router: LLM router for fallback when metrics not found
        """
        self.db = db
        self.router = router

    async def handle(self, classified_query) -> Dict:
        """
        Handle a lookup query using data-first approach for speed.

        Returns database data immediately for fast responses.
        LLM enhancement is optional and done asynchronously if time permits.

        Args:
            classified_query: ClassifiedQuery with intent LOOKUP

        Returns:
            Dict with data response
        """
        logger.info(f"LookupHandler.handle called for query: {classified_query.original_query[:50]}...")
        symbols = classified_query.entities.get('symbols', [])
        original_query = classified_query.original_query

        if not symbols:
            logger.info("No symbols found, returning helpful message")
            return {
                'type': 'info',
                'message': 'Please specify a stock symbol or company name in your question.',
                'suggestions': [
                    'Try: "What is Apple\'s P/E ratio?"',
                    'Or: "Show me MSFT market cap"'
                ]
            }

        symbol = symbols[0].upper()
        logger.info(f"Processing lookup for symbol: {symbol}")

        # Get database data - this is the primary response for speed
        company_data = await self._get_company_data(symbol)
        logger.info(f"Got company data: {bool(company_data)}")

        if company_data:
            # Return formatted data response immediately
            result = self._format_simple_response(symbol, company_data, original_query)
            logger.info(f"Returning data response for {symbol}")
            return result
        else:
            # No data found
            return {
                'type': 'not_found',
                'symbol': symbol,
                'message': f'No data found for {symbol}. The stock may not be in our database.',
                'suggestions': [
                    'Check if the symbol is correct',
                    'Try searching for the company by name'
                ]
            }

    async def _llm_answer_query(self, symbol: Optional[str], query: str, data: Optional[Dict] = None) -> Dict:
        """
        Use LLM as primary answering mechanism for investment questions.

        This is the LLM-first approach: we always use the LLM to formulate
        intelligent responses. Database data enriches the response when
        available but doesn't gate it.

        Args:
            symbol: Stock symbol (can be None)
            query: The user's original query
            data: Database data for context (can be None)

        Returns:
            Dict with intelligent LLM response
        """
        # If no LLM available, fall back to simple data display
        if not self.router:
            if data:
                return self._format_simple_response(symbol, data, query)
            return {
                'type': 'error',
                'message': 'No AI assistant available. Please configure ANTHROPIC_API_KEY or OLLAMA_URL.',
                'suggestions': [
                    'Check your environment configuration',
                    'Ensure the AI service is running'
                ]
            }

        try:
            from ...ai.llm.base import TaskType

            # Build prompt with available context
            prompt = f"""You are an expert investment analyst assistant. Answer this question:

Question: {query}
"""
            if symbol:
                prompt += f"\nCompany: {symbol}"
                if data:
                    company_name = data.get('name', symbol)
                    sector = data.get('sector')
                    industry = data.get('industry')
                    if company_name != symbol:
                        prompt += f" ({company_name})"
                    if sector:
                        prompt += f"\nSector: {sector}"
                    if industry:
                        prompt += f"\nIndustry: {industry}"

            if data:
                prompt += "\n\nAvailable financial data:\n"
                for key, value in data.items():
                    if value is not None and key not in ['description', 'name', 'symbol', 'sector', 'industry']:
                        formatted = self._format_for_prompt(key, value)
                        if formatted:
                            prompt += f"- {formatted}\n"

            prompt += """
Instructions:
1. Answer the question directly and intelligently
2. Use the available data when relevant, citing specific numbers
3. If asked about a metric not in the data, explain what it means and how it's calculated
4. Be helpful and informative even if exact data isn't available
5. Keep your response concise (2-4 sentences for simple questions, more for complex ones)
6. If the question is about something you can derive from the data, do the calculation

Response:"""

            response = self.router.route(
                TaskType.ANALYSIS,
                prompt=prompt,
                temperature=0.3,
                max_tokens=500
            )

            result = {
                'type': 'llm_response',
                'symbol': symbol,
                'query': query,
                'answer': response.content.strip(),
                'source': 'llm' if not data else 'database+llm'
            }

            # Include structured data if available (for UI display)
            if data:
                result['data'] = {
                    'name': data.get('name'),
                    'sector': data.get('sector'),
                    'industry': data.get('industry'),
                    'price': data.get('price'),
                    'market_cap': data.get('market_cap')
                }

            return result

        except Exception as e:
            logger.error(f"LLM answer query failed: {e}")
            # Fall back to data-only response if available
            if data:
                return self._format_simple_response(symbol, data, query)
            return {
                'type': 'error',
                'message': f'Unable to process query: {str(e)}',
                'suggestions': [
                    'Try rephrasing your question',
                    'Check the stock symbol is correct'
                ]
            }

    def _format_for_prompt(self, key: str, value: any) -> Optional[str]:
        """Format a data value for inclusion in LLM prompt"""
        if value is None:
            return None

        # Get display name and format from METRICS if available
        if key in self.METRICS:
            metric_info = self.METRICS[key]
            display_name = metric_info['display']
            formatted = self._format_value(value, metric_info['format'])
            return f"{display_name}: {formatted}"

        # Handle known non-metric fields
        if key in ['price']:
            return f"Stock Price: ${value:.2f}"
        if key in ['market_cap'] and value:
            if value >= 1_000_000_000_000:
                return f"Market Cap: ${value / 1_000_000_000_000:.2f}T"
            elif value >= 1_000_000_000:
                return f"Market Cap: ${value / 1_000_000_000:.2f}B"
            else:
                return f"Market Cap: ${value / 1_000_000:.2f}M"

        # Format large numbers
        if isinstance(value, (int, float)):
            if abs(value) >= 1_000_000_000:
                return f"{key}: ${value / 1_000_000_000:.2f}B"
            elif abs(value) >= 1_000_000:
                return f"{key}: ${value / 1_000_000:.2f}M"
            elif isinstance(value, float) and abs(value) < 1:
                return f"{key}: {value * 100:.1f}%"
            else:
                return f"{key}: {value}"

        return None

    def _format_simple_response(self, symbol: str, data: Dict, query: str) -> Dict:
        """Format a simple data-only response when LLM is not available"""
        metrics_by_category = {}
        for metric_name, metric_info in self.METRICS.items():
            value = data.get(metric_name)
            if value is not None:
                category = metric_info['category']
                if category not in metrics_by_category:
                    metrics_by_category[category] = []
                metrics_by_category[category].append({
                    'name': metric_info['display'],
                    'value': self._format_value(value, metric_info['format'])
                })

        return {
            'type': 'data_response',
            'symbol': symbol,
            'name': data.get('name', symbol),
            'query': query,
            'metrics_by_category': metrics_by_category,
            'source': 'database',
            'note': 'AI assistant unavailable - showing raw data'
        }

    def _has_missing_values(self, result: Dict) -> bool:
        """Check if any requested metrics have N/A values"""
        metrics = result.get('metrics', [])
        for m in metrics:
            if m.get('value') is None or m.get('formatted_value') == 'N/A':
                return True
        return False

    async def _enhance_with_llm(
        self,
        result: Dict,
        symbol: str,
        unresolved_metrics: list,
        original_query: str
    ) -> Dict:
        """Use LLM to help when metrics can't be found in database"""
        if not self.router:
            # No LLM available - add helpful message
            if unresolved_metrics:
                result['note'] = f"Could not find data for: {', '.join(unresolved_metrics)}"
            return result

        try:
            from ...ai.llm.base import TaskType

            # Get company data for context
            company_data = await self._get_company_data(symbol)

            # Build prompt for LLM
            prompt = f"""Answer this investment data question:

Question: {original_query}

Available data for {symbol}:
"""
            if company_data:
                for key, value in company_data.items():
                    if value is not None and key not in ['description']:
                        if isinstance(value, float) and value > 1000000:
                            formatted = f"${value/1e9:.2f}B" if value > 1e9 else f"${value/1e6:.2f}M"
                        elif isinstance(value, float) and value < 1:
                            formatted = f"{value*100:.1f}%"
                        else:
                            formatted = str(value)
                        prompt += f"- {key}: {formatted}\n"

            if unresolved_metrics:
                prompt += f"\nMetrics requested but not in database: {', '.join(unresolved_metrics)}\n"

            prompt += """
Instructions:
1. Answer the specific question using the available data
2. If asked about a metric not in the data, explain what it means and provide the calculation if possible
3. Be concise (2-3 sentences)

Response:"""

            response = self.router.route(
                TaskType.ANALYSIS,
                prompt=prompt,
                temperature=0.3,
                max_tokens=300
            )

            # Add LLM explanation to result
            result['llm_explanation'] = response.content.strip()
            result['source'] = 'database+llm'

            if unresolved_metrics:
                result['unresolved_metrics'] = unresolved_metrics

        except Exception as e:
            logger.warning(f"LLM enhancement failed: {e}")
            if unresolved_metrics:
                result['note'] = f"Could not find data for: {', '.join(unresolved_metrics)}"

        return result

    async def _llm_fallback_response(self, symbol: str, query: str, reason: str) -> Dict:
        """
        Use LLM to provide an intelligent response when database lookup fails.
        This is the systemic solution - LLM steps in immediately when data unavailable.
        """
        if not self.router:
            return {
                'type': 'error',
                'message': f'Could not find data for {symbol}. {reason}',
                'suggestions': [
                    f"Check if {symbol} is a valid stock ticker",
                    "Try using the full company name",
                    "The stock may not be in our database yet"
                ]
            }

        try:
            from ...ai.llm.base import TaskType

            prompt = f"""You are an investment analyst assistant. The user asked:

Question: {query}

Context: {reason}

Please provide a helpful response. If the user is asking about a specific company or metric:
1. Explain what the metric means (if applicable)
2. Provide general context about the company if you know it
3. Suggest how they might find this information
4. If "{symbol}" might be a company name rather than a ticker, suggest the correct ticker

Keep your response concise (3-5 sentences) and helpful.

Response:"""

            response = self.router.route(
                TaskType.ANALYSIS,
                prompt=prompt,
                temperature=0.3,
                max_tokens=400
            )

            return {
                'type': 'llm_response',
                'symbol': symbol,
                'query': query,
                'answer': response.content.strip(),
                'source': 'llm',
                'note': reason,
                'suggestions': [
                    f"Try searching for {symbol} with its ticker symbol",
                    "Check the company spelling",
                    "The data may need to be updated"
                ]
            }

        except Exception as e:
            logger.error(f"LLM fallback failed: {e}")
            return {
                'type': 'error',
                'message': f'Could not find data for {symbol}. {reason}',
                'suggestions': [
                    f"Verify {symbol} is a valid ticker",
                    "Try the full company name",
                    "Data may not be available for this stock"
                ]
            }

    async def _get_company_summary(self, symbol: str, original_query: str = None) -> Dict:
        """Get a comprehensive company summary"""
        company_data = await self._get_company_data(symbol)
        if not company_data:
            # Try LLM fallback when no data found
            return await self._llm_fallback_response(
                symbol,
                original_query or f"Tell me about {symbol}",
                "No data found in database for this company."
            )

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

    async def _get_specific_metrics(self, symbol: str, metric_keys: List[str], original_query: str = None) -> Dict:
        """Get specific requested metrics"""
        company_data = await self._get_company_data(symbol)
        if not company_data:
            # Try LLM fallback when no data found
            metrics_str = ', '.join(metric_keys) if metric_keys else 'company data'
            return await self._llm_fallback_response(
                symbol,
                original_query or f"What is the {metrics_str} of {symbol}?",
                "No data found in database for this company."
            )

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
        """Get company data with optimized queries for speed"""
        if not self.db:
            return None

        # Fast query - get company and metrics only (avoiding slow JOINs)
        sql = """
            SELECT
                c.symbol, c.name, c.sector, c.industry, c.description,
                c.market_cap,
                m.pe_ratio, m.pb_ratio, m.ps_ratio, m.ev_ebitda,
                m.gross_margin, m.operating_margin, m.net_margin,
                m.roe, m.roa, m.roic,
                m.revenue_growth_yoy, m.earnings_growth_yoy as eps_growth_yoy,
                m.debt_to_equity, m.current_ratio, m.interest_coverage,
                m.dividend_yield,
                m.fcf as free_cash_flow
            FROM companies c
            LEFT JOIN calculated_metrics m ON c.id = m.company_id
            WHERE c.symbol = ? AND c.is_active = 1
            ORDER BY m.fiscal_period DESC
            LIMIT 1
        """

        try:
            result = self.db.execute(sql, [symbol]).fetchone()
            if not result:
                return None

            columns = [
                'symbol', 'name', 'sector', 'industry', 'description',
                'market_cap',
                'pe_ratio', 'pb_ratio', 'ps_ratio', 'ev_ebitda',
                'gross_margin', 'operating_margin', 'net_margin',
                'roe', 'roa', 'roic',
                'revenue_growth_yoy', 'eps_growth_yoy',
                'debt_to_equity', 'current_ratio', 'interest_coverage',
                'dividend_yield',
                'free_cash_flow'
            ]
            data = dict(zip(columns, result))
            return data

        except Exception as e:
            logger.error(f"Failed to get company data for {symbol}: {e}")
            return None

    def _compute_derived_metrics(self, data: Dict) -> Dict:
        """Compute NOPAT, EBIT, EBITDA from raw financial data"""
        try:
            operating_income = data.get('operating_income')
            net_income = data.get('net_income')
            depreciation = data.get('depreciation_amortization') or 0

            # EBIT = Operating Income (earnings before interest and tax)
            if operating_income is not None:
                data['ebit'] = operating_income

            # EBITDA = EBIT + Depreciation & Amortization
            if operating_income is not None:
                data['ebitda'] = operating_income + depreciation

            # NOPAT = Operating Income * (1 - Tax Rate)
            # Estimate tax rate from net income / pre-tax income if available
            if operating_income is not None and net_income is not None:
                # Approximate tax rate (assume ~21% if we can't calculate)
                # More accurate would be to get income_tax_expense from financials
                tax_rate = 0.21  # Default US corporate tax rate
                data['nopat'] = operating_income * (1 - tax_rate)

            # Beta - try to get from calculated_metrics or estimate
            if data.get('beta') is None:
                # Default market beta of 1.0 if not available
                data['beta'] = None  # Will show N/A if not in DB

        except Exception as e:
            logger.warning(f"Error computing derived metrics: {e}")

        return data

    def _format_value(self, value: any, format_type: str) -> str:
        """Format a value for display"""
        if value is None:
            return 'N/A'

        if format_type == 'ratio':
            return f"{value:.2f}x"
        elif format_type == 'percent':
            # Value is stored as decimal (0.38 = 38%)
            return f"{value * 100:.2f}%"
        elif format_type == 'percent_raw':
            # Value is already stored as percentage (46.9 = 46.9%)
            return f"{value:.2f}%"
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
