# src/services/ai/knowledge/advanced/query_expander.py

"""
Query Expansion for improved retrieval.

Expands user queries with:
- Synonyms and related terms
- Investment-specific terminology
- Context-aware additions
"""

import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class QueryExpander:
    """
    Expand queries with related terms for better retrieval.

    Uses both:
    - Static synonym/term mappings
    - LLM-based expansion (when router available)
    """

    # Investment term synonyms and related concepts
    TERM_EXPANSIONS = {
        # Valuation terms
        'cheap': ['undervalued', 'low valuation', 'discount to intrinsic value', 'margin of safety'],
        'expensive': ['overvalued', 'high valuation', 'premium', 'priced for perfection'],
        'value': ['intrinsic value', 'margin of safety', 'fundamental value', 'worth'],
        'fair value': ['intrinsic value', 'fundamental value', 'discounted cash flow'],
        'dcf': ['discounted cash flow', 'intrinsic value', 'cash flow valuation'],
        'pe ratio': ['price to earnings', 'earnings multiple', 'valuation multiple'],

        # Competitive advantage terms
        'moat': ['competitive advantage', 'economic moat', 'durable advantage', 'barrier to entry'],
        'competitive advantage': ['moat', 'barrier to entry', 'sustainable edge', 'defensibility'],
        'network effects': ['network effect', 'network economics', 'platform dynamics'],
        'switching costs': ['lock-in', 'customer retention', 'stickiness'],
        'brand': ['brand power', 'brand loyalty', 'brand equity', 'pricing power'],

        # Risk terms
        'risk': ['downside', 'uncertainty', 'volatility', 'potential loss'],
        'downside': ['risk', 'potential loss', 'worst case', 'margin of safety'],
        'leverage': ['debt', 'borrowing', 'financial leverage', 'balance sheet risk'],
        'black swan': ['tail risk', 'fat tails', 'extreme events', 'uncertainty'],

        # Psychology terms
        'bias': ['cognitive bias', 'behavioral bias', 'mental error', 'misjudgment'],
        'fear': ['panic', 'pessimism', 'capitulation', 'market fear'],
        'greed': ['euphoria', 'optimism', 'bubble', 'market exuberance'],
        'psychology': ['behavioral finance', 'investor psychology', 'sentiment', 'emotion'],

        # Cycle terms
        'cycle': ['market cycle', 'economic cycle', 'business cycle', 'pendulum'],
        'bubble': ['mania', 'euphoria', 'speculative excess', 'overvaluation'],
        'crash': ['panic', 'bear market', 'capitulation', 'market decline'],
        'recession': ['economic downturn', 'contraction', 'bear market'],

        # Quality terms
        'quality': ['high quality business', 'wonderful business', 'great company'],
        'compounding': ['compound growth', 'compounding machine', 'geometric growth'],
        'roe': ['return on equity', 'profitability', 'capital efficiency'],
        'roic': ['return on invested capital', 'capital efficiency', 'reinvestment'],

        # Management terms
        'management': ['leadership', 'executives', 'capital allocation', 'governance'],
        'capital allocation': ['reinvestment', 'buybacks', 'dividends', 'acquisitions'],
        'insider': ['insider ownership', 'skin in the game', 'management alignment'],

        # Strategy terms
        'contrarian': ['against the crowd', 'variant perception', 'non-consensus'],
        'value investing': ['fundamental investing', 'intrinsic value', 'margin of safety'],
        'growth investing': ['growth stocks', 'high growth', 'expansion'],
    }

    # Analyst-specific term additions
    ANALYST_TERMS = {
        'value': ['margin of safety', 'intrinsic value', 'discount', 'patience'],
        'growth': ['scalability', 'runway', 'TAM', 'market expansion'],
        'contrarian': ['sentiment', 'crowd psychology', 'variant perception'],
        'quant': ['factors', 'systematic', 'statistical', 'backtesting'],
        'risk': ['tail risk', 'fragility', 'antifragility', 'optionality'],
    }

    def __init__(self, router=None):
        """
        Args:
            router: Optional LLM router for advanced expansion
        """
        self.router = router

    def expand(self,
               query: str,
               style: str = None,
               analyst: str = None,
               max_expansions: int = 3) -> List[str]:
        """
        Expand query with related terms.

        Args:
            query: Original query
            style: Investment style (value, growth, etc.)
            analyst: Analyst type for context
            max_expansions: Max number of expanded queries

        Returns:
            List of expanded queries
        """
        expanded = []
        query_lower = query.lower()

        # Find matching terms and add expansions
        additions = set()

        for term, expansions in self.TERM_EXPANSIONS.items():
            if term in query_lower:
                # Add 1-2 related terms
                additions.update(expansions[:2])

        # Add analyst-specific terms
        analyst_key = analyst or style
        if analyst_key and analyst_key in self.ANALYST_TERMS:
            additions.update(self.ANALYST_TERMS[analyst_key][:2])

        # Create expanded queries
        if additions:
            # Query + top additions
            additions_list = list(additions)[:4]
            expanded.append(f"{query} {' '.join(additions_list[:2])}")

            if len(additions_list) > 2:
                expanded.append(f"{query} {' '.join(additions_list[2:4])}")

        # Add a conceptual variation
        conceptual = self._create_conceptual_query(query, style)
        if conceptual:
            expanded.append(conceptual)

        return expanded[:max_expansions]

    def _create_conceptual_query(self, query: str, style: str = None) -> Optional[str]:
        """Create a conceptually related query"""
        query_lower = query.lower()

        # Conceptual mappings
        conceptual_maps = {
            'when to buy': 'margin of safety entry point patience',
            'when to sell': 'exit strategy sell discipline',
            'how to value': 'valuation intrinsic value DCF',
            'is it cheap': 'valuation margin of safety price vs value',
            'is it risky': 'risk assessment downside protection',
            'good investment': 'quality business competitive advantage moat',
            'should i invest': 'investment criteria checklist due diligence',
        }

        for pattern, expansion in conceptual_maps.items():
            if pattern in query_lower:
                return expansion

        return None

    async def expand_with_llm(self,
                              query: str,
                              context: str = None) -> List[str]:
        """
        Use LLM for advanced query expansion.

        Only available when router is configured.
        """
        if not self.router:
            return []

        prompt = f"""Generate 2-3 alternative search queries that would find relevant investment wisdom for this question.

Original query: "{query}"
{f"Context: {context}" if context else ""}

Focus on investment concepts, principles, and mental models.
Return only the queries, one per line, no numbering.
"""

        try:
            # This would call the LLM router
            # For now, return empty since we don't have router implementation
            return []
        except Exception as e:
            logger.warning(f"LLM expansion failed: {e}")
            return []

    def get_related_terms(self, term: str) -> List[str]:
        """Get terms related to a given term"""
        term_lower = term.lower()

        # Direct lookup
        if term_lower in self.TERM_EXPANSIONS:
            return self.TERM_EXPANSIONS[term_lower]

        # Partial match
        for key, expansions in self.TERM_EXPANSIONS.items():
            if term_lower in key or key in term_lower:
                return expansions

        return []
