#!/usr/bin/env python3
# src/services/ai/notes_ai_service.py
"""
AI Service for Notes and Thesis Features.

Provides AI-powered features for research notes:
- Note summarization
- Assumption extraction from notes
- Thesis validation and challenges
- Key insight extraction
- Related note suggestions
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

# Try to import Anthropic client
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class AIResponse:
    """Container for AI response data."""
    content: str
    model: str
    tokens_used: int
    cost_usd: float
    metadata: Optional[Dict] = None


class NotesAIService:
    """AI service for notes and thesis features."""

    def __init__(self):
        """Initialize the notes AI service."""
        self.anthropic_key = os.environ.get('ANTHROPIC_API_KEY')
        self.model = os.environ.get('ANTHROPIC_MODEL', 'claude-3-haiku-20240307')
        self.client = None

        if ANTHROPIC_AVAILABLE and self.anthropic_key:
            self.client = anthropic.Anthropic(api_key=self.anthropic_key)
            logger.info(f"NotesAIService initialized with model: {self.model}")
        else:
            logger.warning("Anthropic client not available - AI features disabled")

    def is_available(self) -> bool:
        """Check if AI service is available."""
        return self.client is not None

    def _call_api(self, system_prompt: str, user_message: str, max_tokens: int = 1024) -> AIResponse:
        """Make API call to Claude."""
        if not self.is_available():
            return AIResponse(
                content="AI service not available. Please configure ANTHROPIC_API_KEY.",
                model="none",
                tokens_used=0,
                cost_usd=0
            )

        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}]
            )

            # Calculate cost (approximate for haiku)
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens

            # Haiku pricing: $0.25/1M input, $1.25/1M output
            cost = (input_tokens * 0.25 / 1_000_000) + (output_tokens * 1.25 / 1_000_000)

            return AIResponse(
                content=response.content[0].text,
                model=self.model,
                tokens_used=input_tokens + output_tokens,
                cost_usd=cost
            )
        except Exception as e:
            logger.error(f"API call failed: {e}")
            return AIResponse(
                content=f"Error: {str(e)}",
                model=self.model,
                tokens_used=0,
                cost_usd=0
            )

    def summarize_note(self, note_content: str, note_title: str = "",
                       max_length: int = 200) -> AIResponse:
        """
        Generate a concise summary of a research note.

        Args:
            note_content: The full text content of the note
            note_title: Optional title of the note
            max_length: Target length for summary in words

        Returns:
            AIResponse with summary
        """
        system_prompt = """You are a financial research analyst assistant. Your task is to
summarize research notes concisely while preserving key insights and investment implications.

Guidelines:
- Focus on investment-relevant information
- Highlight key metrics, conclusions, and action items
- Maintain objectivity and accuracy
- Be concise but comprehensive"""

        user_message = f"""Summarize the following research note in approximately {max_length} words.

Title: {note_title}

Content:
{note_content}

Provide a clear, investment-focused summary."""

        return self._call_api(system_prompt, user_message, max_tokens=512)

    def extract_assumptions(self, note_content: str, thesis_context: str = "") -> AIResponse:
        """
        Extract investment assumptions from a research note.

        Args:
            note_content: The text content to analyze
            thesis_context: Optional thesis context for relevance

        Returns:
            AIResponse with structured assumption list (JSON)
        """
        system_prompt = """You are a financial research analyst specializing in investment thesis analysis.
Your task is to identify and extract investment assumptions from research notes.

An investment assumption is a belief or expectation about:
- Future business performance (revenue growth, margins, etc.)
- Market conditions or competitive dynamics
- Management execution or strategy
- Macroeconomic factors
- Regulatory or industry trends

For each assumption, assess:
- Importance: critical, high, medium, low
- Verifiability: Can this be tracked with metrics?
- Suggested metrics or data points to validate

Return your response as valid JSON."""

        user_message = f"""Analyze the following research content and extract investment assumptions.

{f"Thesis Context: {thesis_context}" if thesis_context else ""}

Content to analyze:
{note_content}

Return a JSON object with the following structure:
{{
  "assumptions": [
    {{
      "text": "The assumption statement",
      "importance": "critical|high|medium|low",
      "category": "growth|profitability|competitive|management|macro|regulatory",
      "verifiable": true|false,
      "suggested_metrics": ["metric1", "metric2"],
      "validation_criteria": "How to validate this assumption"
    }}
  ],
  "key_themes": ["theme1", "theme2"],
  "thesis_implications": "Brief summary of implications for the investment thesis"
}}"""

        response = self._call_api(system_prompt, user_message, max_tokens=1500)

        # Try to parse JSON from response
        try:
            # Extract JSON from response if wrapped in markdown
            content = response.content
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]

            parsed = json.loads(content)
            response.metadata = parsed
        except json.JSONDecodeError:
            logger.warning("Could not parse assumptions as JSON")

        return response

    def challenge_thesis(self, thesis_summary: str, assumptions: List[Dict],
                         company_data: Optional[Dict] = None) -> AIResponse:
        """
        Generate challenges and risk factors for an investment thesis.

        Args:
            thesis_summary: Summary of the investment thesis
            assumptions: List of thesis assumptions
            company_data: Optional company financial data for context

        Returns:
            AIResponse with challenges and counter-arguments
        """
        system_prompt = """You are a skeptical investment analyst conducting a devil's advocate review
of an investment thesis. Your role is to identify weaknesses, risks, and potential blind spots.

Guidelines:
- Challenge each key assumption
- Identify what could go wrong
- Consider competitive threats and market risks
- Look for potential confirmation bias
- Suggest risk mitigants and monitoring points
- Be constructive but thorough"""

        assumptions_text = "\n".join([
            f"- {a.get('text', a.get('assumption_text', str(a)))}"
            for a in assumptions
        ])

        company_context = ""
        if company_data:
            company_context = f"""
Company Context:
- Symbol: {company_data.get('symbol', 'N/A')}
- Sector: {company_data.get('sector', 'N/A')}
- Market Cap: {company_data.get('market_cap', 'N/A')}
- Key Metrics: {json.dumps(company_data.get('metrics', {}), indent=2)}
"""

        user_message = f"""Challenge the following investment thesis:

Thesis Summary:
{thesis_summary}

Key Assumptions:
{assumptions_text}
{company_context}

Provide:
1. Main challenges to the thesis (what could invalidate it)
2. Risks not addressed by the assumptions
3. Questions that need answers
4. Suggested monitoring points
5. Overall risk assessment (low/medium/high)"""

        return self._call_api(system_prompt, user_message, max_tokens=1500)

    def extract_key_insights(self, note_content: str, note_type: str = "research") -> AIResponse:
        """
        Extract key insights and action items from a note.

        Args:
            note_content: The note content
            note_type: Type of note (research, earnings, thesis, etc.)

        Returns:
            AIResponse with structured insights
        """
        system_prompt = f"""You are a financial research analyst extracting key insights from {note_type} notes.

Focus on:
- Investment-relevant conclusions
- Quantitative insights (numbers, percentages, ratios)
- Action items or follow-ups needed
- Questions to investigate further
- Comparison points with other companies or periods"""

        user_message = f"""Extract key insights from this {note_type} note:

{note_content}

Return as JSON:
{{
  "key_insights": [
    {{
      "insight": "The insight text",
      "type": "conclusion|metric|action|question|comparison",
      "importance": "high|medium|low"
    }}
  ],
  "action_items": ["action1", "action2"],
  "follow_up_questions": ["question1", "question2"],
  "related_tickers": ["TICKER1", "TICKER2"]
}}"""

        response = self._call_api(system_prompt, user_message, max_tokens=1000)

        # Try to parse JSON
        try:
            content = response.content
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]
            parsed = json.loads(content)
            response.metadata = parsed
        except json.JSONDecodeError:
            logger.warning("Could not parse insights as JSON")

        return response

    def suggest_tags(self, note_content: str, existing_tags: List[str] = None) -> AIResponse:
        """
        Suggest tags for a note based on its content.

        Args:
            note_content: The note content
            existing_tags: List of available tags in the system

        Returns:
            AIResponse with suggested tags
        """
        system_prompt = """You are a research organization assistant. Your task is to suggest
relevant tags for research notes to improve searchability and organization.

Focus on:
- Investment themes (growth, value, dividend, etc.)
- Sectors and industries
- Analysis types (DCF, comparable, qualitative)
- Sentiment (bullish, bearish, neutral)
- Catalysts and events"""

        existing_tags_text = ""
        if existing_tags:
            existing_tags_text = f"\nExisting tags in the system: {', '.join(existing_tags)}"

        user_message = f"""Suggest tags for this research note:{existing_tags_text}

Content:
{note_content}

Return as JSON:
{{
  "suggested_tags": ["tag1", "tag2", "tag3"],
  "new_tags": ["tag that doesn't exist yet"],
  "reasoning": "Brief explanation of tag choices"
}}"""

        response = self._call_api(system_prompt, user_message, max_tokens=300)

        try:
            content = response.content
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0]
            elif '```' in content:
                content = content.split('```')[1].split('```')[0]
            parsed = json.loads(content)
            response.metadata = parsed
        except json.JSONDecodeError:
            logger.warning("Could not parse tags as JSON")

        return response


# Singleton instance
_service: Optional[NotesAIService] = None


def get_notes_ai_service() -> NotesAIService:
    """Get the singleton notes AI service instance."""
    global _service
    if _service is None:
        _service = NotesAIService()
    return _service
