# src/services/ai/knowledge/maintenance/quality_scorer.py

"""
Score the quality of knowledge chunks.

Used to:
- Prioritize high-quality content in retrieval
- Identify low-quality content for review
- Filter chunks during indexing
"""

import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)


class QualityScorer:
    """
    Score knowledge chunk quality based on multiple factors.

    Scores consider:
    - Content length and completeness
    - Investment term density
    - Readability and structure
    - Source authority
    - Metadata completeness
    """

    # Investment terms that indicate substantive content
    INVESTMENT_TERMS = {
        # Valuation
        'valuation', 'intrinsic value', 'margin of safety', 'dcf', 'multiple',
        'earnings', 'cash flow', 'price', 'value',

        # Quality
        'moat', 'competitive advantage', 'pricing power', 'roe', 'roic',
        'quality', 'compounding', 'durable',

        # Risk
        'risk', 'downside', 'volatility', 'leverage', 'debt', 'margin',
        'black swan', 'tail risk', 'uncertainty',

        # Management
        'management', 'capital allocation', 'governance', 'incentive',
        'ceo', 'founder', 'leadership',

        # Strategy
        'invest', 'portfolio', 'position', 'buy', 'sell', 'hold',
        'long-term', 'patience', 'discipline',

        # Psychology
        'psychology', 'behavior', 'emotion', 'bias', 'fear', 'greed',
        'sentiment', 'cycle',
    }

    # High-authority sources (boost score)
    AUTHORITY_SOURCES = {
        'berkshire hathaway': 1.3,
        'warren buffett': 1.3,
        'charlie munger': 1.25,
        'nassim taleb': 1.2,
        'howard marks': 1.2,
        'aswath damodaran': 1.2,
        'farnam street': 1.15,
        'morgan housel': 1.15,
    }

    def __init__(self,
                 min_length: int = 100,
                 max_length: int = 5000,
                 ideal_length: int = 800):
        """
        Args:
            min_length: Minimum acceptable length
            max_length: Maximum acceptable length
            ideal_length: Ideal chunk length
        """
        self.min_length = min_length
        self.max_length = max_length
        self.ideal_length = ideal_length

    def score_chunk(self, chunk: Dict) -> float:
        """
        Score a single chunk (0-1).

        Args:
            chunk: Dict with 'content' and optionally 'metadata'

        Returns:
            Quality score between 0 and 1
        """
        content = chunk.get('content', '')
        metadata = chunk.get('metadata', {})

        # Component scores
        length_score = self._score_length(content)
        term_score = self._score_investment_terms(content)
        structure_score = self._score_structure(content)
        metadata_score = self._score_metadata(metadata)
        authority_score = self._score_authority(metadata)

        # Weighted combination
        raw_score = (
            length_score * 0.2 +
            term_score * 0.3 +
            structure_score * 0.2 +
            metadata_score * 0.15 +
            authority_score * 0.15
        )

        # Apply authority multiplier
        final_score = min(1.0, raw_score * authority_score)

        return round(final_score, 3)

    def _score_length(self, content: str) -> float:
        """Score based on content length"""
        length = len(content)

        if length < self.min_length:
            return 0.2  # Too short

        if length > self.max_length:
            return 0.6  # Too long but still usable

        # Ideal range scoring
        if length < self.ideal_length:
            # Ramp up to ideal
            return 0.5 + 0.5 * (length - self.min_length) / (self.ideal_length - self.min_length)
        else:
            # Slight decay after ideal
            excess = (length - self.ideal_length) / (self.max_length - self.ideal_length)
            return max(0.7, 1.0 - 0.3 * excess)

    def _score_investment_terms(self, content: str) -> float:
        """Score based on investment term density"""
        content_lower = content.lower()
        word_count = len(content.split())

        if word_count == 0:
            return 0

        # Count term occurrences
        term_count = sum(
            1 for term in self.INVESTMENT_TERMS
            if term in content_lower
        )

        # Calculate density (terms per 100 words)
        density = (term_count / word_count) * 100

        # Score based on density (ideal: 3-10 terms per 100 words)
        if density < 1:
            return 0.3
        elif density < 3:
            return 0.5 + 0.2 * (density - 1) / 2
        elif density <= 10:
            return 0.9 + 0.1 * (density - 3) / 7
        else:
            # Too dense might be a list or index
            return 0.8

    def _score_structure(self, content: str) -> float:
        """Score based on content structure"""
        score = 0.5  # Base

        # Has paragraphs
        if '\n\n' in content:
            score += 0.2

        # Has sentences (ends with punctuation)
        sentence_count = len(re.findall(r'[.!?]', content))
        if sentence_count >= 3:
            score += 0.15

        # Has some capitalization (not all lowercase)
        if not content.islower() and not content.isupper():
            score += 0.1

        # Not mostly symbols/numbers
        alpha_ratio = sum(1 for c in content if c.isalpha()) / max(1, len(content))
        if alpha_ratio > 0.7:
            score += 0.15

        return min(1.0, score)

    def _score_metadata(self, metadata: Dict) -> float:
        """Score based on metadata completeness"""
        score = 0.5  # Base

        # Key metadata fields
        if metadata.get('source'):
            score += 0.15
        if metadata.get('author'):
            score += 0.15
        if metadata.get('date') or metadata.get('year'):
            score += 0.1
        if metadata.get('title'):
            score += 0.1
        if metadata.get('topics'):
            score += 0.1

        return min(1.0, score)

    def _score_authority(self, metadata: Dict) -> float:
        """Score based on source authority"""
        source = (metadata.get('source', '') or '').lower()
        author = (metadata.get('author', '') or '').lower()

        # Check against authority sources
        for name, multiplier in self.AUTHORITY_SOURCES.items():
            if name in source or name in author:
                return multiplier

        return 1.0  # Default multiplier

    def score_chunks(self, chunks: List[Dict]) -> List[Dict]:
        """
        Score multiple chunks and add quality scores.

        Returns chunks with 'quality_score' added to metadata.
        """
        for chunk in chunks:
            score = self.score_chunk(chunk)

            if 'metadata' not in chunk:
                chunk['metadata'] = {}

            chunk['metadata']['quality_score'] = score

        return chunks

    def filter_by_quality(self,
                          chunks: List[Dict],
                          min_score: float = 0.5) -> List[Dict]:
        """Filter chunks by minimum quality score"""
        scored = self.score_chunks(chunks)

        filtered = [
            c for c in scored
            if c.get('metadata', {}).get('quality_score', 0) >= min_score
        ]

        logger.info(f"Quality filter: {len(filtered)}/{len(chunks)} chunks above {min_score}")
        return filtered

    def get_quality_distribution(self, chunks: List[Dict]) -> Dict:
        """Get distribution of quality scores"""
        if not chunks:
            return {}

        scores = [self.score_chunk(c) for c in chunks]

        # Buckets
        buckets = {
            'excellent': 0,  # 0.8+
            'good': 0,       # 0.6-0.8
            'fair': 0,       # 0.4-0.6
            'poor': 0,       # 0.2-0.4
            'very_poor': 0   # <0.2
        }

        for score in scores:
            if score >= 0.8:
                buckets['excellent'] += 1
            elif score >= 0.6:
                buckets['good'] += 1
            elif score >= 0.4:
                buckets['fair'] += 1
            elif score >= 0.2:
                buckets['poor'] += 1
            else:
                buckets['very_poor'] += 1

        return {
            'distribution': buckets,
            'average': sum(scores) / len(scores),
            'min': min(scores),
            'max': max(scores),
            'total': len(chunks)
        }
