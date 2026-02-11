# src/services/ai/analyst_service.py
"""
Main orchestration service for AI investment analysts.

Coordinates between:
- Analyst personas (prompts and styles)
- LLM router (model selection)
- Data formatters (context building)
- Knowledge retriever (investment wisdom - when available)
- Advanced RAG (contextual retrieval, knowledge graph, hybrid search)
"""

import logging
import uuid
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime

# Package imports (used when run via cli_runner with cwd=project root: from src.services.ai.analyst_service)
from .analysts import get_analyst, list_analysts, AnalystPersona
from .llm.router import ModelRouter
from .llm.base import Message, LLMResponse
from .tasks.data_formatter import DataFormatter

# Advanced RAG imports (optional - gracefully degrade if not available)
try:
    from .knowledge.advanced.contextual_retriever import (
        ContextualRetriever, UserContext, QueryContext
    )
    from .knowledge.advanced.query_expander import QueryExpander
    from .knowledge.advanced.hybrid_search import HybridSearcher
    from .knowledge.graph.knowledge_graph import KnowledgeGraph
    from .knowledge.graph.graph_retriever import GraphEnhancedRetriever
    from .knowledge.citations.citation_tracker import CitationTracker
    ADVANCED_RAG_AVAILABLE = True
except ImportError:
    ADVANCED_RAG_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class ChatMessage:
    """A single message in a conversation."""
    id: str
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: str
    metadata: Dict = field(default_factory=dict)


@dataclass
class Conversation:
    """A conversation with an analyst."""
    id: str
    analyst_id: str
    company_id: Optional[int] = None
    company_symbol: Optional[str] = None
    messages: List[ChatMessage] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'analyst_id': self.analyst_id,
            'company_id': self.company_id,
            'company_symbol': self.company_symbol,
            'messages': [
                {
                    'id': m.id,
                    'role': m.role,
                    'content': m.content,
                    'timestamp': m.timestamp,
                    'metadata': m.metadata
                }
                for m in self.messages
            ],
            'created_at': self.created_at,
            'metadata': self.metadata
        }


class AnalystService:
    """
    Main service for AI analyst interactions.

    This service:
    1. Manages analyst personas
    2. Handles conversation state
    3. Builds context from company data
    4. Retrieves relevant investment wisdom
    5. Routes requests to appropriate LLM
    6. Returns formatted responses
    """

    def __init__(self, router: ModelRouter = None, knowledge_retriever=None,
                 use_advanced_rag: bool = True):
        """
        Initialize the analyst service.

        Args:
            router: LLM router instance (creates default if not provided)
            knowledge_retriever: Optional knowledge retriever for wisdom lookup
            use_advanced_rag: Whether to use advanced RAG features (contextual, graph, hybrid)
        """
        self.router = router
        self.retriever = knowledge_retriever
        self.formatter = DataFormatter()
        self.conversations: Dict[str, Conversation] = {}

        # Lazy initialization of router
        self._router_initialized = False

        # Advanced RAG components (initialized lazily)
        self.use_advanced_rag = use_advanced_rag and ADVANCED_RAG_AVAILABLE
        self._query_expander = None
        self._knowledge_graph = None
        self._graph_retriever = None
        self._contextual_retriever = None
        self._citation_tracker = None
        self._advanced_rag_initialized = False

    def _ensure_router(self):
        """Ensure router is initialized (lazy loading)."""
        if self.router is None and not self._router_initialized:
            try:
                self.router = ModelRouter()
                self._router_initialized = True
                logger.info("ModelRouter initialized successfully")
            except Exception as e:
                logger.warning(f"Could not initialize ModelRouter: {e}")
                self._router_initialized = True

    def _ensure_advanced_rag(self):
        """Initialize advanced RAG components lazily."""
        if not self.use_advanced_rag or self._advanced_rag_initialized:
            return

        try:
            # Query expander for better retrieval
            self._query_expander = QueryExpander()

            # Knowledge graph for concept relationships
            self._knowledge_graph = KnowledgeGraph(db_path="data/knowledge_graph.db")

            # Graph-enhanced retriever
            if self.retriever:
                vector_store = getattr(self.retriever, 'store', None)
                self._graph_retriever = GraphEnhancedRetriever(
                    knowledge_graph=self._knowledge_graph,
                    vector_store=vector_store
                )

                # Contextual retriever wrapping base retriever
                self._contextual_retriever = ContextualRetriever(
                    base_retriever=self.retriever,
                    query_expander=self._query_expander
                )

            # Citation tracker for source attribution
            self._citation_tracker = CitationTracker(db_path="data/citations.db")

            self._advanced_rag_initialized = True
            logger.info("Advanced RAG components initialized")

        except Exception as e:
            logger.warning(f"Could not initialize advanced RAG: {e}")
            self.use_advanced_rag = False
            self._advanced_rag_initialized = True

    def get_analysts(self) -> List[Dict]:
        """
        Get list of all available analysts.

        Returns:
            List of analyst info dictionaries
        """
        return list_analysts()

    def get_analyst_info(self, analyst_id: str) -> Dict:
        """
        Get detailed info for a specific analyst.

        Args:
            analyst_id: The analyst ID

        Returns:
            Analyst info dictionary
        """
        analyst = get_analyst(analyst_id)
        return {
            'id': analyst.id,
            'name': analyst.name,
            'title': analyst.title,
            'style': analyst.style,
            'icon': analyst.icon,
            'color': analyst.color,
            'description': analyst.description,
            'influences': analyst.influences,
            'strengths': analyst.strengths,
            'best_for': analyst.best_for,
            'greeting': analyst.greeting,
            'suggested_questions': analyst.suggested_questions
        }

    def create_conversation(
        self,
        analyst_id: str,
        company_id: int = None,
        company_symbol: str = None
    ) -> Conversation:
        """
        Start a new conversation with an analyst.

        Args:
            analyst_id: The analyst to chat with
            company_id: Optional company ID for context
            company_symbol: Optional company symbol for context

        Returns:
            New Conversation instance
        """
        # Validate analyst exists
        get_analyst(analyst_id)

        conv = Conversation(
            id=str(uuid.uuid4()),
            analyst_id=analyst_id,
            company_id=company_id,
            company_symbol=company_symbol
        )
        self.conversations[conv.id] = conv

        logger.info(f"Created conversation {conv.id} with analyst {analyst_id}")
        return conv

    def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        """
        Get an existing conversation.

        Args:
            conversation_id: The conversation ID

        Returns:
            Conversation if found, None otherwise
        """
        return self.conversations.get(conversation_id)

    def chat(
        self,
        conversation_id: str,
        user_message: str,
        company_context: Dict = None
    ) -> ChatMessage:
        """
        Send a message and get analyst response.

        Args:
            conversation_id: The conversation ID
            user_message: User's message
            company_context: Optional company data override

        Returns:
            Assistant's response message
        """
        self._ensure_router()

        conv = self.get_conversation(conversation_id)
        if not conv:
            # Conversation created in Node.js - create temporary one for Python
            analyst_id = 'value'
            company_symbol = None
            if company_context:
                analyst_id = company_context.get('analyst_id', 'value')
                if company_context.get('company'):
                    company_symbol = company_context['company'].get('symbol')

            conv = self.create_conversation(analyst_id, None, company_symbol)
            conv.id = conversation_id  # Use the same ID for consistency

        if not self.router:
            raise RuntimeError("No LLM models available. Please configure Claude or Ollama.")

        analyst = get_analyst(conv.analyst_id)

        # 1. Build data context
        data_context = self._build_context(conv, company_context)

        # 2. Get relevant wisdom (if available) - pass company context for advanced RAG
        wisdom = self._get_wisdom(user_message, analyst.id, company_context)

        # 3. Build message history
        history = [
            Message(role=m.role, content=m.content)
            for m in conv.messages[-10:]  # Last 10 messages for context
        ]

        # 4. Add user message to conversation
        user_msg = ChatMessage(
            id=str(uuid.uuid4()),
            role='user',
            content=user_message,
            timestamp=datetime.now().isoformat()
        )
        conv.messages.append(user_msg)

        # 5. Combine context
        full_context = data_context
        if wisdom:
            full_context = f"{data_context}\n\n{wisdom}"

        # 6. Call LLM
        try:
            response = self.router.analyze(
                system_prompt=analyst.system_prompt,
                data_context=full_context,
                user_query=user_message,
                history=history
            )

            # 7. Create assistant response
            assistant_msg = ChatMessage(
                id=str(uuid.uuid4()),
                role='assistant',
                content=response.content,
                timestamp=datetime.now().isoformat(),
                metadata={
                    'model': response.model,
                    'tokens': response.tokens_used,
                    'cost_usd': response.cost_usd,
                    'latency_ms': response.latency_ms
                }
            )
            conv.messages.append(assistant_msg)

            logger.info(
                f"Chat completed: conv={conversation_id}, "
                f"model={response.model}, tokens={response.tokens_used}"
            )

            return assistant_msg

        except Exception as e:
            logger.error(f"Chat failed: {e}")
            # Return error message
            error_msg = ChatMessage(
                id=str(uuid.uuid4()),
                role='assistant',
                content=f"I apologize, but I encountered an error processing your request: {str(e)}. Please try again.",
                timestamp=datetime.now().isoformat(),
                metadata={'error': str(e)}
            )
            conv.messages.append(error_msg)
            return error_msg

    def chat_stream(
        self,
        conversation_id: str,
        user_message: str,
        company_context: Dict = None
    ):
        """
        Stream a chat response token by token.

        Args:
            conversation_id: The conversation ID
            user_message: User's message
            company_context: Optional company data override

        Yields:
            Tokens as they are generated
        """
        from .llm.base import TaskType

        self._ensure_router()

        conv = self.get_conversation(conversation_id)
        if not conv:
            # Conversation created in Node.js - create temporary one for Python
            # Extract analyst_id from company_context or default to 'value'
            analyst_id = 'value'
            company_symbol = None
            if company_context:
                analyst_id = company_context.get('analyst_id', 'value')
                if company_context.get('company'):
                    company_symbol = company_context['company'].get('symbol')

            conv = self.create_conversation(analyst_id, None, company_symbol)
            conv.id = conversation_id  # Use the same ID for consistency

        if not self.router:
            raise RuntimeError("No LLM models available. Please configure Claude or Ollama.")

        analyst = get_analyst(conv.analyst_id)

        # 1. Build data context
        data_context = self._build_context(conv, company_context)

        # 2. Get relevant wisdom
        wisdom = self._get_wisdom(user_message, analyst.id, company_context)

        # 3. Build message history
        history = [
            Message(role=m.role, content=m.content)
            for m in conv.messages[-10:]
        ]

        # 4. Add user message to conversation
        user_msg = ChatMessage(
            id=str(uuid.uuid4()),
            role='user',
            content=user_message,
            timestamp=datetime.now().isoformat()
        )
        conv.messages.append(user_msg)

        # 5. Combine context
        full_context = data_context
        if wisdom:
            full_context = f"{data_context}\n\n{wisdom}"

        # 6. Build the full query
        full_query = f"""## CURRENT DATA
{full_context}

## USER QUESTION
{user_message}

Analyze the data above and provide your investment perspective."""

        history.append(Message(role='user', content=full_query))

        # 7. Get the model and stream
        model = self.router.get_model(TaskType.CHAT)
        full_content = ""

        try:
            for token in model.stream_chat(
                messages=history,
                max_tokens=1500,
                temperature=0.7,
                system=analyst.system_prompt
            ):
                full_content += token
                yield token

            # 8. After streaming completes, save the full message
            assistant_msg = ChatMessage(
                id=str(uuid.uuid4()),
                role='assistant',
                content=full_content,
                timestamp=datetime.now().isoformat(),
                metadata={'model': model.name, 'streamed': True}
            )
            conv.messages.append(assistant_msg)

            logger.info(f"Stream chat completed: conv={conversation_id}, model={model.name}")

        except Exception as e:
            logger.error(f"Stream chat failed: {e}")
            raise

    def _build_context(
        self,
        conv: Conversation,
        override: Dict = None
    ) -> str:
        """
        Build data context for the analysis.

        Args:
            conv: Current conversation
            override: Optional data override

        Returns:
            Formatted context string
        """
        if override:
            # Use provided data
            parts = []

            if override.get('company'):
                parts.append(
                    self.formatter.format_company_data(
                        override['company'],
                        override.get('metrics', {})
                    )
                )

            if override.get('financials'):
                parts.append(
                    self.formatter.format_financial_statements(
                        income=override['financials'].get('income'),
                        balance=override['financials'].get('balance'),
                        cashflow=override['financials'].get('cashflow')
                    )
                )

            if override.get('sentiment'):
                parts.append(
                    self.formatter.format_sentiment_data(override['sentiment'])
                )

            if override.get('analyst_ratings'):
                parts.append(
                    self.formatter.format_analyst_ratings(override['analyst_ratings'])
                )

            if override.get('insider_activity'):
                parts.append(
                    self.formatter.format_insider_data(override['insider_activity'])
                )

            if override.get('news'):
                parts.append(
                    self.formatter.format_news_items(override['news'])
                )

            # Portfolio context
            if override.get('portfolio') and override.get('positions'):
                parts.append(
                    self.formatter.format_portfolio_data(
                        override['portfolio'],
                        override['positions']
                    )
                )

            # Investor holdings context
            if override.get('investor') and override.get('investor_holdings'):
                parts.append(
                    self.formatter.format_investor_holdings(
                        override['investor'],
                        override['investor_holdings']
                    )
                )

            # Knowledge base context (quotes, frameworks, case studies from Node.js)
            if override.get('knowledgePrompt'):
                parts.append(override['knowledgePrompt'])

            return "\n\n".join(parts) if parts else "No company data provided."

        # If no override, check if conversation has company context
        if conv.company_symbol:
            return f"Analysis requested for: {conv.company_symbol}\n(Provide company data in the request for detailed analysis)"

        return "No specific company data available. I can provide general investment framework guidance."

    def _get_wisdom(self, query: str, analyst_type: str,
                     company_data: Dict = None) -> str:
        """
        Retrieve relevant investment wisdom using advanced RAG.

        Uses contextual retrieval, query expansion, and knowledge graph
        when available. Falls back to basic retrieval otherwise.

        Args:
            query: User's query
            analyst_type: Type of analyst for topic filtering
            company_data: Optional company data for context-aware retrieval

        Returns:
            Formatted wisdom string or empty string
        """
        if not self.retriever:
            return ""

        # Initialize advanced RAG if enabled
        if self.use_advanced_rag:
            self._ensure_advanced_rag()

        try:
            # Analyst type to topic mapping (extended)
            ANALYST_TOPICS = {
                'value': ['valuation', 'moats', 'margin_of_safety', 'capital_allocation',
                          'intrinsic_value', 'quality', 'patience'],
                'growth': ['growth', 'competitive_advantage', 'tam', 'scalability',
                           'network_effects', 'disruption', 'runway'],
                'contrarian': ['contrarian', 'sentiment', 'cycles', 'mean_reversion',
                               'psychology', 'fear_greed', 'market_timing'],
                'quant': ['factors', 'momentum', 'value', 'quality',
                          'systematic', 'risk_metrics', 'position_sizing'],
                'tailrisk': ['tail_risk', 'antifragility', 'convexity', 'optionality',
                             'black_swan', 'fragility', 'survival'],
                'tech': ['disruption', 'network_effects', 'platforms', 'ai',
                         's_curves', 'adoption', 'winner_take_all']
            }
            topics = ANALYST_TOPICS.get(analyst_type, ['investing', 'analysis'])

            # Try advanced contextual retrieval first
            if self._contextual_retriever and company_data:
                return self._get_contextual_wisdom(query, analyst_type, company_data, topics)

            # Try graph-enhanced retrieval
            if self._graph_retriever:
                return self._get_graph_wisdom(query, analyst_type, topics)

            # Fall back to basic retrieval with query expansion
            return self._get_basic_wisdom(query, topics)

        except Exception as e:
            logger.warning(f"Wisdom retrieval failed: {e}")
            return ""

    def _get_contextual_wisdom(self, query: str, analyst_type: str,
                                company_data: Dict, topics: List[str]) -> str:
        """Get wisdom using contextual retrieval with company context."""
        try:
            # Build user context based on analyst type
            user_ctx = UserContext(
                investment_style=analyst_type,
                interests=topics[:5]
            )

            # Build query context with company info
            query_ctx = QueryContext(
                original_query=query,
                current_symbol=company_data.get('company', {}).get('symbol'),
                current_company_data=company_data.get('metrics', {}),
                analyst_type=analyst_type
            )

            # Retrieve with context
            results = self._contextual_retriever.retrieve(
                query=query,
                user_context=user_ctx,
                query_context=query_ctx,
                top_k=5
            )

            if not results:
                return self._get_basic_wisdom(query, topics)

            # Format results with citations
            return self._format_wisdom_results(results, include_citations=True)

        except Exception as e:
            logger.warning(f"Contextual retrieval failed, falling back: {e}")
            return self._get_basic_wisdom(query, topics)

    def _get_graph_wisdom(self, query: str, analyst_type: str,
                          topics: List[str]) -> str:
        """Get wisdom using knowledge graph for concept exploration."""
        try:
            # Use graph retriever for concept-aware search
            results = self._graph_retriever.retrieve(
                query=query,
                top_k=5,
                expand_depth=1,
                include_contradictions=analyst_type == 'contrarian'
            )

            if not results:
                return self._get_basic_wisdom(query, topics)

            # Get related concepts to enhance understanding
            concept_context = self._get_concept_context(query, analyst_type)

            # Format results
            wisdom = self._format_wisdom_results(results, include_citations=True)

            if concept_context:
                wisdom = f"{concept_context}\n\n{wisdom}"

            return wisdom

        except Exception as e:
            logger.warning(f"Graph retrieval failed, falling back: {e}")
            return self._get_basic_wisdom(query, topics)

    def _get_concept_context(self, query: str, analyst_type: str) -> str:
        """Get relevant concept relationships from knowledge graph."""
        if not self._knowledge_graph:
            return ""

        try:
            # Map analyst types to key concepts
            ANALYST_CONCEPTS = {
                'value': ['margin_of_safety', 'intrinsic_value', 'moat'],
                'growth': ['compounding', 'moat', 'capital_allocation'],
                'contrarian': ['market_cycles', 'pendulum', 'fear_and_greed'],
                'quant': ['margin_of_safety', 'capital_allocation'],
                'tailrisk': ['antifragility', 'black_swan', 'optionality'],
                'tech': ['moat', 'compounding']
            }

            concepts = ANALYST_CONCEPTS.get(analyst_type, [])
            if not concepts:
                return ""

            # Get concept relationships
            parts = []
            for concept_id in concepts[:2]:  # Limit to avoid context overload
                concept = self._knowledge_graph.get_concept(concept_id)
                if concept:
                    related = self._knowledge_graph.get_related_concepts(
                        concept_id, max_depth=1
                    )
                    if related:
                        related_names = [r['name'] for r in related[:3]]
                        parts.append(
                            f"**{concept.name}**: {concept.description} "
                            f"(Related: {', '.join(related_names)})"
                        )

            if parts:
                return "## Key Concepts\n" + "\n".join(parts)
            return ""

        except Exception as e:
            logger.debug(f"Concept context failed: {e}")
            return ""

    def _get_basic_wisdom(self, query: str, topics: List[str]) -> str:
        """Basic retrieval with optional query expansion."""
        try:
            # Expand query if available
            search_query = query
            if self._query_expander:
                expanded = self._query_expander.expand(query, max_expansions=1)
                if expanded:
                    search_query = expanded[0]

            # Retrieve with base retriever
            results = self.retriever.retrieve(
                query=search_query,
                top_k=3,
                topics=topics[:3] if hasattr(self.retriever, 'retrieve') else None
            )

            if not results:
                return ""

            return self._format_wisdom_results(results, include_citations=False)

        except Exception as e:
            logger.warning(f"Basic wisdom retrieval failed: {e}")
            return ""

    def _format_wisdom_results(self, results: List, include_citations: bool = False) -> str:
        """Format retrieval results into wisdom section."""
        if not results:
            return ""

        parts = ["## Investment Wisdom"]

        for r in results:
            # Handle both dict and RetrievalResult objects
            if hasattr(r, 'content'):
                # RetrievalResult object
                source = r.source
                author = r.author
                content = r.content[:500]
                citation = r.citation if include_citations else None
            else:
                # Dict format
                metadata = r.get('metadata', {})
                source = metadata.get('source', 'Unknown')
                author = metadata.get('author', '')
                content = r.get('content', '')[:500]
                citation = None

            # Format entry
            if author and author != 'Unknown':
                header = f"**{author}** ({source})"
            else:
                header = f"**{source}**"

            parts.append(f"{header}:\n{content}...")

            # Track citation if available
            if include_citations and self._citation_tracker and hasattr(r, 'chunk_id'):
                try:
                    self._citation_tracker.create_from_chunk({
                        'id': r.chunk_id,
                        'content': content,
                        'metadata': {'source': source, 'author': author}
                    })
                except Exception:
                    pass

        return "\n\n".join(parts)

    def quick_analyze(
        self,
        analyst_id: str,
        company_data: Dict,
        question: str = None
    ) -> LLMResponse:
        """
        Quick one-shot analysis without conversation.

        Args:
            analyst_id: Analyst to use
            company_data: Company data dictionary
            question: Optional specific question

        Returns:
            LLM response
        """
        self._ensure_router()

        if not self.router:
            raise RuntimeError("No LLM models available")

        analyst = get_analyst(analyst_id)

        # Build context
        context = self.formatter.format_company_data(
            company_data.get('company', {}),
            company_data.get('metrics', {})
        )

        # Default question if not provided
        if not question:
            question = "Please provide your analysis of this company based on your investment philosophy."

        return self.router.analyze(
            system_prompt=analyst.system_prompt,
            data_context=context,
            user_query=question
        )

    def get_stats(self) -> Dict:
        """Get service statistics."""
        stats = {
            'active_conversations': len(self.conversations),
            'analysts_available': len(list_analysts()),
            'router_available': self.router is not None,
            'knowledge_available': self.retriever is not None,
            'advanced_rag_enabled': self.use_advanced_rag,
            'advanced_rag_initialized': self._advanced_rag_initialized
        }

        if self.router:
            stats['router_stats'] = self.router.get_stats()

        # Add knowledge graph stats if available
        if self._knowledge_graph:
            try:
                stats['knowledge_graph'] = self._knowledge_graph.get_stats()
            except Exception:
                pass

        # Add citation stats if available
        if self._citation_tracker:
            try:
                stats['citations'] = self._citation_tracker.get_stats()
            except Exception:
                pass

        return stats


# Module-level singleton for convenience
_service_instance: Optional[AnalystService] = None


def get_analyst_service() -> AnalystService:
    """Get or create the singleton analyst service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = AnalystService()
    return _service_instance
