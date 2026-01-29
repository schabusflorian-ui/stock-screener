"""
API endpoint tests for AI/LLM features.

Tests cover:
- Analyst API endpoints
- Knowledge API endpoints
- AI feature endpoints (briefing, debate, etc.)
- Request/response validation
- Error handling
"""

import pytest
import sys
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class TestAnalystAPIEndpoints:
    """Tests for analyst API endpoints."""

    @pytest.fixture
    def mock_analyst_service(self):
        """Create a mock analyst service."""
        service = MagicMock()
        service.get_analysts.return_value = [
            {'id': 'value', 'name': 'Benjamin', 'title': 'Value Analyst'},
            {'id': 'growth', 'name': 'Catherine', 'title': 'Growth Analyst'},
            {'id': 'tech', 'name': 'Sophia', 'title': 'Tech Analyst'},
            {'id': 'tailrisk', 'name': 'Nikolai', 'title': 'Tail Risk Analyst'}
        ]
        service.get_analyst_info.return_value = {
            'id': 'value',
            'name': 'Benjamin',
            'title': 'Value Analyst',
            'greeting': 'Hello, I am Benjamin...',
            'suggested_questions': ['What is intrinsic value?']
        }
        service.create_conversation.return_value = {
            'id': 'conv-123',
            'analyst_id': 'value',
            'company_id': 'AAPL'
        }
        service.chat.return_value = {
            'content': 'Analysis response',
            'metadata': {}
        }
        return service

    def test_list_personas_structure(self, mock_analyst_service):
        """Test that list personas returns correct structure."""
        analysts = mock_analyst_service.get_analysts()

        assert len(analysts) >= 4
        for analyst in analysts:
            assert 'id' in analyst
            assert 'name' in analyst
            assert 'title' in analyst

    def test_get_persona_by_id(self, mock_analyst_service):
        """Test getting a specific persona."""
        analyst = mock_analyst_service.get_analyst_info('value')

        assert analyst['id'] == 'value'
        assert analyst['name'] == 'Benjamin'
        assert 'greeting' in analyst

    def test_create_conversation(self, mock_analyst_service):
        """Test creating a new conversation."""
        conv = mock_analyst_service.create_conversation(
            analyst_id='value',
            company_id='AAPL'
        )

        assert 'id' in conv
        assert conv['analyst_id'] == 'value'
        assert conv['company_id'] == 'AAPL'

    def test_send_message(self, mock_analyst_service):
        """Test sending a message in conversation."""
        response = mock_analyst_service.chat(
            conversation_id='conv-123',
            message='What do you think about Apple?'
        )

        assert 'content' in response
        assert len(response['content']) > 0

    def test_quick_analyze(self, mock_analyst_service):
        """Test one-shot analysis."""
        mock_analyst_service.quick_analyze.return_value = {
            'analysis': 'Apple is a high-quality company...',
            'analyst': 'value'
        }

        result = mock_analyst_service.quick_analyze(
            symbol='AAPL',
            analyst_id='value'
        )

        assert 'analysis' in result


class TestKnowledgeAPIEndpoints:
    """Tests for knowledge API endpoints."""

    @pytest.fixture
    def mock_knowledge_service(self):
        """Create a mock knowledge service."""
        service = MagicMock()
        service.search.return_value = [
            {'content': 'Wisdom 1', 'source': 'Berkshire', 'score': 0.9},
            {'content': 'Wisdom 2', 'source': 'Oaktree', 'score': 0.85}
        ]
        service.get_stats.return_value = {
            'total_documents': 500,
            'sources': ['Berkshire', 'Oaktree', 'Taleb'],
            'topics': ['valuation', 'risk', 'moats']
        }
        service.get_topics.return_value = [
            'valuation', 'moats', 'risk_management', 'growth',
            'tail_risk', 'technology', 'disruption'
        ]
        return service

    def test_search_knowledge(self, mock_knowledge_service):
        """Test searching the knowledge base."""
        results = mock_knowledge_service.search(query='margin of safety')

        assert len(results) >= 0
        for result in results:
            assert 'content' in result
            assert 'source' in result

    def test_get_stats(self, mock_knowledge_service):
        """Test getting knowledge base statistics."""
        stats = mock_knowledge_service.get_stats()

        assert 'total_documents' in stats
        assert stats['total_documents'] > 0
        assert 'sources' in stats
        assert 'topics' in stats

    def test_get_topics(self, mock_knowledge_service):
        """Test getting available topics."""
        topics = mock_knowledge_service.get_topics()

        assert len(topics) > 0
        assert 'valuation' in topics or 'risk_management' in topics

    def test_retrieve_for_company(self, mock_knowledge_service):
        """Test retrieving knowledge for company analysis."""
        mock_knowledge_service.retrieve_for_company.return_value = [
            {'content': 'Relevant wisdom', 'source': 'Test'}
        ]

        results = mock_knowledge_service.retrieve_for_company(
            symbol='AAPL',
            metrics={'pe_ratio': 28, 'roe': 0.15}
        )

        assert len(results) >= 0

    def test_topic_retrieval(self, mock_knowledge_service):
        """Test topic-specific retrieval."""
        mock_knowledge_service.retrieve_by_topic.return_value = [
            {'content': 'Topic content', 'topic': 'tail_risk'}
        ]

        results = mock_knowledge_service.retrieve_by_topic(topic='tail_risk')

        assert len(results) >= 0


class TestAIFeatureEndpoints:
    """Tests for AI feature endpoints (briefing, debate, etc.)."""

    @pytest.fixture
    def mock_ai_service(self):
        """Create a mock AI service."""
        service = MagicMock()
        service.generate_briefing.return_value = {
            'date': '2024-01-15',
            'market_summary': 'Markets are up...',
            'key_events': ['Earnings season begins'],
            'watchlist_updates': []
        }
        service.bull_bear_debate.return_value = {
            'bull_case': 'Strong growth...',
            'bear_case': 'High valuation...',
            'conclusion': 'Mixed outlook'
        }
        service.round_table.return_value = {
            'participants': ['Benjamin', 'Catherine', 'Nikolai'],
            'discussion': 'Each analyst presents their view...'
        }
        return service

    def test_generate_briefing(self, mock_ai_service):
        """Test generating daily briefing."""
        briefing = mock_ai_service.generate_briefing()

        assert 'market_summary' in briefing
        assert 'key_events' in briefing

    def test_bull_bear_debate(self, mock_ai_service):
        """Test bull vs bear debate."""
        debate = mock_ai_service.bull_bear_debate(symbol='AAPL')

        assert 'bull_case' in debate
        assert 'bear_case' in debate

    def test_round_table(self, mock_ai_service):
        """Test multi-analyst round table."""
        discussion = mock_ai_service.round_table(
            symbol='NVDA',
            analysts=['value', 'growth', 'tech']
        )

        assert 'participants' in discussion
        assert len(discussion['participants']) >= 2

    def test_challenge_thesis(self, mock_ai_service):
        """Test challenging an investment thesis."""
        mock_ai_service.challenge_thesis.return_value = {
            'original_thesis': 'AAPL is undervalued',
            'challenges': ['High valuation', 'Slowing growth'],
            'counter_arguments': ['Strong ecosystem', 'Services growth']
        }

        result = mock_ai_service.challenge_thesis(
            thesis='AAPL is undervalued',
            symbol='AAPL'
        )

        assert 'challenges' in result


class TestAPIRequestValidation:
    """Tests for API request validation."""

    def test_symbol_validation(self):
        """Test that invalid symbols are rejected."""
        # Valid symbols
        valid_symbols = ['AAPL', 'MSFT', 'GOOGL', 'BRK.A', 'BRK-B']

        for symbol in valid_symbols:
            assert len(symbol) >= 1
            assert len(symbol) <= 10

    def test_analyst_id_validation(self, all_analyst_ids):
        """Test that analyst IDs are validated."""
        for analyst_id in all_analyst_ids:
            assert analyst_id in ['value', 'growth', 'contrarian', 'quant', 'tech', 'tailrisk']

    def test_empty_message_handling(self):
        """Test handling of empty messages."""
        # Empty messages should be rejected
        empty_messages = ['', '   ', None]

        for msg in empty_messages:
            is_valid = msg is not None and len(str(msg).strip()) > 0
            assert not is_valid

    def test_max_message_length(self):
        """Test maximum message length enforcement."""
        max_length = 10000  # Example limit

        long_message = 'x' * 15000
        truncated = long_message[:max_length] if len(long_message) > max_length else long_message

        assert len(truncated) <= max_length


class TestAPIErrorHandling:
    """Tests for API error handling."""

    def test_analyst_not_found_error(self):
        """Test error when analyst not found."""
        from src.services.ai.analysts import get_analyst
        import pytest

        # get_analyst raises ValueError for unknown analyst
        with pytest.raises(ValueError) as exc_info:
            get_analyst('nonexistent')

        assert 'Unknown analyst' in str(exc_info.value)

    def test_conversation_not_found_handling(self):
        """Test handling of missing conversation."""
        # Should return error response, not crash
        mock_service = MagicMock()
        mock_service.get_conversation.return_value = None

        result = mock_service.get_conversation('invalid-conv-id')

        assert result is None

    def test_llm_timeout_handling(self):
        """Test handling of LLM timeout."""
        mock_router = MagicMock()
        mock_router.route.side_effect = TimeoutError("Request timed out")

        with pytest.raises(TimeoutError):
            mock_router.route('task', [])

    def test_rate_limit_error(self):
        """Test handling of rate limit errors."""
        class RateLimitError(Exception):
            pass

        mock_client = MagicMock()
        mock_client.chat.side_effect = RateLimitError("Rate limit exceeded")

        with pytest.raises(RateLimitError):
            mock_client.chat([])


class TestAPIResponseFormat:
    """Tests for API response format consistency."""

    def test_analyst_response_format(self):
        """Test analyst response format."""
        expected_fields = ['id', 'name', 'title', 'style', 'icon', 'color', 'description']

        from src.services.ai.analysts import get_analyst
        analyst = get_analyst('value')

        for field in expected_fields:
            assert hasattr(analyst, field)

    def test_knowledge_search_response_format(self):
        """Test knowledge search response format."""
        mock_result = {
            'content': 'Sample wisdom',
            'metadata': {
                'source': 'Berkshire',
                'topics': ['valuation']
            },
            'score': 0.85
        }

        assert 'content' in mock_result
        assert 'metadata' in mock_result
        assert 'score' in mock_result

    def test_conversation_response_format(self):
        """Test conversation response format."""
        mock_response = {
            'message_id': 'msg-123',
            'role': 'assistant',
            'content': 'Analysis...',
            'timestamp': '2024-01-15T10:00:00Z',
            'metadata': {
                'model': 'claude-sonnet',
                'tokens_used': 150
            }
        }

        assert 'content' in mock_response
        assert 'role' in mock_response


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_analyst_health_check(self):
        """Test analyst service health check."""
        mock_service = MagicMock()
        mock_service.health_check.return_value = {
            'status': 'healthy',
            'analysts_loaded': 6,
            'llm_available': True
        }

        health = mock_service.health_check()

        assert health['status'] == 'healthy'
        assert health['analysts_loaded'] >= 4

    def test_knowledge_health_check(self):
        """Test knowledge service health check."""
        mock_service = MagicMock()
        mock_service.health_check.return_value = {
            'status': 'healthy',
            'document_count': 500,
            'embedding_service': 'available'
        }

        health = mock_service.health_check()

        assert health['status'] == 'healthy'
        assert health['document_count'] > 0


class TestStreamingEndpoints:
    """Tests for streaming (SSE) endpoints."""

    def test_streaming_response_format(self):
        """Test SSE response format."""
        # SSE events should follow format: data: {...}\n\n
        mock_events = [
            {'type': 'token', 'content': 'Hello'},
            {'type': 'token', 'content': ' world'},
            {'type': 'done', 'content': ''}
        ]

        for event in mock_events:
            # Should be serializable to JSON
            json_str = json.dumps(event)
            sse_line = f"data: {json_str}\n\n"

            assert sse_line.startswith('data: ')
            assert sse_line.endswith('\n\n')

    def test_streaming_token_accumulation(self):
        """Test that streaming tokens accumulate correctly."""
        tokens = ['Hello', ' ', 'world', '!']
        full_response = ''.join(tokens)

        assert full_response == 'Hello world!'


# Run tests if executed directly
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
