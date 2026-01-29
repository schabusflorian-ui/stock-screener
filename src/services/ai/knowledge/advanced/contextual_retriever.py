# src/services/ai/knowledge/advanced/contextual_retriever.py

"""
Context-aware knowledge retrieval.

Considers:
- User's investment style and preferences
- Current conversation and query intent
- Company being analyzed
- Analyst persona making the request

This makes retrieval much more relevant than pure semantic search.
"""

import logging
from typing import List, Dict, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class UserContext:
    """Context about the user for personalized retrieval"""
    user_id: Optional[int] = None
    investment_style: Optional[str] = None  # 'value', 'growth', 'contrarian', 'quant'
    risk_tolerance: Optional[str] = None    # 'conservative', 'moderate', 'aggressive'
    experience_level: Optional[str] = None  # 'beginner', 'intermediate', 'advanced'
    interests: List[str] = field(default_factory=list)  # Topics they care about
    portfolio_symbols: List[str] = field(default_factory=list)  # What they own
    favorite_authors: List[str] = field(default_factory=list)  # Preferred sources


@dataclass
class QueryContext:
    """Context about the current query/conversation"""
    original_query: str
    conversation_history: List[Dict] = field(default_factory=list)
    current_symbol: Optional[str] = None
    current_company_data: Optional[Dict] = None
    analyst_type: Optional[str] = None  # Which analyst is asking


@dataclass
class RetrievalResult:
    """Enhanced retrieval result with context"""
    content: str
    source: str
    author: str
    relevance_score: float
    context_score: float  # How relevant to user's context
    topics: List[str]
    citation: str
    metadata: Dict
    chunk_id: Optional[str] = None

    @property
    def combined_score(self) -> float:
        """Combined relevance and context score"""
        return (self.relevance_score + self.context_score) / 2


class ContextualRetriever:
    """
    Context-aware knowledge retrieval.

    Enhances basic retrieval with:
    - User preference awareness
    - Company situation detection
    - Analyst-specific topic weighting
    - Query expansion
    """

    # Topic relevance by investment style
    STYLE_TOPIC_WEIGHTS = {
        'value': {
            'valuation': 2.0, 'moats': 1.8, 'risk': 1.5,
            'quality': 1.5, 'management': 1.3, 'margin_of_safety': 2.0,
            'growth': 0.8, 'momentum': 0.5
        },
        'growth': {
            'growth': 2.0, 'moats': 1.8, 'quality': 1.5,
            'management': 1.3, 'valuation': 1.0,
            'dividends': 0.5, 'contrarian': 0.7
        },
        'contrarian': {
            'contrarian': 2.0, 'cycles': 1.8, 'psychology': 1.8,
            'risk': 1.5, 'valuation': 1.3, 'sentiment': 1.8,
            'momentum': 0.5
        },
        'quant': {
            'valuation': 1.5, 'quality': 1.5, 'momentum': 1.3,
            'risk': 1.5, 'statistics': 1.8, 'factors': 2.0
        },
        'risk': {
            'risk': 2.0, 'tail_risk': 2.0, 'antifragility': 1.8,
            'optionality': 1.5, 'uncertainty': 1.8,
            'psychology': 1.3, 'cycles': 1.3
        }
    }

    # Company situation to topic mapping
    SITUATION_TOPICS = {
        'high_pe': ['growth', 'valuation', 'quality', 'paying_up'],
        'low_pe': ['value_traps', 'valuation', 'contrarian', 'margin_of_safety'],
        'high_debt': ['risk', 'balance_sheet', 'distress', 'leverage'],
        'declining_revenue': ['turnaround', 'contrarian', 'risk', 'secular_decline'],
        'high_growth': ['growth', 'moats', 'valuation', 'runway'],
        'dividend_payer': ['dividends', 'quality', 'income', 'stability'],
        'insider_buying': ['management', 'skin_in_the_game', 'alignment'],
        'insider_selling': ['management', 'risk', 'red_flags'],
        'high_roe': ['quality', 'moats', 'compounding'],
        'low_roe': ['turnaround', 'capital_intensive', 'commodity'],
        'high_margin': ['pricing_power', 'moats', 'quality'],
        'low_margin': ['cost_leadership', 'scale', 'commodity']
    }

    def __init__(self,
                 base_retriever,
                 query_expander=None,
                 hybrid_searcher=None):
        """
        Args:
            base_retriever: KnowledgeRetriever instance
            query_expander: Optional QueryExpander for query enhancement
            hybrid_searcher: Optional HybridSearcher for combined search
        """
        self.base_retriever = base_retriever
        self.query_expander = query_expander
        self.hybrid_searcher = hybrid_searcher

    def retrieve(self,
                 query: str,
                 user_context: UserContext = None,
                 query_context: QueryContext = None,
                 top_k: int = 5) -> List[RetrievalResult]:
        """
        Retrieve knowledge with full context awareness.

        Args:
            query: The search query
            user_context: Information about the user
            query_context: Information about current conversation
            top_k: Number of results to return

        Returns:
            List of contextually relevant results
        """
        # Step 1: Expand query based on context
        expanded_queries = self._expand_query(query, user_context, query_context)

        # Step 2: Determine topic weights
        topic_weights = self._calculate_topic_weights(user_context, query_context)

        # Step 3: Retrieve from multiple queries
        all_results = []
        seen_ids = set()

        for expanded_query in expanded_queries:
            # Use hybrid search if available, otherwise base retriever
            if self.hybrid_searcher:
                results = self.hybrid_searcher.search(
                    expanded_query,
                    top_k=top_k * 2
                )
            else:
                results = self.base_retriever.retrieve(
                    query=expanded_query,
                    top_k=top_k * 2
                )

            for r in results:
                doc_id = r.get('id', id(r))
                if doc_id not in seen_ids:
                    seen_ids.add(doc_id)
                    all_results.append(r)

        # Step 4: Score with context
        scored_results = self._score_with_context(
            all_results, topic_weights, user_context, query_context
        )

        # Step 5: Convert to RetrievalResult
        final_results = []
        for r in scored_results[:top_k]:
            metadata = r.get('metadata', {})
            final_results.append(RetrievalResult(
                content=r.get('content', ''),
                source=metadata.get('source', 'Unknown'),
                author=metadata.get('author', 'Unknown'),
                relevance_score=r.get('similarity', r.get('combined_score', 0)),
                context_score=r.get('context_score', 0),
                topics=metadata.get('topics', []),
                citation=self._build_citation(r),
                metadata=metadata,
                chunk_id=str(r.get('id', ''))
            ))

        return final_results

    def retrieve_for_analysis(self,
                              company_data: Dict,
                              analyst_type: str,
                              user_question: str = None,
                              user_context: UserContext = None) -> List[RetrievalResult]:
        """
        Specialized retrieval for company analysis.

        Automatically detects company situation and retrieves relevant wisdom.
        """
        # Detect company situation
        situations = self._detect_company_situations(company_data)

        # Build query context
        query_context = QueryContext(
            original_query=user_question or f"Analysis of {company_data.get('symbol', 'company')}",
            current_symbol=company_data.get('symbol'),
            current_company_data=company_data,
            analyst_type=analyst_type
        )

        # Build contextual query
        query_parts = [user_question] if user_question else []

        # Add situation-based query terms
        for situation in situations:
            topics = self.SITUATION_TOPICS.get(situation, [])
            query_parts.extend(topics[:2])

        # Add analyst-relevant terms
        if analyst_type in self.STYLE_TOPIC_WEIGHTS:
            top_topics = sorted(
                self.STYLE_TOPIC_WEIGHTS[analyst_type].items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]
            query_parts.extend([t[0] for t in top_topics])

        query = " ".join(set(query_parts))  # Dedupe

        return self.retrieve(
            query=query,
            user_context=user_context,
            query_context=query_context,
            top_k=5
        )

    def _expand_query(self,
                      query: str,
                      user_context: UserContext,
                      query_context: QueryContext) -> List[str]:
        """Expand query into multiple related queries"""
        queries = [query]

        if self.query_expander:
            style = None
            analyst = None

            if query_context:
                analyst = query_context.analyst_type
            if user_context:
                style = user_context.investment_style

            expanded = self.query_expander.expand(
                query=query,
                style=style,
                analyst=analyst
            )
            queries.extend(expanded)

        return queries[:4]  # Limit to 4 queries

    def _calculate_topic_weights(self,
                                 user_context: UserContext,
                                 query_context: QueryContext) -> Dict[str, float]:
        """Calculate topic weights based on context"""
        weights = {}

        # Base weights from investment style/analyst type
        style = None
        if query_context and query_context.analyst_type:
            style = query_context.analyst_type
        elif user_context and user_context.investment_style:
            style = user_context.investment_style

        if style and style in self.STYLE_TOPIC_WEIGHTS:
            weights = self.STYLE_TOPIC_WEIGHTS[style].copy()

        # Boost based on user interests
        if user_context and user_context.interests:
            for interest in user_context.interests:
                interest_lower = interest.lower().replace(' ', '_')
                if interest_lower in weights:
                    weights[interest_lower] *= 1.5
                else:
                    weights[interest_lower] = 1.5

        # Boost based on company situation
        if query_context and query_context.current_company_data:
            situations = self._detect_company_situations(
                query_context.current_company_data
            )
            for situation in situations:
                for topic in self.SITUATION_TOPICS.get(situation, []):
                    if topic in weights:
                        weights[topic] *= 1.3
                    else:
                        weights[topic] = 1.3

        return weights

    def _detect_company_situations(self, company_data: Dict) -> List[str]:
        """Detect relevant situations from company data"""
        situations = []
        metrics = company_data.get('metrics', company_data)

        # Valuation situations
        pe = metrics.get('pe_ratio') or metrics.get('pe')
        if pe:
            try:
                pe_val = float(pe)
                if pe_val > 30:
                    situations.append('high_pe')
                elif 0 < pe_val < 12:
                    situations.append('low_pe')
            except (ValueError, TypeError):
                pass

        # Growth situations
        rev_growth = metrics.get('revenue_growth')
        if rev_growth:
            try:
                growth_val = float(rev_growth)
                if growth_val > 0.2:
                    situations.append('high_growth')
                elif growth_val < -0.1:
                    situations.append('declining_revenue')
            except (ValueError, TypeError):
                pass

        # Profitability
        roe = metrics.get('roe') or metrics.get('return_on_equity')
        if roe:
            try:
                roe_val = float(roe)
                if roe_val > 0.20:
                    situations.append('high_roe')
                elif roe_val < 0.08:
                    situations.append('low_roe')
            except (ValueError, TypeError):
                pass

        # Margins
        margin = metrics.get('profit_margin') or metrics.get('operating_margin')
        if margin:
            try:
                margin_val = float(margin)
                if margin_val > 0.20:
                    situations.append('high_margin')
                elif margin_val < 0.05:
                    situations.append('low_margin')
            except (ValueError, TypeError):
                pass

        # Balance sheet
        debt_equity = metrics.get('debt_to_equity')
        if debt_equity:
            try:
                de_val = float(debt_equity)
                if de_val > 1.5:
                    situations.append('high_debt')
            except (ValueError, TypeError):
                pass

        # Dividend
        div_yield = metrics.get('dividend_yield')
        if div_yield:
            try:
                div_val = float(div_yield)
                if div_val > 0.02:
                    situations.append('dividend_payer')
            except (ValueError, TypeError):
                pass

        # Insider activity
        insider = company_data.get('insider_activity', {})
        if insider.get('net_buying', 0) > 0:
            situations.append('insider_buying')
        elif insider.get('net_selling', 0) > 0:
            situations.append('insider_selling')

        return situations

    def _score_with_context(self,
                            results: List[Dict],
                            topic_weights: Dict[str, float],
                            user_context: UserContext,
                            query_context: QueryContext) -> List[Dict]:
        """Score results with contextual relevance"""
        scored = []

        for r in results:
            base_score = r.get('similarity', r.get('combined_score', 0.5))
            metadata = r.get('metadata', {})

            # Topic weight bonus
            topic_bonus = 0
            chunk_topics = metadata.get('topics', [])
            for topic in chunk_topics:
                topic_key = topic.lower().replace(' ', '_')
                if topic_key in topic_weights:
                    topic_bonus += topic_weights[topic_key] * 0.1

            # Author preference bonus
            author_bonus = 0
            if user_context and user_context.favorite_authors:
                author = (metadata.get('author', '') or '').lower()
                for fav in user_context.favorite_authors:
                    if fav.lower() in author:
                        author_bonus = 0.2
                        break

            # Interest alignment bonus
            interest_bonus = 0
            if user_context and user_context.interests:
                for interest in user_context.interests:
                    if interest.lower() in str(chunk_topics).lower():
                        interest_bonus += 0.1

            # Calculate context score
            context_score = min(1.0, topic_bonus + author_bonus + interest_bonus)

            # Final combined score
            final_score = base_score * (1 + context_score * 0.5)

            r['context_score'] = context_score
            r['final_score'] = final_score
            scored.append(r)

        # Sort by final score
        scored.sort(key=lambda x: x['final_score'], reverse=True)
        return scored

    def _build_citation(self, result: Dict) -> str:
        """Build citation string for a result"""
        metadata = result.get('metadata', {})
        author = metadata.get('author', 'Unknown')
        source = metadata.get('source', 'Unknown')
        title = metadata.get('title', '')
        year = metadata.get('year', '') or metadata.get('date', '')[:4] if metadata.get('date') else ''

        parts = [author]
        if title:
            parts.append(f'"{title}"')
        parts.append(source)
        if year:
            parts.append(f"({year})")

        return ", ".join(parts)

    def format_context_for_prompt(self, results: List[RetrievalResult]) -> str:
        """Format retrieval results for inclusion in LLM prompt"""
        if not results:
            return "No relevant knowledge found."

        sections = []
        for r in results:
            section = f"""---
[{r.author}, {r.source}]
{r.content}
---"""
            sections.append(section)

        return "\n\n".join(sections)
