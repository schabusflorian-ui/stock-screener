# src/services/ai/knowledge/citations/quote_extractor.py

"""
Extract quotable passages from knowledge chunks.

Identifies memorable, standalone quotes that can be used
in analysis and responses.
"""

import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class QuoteExtractor:
    """
    Extract quotable passages from text.

    Identifies:
    - Direct quotes (in quotation marks)
    - Standalone wisdom (short, memorable sentences)
    - Key principles and rules
    """

    # Patterns that indicate quotable content
    QUOTE_INDICATORS = [
        r'"([^"]{20,200})"',  # Text in quotes
        r"'([^']{20,200})'",  # Text in single quotes
        r'"([^"]{20,200})"',  # Smart quotes
    ]

    # Patterns for principle/rule statements
    PRINCIPLE_PATTERNS = [
        r'rule (?:is|#?\d+)[:\s]+([^.!?]+[.!?])',
        r'principle[:\s]+([^.!?]+[.!?])',
        r'lesson[:\s]+([^.!?]+[.!?])',
        r'key (?:insight|takeaway)[:\s]+([^.!?]+[.!?])',
        r'never ([^.!?]+[.!?])',
        r'always ([^.!?]+[.!?])',
        r'the (?:most important|key|critical) (?:thing|point|insight) (?:is|:)[:\s]+([^.!?]+[.!?])',
    ]

    # Sentence starters that often indicate quotable wisdom
    WISDOM_STARTERS = [
        r'^(in investing,? [^.!?]+[.!?])',
        r'^(the key to [^.!?]+[.!?])',
        r'^(success in [^.!?]+[.!?])',
        r'^(the secret (?:is|to) [^.!?]+[.!?])',
        r'^(what matters (?:most )?is [^.!?]+[.!?])',
        r'^(price is what you pay[^.!?]+[.!?])',
        r'^(time is the friend [^.!?]+[.!?])',
        r'^(be fearful when [^.!?]+[.!?])',
        r'^(be greedy when [^.!?]+[.!?])',
        r'^(the stock market is [^.!?]+[.!?])',
        r'^(risk comes from [^.!?]+[.!?])',
        r'^(an investment in [^.!?]+[.!?])',
    ]

    def __init__(self,
                 min_length: int = 30,
                 max_length: int = 300,
                 min_quality_score: float = 0.5):
        """
        Args:
            min_length: Minimum quote length
            max_length: Maximum quote length
            min_quality_score: Minimum quality to include (0-1)
        """
        self.min_length = min_length
        self.max_length = max_length
        self.min_quality_score = min_quality_score

        # Compile patterns
        self.quote_patterns = [re.compile(p, re.IGNORECASE | re.MULTILINE)
                               for p in self.QUOTE_INDICATORS]
        self.principle_patterns = [re.compile(p, re.IGNORECASE | re.MULTILINE)
                                   for p in self.PRINCIPLE_PATTERNS]
        self.wisdom_patterns = [re.compile(p, re.IGNORECASE | re.MULTILINE)
                                for p in self.WISDOM_STARTERS]

    def extract_quotes(self, text: str) -> List[Dict]:
        """
        Extract all quotable passages from text.

        Returns:
            List of quote dicts with 'text', 'type', 'quality'
        """
        quotes = []

        # Extract direct quotes
        for pattern in self.quote_patterns:
            for match in pattern.finditer(text):
                quote = match.group(1).strip()
                if self._is_valid_quote(quote):
                    quotes.append({
                        'text': quote,
                        'type': 'direct_quote',
                        'quality': self._score_quote(quote),
                        'position': match.start()
                    })

        # Extract principles/rules
        for pattern in self.principle_patterns:
            for match in pattern.finditer(text):
                quote = match.group(1).strip()
                if self._is_valid_quote(quote):
                    quotes.append({
                        'text': quote,
                        'type': 'principle',
                        'quality': self._score_quote(quote) * 1.1,  # Boost principles
                        'position': match.start()
                    })

        # Extract wisdom statements
        sentences = self._split_sentences(text)
        for sentence in sentences:
            for pattern in self.wisdom_patterns:
                match = pattern.match(sentence.strip())
                if match:
                    quote = match.group(1).strip()
                    if self._is_valid_quote(quote):
                        quotes.append({
                            'text': quote,
                            'type': 'wisdom',
                            'quality': self._score_quote(quote) * 1.05,
                            'position': text.find(sentence)
                        })

        # Deduplicate and filter
        quotes = self._deduplicate(quotes)
        quotes = [q for q in quotes if q['quality'] >= self.min_quality_score]

        # Sort by quality
        quotes.sort(key=lambda x: x['quality'], reverse=True)

        return quotes

    def extract_best_quote(self, text: str) -> Dict:
        """
        Extract the single best quote from text.
        """
        quotes = self.extract_quotes(text)
        if quotes:
            return quotes[0]
        return None

    def _is_valid_quote(self, quote: str) -> bool:
        """Check if quote meets basic criteria"""
        if not quote:
            return False

        # Length check
        if len(quote) < self.min_length or len(quote) > self.max_length:
            return False

        # Should have proper ending
        if not quote.rstrip()[-1] in '.!?"\'':
            return False

        # Should not be all caps
        if quote.isupper():
            return False

        # Should have some substance
        word_count = len(quote.split())
        if word_count < 5:
            return False

        return True

    def _score_quote(self, quote: str) -> float:
        """
        Score quote quality (0-1).

        Higher scores for:
        - Good length (not too short, not too long)
        - Presence of investment terms
        - Complete sentences
        - Memorability indicators
        """
        score = 0.5  # Base score

        # Length scoring (ideal: 50-150 chars)
        length = len(quote)
        if 50 <= length <= 150:
            score += 0.2
        elif 30 <= length <= 200:
            score += 0.1

        # Investment term presence
        investment_terms = [
            'invest', 'value', 'price', 'market', 'risk', 'return',
            'compound', 'margin', 'moat', 'business', 'capital'
        ]
        quote_lower = quote.lower()
        term_count = sum(1 for term in investment_terms if term in quote_lower)
        score += min(0.2, term_count * 0.05)

        # Memorability indicators
        memorable_patterns = [
            r'never\b', r'always\b', r'the key', r'most important',
            r'secret', r'simple', r'compound', r'patience'
        ]
        for pattern in memorable_patterns:
            if re.search(pattern, quote_lower):
                score += 0.05

        # Action words
        if any(word in quote_lower for word in ['buy', 'sell', 'hold', 'avoid', 'seek']):
            score += 0.1

        # Penalize questions (usually not quotable as standalone)
        if quote.endswith('?'):
            score -= 0.15

        return min(1.0, score)

    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences"""
        # Simple sentence splitting
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]

    def _deduplicate(self, quotes: List[Dict]) -> List[Dict]:
        """Remove duplicate or overlapping quotes"""
        seen_texts = set()
        unique = []

        for quote in quotes:
            # Normalize for comparison
            normalized = quote['text'].lower()[:50]

            if normalized not in seen_texts:
                seen_texts.add(normalized)
                unique.append(quote)

        return unique

    def format_as_blockquote(self, quote: Dict, author: str = None) -> str:
        """Format quote as markdown blockquote"""
        text = f"> {quote['text']}"
        if author:
            text += f"\n> — {author}"
        return text

    def extract_with_context(self, text: str, context_chars: int = 100) -> List[Dict]:
        """
        Extract quotes with surrounding context.

        Useful for understanding where a quote comes from.
        """
        quotes = self.extract_quotes(text)

        for quote in quotes:
            pos = quote.get('position', 0)
            start = max(0, pos - context_chars)
            end = min(len(text), pos + len(quote['text']) + context_chars)

            quote['context'] = {
                'before': text[start:pos].strip(),
                'after': text[pos + len(quote['text']):end].strip()
            }

        return quotes
