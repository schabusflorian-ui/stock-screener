# src/services/ai/debate/__init__.py

"""
Multi-Analyst Debate Engine

Provides:
- DebateEngine: Orchestrate multi-analyst debates
- DebateFormat: Bull vs Bear, Round Table, Thesis Challenge
- DebateResult: Structured debate results
"""

from .debate_engine import (
    DebateEngine,
    DebateFormat,
    DebateContribution,
    DebateResult,
    AnalystPersona,
    get_analyst,
    DEBATE_ANALYSTS
)

__all__ = [
    'DebateEngine',
    'DebateFormat',
    'DebateContribution',
    'DebateResult',
    'AnalystPersona',
    'get_analyst',
    'DEBATE_ANALYSTS'
]
