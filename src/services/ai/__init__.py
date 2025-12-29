# src/services/ai/__init__.py

"""
AI Services for Investment Analyst System

This module provides:

Knowledge Pipeline (Agent 5):
- Document processing and topic tagging
- Embeddings generation
- Vector storage and retrieval

LLM Integration Layer (Agent 6):
- Local model integration (Ollama) for lightweight tasks
- Claude API integration for complex reasoning
- Smart routing between local and cloud models
- Cost optimization and usage tracking

Extended AI Features (Agent 6 Part 2):
- Daily briefings and portfolio alerts
- Document analysis (earnings, filings)
- Multi-analyst debates (Bull vs Bear)
- Streaming responses

Usage:
    # LLM integration
    from src.services.ai import ModelRouter, QueryParser, DataFormatter
    from src.services.ai import get_config, get_tracker

    # Initialize router
    router = ModelRouter()

    # Parse queries
    parser = QueryParser(router)
    parsed = parser.parse("Analyze AAPL stock")

    # Format data for LLM
    formatter = DataFormatter()
    context = formatter.format_company_data(company_data)

    # Run analysis
    response = router.analyze(
        system_prompt="You are a value investor...",
        data_context=context,
        user_query="What's your view on AAPL?"
    )

    # Debates
    from src.services.ai import DebateEngine
    debate = DebateEngine(router)
    result = await debate.bull_vs_bear("AAPL", company_data)

    # Document analysis
    from src.services.ai import EarningsCallAnalyzer, DocumentExtractor
    analyzer = EarningsCallAnalyzer(router, DocumentExtractor())
    analysis = await analyzer.analyze_transcript(transcript_text)
"""

__all__ = []

# Knowledge Pipeline (Agent 5) - Optional, may have external dependencies
try:
    from .document_processor import DocumentProcessor
    from .topic_tagger import TopicTagger
    from .embeddings import EmbeddingGenerator
    from .vector_store import VectorStore
    from .knowledge_retriever import KnowledgeRetriever
    __all__.extend([
        'DocumentProcessor',
        'TopicTagger',
        'EmbeddingGenerator',
        'VectorStore',
        'KnowledgeRetriever',
    ])
except ImportError as e:
    # Knowledge pipeline not fully installed
    import logging
    logging.getLogger(__name__).debug(f"Knowledge pipeline not available: {e}")

# LLM Configuration
from .config import (
    AIConfig,
    ClaudeConfig,
    OllamaConfig,
    RouterConfig,
    BudgetConfig,
    get_config,
    set_config,
    MODEL_PRICING,
    TASK_CONFIGS
)
__all__.extend([
    'AIConfig',
    'ClaudeConfig',
    'OllamaConfig',
    'RouterConfig',
    'BudgetConfig',
    'get_config',
    'set_config',
    'MODEL_PRICING',
    'TASK_CONFIGS',
])

# Usage Tracking
from .usage_tracker import UsageTracker, get_tracker
__all__.extend([
    'UsageTracker',
    'get_tracker',
])

# LLM Base Classes and Clients
from .llm import (
    BaseLLM,
    LLMResponse,
    Message,
    TaskType,
    ClaudeClient,
    OllamaClient,
    ModelRouter
)
__all__.extend([
    'BaseLLM',
    'LLMResponse',
    'Message',
    'TaskType',
    'ClaudeClient',
    'OllamaClient',
    'ModelRouter',
])

# Task Utilities
from .tasks import (
    QueryParser,
    ParsedQuery,
    DataFormatter,
    Summarizer,
    SummaryResult
)
__all__.extend([
    'QueryParser',
    'ParsedQuery',
    'DataFormatter',
    'Summarizer',
    'SummaryResult',
])

# Proactive AI Features
from .proactive import (
    DailyBriefingGenerator,
    DailyBriefing,
    BriefingSection,
    PortfolioAlertGenerator,
    PortfolioAlert,
    AlertType,
    AlertPriority,
    ThesisValidator
)
__all__.extend([
    'DailyBriefingGenerator',
    'DailyBriefing',
    'BriefingSection',
    'PortfolioAlertGenerator',
    'PortfolioAlert',
    'AlertType',
    'AlertPriority',
    'ThesisValidator',
])

# Document Analysis
from .documents import (
    DocumentExtractor,
    TranscriptParser,
    EarningsCallAnalyzer,
    EarningsAnalysis,
    FilingAnalyzer
)
__all__.extend([
    'DocumentExtractor',
    'TranscriptParser',
    'EarningsCallAnalyzer',
    'EarningsAnalysis',
    'FilingAnalyzer',
])

# Debate Engine
from .debate import (
    DebateEngine,
    DebateFormat,
    DebateContribution,
    DebateResult,
    AnalystPersona,
    get_analyst,
    DEBATE_ANALYSTS
)
__all__.extend([
    'DebateEngine',
    'DebateFormat',
    'DebateContribution',
    'DebateResult',
    'AnalystPersona',
    'get_analyst',
    'DEBATE_ANALYSTS',
])

# Streaming
from .streaming import (
    StreamHandler,
    StreamEvent,
    ProgressTracker,
    StreamingAnalysis
)
__all__.extend([
    'StreamHandler',
    'StreamEvent',
    'ProgressTracker',
    'StreamingAnalysis',
])

__version__ = '1.1.0'
