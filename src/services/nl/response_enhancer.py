# src/services/nl/response_enhancer.py
"""
Response enhancer for natural language query results.
Uses LLM to generate human-friendly explanations and insights.

Enhanced with:
- Fast summary generation (3s timeout)
- Fallback templates for instant responses
- Haiku model for speed
"""

import logging
import json
import asyncio
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# Fallback templates for when LLM is slow or unavailable
FALLBACK_TEMPLATES = {
    'lookup': "{symbol} has a P/E of {pe_ratio}x, market cap of {market_cap}, and {summary_metric}.",
    'compare': "{leader} leads in {leader_wins}/{total_metrics} metrics compared to {other_companies}.",
    'screen': "Found {count} stocks matching your criteria. Top matches: {top_stocks}.",
    'historical': "{symbol}'s {metric} has changed {direction} by {change_pct}% over the period.",
    'similarity': "Found {count} stocks similar to {symbol}. Top match: {top_match} ({similarity}% similarity).",
    'driver': "{symbol}'s performance is primarily driven by {top_driver}.",
    'portfolio': "Your portfolio contains {count} positions with {summary}.",
    'investor': "{investor}'s portfolio has {count} positions. Top holdings: {top_holdings}.",
    'sentiment': "{symbol} sentiment is {signal} ({score}) based on {sources}.",
    'technical': "{symbol} is showing {signal} signals. RSI: {rsi}, MACD: {macd_signal}.",
    'calculation': "At {multiple}x {metric_name}, {symbol} would be worth ${target_price} ({change}% from current).",
    'explanation': "Based on the data, {explanation_summary}.",
}


class ResponseEnhancer:
    """
    Enhances structured query results with LLM-generated insights.

    Adds natural language explanations to make results more
    understandable and actionable for users.

    Features:
    - Parallel LLM calls with 3-second timeout
    - Template-based fallbacks for instant responses
    - Uses fast model (Haiku) for summaries
    """

    # Timeout for LLM summary generation (in seconds)
    SUMMARY_TIMEOUT = 3.0

    def __init__(self, router=None):
        """
        Args:
            router: LLM router for generating insights
        """
        self.router = router

    async def enhance(self, result: Dict, intent: str, query: str) -> Dict:
        """
        Enhance a query result with LLM-generated insights.

        Args:
            result: The raw result dictionary
            intent: Query intent type
            query: Original user query

        Returns:
            Enhanced result with 'llm_insight' added
        """
        if not self.router:
            # No LLM available, return unchanged
            return result

        try:
            insight = await self._generate_insight(result, intent, query)
            if insight:
                result['llm_insight'] = insight
            return result

        except Exception as e:
            logger.warning(f"Failed to enhance response: {e}")
            return result

    async def _generate_insight(
        self,
        result: Dict,
        intent: str,
        query: str
    ) -> Optional[str]:
        """Generate LLM insight based on result type"""

        # Build prompt based on intent
        if intent == 'lookup' or intent == 'metric_lookup':
            return await self._insight_for_lookup(result, query)
        elif intent == 'compare':
            return await self._insight_for_comparison(result, query)
        elif intent == 'screen':
            return await self._insight_for_screening(result, query)
        elif intent == 'similarity':
            return await self._insight_for_similarity(result, query)
        elif intent == 'driver':
            return await self._insight_for_driver(result, query)
        elif intent == 'historical':
            return await self._insight_for_historical(result, query)

        return None

    async def _insight_for_lookup(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for metric lookup"""
        if result.get('type') == 'error':
            return None

        symbol = result.get('symbol', '')
        metrics = result.get('metrics', [])

        if not metrics:
            return None

        # Build context string
        metrics_text = "\n".join([
            f"- {m['display_name']}: {m['formatted_value']}"
            + (f" ({m['context']})" if m.get('context') else "")
            for m in metrics[:5]
        ])

        prompt = f"""Provide a brief 1-2 sentence investment insight about {symbol} based on these metrics:

{metrics_text}

User asked: "{query}"

Be specific and actionable. Don't repeat the numbers, interpret them:"""

        return await self._call_llm(prompt, max_tokens=150)

    async def _insight_for_comparison(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for company comparison"""
        companies = result.get('companies', [])
        comparisons = result.get('comparisons', [])
        assessment = result.get('overall_assessment', {})

        if not companies or not comparisons:
            return None

        # Build comparison summary
        symbols = [c.get('symbol') for c in companies]
        leader = assessment.get('leader', symbols[0] if symbols else '')
        wins = assessment.get('leader_wins', 0)
        total = assessment.get('total_metrics_compared', 0)

        prompt = f"""Summarize this investment comparison in 2-3 sentences:

Companies: {', '.join(symbols)}
Leader: {leader} (won {wins}/{total} metrics)
Key differences: {', '.join([c['display_name'] + ': ' + c.get('winner', 'tie') for c in comparisons[:3]])}

User asked: "{query}"

Provide actionable insight about which might be the better investment and why:"""

        return await self._call_llm(prompt, max_tokens=200)

    async def _insight_for_screening(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for screening results"""
        count = result.get('results_count', 0)
        filters = result.get('filters_applied', [])
        stocks = result.get('results', [])[:5]

        if count == 0:
            return "No stocks matched your criteria. Try relaxing your filters."

        # Build summary
        top_stocks = ", ".join([s.get('symbol', '') for s in stocks])

        prompt = f"""Provide a 1-2 sentence insight about these screening results:

Filters: {', '.join(filters) if filters else 'None specified'}
Results: {count} stocks found
Top matches: {top_stocks}

User asked: "{query}"

Comment on the quality of matches or notable patterns:"""

        return await self._call_llm(prompt, max_tokens=150)

    async def _insight_for_similarity(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for similarity search"""
        target = result.get('target_symbol', '')
        similar = result.get('similar_stocks', [])[:3]

        if not similar:
            return None

        matches = "\n".join([
            f"- {s['symbol']}: {s['similarity_score']*100:.0f}% match"
            for s in similar
        ])

        prompt = f"""Briefly explain why these stocks are similar to {target}:

{matches}

User asked: "{query}"

Focus on the key characteristics they share in 1-2 sentences:"""

        return await self._call_llm(prompt, max_tokens=150)

    async def _insight_for_driver(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for driver analysis"""
        symbol = result.get('symbol', '')
        drivers = result.get('drivers', [])

        if not drivers:
            return None

        driver_text = "\n".join([
            f"- {d['name']}: {d['impact']} impact"
            for d in drivers[:3]
        ])

        prompt = f"""Explain what's driving {symbol}'s performance based on these factors:

{driver_text}

User asked: "{query}"

Provide actionable insight in 2 sentences:"""

        return await self._call_llm(prompt, max_tokens=200)

    async def _insight_for_historical(self, result: Dict, query: str) -> Optional[str]:
        """Generate insight for historical analysis"""
        symbol = result.get('symbol', '')
        summary = result.get('summary', '')
        metrics = result.get('metrics', [])

        if not metrics:
            return summary or None

        changes = "\n".join([
            f"- {m['display_name']}: {m['change_summary']['percent_change']:+.1f}%"
            for m in metrics if m.get('change_summary', {}).get('percent_change')
        ][:4])

        prompt = f"""Analyze {symbol}'s historical performance:

{changes}

User asked: "{query}"

What does this trend suggest for investors? 1-2 sentences:"""

        return await self._call_llm(prompt, max_tokens=150)

    async def _call_llm(self, prompt: str, max_tokens: int = 200) -> Optional[str]:
        """Call the LLM router"""
        try:
            from ..ai.llm.base import TaskType

            response = self.router.route(
                TaskType.SUMMARIZATION,
                prompt=prompt,
                temperature=0.7,
                max_tokens=max_tokens
            )

            if response and response.content:
                return response.content.strip()

            return None

        except Exception as e:
            logger.warning(f"LLM call failed: {e}")
            return None

    async def generate_summary(self, result: Dict, intent: str, query: str) -> str:
        """
        Generate a brief natural language summary with timeout.

        Uses LLM if available with a 3-second timeout, falls back to
        template-based summaries for instant response.

        Args:
            result: The query result data
            intent: Query intent type
            query: Original user query

        Returns:
            A human-readable summary string
        """
        # First, try LLM with timeout
        if self.router:
            try:
                summary = await asyncio.wait_for(
                    self._generate_llm_summary(result, intent, query),
                    timeout=self.SUMMARY_TIMEOUT
                )
                if summary:
                    return summary
            except asyncio.TimeoutError:
                logger.debug(f"LLM summary timed out after {self.SUMMARY_TIMEOUT}s, using fallback")
            except Exception as e:
                logger.warning(f"LLM summary failed: {e}")

        # Fallback to template-based summary
        return self._generate_fallback_summary(result, intent)

    async def _generate_llm_summary(self, result: Dict, intent: str, query: str) -> Optional[str]:
        """Generate summary using LLM (fast, short prompt)"""
        if not self.router:
            return None

        try:
            from ..ai.llm.base import TaskType

            # Build a compact data representation (max 500 chars)
            data_summary = self._compact_result(result, max_chars=500)

            prompt = f"""Summarize this {intent} result in 1-2 sentences. Be specific and actionable.

Query: {query}
Data: {data_summary}

Summary:"""

            response = self.router.route(
                TaskType.CHAT,  # Use CHAT for speed (lighter model)
                prompt=prompt,
                temperature=0.3,
                max_tokens=100  # Keep it short
            )

            if response and response.content:
                return response.content.strip()

            return None

        except Exception as e:
            logger.warning(f"LLM summary generation failed: {e}")
            return None

    def _compact_result(self, result: Dict, max_chars: int = 500) -> str:
        """Create a compact string representation of result for LLM"""
        # Extract key information based on result type
        compact = {}

        result_type = result.get('type', '')

        if 'symbol' in result:
            compact['symbol'] = result['symbol']

        if 'metrics' in result:
            # Take first 5 metrics
            metrics = result['metrics'][:5] if isinstance(result['metrics'], list) else []
            compact['metrics'] = [
                f"{m.get('display_name', m.get('metric', 'unknown'))}: {m.get('formatted_value', m.get('value', 'N/A'))}"
                for m in metrics
            ]

        if 'companies' in result:
            compact['companies'] = [c.get('symbol', '') for c in result.get('companies', [])[:5]]

        if 'overall_assessment' in result:
            assessment = result['overall_assessment']
            compact['leader'] = assessment.get('leader', '')
            compact['leader_wins'] = assessment.get('leader_wins', 0)
            compact['total'] = assessment.get('total_metrics_compared', 0)

        if 'results' in result:
            results = result['results'][:5] if isinstance(result['results'], list) else []
            compact['top_results'] = [r.get('symbol', '') for r in results]
            compact['count'] = result.get('results_count', len(results))

        if 'similar_stocks' in result:
            similar = result['similar_stocks'][:3]
            compact['similar'] = [
                f"{s.get('symbol')}: {s.get('similarity_score', 0)*100:.0f}%"
                for s in similar
            ]

        if 'holdings' in result:
            holdings = result['holdings'][:5] if isinstance(result['holdings'], list) else []
            compact['top_holdings'] = [h.get('symbol', '') for h in holdings]
            compact['total_holdings'] = result.get('total_holdings', len(holdings))

        # Convert to JSON string and truncate if needed
        json_str = json.dumps(compact, default=str)
        if len(json_str) > max_chars:
            json_str = json_str[:max_chars-3] + '...'

        return json_str

    def _generate_fallback_summary(self, result: Dict, intent: str) -> str:
        """
        Generate a template-based summary when LLM is unavailable or slow.

        Provides instant, guaranteed response for any query type.
        """
        template = FALLBACK_TEMPLATES.get(intent, "Results for your query are shown below.")

        try:
            # Build template variables based on intent
            variables = self._extract_template_variables(result, intent)
            return template.format(**variables)
        except (KeyError, ValueError) as e:
            logger.debug(f"Template formatting failed for {intent}: {e}")
            # Return a generic fallback
            return self._generic_fallback(result, intent)

    def _extract_template_variables(self, result: Dict, intent: str) -> Dict:
        """Extract variables for template formatting based on intent"""
        variables = {}

        if intent == 'lookup':
            variables['symbol'] = result.get('symbol', 'Stock')
            metrics = result.get('metrics', [])
            pe_metric = next((m for m in metrics if 'pe' in m.get('metric', '').lower()), None)
            variables['pe_ratio'] = pe_metric.get('formatted_value', 'N/A').replace('x', '') if pe_metric else 'N/A'

            market_cap_metric = next((m for m in metrics if 'market_cap' in m.get('metric', '').lower()), None)
            variables['market_cap'] = market_cap_metric.get('formatted_value', 'N/A') if market_cap_metric else 'N/A'

            # Find an interesting summary metric
            summary_metric = next((m for m in metrics if m.get('metric') in ['roe', 'revenue_growth_yoy', 'net_margin']), None)
            if summary_metric:
                variables['summary_metric'] = f"{summary_metric.get('display_name', '')}: {summary_metric.get('formatted_value', 'N/A')}"
            else:
                variables['summary_metric'] = f"{len(metrics)} metrics available"

        elif intent == 'compare':
            assessment = result.get('overall_assessment', {})
            variables['leader'] = assessment.get('leader', 'Unknown')
            variables['leader_wins'] = assessment.get('leader_wins', 0)
            variables['total_metrics'] = assessment.get('total_metrics_compared', 0)
            companies = result.get('companies', [])
            other = [c.get('symbol') for c in companies if c.get('symbol') != variables['leader']]
            variables['other_companies'] = ', '.join(other[:2]) if other else 'others'

        elif intent == 'screen':
            variables['count'] = result.get('results_count', 0)
            results = result.get('results', [])[:5]
            variables['top_stocks'] = ', '.join([r.get('symbol', '') for r in results]) if results else 'none'

        elif intent == 'historical':
            variables['symbol'] = result.get('symbol', 'Stock')
            metrics = result.get('metrics', [])
            if metrics:
                first_metric = metrics[0]
                change_summary = first_metric.get('change_summary', {})
                variables['metric'] = first_metric.get('display_name', 'metric')
                pct_change = change_summary.get('percent_change', 0)
                variables['direction'] = 'up' if pct_change > 0 else 'down'
                variables['change_pct'] = f"{abs(pct_change):.1f}"
            else:
                variables['metric'] = 'key metrics'
                variables['direction'] = 'changed'
                variables['change_pct'] = 'N/A'

        elif intent == 'similarity':
            variables['symbol'] = result.get('target_symbol', 'Stock')
            similar = result.get('similar_stocks', [])
            variables['count'] = len(similar)
            if similar:
                top = similar[0]
                variables['top_match'] = top.get('symbol', 'Unknown')
                variables['similarity'] = f"{top.get('similarity_score', 0)*100:.0f}"
            else:
                variables['top_match'] = 'none found'
                variables['similarity'] = '0'

        elif intent == 'driver':
            variables['symbol'] = result.get('symbol', 'Stock')
            drivers = result.get('drivers', [])
            if drivers:
                variables['top_driver'] = drivers[0].get('name', 'unknown factors')
            else:
                variables['top_driver'] = 'various factors'

        elif intent == 'portfolio':
            variables['count'] = result.get('total_positions', 0)
            variables['summary'] = result.get('summary', 'multiple assets')

        elif intent == 'investor':
            variables['investor'] = result.get('investor_name', result.get('investor', 'Investor'))
            variables['count'] = result.get('total_holdings', 0)
            holdings = result.get('holdings', [])[:3]
            variables['top_holdings'] = ', '.join([h.get('symbol', '') for h in holdings]) if holdings else 'various stocks'

        elif intent == 'sentiment':
            variables['symbol'] = result.get('symbol', 'Stock')
            variables['signal'] = result.get('overall_signal', 'neutral')
            variables['score'] = result.get('sentiment_score', 'N/A')
            variables['sources'] = ', '.join(result.get('sources', ['social media']))

        elif intent == 'technical':
            variables['symbol'] = result.get('symbol', 'Stock')
            indicators = result.get('indicators', {})
            variables['signal'] = result.get('overall_signal', 'mixed')
            variables['rsi'] = indicators.get('rsi', {}).get('value', 'N/A')
            variables['macd_signal'] = indicators.get('macd', {}).get('interpretation', 'neutral')

        elif intent == 'calculation' or intent == 'calculation_result':
            inputs = result.get('inputs', {})
            calc_result = result.get('result', {})
            variables['symbol'] = result.get('symbol', 'Stock')
            variables['multiple'] = inputs.get('target_pe', inputs.get('target_multiple', 'N/A'))
            variables['metric_name'] = 'earnings' if 'pe' in result.get('calculation', '') else 'multiple'
            variables['target_price'] = calc_result.get('target_price', 'N/A')
            variables['change'] = calc_result.get('change_percent', 'N/A')

        elif intent == 'explanation':
            variables['explanation_summary'] = result.get('explanation', 'analysis is provided below')[:100]

        return variables

    def _generic_fallback(self, result: Dict, intent: str) -> str:
        """Generate a very generic fallback when template formatting fails"""
        symbol = result.get('symbol', '')
        result_type = result.get('type', intent)

        if symbol:
            return f"Results for {symbol} ({result_type}) are shown below."
        elif result.get('results_count', 0) > 0:
            return f"Found {result['results_count']} results matching your query."
        else:
            return f"Results for your {result_type} query are shown below."
