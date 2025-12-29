# src/services/ai/proactive/portfolio_alerts.py

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class AlertType(Enum):
    """Types of portfolio alerts"""
    PRICE_MOVE = "price_move"
    EARNINGS = "earnings"
    DIVIDEND = "dividend"
    THESIS_RISK = "thesis_risk"
    CONCENTRATION = "concentration"
    CORRELATION = "correlation"
    NEWS = "news"
    VALUATION = "valuation"


class AlertPriority(Enum):
    """Alert priority levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class PortfolioAlert:
    """A portfolio alert"""
    id: str
    type: AlertType
    priority: AlertPriority
    symbol: str
    portfolio_id: int
    title: str
    message: str
    data: Dict
    created_at: datetime
    acknowledged: bool = False


class PortfolioAlertGenerator:
    """
    Generate AI-powered portfolio alerts.

    Monitors:
    - Large price moves (up or down)
    - Upcoming earnings
    - Dividend announcements
    - Thesis risk factors
    - Position concentration
    - Correlation warnings
    - Relevant news
    - Valuation changes
    """

    # Alert thresholds
    PRICE_MOVE_THRESHOLD = 5.0  # 5% daily move
    LARGE_GAIN_THRESHOLD = 50.0  # 50% total gain
    LARGE_LOSS_THRESHOLD = -30.0  # 30% total loss
    CONCENTRATION_THRESHOLD = 25.0  # 25% of portfolio
    CORRELATION_THRESHOLD = 0.8  # High correlation warning

    def __init__(self,
                 router,
                 portfolio_service=None,
                 price_service=None,
                 news_service=None):
        """
        Initialize alert generator.

        Args:
            router: ModelRouter for LLM access
            portfolio_service: Service for portfolio data
            price_service: Service for price data
            news_service: Service for news data
        """
        self.router = router
        self.portfolio_service = portfolio_service
        self.price_service = price_service
        self.news_service = news_service

    async def generate_alerts(self,
                              user_id: int,
                              portfolio_ids: List[int] = None) -> List[PortfolioAlert]:
        """
        Generate all alerts for a user's portfolios.

        Args:
            user_id: User ID
            portfolio_ids: Specific portfolios (None = all)

        Returns:
            List of PortfolioAlert objects
        """
        alerts = []

        if not self.portfolio_service:
            return alerts

        # Get portfolios
        portfolios = await self.portfolio_service.list_portfolios(user_id)
        if portfolio_ids:
            portfolios = [p for p in portfolios if p['id'] in portfolio_ids]

        for portfolio in portfolios:
            portfolio_id = portfolio['id']
            positions = await self.portfolio_service.get_positions(portfolio_id)

            # Price move alerts
            price_alerts = await self._check_price_moves(portfolio_id, positions)
            alerts.extend(price_alerts)

            # Concentration alerts
            concentration_alerts = self._check_concentration(portfolio_id, positions)
            alerts.extend(concentration_alerts)

            # Performance alerts
            performance_alerts = self._check_performance(portfolio_id, positions)
            alerts.extend(performance_alerts)

            # News alerts (if news service available)
            if self.news_service:
                news_alerts = await self._check_news(portfolio_id, positions)
                alerts.extend(news_alerts)

        # Sort by priority
        priority_order = {
            AlertPriority.CRITICAL: 0,
            AlertPriority.HIGH: 1,
            AlertPriority.MEDIUM: 2,
            AlertPriority.LOW: 3
        }
        alerts.sort(key=lambda a: priority_order[a.priority])

        return alerts

    async def _check_price_moves(self,
                                 portfolio_id: int,
                                 positions: List[Dict]) -> List[PortfolioAlert]:
        """Check for significant price moves"""
        alerts = []

        for pos in positions:
            symbol = pos.get('symbol', '')
            day_change = pos.get('day_change_pct', 0)

            if abs(day_change) >= self.PRICE_MOVE_THRESHOLD:
                direction = "up" if day_change > 0 else "down"
                priority = AlertPriority.HIGH if abs(day_change) >= 10 else AlertPriority.MEDIUM

                alert = PortfolioAlert(
                    id=f"price_{symbol}_{datetime.now().strftime('%Y%m%d')}",
                    type=AlertType.PRICE_MOVE,
                    priority=priority,
                    symbol=symbol,
                    portfolio_id=portfolio_id,
                    title=f"{symbol} {direction} {abs(day_change):.1f}% today",
                    message=f"{symbol} has moved {day_change:+.1f}% today. "
                            f"Current value: ${pos.get('current_value', 0):,.2f}",
                    data={
                        'day_change_pct': day_change,
                        'current_value': pos.get('current_value', 0),
                        'shares': pos.get('shares', 0)
                    },
                    created_at=datetime.now()
                )
                alerts.append(alert)

        return alerts

    def _check_concentration(self,
                             portfolio_id: int,
                             positions: List[Dict]) -> List[PortfolioAlert]:
        """Check for position concentration risks"""
        alerts = []

        for pos in positions:
            symbol = pos.get('symbol', '')
            weight = pos.get('weight', 0)

            if weight >= self.CONCENTRATION_THRESHOLD:
                priority = AlertPriority.HIGH if weight >= 40 else AlertPriority.MEDIUM

                alert = PortfolioAlert(
                    id=f"concentration_{symbol}_{portfolio_id}",
                    type=AlertType.CONCENTRATION,
                    priority=priority,
                    symbol=symbol,
                    portfolio_id=portfolio_id,
                    title=f"{symbol} is {weight:.1f}% of portfolio",
                    message=f"High concentration in {symbol}. "
                            f"Consider diversifying to reduce single-stock risk.",
                    data={
                        'weight': weight,
                        'current_value': pos.get('current_value', 0)
                    },
                    created_at=datetime.now()
                )
                alerts.append(alert)

        return alerts

    def _check_performance(self,
                           portfolio_id: int,
                           positions: List[Dict]) -> List[PortfolioAlert]:
        """Check for significant gains or losses"""
        alerts = []

        for pos in positions:
            symbol = pos.get('symbol', '')
            gain_pct = pos.get('unrealized_gain_pct', 0)

            if gain_pct >= self.LARGE_GAIN_THRESHOLD:
                alert = PortfolioAlert(
                    id=f"gain_{symbol}_{portfolio_id}",
                    type=AlertType.VALUATION,
                    priority=AlertPriority.MEDIUM,
                    symbol=symbol,
                    portfolio_id=portfolio_id,
                    title=f"{symbol} up {gain_pct:.1f}% total",
                    message=f"Large unrealized gain in {symbol}. "
                            f"Consider taking profits or rebalancing.",
                    data={
                        'unrealized_gain_pct': gain_pct,
                        'unrealized_gain': pos.get('unrealized_gain', 0),
                        'current_value': pos.get('current_value', 0)
                    },
                    created_at=datetime.now()
                )
                alerts.append(alert)

            elif gain_pct <= self.LARGE_LOSS_THRESHOLD:
                alert = PortfolioAlert(
                    id=f"loss_{symbol}_{portfolio_id}",
                    type=AlertType.THESIS_RISK,
                    priority=AlertPriority.HIGH,
                    symbol=symbol,
                    portfolio_id=portfolio_id,
                    title=f"{symbol} down {abs(gain_pct):.1f}%",
                    message=f"Large unrealized loss in {symbol}. "
                            f"Review thesis and consider if position should be reduced.",
                    data={
                        'unrealized_gain_pct': gain_pct,
                        'unrealized_gain': pos.get('unrealized_gain', 0),
                        'current_value': pos.get('current_value', 0)
                    },
                    created_at=datetime.now()
                )
                alerts.append(alert)

        return alerts

    async def _check_news(self,
                          portfolio_id: int,
                          positions: List[Dict]) -> List[PortfolioAlert]:
        """Check for significant news on holdings"""
        alerts = []

        if not self.news_service:
            return alerts

        symbols = [pos.get('symbol', '') for pos in positions]

        for symbol in symbols:
            try:
                # Get recent news with high sentiment impact
                news = await self.news_service.get_news(
                    symbol=symbol,
                    limit=5,
                    min_impact='high'
                )

                for article in news:
                    sentiment = article.get('sentiment', 'neutral')
                    if sentiment in ['very_negative', 'very_positive']:
                        priority = AlertPriority.HIGH
                    elif sentiment in ['negative', 'positive']:
                        priority = AlertPriority.MEDIUM
                    else:
                        continue  # Skip neutral news

                    alert = PortfolioAlert(
                        id=f"news_{symbol}_{article.get('id', '')}",
                        type=AlertType.NEWS,
                        priority=priority,
                        symbol=symbol,
                        portfolio_id=portfolio_id,
                        title=f"{symbol}: {article.get('title', 'News alert')[:50]}",
                        message=article.get('summary', article.get('title', '')),
                        data={
                            'article_id': article.get('id'),
                            'source': article.get('source'),
                            'sentiment': sentiment,
                            'url': article.get('url')
                        },
                        created_at=datetime.now()
                    )
                    alerts.append(alert)
            except Exception as e:
                logger.warning(f"Failed to check news for {symbol}: {e}")

        return alerts

    async def generate_ai_insight(self, alert: PortfolioAlert) -> str:
        """
        Generate AI insight for a specific alert.

        Args:
            alert: The alert to analyze

        Returns:
            AI-generated insight
        """
        from ..llm.base import TaskType

        prompt = f"""
Provide a brief insight for this portfolio alert:

Alert Type: {alert.type.value}
Symbol: {alert.symbol}
Title: {alert.title}
Message: {alert.message}
Data: {alert.data}

In 2-3 sentences, explain:
- What this means for the investor
- What action (if any) they should consider
- What to watch going forward

Be direct and actionable.
"""

        response = self.router.route(
            TaskType.SUMMARIZATION,
            prompt=prompt,
            temperature=0.3
        )

        return response.content


class ThesisValidator:
    """
    Validate investment theses against current data.

    Checks if original investment thesis is still valid
    based on:
    - Financial performance vs expectations
    - Competitive position changes
    - Management changes
    - Industry shifts
    """

    def __init__(self, router, data_service=None):
        """
        Initialize thesis validator.

        Args:
            router: ModelRouter for LLM access
            data_service: Service for company data
        """
        self.router = router
        self.data_service = data_service

    async def validate_thesis(self,
                              symbol: str,
                              original_thesis: str,
                              company_data: Dict = None) -> Dict:
        """
        Validate an investment thesis.

        Args:
            symbol: Stock ticker
            original_thesis: The original investment thesis
            company_data: Current company data

        Returns:
            Dict with validation results
        """
        from ..llm.base import TaskType

        prompt = f"""
Validate this investment thesis against current data:

ORIGINAL THESIS:
{original_thesis}

CURRENT DATA:
{company_data or 'No current data provided'}

Analyze:
1. THESIS STATUS: Is the thesis still valid? (valid/weakening/invalid)
2. KEY CHANGES: What has changed since the thesis was formed?
3. RISK FACTORS: What new risks have emerged?
4. CONFIRMATION: What evidence supports the thesis?
5. CONCERNS: What evidence contradicts the thesis?
6. RECOMMENDATION: Should the investor hold, add, or reduce?

Be specific and use data when available.
"""

        response = self.router.route(
            TaskType.ANALYSIS,
            prompt=prompt,
            temperature=0.4
        )

        # Parse response
        result = {
            'symbol': symbol,
            'status': 'unknown',
            'analysis': response.content,
            'validated_at': datetime.now().isoformat()
        }

        # Extract status
        content_lower = response.content.lower()
        if 'invalid' in content_lower or 'broken' in content_lower:
            result['status'] = 'invalid'
        elif 'weakening' in content_lower or 'weakened' in content_lower:
            result['status'] = 'weakening'
        elif 'valid' in content_lower or 'intact' in content_lower:
            result['status'] = 'valid'

        return result
