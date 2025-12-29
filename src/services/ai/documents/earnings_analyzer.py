# src/services/ai/documents/earnings_analyzer.py

from typing import Dict, List, Optional
from dataclasses import dataclass, field
import re
import logging

logger = logging.getLogger(__name__)


@dataclass
class EarningsAnalysis:
    """Structured analysis of an earnings call"""
    symbol: str
    quarter: str

    # Extracted data
    revenue: Optional[str] = None
    eps: Optional[str] = None
    guidance: Optional[str] = None

    # AI analysis
    key_takeaways: List[str] = field(default_factory=list)
    sentiment: str = "neutral"  # 'positive', 'negative', 'neutral', 'mixed'
    management_tone: str = "neutral"
    concerns: List[str] = field(default_factory=list)
    positives: List[str] = field(default_factory=list)

    # Quotes
    notable_quotes: List[Dict[str, str]] = field(default_factory=list)

    # Summary
    summary: str = ""
    investment_implications: str = ""


class EarningsCallAnalyzer:
    """
    Analyze earnings call transcripts using AI.

    Extracts:
    - Key metrics mentioned
    - Management tone and sentiment
    - Guidance and outlook
    - Notable quotes
    - Investment implications
    """

    EARNINGS_SYSTEM_PROMPT = """
You are an expert financial analyst specializing in earnings call analysis.

When analyzing transcripts, focus on:
1. KEY METRICS: Revenue, EPS, margins, growth rates
2. GUIDANCE: Forward-looking statements, targets, outlook
3. TONE: Management confidence, defensiveness, optimism
4. RED FLAGS: Hedging language, blame-shifting, avoiding questions
5. POSITIVE SIGNALS: Confidence, specific commitments, upside surprises

Be specific. Quote directly when relevant. Identify what matters for investors.
"""

    def __init__(self, router, extractor=None):
        """
        Initialize earnings analyzer.

        Args:
            router: ModelRouter for LLM access
            extractor: DocumentExtractor for file processing
        """
        self.router = router
        self.extractor = extractor

    async def analyze_transcript(self,
                                 transcript_text: str = None,
                                 transcript_file: bytes = None,
                                 symbol: str = None,
                                 quarter: str = None) -> EarningsAnalysis:
        """
        Analyze an earnings call transcript.

        Args:
            transcript_text: Raw transcript text
            transcript_file: File bytes to extract
            symbol: Company ticker
            quarter: e.g., "Q3 2024"

        Returns:
            Structured EarningsAnalysis
        """
        # Extract text if file provided
        if transcript_file and not transcript_text and self.extractor:
            transcript_text = self.extractor.extract(
                file_bytes=transcript_file,
                file_type='pdf'
            )

        if not transcript_text:
            raise ValueError("No transcript content provided")

        # Truncate if too long (keep beginning and end)
        transcript_text = self._smart_truncate(transcript_text, max_chars=50000)

        # Run analysis in stages for better results

        # Stage 1: Extract key metrics
        metrics = await self._extract_metrics(transcript_text)

        # Stage 2: Analyze sentiment and tone
        sentiment = await self._analyze_sentiment(transcript_text)

        # Stage 3: Extract notable quotes
        quotes = await self._extract_quotes(transcript_text)

        # Stage 4: Generate summary and implications
        summary = await self._generate_summary(
            transcript_text, metrics, sentiment, quotes
        )

        return EarningsAnalysis(
            symbol=symbol or "UNKNOWN",
            quarter=quarter or "Unknown Quarter",
            revenue=metrics.get('revenue'),
            eps=metrics.get('eps'),
            guidance=metrics.get('guidance'),
            key_takeaways=summary.get('key_takeaways', []),
            sentiment=sentiment.get('overall', 'neutral'),
            management_tone=sentiment.get('tone', 'neutral'),
            concerns=summary.get('concerns', []),
            positives=summary.get('positives', []),
            notable_quotes=quotes,
            summary=summary.get('summary', ''),
            investment_implications=summary.get('implications', '')
        )

    async def _extract_metrics(self, transcript: str) -> Dict:
        """Extract key financial metrics mentioned"""
        from ..llm.base import TaskType

        prompt = f"""
Extract the key financial metrics from this earnings call transcript.

Return in this exact format:
REVENUE: [amount and growth]
EPS: [amount and comparison]
GUIDANCE: [any forward guidance given]
OTHER_METRICS: [other important numbers mentioned]

Transcript (excerpt):
{transcript[:15000]}

Extract only what's explicitly stated. Say "Not mentioned" if not found.
"""

        response = self.router.route(
            TaskType.ENTITY_EXTRACTION,
            prompt=prompt,
            temperature=0.1
        )

        # Parse response
        metrics = {}
        for line in response.content.split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                if len(parts) == 2:
                    key = parts[0].strip().lower().replace(' ', '_')
                    metrics[key] = parts[1].strip()

        return metrics

    async def _analyze_sentiment(self, transcript: str) -> Dict:
        """Analyze management tone and sentiment"""
        from ..llm.base import TaskType

        prompt = f"""
Analyze the tone and sentiment of management in this earnings call.

Consider:
- Confidence level (confident, cautious, defensive)
- Optimism about future (optimistic, neutral, pessimistic)
- How they handle tough questions
- Language patterns (hedging, specificity, blame-shifting)

Transcript (excerpt):
{transcript[:20000]}

Return:
OVERALL_SENTIMENT: [positive/negative/neutral/mixed]
MANAGEMENT_TONE: [description]
CONFIDENCE_LEVEL: [high/medium/low]
RED_FLAGS: [any concerning language patterns]
POSITIVE_SIGNALS: [any encouraging signs]
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            prompt=prompt,
            temperature=0.3
        )

        # Parse response
        sentiment = {'overall': 'neutral', 'tone': 'neutral'}
        for line in response.content.split('\n'):
            if 'OVERALL_SENTIMENT:' in line:
                sentiment['overall'] = line.split(':')[1].strip().lower()
            elif 'MANAGEMENT_TONE:' in line:
                sentiment['tone'] = line.split(':')[1].strip()
            elif 'CONFIDENCE_LEVEL:' in line:
                sentiment['confidence'] = line.split(':')[1].strip().lower()

        return sentiment

    async def _extract_quotes(self, transcript: str) -> List[Dict]:
        """Extract notable quotes from the call"""
        from ..llm.base import TaskType

        prompt = f"""
Extract 3-5 of the most important or revealing quotes from this earnings call.

Focus on quotes that:
- Reveal management's true thinking
- Contain specific commitments or targets
- Show confidence or concern
- Would matter to investors

Transcript (excerpt):
{transcript[:25000]}

For each quote, provide:
QUOTE: "[exact or near-exact quote]"
SPEAKER: [who said it]
SIGNIFICANCE: [why it matters]

Return the most important quotes only.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            prompt=prompt,
            temperature=0.3
        )

        # Parse quotes
        quotes = []
        current_quote = {}

        for line in response.content.split('\n'):
            line = line.strip()
            if line.startswith('QUOTE:'):
                if current_quote and current_quote.get('quote'):
                    quotes.append(current_quote)
                current_quote = {'quote': line.replace('QUOTE:', '').strip().strip('"')}
            elif line.startswith('SPEAKER:'):
                current_quote['speaker'] = line.replace('SPEAKER:', '').strip()
            elif line.startswith('SIGNIFICANCE:'):
                current_quote['significance'] = line.replace('SIGNIFICANCE:', '').strip()

        if current_quote and current_quote.get('quote'):
            quotes.append(current_quote)

        return quotes[:5]

    async def _generate_summary(self,
                                transcript: str,
                                metrics: Dict,
                                sentiment: Dict,
                                quotes: List[Dict]) -> Dict:
        """Generate overall summary and investment implications"""
        from ..llm.base import TaskType

        context = f"""
EXTRACTED METRICS:
{metrics}

SENTIMENT ANALYSIS:
{sentiment}

KEY QUOTES:
{quotes}
"""

        prompt = f"""
Based on this earnings call analysis, provide:

1. SUMMARY: 3-4 sentence overview of the call
2. KEY_TAKEAWAYS: Bullet points of most important items (max 5)
3. POSITIVES: What went well or looks promising
4. CONCERNS: What's worrying or needs monitoring
5. INVESTMENT_IMPLICATIONS: What this means for investors

Analysis context:
{context}

Transcript excerpt for reference:
{transcript[:10000]}

Be specific and actionable. Focus on what matters for investment decisions.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            prompt=prompt,
            temperature=0.4
        )

        # Parse response
        result = {
            'summary': '',
            'key_takeaways': [],
            'positives': [],
            'concerns': [],
            'implications': ''
        }

        current_section = None
        for line in response.content.split('\n'):
            line = line.strip()

            if 'SUMMARY:' in line:
                current_section = 'summary'
                result['summary'] = line.replace('SUMMARY:', '').strip()
            elif 'KEY_TAKEAWAYS:' in line:
                current_section = 'key_takeaways'
            elif 'POSITIVES:' in line:
                current_section = 'positives'
            elif 'CONCERNS:' in line:
                current_section = 'concerns'
            elif 'INVESTMENT_IMPLICATIONS:' in line:
                current_section = 'implications'
                result['implications'] = line.replace('INVESTMENT_IMPLICATIONS:', '').strip()
            elif line.startswith(('-', '•', '*')) and current_section in ('key_takeaways', 'positives', 'concerns'):
                result[current_section].append(line.lstrip('-•* '))
            elif current_section == 'summary' and line:
                result['summary'] += ' ' + line
            elif current_section == 'implications' and line:
                result['implications'] += ' ' + line

        return result

    def _smart_truncate(self, text: str, max_chars: int) -> str:
        """Truncate text while keeping beginning and end"""
        if len(text) <= max_chars:
            return text

        # Keep 70% from beginning, 30% from end
        begin_chars = int(max_chars * 0.7)
        end_chars = int(max_chars * 0.3)

        return (
            text[:begin_chars] +
            "\n\n[... transcript truncated ...]\n\n" +
            text[-end_chars:]
        )


class FilingAnalyzer:
    """
    Analyze SEC filings (10-K, 10-Q) using AI.

    Extracts:
    - Key financial highlights
    - Risk factors
    - MD&A insights
    - Segment performance
    """

    def __init__(self, router, extractor=None):
        """
        Initialize filing analyzer.

        Args:
            router: ModelRouter for LLM access
            extractor: DocumentExtractor for file processing
        """
        self.router = router
        self.extractor = extractor

    async def analyze(self,
                      filing_text: str = None,
                      filing_file: bytes = None,
                      filing_type: str = '10-K',
                      symbol: str = None) -> Dict:
        """
        Analyze a SEC filing.

        Args:
            filing_text: Raw filing text
            filing_file: File bytes to extract
            filing_type: '10-K' or '10-Q'
            symbol: Company ticker

        Returns:
            Structured analysis
        """
        # Extract text if file provided
        if filing_file and not filing_text and self.extractor:
            filing_text = self.extractor.extract(
                file_bytes=filing_file,
                file_type='html'  # SEC filings are usually HTML
            )

        if not filing_text:
            raise ValueError("No filing content provided")

        # Truncate for analysis
        filing_text = self._smart_truncate(filing_text, max_chars=60000)

        # Analyze different sections
        from ..llm.base import TaskType

        prompt = f"""
Analyze this {filing_type} filing for {symbol or 'the company'}.

Filing excerpt:
{filing_text[:30000]}

Provide:
1. BUSINESS_OVERVIEW: 2-3 sentence summary of the business
2. KEY_FINANCIALS: Revenue, profit, key metrics mentioned
3. RISK_FACTORS: Top 3-5 most important risks
4. MANAGEMENT_OUTLOOK: What management says about future
5. NOTABLE_CHANGES: What's different from previous filings
6. INVESTOR_TAKEAWAYS: Key points for investors

Be specific and cite numbers when available.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            prompt=prompt,
            temperature=0.3
        )

        return {
            'symbol': symbol,
            'filing_type': filing_type,
            'analysis': response.content,
            'word_count': len(filing_text.split())
        }

    def _smart_truncate(self, text: str, max_chars: int) -> str:
        """Truncate text while keeping important sections"""
        if len(text) <= max_chars:
            return text

        # Try to keep Item 1A (Risk Factors) and Item 7 (MD&A)
        item_1a = text.find('Item 1A')
        item_7 = text.find('Item 7')

        chunks = [text[:max_chars // 3]]  # Beginning

        if item_1a > 0:
            chunks.append(text[item_1a:item_1a + max_chars // 3])

        if item_7 > 0:
            chunks.append(text[item_7:item_7 + max_chars // 3])

        return "\n\n[...]\n\n".join(chunks)
