# src/services/nl/__init__.py
"""
Natural Language Query Engine for investment queries.

Handles queries like:
- "Show me undervalued tech stocks with growing dividends"
- "Compare AAPL's margins to 5 years ago"
- "What's driving NVDA's revenue growth?"
- "Find stocks like COST"
- "How does MSFT compare to GOOGL?"
"""

from .query_engine import QueryEngine, QueryResult
from .classifier import QueryClassifier, QueryIntent, ClassifiedQuery

__all__ = [
    'QueryEngine',
    'QueryResult',
    'QueryClassifier',
    'QueryIntent',
    'ClassifiedQuery'
]
