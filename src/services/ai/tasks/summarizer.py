# src/services/ai/tasks/summarizer.py

import logging
from typing import Dict, List, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SummaryResult:
    """Result of text summarization"""
    summary: str
    original_length: int
    summary_length: int
    compression_ratio: float
    key_points: List[str] = None


class Summarizer:
    """
    Summarize long-form content for LLM context.

    Strategies:
    - Direct LLM summarization for shorter content
    - Chunk-and-summarize for very long content
    - Extract key points and metrics
    """

    # Maximum characters to send to LLM at once
    CHUNK_SIZE = 6000
    MAX_SUMMARY_LENGTH = 500

    def __init__(self, router=None):
        """
        Initialize summarizer.

        Args:
            router: ModelRouter for LLM-based summarization
        """
        self.router = router

    def summarize(self,
                  text: str,
                  max_length: int = None,
                  style: str = 'concise') -> SummaryResult:
        """
        Summarize text content.

        Args:
            text: Text to summarize
            max_length: Maximum summary length in characters
            style: 'concise', 'detailed', or 'bullet_points'

        Returns:
            SummaryResult with summary and metadata
        """
        max_length = max_length or self.MAX_SUMMARY_LENGTH
        original_length = len(text)

        # If text is already short, return as-is
        if original_length <= max_length:
            return SummaryResult(
                summary=text,
                original_length=original_length,
                summary_length=original_length,
                compression_ratio=1.0
            )

        # Choose summarization method
        if self.router and original_length > 500:
            summary = self._summarize_with_llm(text, max_length, style)
        else:
            summary = self._summarize_extractive(text, max_length)

        return SummaryResult(
            summary=summary,
            original_length=original_length,
            summary_length=len(summary),
            compression_ratio=len(summary) / original_length
        )

    def summarize_chunks(self,
                         texts: List[str],
                         max_length_per_chunk: int = 200) -> str:
        """
        Summarize multiple text chunks into one summary.

        Args:
            texts: List of text chunks
            max_length_per_chunk: Max summary length per chunk

        Returns:
            Combined summary
        """
        summaries = []
        for text in texts:
            result = self.summarize(text, max_length=max_length_per_chunk)
            summaries.append(result.summary)

        combined = "\n".join(summaries)

        # If combined is still too long, summarize again
        if len(combined) > 1000:
            final = self.summarize(combined, max_length=800)
            return final.summary

        return combined

    def extract_key_points(self,
                           text: str,
                           num_points: int = 5) -> List[str]:
        """
        Extract key points from text.

        Args:
            text: Text to analyze
            num_points: Number of key points to extract

        Returns:
            List of key points
        """
        if self.router:
            return self._extract_points_with_llm(text, num_points)
        else:
            return self._extract_points_extractive(text, num_points)

    def summarize_financial_content(self,
                                    content: Dict,
                                    content_type: str = 'news') -> str:
        """
        Summarize financial content with domain-specific formatting.

        Args:
            content: Content dictionary with title, body, etc.
            content_type: 'news', 'report', 'filing', 'research'

        Returns:
            Formatted summary
        """
        if content_type == 'news':
            return self._summarize_news(content)
        elif content_type == 'filing':
            return self._summarize_filing(content)
        elif content_type == 'research':
            return self._summarize_research(content)
        else:
            # Default to general summary
            text = content.get('body', content.get('content', ''))
            return self.summarize(text).summary

    def _summarize_with_llm(self,
                            text: str,
                            max_length: int,
                            style: str) -> str:
        """Summarize using LLM"""
        style_instructions = {
            'concise': 'Be extremely concise. Focus only on the most important facts.',
            'detailed': 'Provide a comprehensive summary covering all key points.',
            'bullet_points': 'Format as a bulleted list of key points.'
        }

        prompt = f"""Summarize the following content in approximately {max_length} characters.
{style_instructions.get(style, '')}
Focus on investment-relevant information: metrics, trends, risks, and opportunities.

Content:
{text[:self.CHUNK_SIZE]}

Summary:"""

        try:
            from ..llm.base import TaskType
            response = self.router.route(TaskType.SUMMARIZATION, prompt=prompt)
            return response.content.strip()
        except Exception as e:
            logger.warning(f"LLM summarization failed: {e}")
            return self._summarize_extractive(text, max_length)

    def _summarize_extractive(self, text: str, max_length: int) -> str:
        """Simple extractive summarization (first N characters)"""
        # Split into sentences
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text)

        # Take sentences until we reach max_length
        summary_parts = []
        current_length = 0

        for sentence in sentences:
            if current_length + len(sentence) + 1 <= max_length:
                summary_parts.append(sentence)
                current_length += len(sentence) + 1
            else:
                break

        if not summary_parts:
            # Just truncate if no complete sentences
            return text[:max_length-3] + '...'

        return ' '.join(summary_parts)

    def _extract_points_with_llm(self, text: str, num_points: int) -> List[str]:
        """Extract key points using LLM"""
        prompt = f"""Extract exactly {num_points} key points from this content.
Each point should be one concise sentence.
Focus on investment-relevant insights.

Content:
{text[:self.CHUNK_SIZE]}

Key points (one per line):"""

        try:
            from ..llm.base import TaskType
            response = self.router.route(TaskType.SUMMARIZATION, prompt=prompt)

            # Parse response into list
            lines = response.content.strip().split('\n')
            points = []
            for line in lines:
                # Remove bullet points or numbers
                import re
                cleaned = re.sub(r'^[\d\.\-\*\•]+\s*', '', line.strip())
                if cleaned:
                    points.append(cleaned)

            return points[:num_points]
        except Exception as e:
            logger.warning(f"LLM key point extraction failed: {e}")
            return self._extract_points_extractive(text, num_points)

    def _extract_points_extractive(self, text: str, num_points: int) -> List[str]:
        """Extract key points using simple heuristics"""
        import re

        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+', text)

        # Score sentences by keyword presence
        keywords = ['revenue', 'profit', 'growth', 'increase', 'decrease',
                    'risk', 'opportunity', 'market', 'earnings', 'margin',
                    'forecast', 'guidance', 'expect', 'beat', 'miss']

        scored = []
        for sentence in sentences:
            score = sum(1 for kw in keywords if kw in sentence.lower())
            if len(sentence) > 20 and len(sentence) < 200:
                scored.append((score, sentence))

        # Sort by score and take top N
        scored.sort(key=lambda x: x[0], reverse=True)
        return [s[1] for s in scored[:num_points]]

    def _summarize_news(self, content: Dict) -> str:
        """Summarize news article"""
        title = content.get('title', '')
        body = content.get('body', content.get('content', ''))
        source = content.get('source', '')
        date = content.get('published_at', content.get('date', ''))

        # Build context
        text = f"Title: {title}\n\n{body}"
        summary = self.summarize(text, max_length=300).summary

        return f"[{source} - {date}] {summary}"

    def _summarize_filing(self, content: Dict) -> str:
        """Summarize SEC filing"""
        form_type = content.get('form_type', '')
        company = content.get('company', '')
        items = content.get('items', [])

        lines = [f"{form_type} Filing - {company}"]

        for item in items[:5]:
            item_text = item.get('content', '')[:500]
            summary = self.summarize(item_text, max_length=100).summary
            lines.append(f"- {summary}")

        return '\n'.join(lines)

    def _summarize_research(self, content: Dict) -> str:
        """Summarize research report"""
        title = content.get('title', '')
        analyst = content.get('analyst', '')
        rating = content.get('rating', '')
        target = content.get('price_target', '')
        thesis = content.get('thesis', content.get('content', ''))

        summary = self.summarize(thesis, max_length=400).summary

        lines = [f"Research: {title}"]
        if analyst:
            lines.append(f"Analyst: {analyst}")
        if rating:
            lines.append(f"Rating: {rating}")
        if target:
            lines.append(f"Price Target: ${target}")
        lines.append(f"Summary: {summary}")

        return '\n'.join(lines)
