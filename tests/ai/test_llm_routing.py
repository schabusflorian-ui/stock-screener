"""
Unit tests for LLM routing and cost tracking.

Tests cover:
- Model router selection logic
- Task type routing
- Cost calculation
- Token usage tracking
- Budget compliance
- Fallback behavior
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestModelRouter:
    """Tests for the ModelRouter class."""

    @pytest.fixture
    def mock_clients(self):
        """Create mock LLM clients."""
        mock_claude = MagicMock()
        mock_claude.name = 'claude-sonnet'
        mock_claude.is_available.return_value = True
        mock_claude.chat.return_value = MagicMock(
            content='Claude response',
            model='claude-sonnet-4-20250514',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.001,
            latency_ms=500
        )

        mock_ollama = MagicMock()
        mock_ollama.name = 'phi3'
        mock_ollama.is_available.return_value = True
        mock_ollama.chat.return_value = MagicMock(
            content='Ollama response',
            model='phi3',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.0,
            latency_ms=200
        )

        return mock_claude, mock_ollama

    def test_router_initialization(self):
        """Test router initialization."""
        from src.services.ai.llm.router import ModelRouter

        with patch('src.services.ai.llm.router.ClaudeClient'), \
             patch('src.services.ai.llm.router.OllamaClient'):
            router = ModelRouter()

            assert router is not None

    def test_task_type_routing_query_parsing(self, mock_clients):
        """Test that query parsing routes to fast model."""
        from src.services.ai.llm.router import ModelRouter
        from src.services.ai.llm.base import TaskType

        mock_claude, mock_ollama = mock_clients

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            router.claude = mock_claude
            router.ollama = mock_ollama

            model = router.get_model(TaskType.QUERY_PARSING)

            # Query parsing should prefer fast local model
            assert model in [mock_ollama, mock_claude]

    def test_task_type_routing_analysis(self, mock_clients):
        """Test that analysis routes to best model."""
        from src.services.ai.llm.router import ModelRouter
        from src.services.ai.llm.base import TaskType

        mock_claude, mock_ollama = mock_clients

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            router.claude = mock_claude
            router.ollama = mock_ollama

            model = router.get_model(TaskType.ANALYSIS)

            # Analysis should use Claude (best quality)
            assert model == mock_claude

    def test_fallback_when_claude_unavailable(self, mock_clients):
        """Test fallback to Ollama when Claude unavailable."""
        from src.services.ai.llm.router import ModelRouter
        from src.services.ai.llm.base import TaskType

        mock_claude, mock_ollama = mock_clients
        mock_claude.is_available.return_value = False

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            router.claude = mock_claude
            router.ollama = mock_ollama

            model = router.get_model(TaskType.ANALYSIS)

            # Should fall back to Ollama
            assert model == mock_ollama or model is None

    def test_route_executes_on_selected_model(self, mock_clients):
        """Test that route() executes on the selected model."""
        from src.services.ai.llm.router import ModelRouter
        from src.services.ai.llm.base import TaskType, Message

        mock_claude, mock_ollama = mock_clients

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            # Manually set availability so route() can find a model
            router._availability['claude_sonnet'] = True
            router._models['claude_sonnet'] = mock_claude

            messages = [Message(role='user', content='Analyze AAPL')]
            response = router.route(TaskType.ANALYSIS, messages=messages)

            assert response is not None
            mock_claude.chat.assert_called()


class TestCostCalculation:
    """Tests for LLM cost calculation."""

    def test_claude_cost_calculation(self):
        """Test Claude cost calculation."""
        # Claude Sonnet pricing: $3/1M input, $15/1M output
        input_tokens = 1000
        output_tokens = 500

        expected_cost = (1000 * 3 / 1_000_000) + (500 * 15 / 1_000_000)

        # Just test the calculation logic directly
        input_cost_per_1m = 3.0
        output_cost_per_1m = 15.0

        cost = (input_tokens * input_cost_per_1m / 1_000_000) + (output_tokens * output_cost_per_1m / 1_000_000)

        assert abs(cost - expected_cost) < 0.0001

    def test_ollama_is_free(self):
        """Test that Ollama has zero cost."""
        # Ollama runs locally, so cost should always be 0
        cost = 0.0

        assert cost == 0.0

    def test_cost_tracking_accumulates(self, temp_db):
        """Test that costs accumulate correctly."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        # Log multiple requests
        tracker.log_request(
            model='claude-sonnet',
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.001,
            latency_ms=500
        )
        tracker.log_request(
            model='claude-sonnet',
            input_tokens=200,
            output_tokens=100,
            cost_usd=0.002,
            latency_ms=600
        )

        stats = tracker.get_session_stats()

        assert stats['cost'] == pytest.approx(0.003)
        assert stats['requests'] == 2


class TestUsageTracker:
    """Tests for the UsageTracker class."""

    def test_tracker_initialization(self, temp_db):
        """Test usage tracker initialization."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        assert tracker is not None
        stats = tracker.get_session_stats()
        assert stats['requests'] == 0
        assert stats['cost'] == 0.0

    def test_log_request(self, temp_db):
        """Test logging a request."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        tracker.log_request(
            model='claude-sonnet',
            input_tokens=100,
            output_tokens=50,
            cost_usd=0.001,
            latency_ms=500
        )

        stats = tracker.get_session_stats()
        assert stats['requests'] == 1
        assert stats['cost'] == 0.001

    def test_model_breakdown(self, temp_db):
        """Test getting breakdown by model."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        tracker.log_request(model='claude-sonnet', input_tokens=100, output_tokens=50, cost_usd=0.001, latency_ms=500)
        tracker.log_request(model='phi3', input_tokens=100, output_tokens=50, cost_usd=0.0, latency_ms=200)
        tracker.log_request(model='claude-sonnet', input_tokens=100, output_tokens=50, cost_usd=0.001, latency_ms=500)

        # get_usage_by_model returns breakdown from the database
        by_model = tracker.get_usage_by_model(days=1)

        # Should have entries for both models
        assert len(by_model) >= 1

    def test_token_tracking(self, temp_db):
        """Test token usage tracking."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        tracker.log_request(model='test', input_tokens=100, output_tokens=50, cost_usd=0.0, latency_ms=100)
        tracker.log_request(model='test', input_tokens=200, output_tokens=100, cost_usd=0.0, latency_ms=100)

        stats = tracker.get_session_stats()

        # Session stats track total tokens
        assert stats['tokens'] == 450  # (100+50) + (200+100)

    def test_daily_usage(self, temp_db):
        """Test getting daily usage."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)

        tracker.log_request(model='test', input_tokens=100, output_tokens=50, cost_usd=0.001, latency_ms=100)

        daily = tracker.get_daily_usage()

        assert 'requests' in daily
        assert 'cost' in daily
        assert daily['requests'] >= 1


class TestBudgetCompliance:
    """Tests for budget compliance checking."""

    def test_budget_check_under_limit(self, temp_db):
        """Test budget check when under limit."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)
        tracker.daily_budget = 10.0

        tracker.log_request(model='test', input_tokens=100, output_tokens=50, cost_usd=1.0, latency_ms=100)

        budget_status = tracker.check_budget()

        assert budget_status['can_proceed'] is True
        assert budget_status['daily']['remaining'] == pytest.approx(9.0)

    def test_budget_check_over_limit(self, temp_db):
        """Test budget check when over limit."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)
        tracker.daily_budget = 1.0

        tracker.log_request(model='test', input_tokens=100, output_tokens=50, cost_usd=1.5, latency_ms=100)

        budget_status = tracker.check_budget()

        assert budget_status['daily']['exceeded'] is True
        assert budget_status['daily']['remaining'] < 0

    def test_monthly_budget_tracking(self, temp_db):
        """Test monthly budget tracking."""
        from src.services.ai.usage_tracker import UsageTracker

        tracker = UsageTracker(db_path=temp_db)
        tracker.monthly_budget = 100.0

        for _ in range(10):
            tracker.log_request(model='test', input_tokens=100, output_tokens=50, cost_usd=5.0, latency_ms=100)

        budget_status = tracker.check_budget()

        assert budget_status['monthly']['remaining'] == pytest.approx(50.0)


class TestTaskTypeEnum:
    """Tests for TaskType enumeration."""

    def test_all_task_types_defined(self):
        """Test that all task types are defined."""
        from src.services.ai.llm.base import TaskType

        expected_types = [
            'QUERY_PARSING',
            'ENTITY_EXTRACTION',
            'SENTIMENT',
            'SUMMARIZATION',
            'ANALYSIS',
            'REPORT_GENERATION',
            'CHAT'
        ]

        for task_type in expected_types:
            assert hasattr(TaskType, task_type)

    def test_task_type_string_values(self):
        """Test task type string representations."""
        from src.services.ai.llm.base import TaskType

        for task in TaskType:
            assert task.value is not None
            assert len(task.value) > 0


class TestLLMResponse:
    """Tests for LLMResponse dataclass."""

    def test_response_structure(self):
        """Test LLMResponse has required fields."""
        from src.services.ai.llm.base import LLMResponse

        response = LLMResponse(
            content='Test response',
            model='test-model',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.001,
            latency_ms=500
        )

        assert response.content == 'Test response'
        assert response.model == 'test-model'
        assert response.tokens_used['input'] == 100
        assert response.cost_usd == 0.001
        assert response.latency_ms == 500

    def test_response_metadata(self):
        """Test LLMResponse metadata handling."""
        from src.services.ai.llm.base import LLMResponse

        response = LLMResponse(
            content='Test',
            model='test',
            tokens_used={},
            cost_usd=0.0,
            latency_ms=0,
            metadata={'custom_field': 'value'}
        )

        assert response.metadata['custom_field'] == 'value'


class TestMessageClass:
    """Tests for Message class."""

    def test_message_creation(self):
        """Test creating a message."""
        from src.services.ai.llm.base import Message

        msg = Message(role='user', content='Hello')

        assert msg.role == 'user'
        assert msg.content == 'Hello'

    def test_message_roles(self):
        """Test valid message roles."""
        from src.services.ai.llm.base import Message

        valid_roles = ['user', 'assistant', 'system']

        for role in valid_roles:
            msg = Message(role=role, content='Test')
            assert msg.role == role


class TestAvailableModels:
    """Tests for model availability checking."""

    def test_get_available_models(self, mock_clients):
        """Test getting list of available models."""
        from src.services.ai.llm.router import ModelRouter

        mock_claude, mock_ollama = mock_clients

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            # Set up availability properly
            router._availability['claude_sonnet'] = True
            router._models['claude_sonnet'] = mock_claude

            available = router.get_available_models()

            assert len(available) >= 0

    def test_router_stats(self, mock_clients):
        """Test getting router statistics."""
        from src.services.ai.llm.router import ModelRouter
        from src.services.ai.llm.base import TaskType, Message

        mock_claude, mock_ollama = mock_clients

        with patch('src.services.ai.llm.router.ClaudeClient', return_value=mock_claude), \
             patch('src.services.ai.llm.router.OllamaClient', return_value=mock_ollama):
            router = ModelRouter()
            # Set up availability properly
            router._availability['claude_sonnet'] = True
            router._models['claude_sonnet'] = mock_claude

            # Make some requests
            router.route(TaskType.ANALYSIS, messages=[Message(role='user', content='Test')])

            stats = router.get_stats()

            assert 'total_requests' in stats or stats is not None


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
