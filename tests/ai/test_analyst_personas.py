"""
Unit tests for AI analyst personas.

Tests cover:
- Persona registration and retrieval
- System prompt validation
- Greeting messages
- Suggested questions
- Persona attributes (influences, strengths, best_for)
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestAnalystPersonaRegistry:
    """Tests for the analyst persona registry."""

    def test_all_analysts_registered(self, all_analyst_ids):
        """Test that all expected analysts are registered."""
        from src.services.ai.analysts import list_analysts

        analysts = list_analysts()

        assert len(analysts) >= 6
        for analyst_id in all_analyst_ids:
            # list_analysts returns dicts, not objects
            assert analyst_id in [a['id'] for a in analysts], f"Analyst {analyst_id} not registered"

    def test_get_analyst_by_id(self, all_analyst_ids):
        """Test retrieving analyst by ID."""
        from src.services.ai.analysts import get_analyst

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)
            assert analyst is not None
            assert analyst.id == analyst_id

    def test_get_nonexistent_analyst(self):
        """Test that getting nonexistent analyst raises ValueError."""
        from src.services.ai.analysts import get_analyst
        import pytest

        with pytest.raises(ValueError):
            get_analyst('nonexistent_analyst_id')


class TestValueAnalyst:
    """Tests for the Value Analyst (Benjamin)."""

    def test_value_analyst_attributes(self):
        """Test value analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')

        assert analyst is not None
        assert analyst.name == 'Benjamin'
        assert 'Value' in analyst.title
        assert analyst.icon is not None
        assert analyst.color is not None

    def test_value_analyst_influences(self):
        """Test value analyst influences include key figures."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')
        influences = [i.lower() for i in analyst.influences]

        assert any('buffett' in i for i in influences)
        assert any('munger' in i for i in influences)

    def test_value_analyst_system_prompt(self):
        """Test value analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')
        prompt = analyst.system_prompt.lower()

        # Key value investing concepts
        assert 'margin of safety' in prompt
        assert 'intrinsic value' in prompt or 'valuation' in prompt
        assert 'moat' in prompt or 'competitive advantage' in prompt

    def test_value_analyst_greeting(self):
        """Test value analyst has proper greeting."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')

        assert len(analyst.greeting) > 50
        assert 'Benjamin' in analyst.greeting

    def test_value_analyst_questions(self):
        """Test value analyst has suggested questions."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')

        assert len(analyst.suggested_questions) >= 3
        assert all(q.endswith('?') for q in analyst.suggested_questions)


class TestGrowthAnalyst:
    """Tests for the Growth Analyst (Catherine)."""

    def test_growth_analyst_attributes(self):
        """Test growth analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('growth')

        assert analyst is not None
        assert analyst.name == 'Catherine'
        assert 'Growth' in analyst.title

    def test_growth_analyst_influences(self):
        """Test growth analyst influences."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('growth')
        influences = [i.lower() for i in analyst.influences]

        assert any('fisher' in i for i in influences) or any('lynch' in i for i in influences)

    def test_growth_analyst_system_prompt(self):
        """Test growth analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('growth')
        prompt = analyst.system_prompt.lower()

        # Key growth investing concepts
        assert 'growth' in prompt
        assert 'revenue' in prompt or 'tam' in prompt
        assert 'market' in prompt


class TestContrarianAnalyst:
    """Tests for the Contrarian Analyst (Diana)."""

    def test_contrarian_analyst_attributes(self):
        """Test contrarian analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('contrarian')

        assert analyst is not None
        assert analyst.name == 'Diana'
        assert 'Contrarian' in analyst.title

    def test_contrarian_analyst_system_prompt(self):
        """Test contrarian analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('contrarian')
        prompt = analyst.system_prompt.lower()

        # Key contrarian investing concepts
        assert 'sentiment' in prompt or 'contrarian' in prompt
        assert 'value trap' in prompt or 'recovery' in prompt


class TestQuantAnalyst:
    """Tests for the Quantitative Analyst (Marcus)."""

    def test_quant_analyst_attributes(self):
        """Test quant analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('quant')

        assert analyst is not None
        assert analyst.name == 'Marcus'
        assert 'Quant' in analyst.title or 'Quantitative' in analyst.title

    def test_quant_analyst_system_prompt(self):
        """Test quant analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('quant')
        prompt = analyst.system_prompt.lower()

        # Key quant investing concepts
        assert 'factor' in prompt or 'quantitative' in prompt
        assert 'momentum' in prompt or 'technical' in prompt


class TestTechAnalyst:
    """Tests for the Technology Analyst (Sophia)."""

    def test_tech_analyst_attributes(self):
        """Test tech analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tech')

        assert analyst is not None
        assert analyst.name == 'Sophia'
        assert 'Tech' in analyst.title or 'Disruption' in analyst.title

    def test_tech_analyst_influences(self):
        """Test tech analyst influences include key sources."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tech')
        influences = [i.lower() for i in analyst.influences]

        # Should include tech-focused influences
        assert any('a16z' in i or 'andreessen' in i for i in influences) or \
               any('evans' in i for i in influences) or \
               any('ark' in i for i in influences)

    def test_tech_analyst_system_prompt(self):
        """Test tech analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tech')
        prompt = analyst.system_prompt.lower()

        # Key tech investing concepts
        assert 'disruption' in prompt or 'disruptive' in prompt
        assert 'network effect' in prompt or 'platform' in prompt
        assert 'ai' in prompt or 'technology' in prompt

    def test_tech_analyst_best_for(self):
        """Test tech analyst best_for includes tech stocks."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tech')
        best_for = [b.lower() for b in analyst.best_for]

        assert any('tech' in b for b in best_for)

    def test_tech_analyst_greeting(self):
        """Test tech analyst has proper greeting."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tech')

        assert len(analyst.greeting) > 50
        assert 'Sophia' in analyst.greeting
        assert 'disruption' in analyst.greeting.lower() or 'technology' in analyst.greeting.lower()


class TestTailRiskAnalyst:
    """Tests for the Tail Risk Analyst (Nikolai)."""

    def test_tailrisk_analyst_attributes(self):
        """Test tail risk analyst has correct attributes."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')

        assert analyst is not None
        assert analyst.name == 'Nikolai'
        assert 'Tail Risk' in analyst.title or 'Anti-Fragility' in analyst.title

    def test_tailrisk_analyst_influences(self):
        """Test tail risk analyst influences include Taleb and Spitznagel."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')
        influences = [i.lower() for i in analyst.influences]

        assert any('taleb' in i for i in influences)
        assert any('spitznagel' in i for i in influences) or any('austrian' in i for i in influences)

    def test_tailrisk_analyst_system_prompt(self):
        """Test tail risk analyst system prompt covers key concepts."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')
        prompt = analyst.system_prompt.lower()

        # Key tail risk concepts
        assert 'tail risk' in prompt or 'black swan' in prompt
        assert 'antifragil' in prompt or 'fragil' in prompt
        assert 'convex' in prompt or 'asymmetric' in prompt

    def test_tailrisk_analyst_strengths(self):
        """Test tail risk analyst strengths."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')
        strengths = [s.lower() for s in analyst.strengths]

        assert any('tail risk' in s or 'risk' in s for s in strengths)
        assert any('fragility' in s or 'survival' in s for s in strengths)

    def test_tailrisk_analyst_best_for(self):
        """Test tail risk analyst best_for includes risk assessment."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')
        best_for = [b.lower() for b in analyst.best_for]

        assert any('risk' in b for b in best_for)

    def test_tailrisk_analyst_greeting(self):
        """Test tail risk analyst has proper greeting."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')

        assert len(analyst.greeting) > 50
        assert 'Nikolai' in analyst.greeting
        assert any(term in analyst.greeting.lower() for term in ['tail risk', 'fragility', 'survival'])

    def test_tailrisk_analyst_questions(self):
        """Test tail risk analyst suggested questions focus on risk."""
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('tailrisk')

        assert len(analyst.suggested_questions) >= 3
        questions_lower = [q.lower() for q in analyst.suggested_questions]
        assert any('risk' in q or 'survive' in q or 'fragile' in q for q in questions_lower)


class TestAnalystPersonaDataclass:
    """Tests for the AnalystPersona dataclass structure."""

    def test_persona_has_required_fields(self, all_analyst_ids):
        """Test that all personas have required fields."""
        from src.services.ai.analysts import get_analyst

        required_fields = [
            'id', 'name', 'title', 'style', 'icon', 'color',
            'description', 'influences', 'strengths', 'best_for',
            'system_prompt', 'greeting', 'suggested_questions'
        ]

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)

            for field in required_fields:
                assert hasattr(analyst, field), f"Analyst {analyst_id} missing field: {field}"
                value = getattr(analyst, field)
                assert value is not None, f"Analyst {analyst_id} has None for field: {field}"

    def test_system_prompts_substantial(self, all_analyst_ids):
        """Test that system prompts are substantial."""
        from src.services.ai.analysts import get_analyst

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)

            # System prompts should be detailed
            assert len(analyst.system_prompt) >= 500, \
                f"Analyst {analyst_id} system prompt too short: {len(analyst.system_prompt)} chars"

    def test_colors_are_valid_hex(self, all_analyst_ids):
        """Test that colors are valid hex codes."""
        from src.services.ai.analysts import get_analyst
        import re

        hex_pattern = re.compile(r'^#[0-9A-Fa-f]{6}$')

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)

            assert hex_pattern.match(analyst.color), \
                f"Analyst {analyst_id} has invalid color: {analyst.color}"

    def test_influences_are_lists(self, all_analyst_ids):
        """Test that influences, strengths, best_for are lists."""
        from src.services.ai.analysts import get_analyst

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)

            assert isinstance(analyst.influences, list)
            assert isinstance(analyst.strengths, list)
            assert isinstance(analyst.best_for, list)
            assert isinstance(analyst.suggested_questions, list)

            assert len(analyst.influences) >= 1
            assert len(analyst.strengths) >= 1
            assert len(analyst.best_for) >= 1
            assert len(analyst.suggested_questions) >= 1


class TestAnalystDiversity:
    """Tests for ensuring analysts provide diverse perspectives."""

    def test_unique_system_prompts(self, all_analyst_ids):
        """Test that each analyst has unique system prompt."""
        from src.services.ai.analysts import get_analyst

        prompts = []
        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)
            prompts.append(analyst.system_prompt)

        # All prompts should be unique
        assert len(prompts) == len(set(prompts))

    def test_unique_names(self, all_analyst_ids):
        """Test that each analyst has unique name."""
        from src.services.ai.analysts import get_analyst

        names = []
        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)
            names.append(analyst.name)

        assert len(names) == len(set(names))

    def test_diverse_styles(self, all_analyst_ids):
        """Test that analysts have diverse investing styles."""
        from src.services.ai.analysts import get_analyst

        styles = []
        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)
            styles.append(analyst.style)

        # All styles should be unique
        assert len(styles) == len(set(styles))

    def test_different_focus_areas(self, all_analyst_ids):
        """Test that analysts cover different focus areas."""
        from src.services.ai.analysts import get_analyst

        all_best_for = []
        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)
            all_best_for.extend(analyst.best_for)

        # Should cover variety of use cases
        all_best_for_lower = [b.lower() for b in all_best_for]
        assert any('value' in b or 'undervalued' in b for b in all_best_for_lower)
        assert any('growth' in b for b in all_best_for_lower)
        assert any('tech' in b for b in all_best_for_lower)
        assert any('risk' in b for b in all_best_for_lower)


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
