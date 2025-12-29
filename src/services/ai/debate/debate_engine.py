# src/services/ai/debate/debate_engine.py

from typing import List, Dict, Optional, Generator
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class DebateFormat(Enum):
    """Types of debate formats"""
    BULL_VS_BEAR = "bull_bear"
    ROUND_TABLE = "round_table"
    DEVIL_ADVOCATE = "devil_advocate"
    THESIS_CHALLENGE = "thesis_challenge"


@dataclass
class DebateContribution:
    """A single contribution in a debate"""
    analyst_id: str
    analyst_name: str
    position: str  # 'bull', 'bear', 'neutral'
    content: str
    key_points: List[str] = field(default_factory=list)


@dataclass
class DebateResult:
    """Complete debate result"""
    format: DebateFormat
    topic: str
    symbol: str
    contributions: List[DebateContribution]
    synthesis: str
    key_disagreements: List[str]
    areas_of_agreement: List[str]


@dataclass
class AnalystPersona:
    """Simple analyst persona for debates"""
    id: str
    name: str
    style: str
    system_prompt: str


# Pre-defined analyst personas for debates
DEBATE_ANALYSTS = {
    'value': AnalystPersona(
        id='value',
        name='Benjamin Graham Jr.',
        style='value investing',
        system_prompt="""You are a value investor in the tradition of Benjamin Graham and Warren Buffett.
Focus on: intrinsic value, margin of safety, quality of earnings, balance sheet strength.
Be skeptical of growth promises. Demand proof in the financials.
Use conservative assumptions. Look for what could go wrong."""
    ),
    'growth': AnalystPersona(
        id='growth',
        name='Catherine Growth',
        style='growth investing',
        system_prompt="""You are a growth-focused investor like Cathie Wood or Philip Fisher.
Focus on: market opportunity, competitive moats, management vision, innovation.
Value long-term potential over current metrics. Look for disruption.
Accept higher valuations for truly exceptional growth."""
    ),
    'contrarian': AnalystPersona(
        id='contrarian',
        name='Michael Contraire',
        style='contrarian analysis',
        system_prompt="""You are a contrarian investor who looks for opportunities others miss.
Challenge consensus. Ask what the market is getting wrong.
Look for: hated stocks, misunderstood situations, mean reversion opportunities.
Be skeptical of popular narratives."""
    ),
    'quant': AnalystPersona(
        id='quant',
        name='Quantitative Analytics',
        style='quantitative analysis',
        system_prompt="""You are a quantitative analyst focused on data and statistics.
Rely on: historical patterns, factor exposures, valuation metrics, momentum.
Be objective. Let the numbers speak. Avoid narrative bias.
Focus on expected value and probability distributions."""
    ),
    'technical': AnalystPersona(
        id='technical',
        name='Taylor Technical',
        style='technical analysis',
        system_prompt="""You are a technical analyst focused on price action and market psychology.
Analyze: chart patterns, support/resistance, volume, momentum indicators.
Timing matters. The market tells a story through price."""
    )
}


def get_analyst(analyst_id: str) -> AnalystPersona:
    """Get an analyst persona by ID"""
    return DEBATE_ANALYSTS.get(analyst_id, DEBATE_ANALYSTS['value'])


class DebateEngine:
    """
    Orchestrate multi-analyst debates and discussions.

    Formats:
    - Bull vs Bear: Two analysts argue opposite sides
    - Round Table: Multiple analysts share perspectives
    - Devil's Advocate: Challenge a given thesis
    - Thesis Challenge: Stress test an investment idea
    """

    SYNTHESIS_PROMPT = """
You are a neutral moderator synthesizing an investment debate.

Summarize:
1. Key points of agreement
2. Key points of disagreement
3. What an investor should consider based on both sides
4. What additional research might help resolve disagreements

Be balanced and objective. Help the investor think through the decision.
"""

    def __init__(self, router):
        """
        Initialize debate engine.

        Args:
            router: ModelRouter for LLM access
        """
        self.router = router

    async def bull_vs_bear(self,
                           symbol: str,
                           company_data: Dict,
                           bull_analyst: str = 'growth',
                           bear_analyst: str = 'contrarian') -> DebateResult:
        """
        Run a Bull vs Bear debate on a stock.

        Args:
            symbol: Stock ticker
            company_data: Formatted company data
            bull_analyst: Analyst persona for bull case
            bear_analyst: Analyst persona for bear case

        Returns:
            DebateResult with both perspectives and synthesis
        """
        contributions = []

        # Get analyst personas
        bull = get_analyst(bull_analyst)
        bear = get_analyst(bear_analyst)

        # Generate bull case
        bull_response = await self._generate_position(
            analyst=bull,
            position='bull',
            symbol=symbol,
            company_data=company_data,
            opposing_view=None
        )
        contributions.append(bull_response)

        # Generate bear case (with awareness of bull case)
        bear_response = await self._generate_position(
            analyst=bear,
            position='bear',
            symbol=symbol,
            company_data=company_data,
            opposing_view=bull_response.content
        )
        contributions.append(bear_response)

        # Bull rebuttal
        bull_rebuttal = await self._generate_rebuttal(
            analyst=bull,
            position='bull',
            original_case=bull_response.content,
            opposing_case=bear_response.content,
            symbol=symbol
        )
        contributions.append(bull_rebuttal)

        # Bear rebuttal
        bear_rebuttal = await self._generate_rebuttal(
            analyst=bear,
            position='bear',
            original_case=bear_response.content,
            opposing_case=bull_response.content,
            symbol=symbol
        )
        contributions.append(bear_rebuttal)

        # Synthesize
        synthesis = await self._synthesize_debate(symbol, contributions)

        return DebateResult(
            format=DebateFormat.BULL_VS_BEAR,
            topic=f"Investment case for {symbol}",
            symbol=symbol,
            contributions=contributions,
            synthesis=synthesis['summary'],
            key_disagreements=synthesis['disagreements'],
            areas_of_agreement=synthesis['agreements']
        )

    async def round_table(self,
                          symbol: str,
                          company_data: Dict,
                          analysts: List[str] = None) -> DebateResult:
        """
        Run a round table discussion with multiple analysts.

        Each analyst shares their perspective without explicit positions.
        """
        analysts = analysts or ['value', 'growth', 'contrarian', 'quant']
        contributions = []

        # Collect previous perspectives for context
        previous_perspectives = []

        for analyst_id in analysts:
            analyst = get_analyst(analyst_id)
            from ..llm.base import Message, TaskType

            prompt = f"""
You are {analyst.name}, analyzing {symbol}.

Company Data:
{company_data}

{"Previous perspectives shared:" + chr(10) + chr(10).join(previous_perspectives) if previous_perspectives else "You're the first to share your perspective."}

Share your analysis from your {analyst.style} perspective. Be concise (3-4 paragraphs).
Focus on what YOU uniquely see that others might miss.

If others have spoken, acknowledge their points but add your distinct viewpoint.
"""

            response = self.router.route(
                TaskType.ANALYSIS,
                messages=[Message(role='user', content=prompt)],
                system=analyst.system_prompt,
                temperature=0.7
            )

            contribution = DebateContribution(
                analyst_id=analyst_id,
                analyst_name=analyst.name,
                position='neutral',
                content=response.content,
                key_points=self._extract_key_points(response.content)
            )
            contributions.append(contribution)
            previous_perspectives.append(f"{analyst.name}: {response.content[:500]}...")

        # Synthesize
        synthesis = await self._synthesize_debate(symbol, contributions)

        return DebateResult(
            format=DebateFormat.ROUND_TABLE,
            topic=f"Multi-perspective analysis of {symbol}",
            symbol=symbol,
            contributions=contributions,
            synthesis=synthesis['summary'],
            key_disagreements=synthesis['disagreements'],
            areas_of_agreement=synthesis['agreements']
        )

    async def challenge_thesis(self,
                               thesis: str,
                               symbol: str,
                               company_data: Dict,
                               challenger: str = 'contrarian') -> DebateResult:
        """
        Challenge an investment thesis with devil's advocate analysis.

        Args:
            thesis: The bull case or investment thesis to challenge
            symbol: Stock ticker
            company_data: Company data
            challenger: Analyst to play devil's advocate
        """
        from ..llm.base import Message, TaskType

        challenger_analyst = get_analyst(challenger)

        # Generate challenge
        challenge_prompt = f"""
You are {challenger_analyst.name}, playing devil's advocate.

THESIS TO CHALLENGE:
{thesis}

COMPANY DATA:
{company_data}

Your job is to stress-test this thesis. Find the weaknesses. Ask the hard questions.

Structure your challenge:
1. STRONGEST COUNTER-ARGUMENTS: Why this thesis might be wrong
2. RISKS NOT ADDRESSED: What could go wrong that isn't mentioned
3. ASSUMPTIONS TO QUESTION: What is the thesis assuming that might not hold
4. WHAT WOULD BREAK THE THESIS: Specific events or data that would invalidate it
5. CRITICAL QUESTIONS: What would you need to know before believing this thesis

Be tough but fair. The goal is to help the investor think more clearly, not to be negative for its own sake.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            messages=[Message(role='user', content=challenge_prompt)],
            system=challenger_analyst.system_prompt,
            temperature=0.6
        )

        challenge = DebateContribution(
            analyst_id=challenger,
            analyst_name=challenger_analyst.name,
            position='bear',
            content=response.content,
            key_points=self._extract_key_points(response.content)
        )

        # Generate synthesis
        synthesis_prompt = f"""
ORIGINAL THESIS:
{thesis}

CHALLENGE:
{response.content}

Summarize:
1. Which challenges are most valid
2. Which parts of the thesis survive scrutiny
3. What the investor should investigate further
"""

        synth_response = self.router.route(
            TaskType.SUMMARIZATION,
            prompt=synthesis_prompt,
            temperature=0.4
        )

        return DebateResult(
            format=DebateFormat.THESIS_CHALLENGE,
            topic=f"Thesis challenge for {symbol}",
            symbol=symbol,
            contributions=[challenge],
            synthesis=synth_response.content,
            key_disagreements=[],
            areas_of_agreement=[]
        )

    async def _generate_position(self,
                                 analyst: AnalystPersona,
                                 position: str,
                                 symbol: str,
                                 company_data: Dict,
                                 opposing_view: str = None) -> DebateContribution:
        """Generate a bull or bear position"""
        from ..llm.base import Message, TaskType

        position_instruction = (
            "Make the BULL case - why this is a good investment"
            if position == 'bull'
            else "Make the BEAR case - why investors should avoid this"
        )

        prompt = f"""
You are {analyst.name}, making the {position.upper()} case for {symbol}.

{position_instruction}

Company Data:
{company_data}

{"The opposing view argues:" + chr(10) + str(opposing_view)[:1000] if opposing_view else ""}

Present your case in 3-4 focused paragraphs. Be specific and use data.
End with your key thesis statement.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            messages=[Message(role='user', content=prompt)],
            system=analyst.system_prompt,
            temperature=0.7
        )

        return DebateContribution(
            analyst_id=analyst.id,
            analyst_name=analyst.name,
            position=position,
            content=response.content,
            key_points=self._extract_key_points(response.content)
        )

    async def _generate_rebuttal(self,
                                 analyst: AnalystPersona,
                                 position: str,
                                 original_case: str,
                                 opposing_case: str,
                                 symbol: str) -> DebateContribution:
        """Generate a rebuttal to opposing argument"""
        from ..llm.base import Message, TaskType

        prompt = f"""
You are {analyst.name}, defending your {position.upper()} case for {symbol}.

YOUR ORIGINAL CASE:
{original_case[:1000]}

THE OPPOSING ARGUMENT:
{opposing_case[:1000]}

Respond to their strongest points. Where are they wrong? What are they missing?
Keep it to 2 paragraphs. Be direct and specific.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            messages=[Message(role='user', content=prompt)],
            system=analyst.system_prompt,
            temperature=0.6
        )

        return DebateContribution(
            analyst_id=analyst.id,
            analyst_name=f"{analyst.name} (Rebuttal)",
            position=position,
            content=response.content,
            key_points=self._extract_key_points(response.content)
        )

    async def _synthesize_debate(self,
                                 symbol: str,
                                 contributions: List[DebateContribution]) -> Dict:
        """Synthesize debate into balanced summary"""
        from ..llm.base import TaskType

        debate_content = "\n\n".join([
            f"=== {c.analyst_name} ({c.position.upper()}) ===\n{c.content}"
            for c in contributions
        ])

        prompt = f"""
Synthesize this debate about {symbol}:

{debate_content}

Provide:
SUMMARY: Balanced 2-3 paragraph summary
AGREEMENTS: Bullet points where analysts agree
DISAGREEMENTS: Bullet points where they disagree
INVESTOR_TAKEAWAY: What should the investor do with this information
"""

        response = self.router.route(
            TaskType.SUMMARIZATION,
            prompt=prompt,
            temperature=0.4
        )

        # Parse response
        result = {
            'summary': '',
            'agreements': [],
            'disagreements': []
        }

        current_section = None
        for line in response.content.split('\n'):
            line = line.strip()
            if 'SUMMARY:' in line:
                current_section = 'summary'
                result['summary'] = line.replace('SUMMARY:', '').strip()
            elif 'AGREEMENTS:' in line:
                current_section = 'agreements'
            elif 'DISAGREEMENTS:' in line:
                current_section = 'disagreements'
            elif 'INVESTOR_TAKEAWAY:' in line:
                current_section = 'takeaway'
                result['takeaway'] = line.replace('INVESTOR_TAKEAWAY:', '').strip()
            elif line.startswith(('-', '•', '*')) and current_section in ('agreements', 'disagreements'):
                result[current_section].append(line.lstrip('-•* '))
            elif current_section == 'summary' and line:
                result['summary'] += ' ' + line

        return result

    def _extract_key_points(self, content: str) -> List[str]:
        """Extract key points from analyst content"""
        # Simple extraction - could be enhanced with LLM
        sentences = content.split('.')
        key_sentences = [s.strip() for s in sentences if len(s.strip()) > 50][:5]
        return key_sentences
