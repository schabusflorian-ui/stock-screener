# src/services/ai/analysts/__init__.py
"""
AI Investment Analysts with distinct personas and investment philosophies.

Available analysts:
- value: Benjamin (Value Investing - Buffett/Graham style)
- growth: Catherine (Growth Investing - Fisher/Lynch style)
- contrarian: Diana (Contrarian Investing - Marks/Burry style)
- quant: Marcus (Quantitative/Factor Investing)
- tailrisk: Nikolai (Tail Risk & Anti-Fragility - Taleb/Spitznagel style)
- tech: Elena (Technology & Disruption - a16z/ARK style)
"""

from .personas import AnalystPersona, ANALYSTS, get_analyst, list_analysts

# Import to register analysts
from . import value_analyst
from . import growth_analyst
from . import contrarian_analyst
from . import quant_analyst
from . import tailrisk_analyst
from . import tech_analyst

__all__ = [
    'AnalystPersona',
    'ANALYSTS',
    'get_analyst',
    'list_analysts'
]
