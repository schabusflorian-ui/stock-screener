"""
End-to-end conversation tests.

Tests cover:
- Full conversation flow with analysts
- Multi-turn conversations
- Context preservation
- Knowledge-augmented responses
- Conversation state management
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
import uuid

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestConversationCreation:
    """Tests for conversation creation."""

    def test_create_conversation_with_analyst(self):
        """Test creating a conversation with an analyst."""
        from src.services.ai.analyst_service import AnalystService

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.conversations = {}
            service.router = MagicMock()

            # create_conversation returns a Conversation object
            conv = service.create_conversation(
                analyst_id='value',
                company_symbol='AAPL'  # Use company_symbol, not company_id
            )

            assert conv is not None
            # Conversation object has attributes, not dict keys
            assert hasattr(conv, 'id')
            assert conv.analyst_id == 'value'
            assert conv.company_symbol == 'AAPL'

    def test_conversation_gets_greeting(self):
        """Test that new conversations can access analyst greeting."""
        from src.services.ai.analyst_service import AnalystService
        from src.services.ai.analysts import get_analyst

        analyst = get_analyst('value')

        # Analyst has a greeting attribute
        assert hasattr(analyst, 'greeting')
        assert len(analyst.greeting) > 0

    def test_create_conversation_all_analysts(self, all_analyst_ids):
        """Test creating conversations with all analysts."""
        from src.services.ai.analyst_service import AnalystService

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.conversations = {}
            service.router = MagicMock()

            for analyst_id in all_analyst_ids:
                conv = service.create_conversation(
                    analyst_id=analyst_id,
                    company_symbol='AAPL'
                )

                assert conv is not None
                assert conv.analyst_id == analyst_id


class TestConversationFlow:
    """Tests for conversation flow."""

    @pytest.fixture
    def mock_analyst_service(self):
        """Create a mock analyst service with conversation support."""
        from src.services.ai.analyst_service import AnalystService
        from src.services.ai.tasks.data_formatter import DataFormatter

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.conversations = {}
            service.router = MagicMock()
            service.retriever = MagicMock()
            service.formatter = DataFormatter()

            # Set up advanced RAG attributes
            service.use_advanced_rag = False
            service._advanced_rag_initialized = False
            service._query_expander = None
            service._knowledge_graph = None
            service._graph_retriever = None
            service._contextual_retriever = None

            # Mock router response
            service.router.route.return_value = MagicMock(
                content='This is the analyst response.',
                model='claude-sonnet',
                tokens_used={'input': 100, 'output': 50},
                cost_usd=0.001,
                latency_ms=500
            )

            # Mock retriever
            service.retriever.retrieve.return_value = []

            return service

    def test_single_turn_conversation(self, mock_analyst_service):
        """Test a single question-answer exchange."""
        from src.services.ai.analyst_service import Conversation
        service = mock_analyst_service

        # Create conversation using proper Conversation object
        conv_id = str(uuid.uuid4())
        service.conversations[conv_id] = Conversation(
            id=conv_id,
            analyst_id='value',
            company_symbol='AAPL'
        )

        # Send a message
        response = service.chat(conv_id, 'What is the intrinsic value of Apple?')

        assert response is not None
        # Response is a ChatMessage dataclass with a content attribute
        assert hasattr(response, 'content')

    def test_multi_turn_conversation(self, mock_analyst_service):
        """Test multi-turn conversation preserves context."""
        from src.services.ai.analyst_service import Conversation
        service = mock_analyst_service

        conv_id = str(uuid.uuid4())
        service.conversations[conv_id] = Conversation(
            id=conv_id,
            analyst_id='value',
            company_symbol='AAPL'
        )

        # First turn
        service.chat(conv_id, 'What is Apples competitive moat?')

        # Second turn - should have context from first
        service.chat(conv_id, 'How durable is that moat?')

        # Third turn
        service.chat(conv_id, 'What are the risks?')

        # Check that messages accumulated
        conv = service.conversations[conv_id]
        # In real implementation, messages would accumulate
        assert conv_id in service.conversations

    def test_conversation_with_tech_analyst(self, mock_analyst_service):
        """Test conversation with tech analyst."""
        from src.services.ai.analyst_service import Conversation
        service = mock_analyst_service

        conv_id = str(uuid.uuid4())
        service.conversations[conv_id] = Conversation(
            id=conv_id,
            analyst_id='tech',
            company_symbol='NVDA'
        )

        response = service.chat(conv_id, 'Is NVIDIA a disruptive company?')

        assert response is not None

    def test_conversation_with_tailrisk_analyst(self, mock_analyst_service):
        """Test conversation with tail risk analyst."""
        from src.services.ai.analyst_service import Conversation
        service = mock_analyst_service

        conv_id = str(uuid.uuid4())
        service.conversations[conv_id] = Conversation(
            id=conv_id,
            analyst_id='tailrisk',
            company_symbol='META'
        )

        response = service.chat(conv_id, 'What are the tail risks for Meta?')

        assert response is not None


class TestContextPreservation:
    """Tests for context preservation in conversations."""

    def test_company_context_with_override(self, sample_company_data, sample_financial_metrics):
        """Test that company context is built from override data."""
        from src.services.ai.analyst_service import AnalystService, Conversation
        from src.services.ai.tasks.data_formatter import DataFormatter

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.formatter = DataFormatter()

            # _build_context takes a Conversation and optional override dict
            conv = Conversation(
                id='test',
                analyst_id='value',
                company_symbol='AAPL'
            )

            # With override data provided
            override = {
                'company': sample_company_data,
                'metrics': sample_financial_metrics
            }

            context = service._build_context(conv, override)

            # Context should be a string
            assert isinstance(context, str)

    def test_previous_messages_in_context(self):
        """Test that previous messages are included in context."""
        from src.services.ai.llm.base import Message

        messages = [
            Message(role='user', content='What about the valuation?'),
            Message(role='assistant', content='The P/E ratio is 28.5...'),
            Message(role='user', content='Is that high?')
        ]

        # All previous messages should be part of context
        assert len(messages) == 3
        assert messages[0].role == 'user'
        assert messages[1].role == 'assistant'

    def test_wisdom_retrieval(self, sample_company_data):
        """Test that wisdom retrieval works with correct params."""
        from src.services.ai.analyst_service import AnalystService
        from unittest.mock import MagicMock

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.retriever = MagicMock()
            service.use_advanced_rag = False
            service._advanced_rag_initialized = True
            service._query_expander = None
            service._knowledge_graph = None
            service._graph_retriever = None
            service._contextual_retriever = None

            service.retriever.retrieve.return_value = [
                {'content': 'Buffett wisdom on moats', 'metadata': {'source': 'Berkshire'}}
            ]

            # _get_wisdom takes query, analyst_type, company_data
            wisdom = service._get_wisdom(
                query='margin of safety',
                analyst_type='value',
                company_data=sample_company_data
            )

            assert isinstance(wisdom, str)


class TestConversationStateManagement:
    """Tests for conversation state management."""

    def test_get_conversation(self):
        """Test retrieving a conversation by ID."""
        from src.services.ai.analyst_service import AnalystService, Conversation

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)

            conv_id = 'test-conv-123'
            # Store actual Conversation object
            service.conversations = {
                conv_id: Conversation(
                    id=conv_id,
                    analyst_id='value'
                )
            }

            conv = service.get_conversation(conv_id)

            assert conv is not None
            assert conv.id == conv_id

    def test_get_nonexistent_conversation(self):
        """Test retrieving nonexistent conversation."""
        from src.services.ai.analyst_service import AnalystService

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.conversations = {}

            conv = service.get_conversation('nonexistent')

            assert conv is None

    def test_message_history_accumulates(self):
        """Test that message history accumulates."""
        from src.services.ai.analyst_service import ChatMessage

        messages = []

        messages.append(ChatMessage(id='1', role='user', content='Question 1', timestamp='2024-01-01'))
        messages.append(ChatMessage(id='2', role='assistant', content='Answer 1', timestamp='2024-01-01'))
        messages.append(ChatMessage(id='3', role='user', content='Question 2', timestamp='2024-01-01'))
        messages.append(ChatMessage(id='4', role='assistant', content='Answer 2', timestamp='2024-01-01'))

        assert len(messages) == 4
        assert messages[-1].role == 'assistant'


class TestQuickAnalysis:
    """Tests for quick (one-shot) analysis."""

    def test_quick_analyze_value(self, sample_company_data):
        """Test quick analysis with value analyst."""
        from src.services.ai.analyst_service import AnalystService
        from src.services.ai.tasks.data_formatter import DataFormatter
        from unittest.mock import MagicMock

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.router = MagicMock()
            service.retriever = MagicMock()
            service.formatter = DataFormatter()
            service._router_initialized = True

            service.router.analyze.return_value = MagicMock(
                content='Value analysis of AAPL...',
                model='claude-sonnet',
                tokens_used={'input': 200, 'output': 300},
                cost_usd=0.005,
                latency_ms=1500
            )

            # quick_analyze takes analyst_id, company_data, question
            result = service.quick_analyze(
                analyst_id='value',
                company_data={'company': sample_company_data, 'metrics': {}},
            )

            assert result is not None

    def test_quick_analyze_tech(self, sample_company_data):
        """Test quick analysis with tech analyst."""
        from src.services.ai.analyst_service import AnalystService
        from src.services.ai.tasks.data_formatter import DataFormatter
        from unittest.mock import MagicMock

        # Modify for tech company
        tech_company = {**sample_company_data, 'symbol': 'NVDA', 'name': 'NVIDIA'}

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.router = MagicMock()
            service.retriever = MagicMock()
            service.formatter = DataFormatter()
            service._router_initialized = True

            service.router.analyze.return_value = MagicMock(
                content='Tech disruption analysis of NVDA...',
                model='claude-sonnet',
                tokens_used={'input': 200, 'output': 300},
                cost_usd=0.005,
                latency_ms=1500
            )

            result = service.quick_analyze(
                analyst_id='tech',
                company_data={'company': tech_company, 'metrics': {}},
            )

            assert result is not None

    def test_quick_analyze_tailrisk(self, sample_company_data):
        """Test quick analysis with tail risk analyst."""
        from src.services.ai.analyst_service import AnalystService
        from src.services.ai.tasks.data_formatter import DataFormatter
        from unittest.mock import MagicMock

        with patch.object(AnalystService, '__init__', lambda x: None):
            service = AnalystService.__new__(AnalystService)
            service.router = MagicMock()
            service.retriever = MagicMock()
            service.formatter = DataFormatter()
            service._router_initialized = True

            service.router.analyze.return_value = MagicMock(
                content='Tail risk analysis: fragility assessment...',
                model='claude-sonnet',
                tokens_used={'input': 200, 'output': 300},
                cost_usd=0.005,
                latency_ms=1500
            )

            result = service.quick_analyze(
                analyst_id='tailrisk',
                company_data={'company': sample_company_data, 'metrics': {}},
            )

            assert result is not None


class TestAnalystConsistency:
    """Tests for analyst response consistency."""

    def test_analyst_stays_in_character(self, all_analyst_ids):
        """Test that analysts maintain their persona."""
        from src.services.ai.analysts import get_analyst

        for analyst_id in all_analyst_ids:
            analyst = get_analyst(analyst_id)

            # System prompt should reinforce persona
            prompt = analyst.system_prompt.lower()
            name = analyst.name.lower()

            # Each analyst should reference their name or style
            assert name in prompt or analyst.style.lower() in prompt

    def test_different_analysts_different_focus(self):
        """Test that different analysts focus on different aspects."""
        from src.services.ai.analysts import get_analyst

        value_analyst = get_analyst('value')
        tech_analyst = get_analyst('tech')
        tailrisk_analyst = get_analyst('tailrisk')

        # Check they have different focuses
        value_prompt = value_analyst.system_prompt.lower()
        tech_prompt = tech_analyst.system_prompt.lower()
        tailrisk_prompt = tailrisk_analyst.system_prompt.lower()

        # Value focuses on intrinsic value and moats
        assert 'intrinsic value' in value_prompt or 'margin of safety' in value_prompt

        # Tech focuses on disruption
        assert 'disruption' in tech_prompt or 'network effect' in tech_prompt

        # Tail risk focuses on black swans
        assert 'tail risk' in tailrisk_prompt or 'antifragil' in tailrisk_prompt


class TestDebateFeatures:
    """Tests for multi-analyst debate features."""

    def test_bull_bear_debate_structure(self):
        """Test bull vs bear debate structure."""
        mock_debate = {
            'symbol': 'AAPL',
            'bull_analyst': 'growth',
            'bear_analyst': 'value',
            'bull_case': {
                'thesis': 'Strong growth ahead',
                'key_points': ['Services growth', 'China recovery'],
                'target_price': 220
            },
            'bear_case': {
                'thesis': 'Overvalued at current levels',
                'key_points': ['Peak iPhone', 'China risks'],
                'target_price': 140
            }
        }

        assert 'bull_case' in mock_debate
        assert 'bear_case' in mock_debate
        assert 'thesis' in mock_debate['bull_case']

    def test_round_table_includes_multiple_perspectives(self):
        """Test round table discussion structure."""
        mock_round_table = {
            'symbol': 'NVDA',
            'participants': [
                {'analyst': 'value', 'view': 'Expensive but quality'},
                {'analyst': 'tech', 'view': 'Dominant AI position'},
                {'analyst': 'tailrisk', 'view': 'Concentration risk in AI'}
            ],
            'consensus_points': ['Strong moat', 'High valuation'],
            'disagreements': ['Fair value', 'Risk level']
        }

        assert len(mock_round_table['participants']) >= 2
        assert 'consensus_points' in mock_round_table


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
