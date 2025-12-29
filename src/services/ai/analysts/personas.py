# src/services/ai/analysts/personas.py
"""
Base persona definitions for AI investment analysts.
"""

from dataclasses import dataclass, field
from typing import List, Dict


@dataclass
class AnalystPersona:
    """Definition of an AI analyst persona."""
    id: str
    name: str
    title: str
    style: str
    icon: str
    color: str
    description: str
    influences: List[str]
    strengths: List[str]
    best_for: List[str]
    system_prompt: str
    greeting: str = ""
    suggested_questions: List[str] = field(default_factory=list)


# Registry of all analysts
ANALYSTS: Dict[str, AnalystPersona] = {}


def get_analyst(analyst_id: str) -> AnalystPersona:
    """
    Get an analyst persona by ID.

    Args:
        analyst_id: The analyst ID (e.g., 'value', 'growth')

    Returns:
        AnalystPersona instance

    Raises:
        ValueError: If analyst not found
    """
    if analyst_id not in ANALYSTS:
        raise ValueError(f"Unknown analyst: {analyst_id}. Available: {list(ANALYSTS.keys())}")
    return ANALYSTS[analyst_id]


def list_analysts() -> List[Dict]:
    """
    Get list of all analysts with their public info.

    Returns:
        List of analyst dictionaries (without system prompts)
    """
    return [
        {
            'id': a.id,
            'name': a.name,
            'title': a.title,
            'style': a.style,
            'icon': a.icon,
            'color': a.color,
            'description': a.description,
            'influences': a.influences,
            'strengths': a.strengths,
            'best_for': a.best_for,
            'greeting': a.greeting,
            'suggested_questions': a.suggested_questions
        }
        for a in ANALYSTS.values()
    ]


def register_analyst(persona: AnalystPersona) -> None:
    """Register an analyst persona."""
    ANALYSTS[persona.id] = persona
