# src/services/nl/response_enhancer.py
"""
Response enhancer for natural language query results.
Uses LLM to generate human-friendly explanations and insights.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class ResponseEnhancer:
    """
    Enhances structured query results with LLM-generated insights.

    Adds natural language explanations to make results more
    understandable and actionable for users.
    """

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
                temperature=0.7
            )

            if response and response.content:
                return response.content.strip()

            return None

        except Exception as e:
            logger.warning(f"LLM call failed: {e}")
            return None
