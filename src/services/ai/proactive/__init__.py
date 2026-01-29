# src/services/ai/proactive/__init__.py

"""
Proactive AI Insights

Provides:
- DailyBriefingGenerator: Personalized daily briefings
- PortfolioAlertGenerator: AI-powered portfolio alerts
- ThesisValidator: Validate investment theses
"""

from .daily_briefing import DailyBriefingGenerator, DailyBriefing, BriefingSection
from .portfolio_alerts import (
    PortfolioAlertGenerator,
    PortfolioAlert,
    AlertType,
    AlertPriority,
    ThesisValidator
)

__all__ = [
    'DailyBriefingGenerator',
    'DailyBriefing',
    'BriefingSection',
    'PortfolioAlertGenerator',
    'PortfolioAlert',
    'AlertType',
    'AlertPriority',
    'ThesisValidator'
]
