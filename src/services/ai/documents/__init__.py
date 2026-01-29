# src/services/ai/documents/__init__.py

"""
Document Analysis

Provides:
- DocumentExtractor: Extract text from PDF, HTML, DOCX
- TranscriptParser: Parse earnings call transcripts
- EarningsCallAnalyzer: Analyze earnings transcripts with AI
- FilingAnalyzer: Analyze SEC filings (10-K, 10-Q)
"""

from .extractor import DocumentExtractor, TranscriptParser
from .earnings_analyzer import EarningsCallAnalyzer, EarningsAnalysis, FilingAnalyzer

__all__ = [
    'DocumentExtractor',
    'TranscriptParser',
    'EarningsCallAnalyzer',
    'EarningsAnalysis',
    'FilingAnalyzer'
]
