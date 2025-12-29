# src/services/ai/proactive/daily_briefing.py

import logging
from typing import List, Dict, Optional, Any
from datetime import date, datetime, timedelta
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class BriefingSection:
    """A section of the daily briefing"""
    title: str
    content: str
    priority: str  # 'high', 'medium', 'low'
    category: str  # 'portfolio', 'watchlist', 'market', 'opportunity'
    symbols: List[str] = field(default_factory=list)


@dataclass
class DailyBriefing:
    """Complete daily briefing"""
    date: date
    user_id: int
    headline: str
    sections: List[BriefingSection]
    generated_at: datetime
    model_used: str


class DailyBriefingGenerator:
    """
    Generates personalized daily briefings for users.

    Combines:
    - Portfolio performance and alerts
    - Watchlist updates
    - Market context
    - AI-identified opportunities
    - Thesis validation checks

    Runs: Daily (morning) or on-demand
    """

    BRIEFING_SYSTEM_PROMPT = """
You are a professional investment analyst preparing a daily briefing for an investor.

Your briefing should be:
- Concise and actionable
- Focused on what MATTERS today
- Personalized to their holdings and interests
- Written in a professional but accessible tone

Structure your briefing with clear sections. Prioritize:
1. Urgent items (earnings, big moves, thesis changes)
2. Important context (market conditions, sector trends)
3. Opportunities (things to research or consider)

Be direct. Skip pleasantries. Lead with the most important information.
"""

    def __init__(self,
                 router,
                 portfolio_service=None,
                 price_service=None,
                 news_service=None):
        """
        Initialize briefing generator.

        Args:
            router: ModelRouter for LLM access
            portfolio_service: Service for portfolio data
            price_service: Service for price data
            news_service: Service for news data (optional)
        """
        self.router = router
        self.portfolio_service = portfolio_service
        self.price_service = price_service
        self.news_service = news_service

    async def generate_briefing(self,
                                user_id: int,
                                portfolio_ids: List[int] = None,
                                include_market: bool = True,
                                include_opportunities: bool = True) -> DailyBriefing:
        """
        Generate a complete daily briefing.

        Args:
            user_id: User to generate briefing for
            portfolio_ids: Specific portfolios (None = all)
            include_market: Include market overview
            include_opportunities: Include AI opportunities

        Returns:
            DailyBriefing with all sections
        """
        sections = []

        # 1. Portfolio Summary
        portfolio_section = await self._generate_portfolio_section(user_id, portfolio_ids)
        if portfolio_section:
            sections.append(portfolio_section)

        # 2. Key Events Today
        events_section = await self._generate_events_section(user_id, portfolio_ids)
        if events_section:
            sections.append(events_section)

        # 3. Positions to Watch
        watch_section = await self._generate_watch_section(user_id, portfolio_ids)
        if watch_section:
            sections.append(watch_section)

        # 4. Market Context
        if include_market:
            market_section = await self._generate_market_section()
            if market_section:
                sections.append(market_section)

        # 5. Opportunities
        if include_opportunities:
            opps_section = await self._generate_opportunities_section(user_id)
            if opps_section:
                sections.append(opps_section)

        # Generate headline
        headline = await self._generate_headline(sections)

        # Get model name
        from ..llm.base import TaskType
        model = self.router.get_model(TaskType.SUMMARIZATION)
        model_name = model.name if model else "Unknown"

        return DailyBriefing(
            date=date.today(),
            user_id=user_id,
            headline=headline,
            sections=sections,
            generated_at=datetime.now(),
            model_used=model_name
        )

    async def _generate_portfolio_section(self,
                                          user_id: int,
                                          portfolio_ids: List[int]) -> Optional[BriefingSection]:
        """Generate portfolio performance summary"""

        if not self.portfolio_service:
            return BriefingSection(
                title="Portfolio Summary",
                content="Portfolio service not configured. Connect your portfolios to see personalized briefings.",
                priority='medium',
                category='portfolio',
                symbols=[]
            )

        # Fetch portfolio data
        portfolios = await self.portfolio_service.list_portfolios(user_id)
        if portfolio_ids:
            portfolios = [p for p in portfolios if p['id'] in portfolio_ids]

        if not portfolios:
            return None

        # Build context
        portfolio_data = []
        for p in portfolios:
            positions = await self.portfolio_service.get_positions(p['id'])
            total_value = sum(pos.get('current_value', 0) for pos in positions)
            day_change = sum(
                pos.get('current_value', 0) * pos.get('day_change_pct', 0) / 100
                for pos in positions
            )

            # Top movers
            sorted_positions = sorted(
                positions,
                key=lambda x: abs(x.get('day_change_pct', 0)),
                reverse=True
            )
            top_movers = sorted_positions[:3]

            portfolio_data.append({
                'name': p['name'],
                'total_value': total_value,
                'day_change': day_change,
                'day_change_pct': (day_change / total_value * 100) if total_value > 0 else 0,
                'top_movers': top_movers
            })

        # Generate summary with LLM
        from ..llm.base import TaskType

        prompt = f"""
Summarize this portfolio performance for today's briefing:

{self._format_portfolio_data(portfolio_data)}

Write 2-3 sentences highlighting:
- Overall performance
- Notable movers (up or down)
- Any concerns or positives
"""

        response = self.router.route(
            TaskType.SUMMARIZATION,
            prompt=prompt,
            temperature=0.3
        )

        symbols = []
        for p in portfolio_data:
            symbols.extend([m.get('symbol', '') for m in p.get('top_movers', [])])

        return BriefingSection(
            title="Portfolio Summary",
            content=response.content,
            priority='high',
            category='portfolio',
            symbols=symbols
        )

    async def _generate_events_section(self,
                                       user_id: int,
                                       portfolio_ids: List[int]) -> Optional[BriefingSection]:
        """Generate section for key events (earnings, dividends, etc.)"""

        # Get symbols user cares about
        symbols = await self._get_user_symbols(user_id, portfolio_ids)

        if not symbols:
            return None

        # Placeholder for events
        events_text = "No major events scheduled for your holdings this week."

        return BriefingSection(
            title="Upcoming Events",
            content=events_text,
            priority='medium',
            category='portfolio',
            symbols=[]
        )

    async def _generate_watch_section(self,
                                      user_id: int,
                                      portfolio_ids: List[int]) -> Optional[BriefingSection]:
        """Identify positions that need attention"""

        if not self.portfolio_service:
            return None

        alerts = []

        # Get all positions
        portfolios = await self.portfolio_service.list_portfolios(user_id)
        if portfolio_ids:
            portfolios = [p for p in portfolios if p['id'] in portfolio_ids]

        for portfolio in portfolios:
            positions = await self.portfolio_service.get_positions(portfolio['id'])

            for pos in positions:
                day_change_pct = pos.get('day_change_pct', 0)
                unrealized_gain_pct = pos.get('unrealized_gain_pct', 0)
                weight = pos.get('weight', 0)

                # Big movers (>5% day change)
                if abs(day_change_pct) > 5:
                    alerts.append({
                        'symbol': pos.get('symbol', ''),
                        'type': 'big_move',
                        'detail': f"{day_change_pct:+.1f}% today"
                    })

                # Big winners (>50% gain)
                if unrealized_gain_pct > 50:
                    alerts.append({
                        'symbol': pos.get('symbol', ''),
                        'type': 'big_winner',
                        'detail': f"{unrealized_gain_pct:+.1f}% total gain"
                    })

                # Big losers (>30% loss)
                if unrealized_gain_pct < -30:
                    alerts.append({
                        'symbol': pos.get('symbol', ''),
                        'type': 'big_loser',
                        'detail': f"{unrealized_gain_pct:+.1f}% total loss"
                    })

                # Concentrated positions (>25% of portfolio)
                if weight > 25:
                    alerts.append({
                        'symbol': pos.get('symbol', ''),
                        'type': 'concentration',
                        'detail': f"{weight:.1f}% of portfolio"
                    })

        if not alerts:
            return None

        # Generate narrative
        from ..llm.base import TaskType

        prompt = f"""
These positions may need the investor's attention:

{self._format_alerts(alerts)}

Write 2-4 sentences summarizing:
- Which positions need attention and why
- Suggested actions or considerations
Be direct and actionable.
"""

        response = self.router.route(TaskType.SUMMARIZATION, prompt=prompt)

        return BriefingSection(
            title="Positions to Watch",
            content=response.content,
            priority='high',
            category='portfolio',
            symbols=list(set(a['symbol'] for a in alerts))
        )

    async def _generate_market_section(self) -> Optional[BriefingSection]:
        """Generate market overview"""

        if not self.price_service:
            return BriefingSection(
                title="Market Context",
                content="Price service not configured. Market overview unavailable.",
                priority='low',
                category='market',
                symbols=[]
            )

        try:
            # Fetch market data
            indices = await self.price_service.get_batch_quotes(['SPY', 'QQQ', 'IWM', 'DIA'])

            # Get VIX if available
            try:
                vix = await self.price_service.get_quote('^VIX')
            except:
                vix = {'price': 'N/A', 'change_pct': 0}

            market_data = {
                'indices': indices,
                'vix': vix.get('price', 'N/A'),
                'vix_change': vix.get('change_pct', 0)
            }

            from ..llm.base import TaskType

            prompt = f"""
Provide a brief market context based on:

S&P 500 (SPY): {indices.get('SPY', {}).get('change_pct', 0):+.2f}%
Nasdaq (QQQ): {indices.get('QQQ', {}).get('change_pct', 0):+.2f}%
Small Cap (IWM): {indices.get('IWM', {}).get('change_pct', 0):+.2f}%
VIX: {market_data['vix']} ({market_data['vix_change']:+.1f}%)

Write 2-3 sentences on:
- Overall market tone
- Any notable divergences
- Risk sentiment
"""

            response = self.router.route(TaskType.SUMMARIZATION, prompt=prompt)

            return BriefingSection(
                title="Market Context",
                content=response.content,
                priority='medium',
                category='market',
                symbols=['SPY', 'QQQ', 'IWM']
            )
        except Exception as e:
            logger.error(f"Failed to generate market section: {e}")
            return None

    async def _generate_opportunities_section(self, user_id: int) -> Optional[BriefingSection]:
        """AI-identified opportunities based on user preferences"""

        return BriefingSection(
            title="On Your Radar",
            content="Based on your investment style, consider researching companies with strong cash flow and recent price weakness. The AI analysts can help evaluate specific opportunities.",
            priority='low',
            category='opportunity',
            symbols=[]
        )

    async def _generate_headline(self, sections: List[BriefingSection]) -> str:
        """Generate a headline for the briefing"""

        # Find highest priority content
        high_priority = [s for s in sections if s.priority == 'high']

        if not high_priority:
            return f"Daily Briefing - {date.today().strftime('%B %d, %Y')}"

        # Use LLM to generate headline
        from ..llm.base import TaskType

        content_summary = "\n".join([f"- {s.title}: {s.content[:100]}..." for s in high_priority])

        prompt = f"""
Generate a short, attention-grabbing headline (max 10 words) for this daily briefing:

{content_summary}

The headline should highlight the most important item.
Just return the headline, nothing else.
"""

        response = self.router.route(
            TaskType.SUMMARIZATION,
            prompt=prompt,
            temperature=0.5
        )

        return response.content.strip().strip('"')

    async def _get_user_symbols(self, user_id: int, portfolio_ids: List[int]) -> List[str]:
        """Get all symbols user is tracking"""
        if not self.portfolio_service:
            return []

        symbols = set()

        portfolios = await self.portfolio_service.list_portfolios(user_id)
        if portfolio_ids:
            portfolios = [p for p in portfolios if p['id'] in portfolio_ids]

        for portfolio in portfolios:
            positions = await self.portfolio_service.get_positions(portfolio['id'])
            symbols.update(pos.get('symbol', '') for pos in positions)

        return list(symbols)

    def _format_portfolio_data(self, data: List[Dict]) -> str:
        """Format portfolio data for prompt"""
        lines = []
        for p in data:
            lines.append(f"\n{p['name']}:")
            lines.append(f"  Total Value: ${p['total_value']:,.2f}")
            lines.append(f"  Day Change: ${p['day_change']:+,.2f} ({p['day_change_pct']:+.2f}%)")
            if p.get('top_movers'):
                lines.append("  Top Movers:")
                for m in p['top_movers']:
                    symbol = m.get('symbol', 'N/A')
                    change = m.get('day_change_pct', 0)
                    lines.append(f"    - {symbol}: {change:+.2f}%")
        return "\n".join(lines)

    def _format_alerts(self, alerts: List[Dict]) -> str:
        """Format alerts for prompt"""
        lines = []
        for a in alerts:
            lines.append(f"- {a['symbol']}: {a['type']} - {a['detail']}")
        return "\n".join(lines)
