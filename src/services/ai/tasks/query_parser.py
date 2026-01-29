# src/services/ai/tasks/query_parser.py

import json
import re
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ParsedQuery:
    """Structured representation of user query"""
    original: str
    intent: str  # analyze, compare, screen, lookup, explain, chat
    symbols: List[str] = field(default_factory=list)
    metrics: List[str] = field(default_factory=list)
    topics: List[str] = field(default_factory=list)
    time_period: str = 'current'
    confidence: float = 0.0

    def needs_company_data(self) -> bool:
        return len(self.symbols) > 0 or self.intent in ['analyze', 'compare']

    def needs_market_data(self) -> bool:
        return self.intent == 'screen' or 'market' in self.topics

    def needs_wisdom_retrieval(self) -> bool:
        return self.intent in ['analyze', 'explain'] or len(self.topics) > 0


class QueryParser:
    """
    Parse user queries into structured format.

    Can use either:
    - LLM-based parsing (more accurate)
    - Rule-based parsing (faster, free)
    """

    # Intent keywords
    INTENT_PATTERNS = {
        'analyze': ['analyze', 'analysis', 'should i buy', 'is .* good', 'what do you think',
                    'evaluate', 'assessment', 'worth'],
        'compare': ['compare', 'versus', ' vs ', 'better', 'difference between', 'which is'],
        'screen': ['find', 'screen', 'filter', 'search for', 'stocks with', 'show me'],
        'lookup': ['what is', 'what\'s', 'current', 'price of', 'how much'],
        'explain': ['explain', 'what does', 'how does', 'teach me', 'help me understand']
    }

    # Common ticker patterns
    TICKER_PATTERN = r'\b([A-Z]{1,5})\b'

    # Metric keywords
    METRIC_KEYWORDS = {
        'pe_ratio': ['p/e', 'pe ratio', 'price to earnings', 'earnings multiple'],
        'pb_ratio': ['p/b', 'pb ratio', 'price to book'],
        'ps_ratio': ['p/s', 'ps ratio', 'price to sales'],
        'roe': ['roe', 'return on equity'],
        'roic': ['roic', 'return on invested capital'],
        'revenue_growth': ['revenue growth', 'sales growth', 'top line'],
        'earnings_growth': ['earnings growth', 'eps growth', 'profit growth'],
        'dividend_yield': ['dividend', 'yield', 'dividend yield'],
        'debt_equity': ['debt', 'leverage', 'debt to equity', 'd/e'],
        'market_cap': ['market cap', 'size', 'valuation'],
        'free_cash_flow': ['fcf', 'free cash flow', 'cash flow']
    }

    # Topic keywords
    TOPIC_KEYWORDS = {
        'valuation': ['valuation', 'value', 'cheap', 'expensive', 'overvalued', 'undervalued',
                      'fair value', 'intrinsic'],
        'growth': ['growth', 'growing', 'expansion', 'revenue growth'],
        'risk': ['risk', 'risky', 'safe', 'volatile', 'volatility', 'downside'],
        'quality': ['quality', 'moat', 'competitive advantage', 'durable'],
        'momentum': ['momentum', 'trend', 'moving', 'technical'],
        'dividends': ['dividend', 'income', 'yield', 'payout'],
        'management': ['management', 'ceo', 'leadership', 'capital allocation']
    }

    def __init__(self, router=None):
        """
        Initialize parser.

        Args:
            router: ModelRouter for LLM-based parsing (optional)
        """
        self.router = router

    def parse(self, query: str, use_llm: bool = False) -> ParsedQuery:
        """
        Parse a user query.

        Args:
            query: User's question
            use_llm: Whether to use LLM for parsing

        Returns:
            ParsedQuery with extracted information
        """
        if use_llm and self.router:
            return self._parse_with_llm(query)
        else:
            return self._parse_with_rules(query)

    def _parse_with_rules(self, query: str) -> ParsedQuery:
        """Parse using rule-based approach"""
        query_lower = query.lower()

        # Detect intent
        intent = 'chat'
        for intent_name, patterns in self.INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, query_lower):
                    intent = intent_name
                    break
            if intent != 'chat':
                break

        # Extract tickers (uppercase 1-5 letter words)
        potential_tickers = re.findall(self.TICKER_PATTERN, query)
        # Filter out common words
        common_words = {'I', 'A', 'THE', 'IS', 'IT', 'TO', 'IN', 'FOR', 'ON', 'AND', 'OR', 'AT'}
        symbols = [t for t in potential_tickers if t not in common_words]

        # Extract metrics
        metrics = []
        for metric, keywords in self.METRIC_KEYWORDS.items():
            for kw in keywords:
                if kw in query_lower:
                    metrics.append(metric)
                    break

        # Extract topics
        topics = []
        for topic, keywords in self.TOPIC_KEYWORDS.items():
            for kw in keywords:
                if kw in query_lower:
                    topics.append(topic)
                    break

        # Detect time period
        time_period = 'current'
        if any(w in query_lower for w in ['history', 'historical', 'past', 'last year']):
            time_period = 'historical'
        elif any(w in query_lower for w in ['forecast', 'future', 'next year', 'forward']):
            time_period = 'forward'

        return ParsedQuery(
            original=query,
            intent=intent,
            symbols=symbols,
            metrics=metrics,
            topics=topics,
            time_period=time_period,
            confidence=0.7  # Rule-based confidence
        )

    def _parse_with_llm(self, query: str) -> ParsedQuery:
        """Parse using LLM"""
        try:
            response = self.router.parse_query(query)

            # Extract JSON from response
            content = response.content.strip()

            # Handle markdown code blocks
            if '```' in content:
                match = re.search(r'```(?:json)?\s*(.*?)\s*```', content, re.DOTALL)
                if match:
                    content = match.group(1)

            data = json.loads(content)

            return ParsedQuery(
                original=query,
                intent=data.get('intent', 'chat'),
                symbols=data.get('symbols', []),
                metrics=data.get('metrics', []),
                topics=data.get('topics', []),
                time_period=data.get('time_period', 'current'),
                confidence=0.9  # LLM confidence
            )
        except Exception as e:
            logger.warning(f"LLM parsing failed, falling back to rules: {e}")
            return self._parse_with_rules(query)
