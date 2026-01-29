"""
Pytest configuration and shared fixtures for the Investment Project test suite.

This module provides:
- Common fixtures for testing AI/LLM components
- Mock data for companies, financial statements, etc.
- Test database setup and teardown
- Environment configuration for testing
"""

import pytest
import sys
import os
import tempfile
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add project root to path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


# ============================================================================
# Environment Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def project_root():
    """Return the project root directory."""
    return PROJECT_ROOT


@pytest.fixture(scope="session")
def test_data_dir(project_root):
    """Return the test data directory."""
    test_dir = project_root / "tests" / "test_data"
    test_dir.mkdir(exist_ok=True)
    return test_dir


@pytest.fixture
def temp_dir():
    """Create a temporary directory for test files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def temp_db(temp_dir):
    """Create a temporary SQLite database path."""
    return str(temp_dir / "test_vectors.db")


# ============================================================================
# Mock Company Data Fixtures
# ============================================================================

@pytest.fixture
def sample_company_data():
    """Sample company data for testing."""
    return {
        'symbol': 'AAPL',
        'name': 'Apple Inc.',
        'sector': 'Technology',
        'industry': 'Consumer Electronics',
        'market_cap': 2800000000000,  # $2.8T
        'pe_ratio': 28.5,
        'forward_pe': 25.2,
        'price': 185.50,
        'fifty_two_week_high': 199.62,
        'fifty_two_week_low': 124.17,
        'dividend_yield': 0.52,
        'beta': 1.28,
        'description': 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.'
    }


@pytest.fixture
def sample_financial_metrics():
    """Sample financial metrics for testing."""
    return {
        'revenue': 383285000000,
        'revenue_growth': 0.08,
        'gross_margin': 0.438,
        'operating_margin': 0.297,
        'net_margin': 0.253,
        'roe': 0.147,
        'roa': 0.288,
        'roic': 0.562,
        'debt_to_equity': 1.81,
        'current_ratio': 0.99,
        'quick_ratio': 0.94,
        'free_cash_flow': 99584000000,
        'fcf_margin': 0.26,
        'earnings_per_share': 6.13,
        'book_value_per_share': 4.25
    }


@pytest.fixture
def sample_income_statement():
    """Sample income statement data."""
    return {
        'fiscal_date_ending': '2023-09-30',
        'total_revenue': 383285000000,
        'cost_of_revenue': 214137000000,
        'gross_profit': 169148000000,
        'operating_expenses': 55013000000,
        'operating_income': 114135000000,
        'interest_expense': 3933000000,
        'income_before_tax': 113736000000,
        'income_tax_expense': 16741000000,
        'net_income': 96995000000
    }


@pytest.fixture
def sample_balance_sheet():
    """Sample balance sheet data."""
    return {
        'fiscal_date_ending': '2023-09-30',
        'total_assets': 352583000000,
        'current_assets': 143566000000,
        'cash_and_equivalents': 29965000000,
        'short_term_investments': 31590000000,
        'accounts_receivable': 29508000000,
        'inventory': 6331000000,
        'total_liabilities': 290437000000,
        'current_liabilities': 145308000000,
        'long_term_debt': 95281000000,
        'total_equity': 62146000000,
        'retained_earnings': -214000000
    }


@pytest.fixture
def sample_cash_flow():
    """Sample cash flow statement data."""
    return {
        'fiscal_date_ending': '2023-09-30',
        'operating_cash_flow': 110543000000,
        'capital_expenditure': 10959000000,
        'free_cash_flow': 99584000000,
        'dividends_paid': 15025000000,
        'share_repurchases': 77550000000
    }


@pytest.fixture
def sample_sentiment_data():
    """Sample sentiment data for testing."""
    return {
        'overall_sentiment': 0.65,
        'news_sentiment': 0.72,
        'social_sentiment': 0.58,
        'analyst_sentiment': 0.70,
        'insider_sentiment': -0.15,
        'news_volume': 156,
        'social_mentions': 12450,
        'sentiment_trend': 'improving'
    }


@pytest.fixture
def sample_analyst_ratings():
    """Sample analyst ratings data."""
    return {
        'consensus': 'Buy',
        'buy_count': 35,
        'hold_count': 8,
        'sell_count': 2,
        'average_price_target': 205.50,
        'high_price_target': 250.00,
        'low_price_target': 150.00,
        'upside_potential': 0.108
    }


# ============================================================================
# Mock Document/Knowledge Base Fixtures
# ============================================================================

@pytest.fixture
def sample_document_chunk():
    """Sample document chunk for testing."""
    return {
        'content': """The most important thing in investing is to have a margin of safety.
        This means buying securities at prices significantly below their intrinsic value.
        When you build a margin of safety into your investments, you protect yourself
        from errors in analysis and unforeseen negative events.""",
        'metadata': {
            'source': 'Berkshire Hathaway',
            'author': 'Warren Buffett',
            'year': 2020,
            'topics': ['valuation', 'risk_management', 'margin_of_safety'],
            'primary_topic': 'valuation',
            'chunk_index': 0,
            'total_chunks': 10
        }
    }


@pytest.fixture
def sample_knowledge_base_content():
    """Sample knowledge base content for testing."""
    return [
        {
            'id': 'buffett_margin_safety',
            'content': 'The margin of safety principle is central to value investing...',
            'metadata': {'source': 'Berkshire', 'topics': ['valuation']}
        },
        {
            'id': 'marks_risk',
            'content': 'Risk means more things can happen than will happen...',
            'metadata': {'source': 'Oaktree', 'topics': ['risk_management']}
        },
        {
            'id': 'taleb_antifragility',
            'content': 'Antifragility is beyond resilience or robustness...',
            'metadata': {'source': 'Taleb', 'topics': ['tail_risk', 'antifragility']}
        },
        {
            'id': 'a16z_network_effects',
            'content': 'Network effects occur when a product becomes more valuable...',
            'metadata': {'source': 'a16z', 'topics': ['technology', 'moats']}
        }
    ]


# ============================================================================
# Mock LLM Response Fixtures
# ============================================================================

@pytest.fixture
def mock_llm_response():
    """Mock LLM response for testing."""
    return {
        'content': 'Based on my analysis of Apple Inc., this is a high-quality company with strong moats...',
        'model': 'claude-sonnet-4-20250514',
        'tokens_used': {'input': 1500, 'output': 500},
        'cost_usd': 0.012,
        'latency_ms': 1250,
        'metadata': {}
    }


@pytest.fixture
def mock_claude_client():
    """Mock Claude client for testing without API calls."""
    with patch('src.services.ai.llm.claude_client.ClaudeClient') as mock:
        instance = mock.return_value
        instance.name = 'claude-sonnet'
        instance.is_available.return_value = True
        instance.chat.return_value = MagicMock(
            content='Mock analysis response',
            model='claude-sonnet-4-20250514',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.001,
            latency_ms=500
        )
        yield instance


@pytest.fixture
def mock_ollama_client():
    """Mock Ollama client for testing without local server."""
    with patch('src.services.ai.llm.ollama_client.OllamaClient') as mock:
        instance = mock.return_value
        instance.name = 'phi3'
        instance.is_available.return_value = True
        instance.chat.return_value = MagicMock(
            content='Mock local response',
            model='phi3',
            tokens_used={'input': 100, 'output': 50},
            cost_usd=0.0,
            latency_ms=200
        )
        yield instance


@pytest.fixture
def mock_clients(mock_claude_client, mock_ollama_client):
    """Combined mock clients fixture for router tests.

    Returns a tuple (mock_claude, mock_ollama) for compatibility with tests.
    """
    return (mock_claude_client, mock_ollama_client)


# ============================================================================
# Analyst Persona Fixtures
# ============================================================================

@pytest.fixture
def all_analyst_ids():
    """List of all analyst persona IDs."""
    return ['value', 'growth', 'contrarian', 'quant', 'tech', 'tailrisk']


@pytest.fixture
def sample_conversation():
    """Sample conversation for testing."""
    return {
        'id': 'test-conv-123',
        'analyst_id': 'value',
        'company_id': 'AAPL',
        'messages': [
            {
                'id': 'msg-1',
                'role': 'assistant',
                'content': 'Hello, I am Benjamin, your Value Investing Analyst...',
                'timestamp': '2024-01-15T10:00:00Z'
            },
            {
                'id': 'msg-2',
                'role': 'user',
                'content': 'What do you think about Apple as an investment?',
                'timestamp': '2024-01-15T10:01:00Z'
            }
        ]
    }


# ============================================================================
# Scraper Test Fixtures
# ============================================================================

@pytest.fixture
def mock_html_response():
    """Mock HTML response for scraper testing."""
    return """
    <html>
    <head><title>Test Article</title></head>
    <body>
        <article>
            <h1>Investment Wisdom</h1>
            <p>This is test content about investing.</p>
            <p>Value investing requires patience and discipline.</p>
        </article>
    </body>
    </html>
    """


@pytest.fixture
def mock_scraper_output_dir(temp_dir):
    """Create mock output directory for scrapers."""
    output_dir = temp_dir / "knowledge_base" / "test_source"
    output_dir.mkdir(parents=True)
    return output_dir


# ============================================================================
# Database Fixtures
# ============================================================================

@pytest.fixture
def sample_vector_embedding():
    """Sample 384-dimensional embedding vector."""
    import numpy as np
    np.random.seed(42)
    return np.random.randn(384).astype(np.float32).tolist()


@pytest.fixture
def populated_vector_store(temp_db, sample_knowledge_base_content, sample_vector_embedding):
    """Create a populated vector store for testing."""
    from src.services.ai.vector_store import VectorStore

    store = VectorStore(temp_db)

    for item in sample_knowledge_base_content:
        doc = {
            'content': item['content'],
            'metadata': item['metadata'],
            'embedding': sample_vector_embedding
        }
        store.add_document(doc)

    yield store
    store.close()


# ============================================================================
# API Test Fixtures
# ============================================================================

@pytest.fixture
def api_test_client():
    """Create a test client for API testing."""
    # This would be used with express testing
    # For now, return a placeholder
    return None


# ============================================================================
# Utility Functions
# ============================================================================

def assert_valid_analyst_response(response):
    """Assert that an analyst response has valid structure."""
    assert response is not None
    assert 'content' in response or hasattr(response, 'content')
    content = response.get('content', '') if isinstance(response, dict) else response.content
    assert len(content) > 0


def assert_valid_embedding(embedding, expected_dim=384):
    """Assert that an embedding vector is valid."""
    assert embedding is not None
    assert len(embedding) == expected_dim
    assert all(isinstance(x, (int, float)) for x in embedding)


def assert_valid_chunk(chunk):
    """Assert that a document chunk has valid structure."""
    assert 'content' in chunk
    assert len(chunk['content']) > 0
    assert 'metadata' in chunk


# Export utility functions
__all__ = [
    'assert_valid_analyst_response',
    'assert_valid_embedding',
    'assert_valid_chunk'
]
