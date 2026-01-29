#!/usr/bin/env python3
"""
Test script for LLM integration layer.

Tests:
- Query parsing (rule-based)
- Data formatting
- Configuration
- Usage tracking
- Model availability check
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

from src.services.ai.llm.base import TaskType, Message, LLMResponse
from src.services.ai.tasks.query_parser import QueryParser, ParsedQuery
from src.services.ai.tasks.data_formatter import DataFormatter
from src.services.ai.config import AIConfig, get_config
from src.services.ai.usage_tracker import UsageTracker


def test_query_parser():
    """Test rule-based query parsing"""
    print("\n=== Testing Query Parser ===\n")

    parser = QueryParser()

    test_queries = [
        "Analyze AAPL stock for me",
        "Compare MSFT vs GOOGL",
        "Find stocks with P/E under 15",
        "What is the current price of NVDA?",
        "Explain what ROE means",
        "Should I buy TSLA? Is it overvalued?",
        "Show me the dividend yield for KO"
    ]

    for query in test_queries:
        parsed = parser.parse(query)
        print(f"Query: {query}")
        print(f"  Intent: {parsed.intent}")
        print(f"  Symbols: {parsed.symbols}")
        print(f"  Metrics: {parsed.metrics}")
        print(f"  Topics: {parsed.topics}")
        print(f"  Time Period: {parsed.time_period}")
        print(f"  Needs Company Data: {parsed.needs_company_data()}")
        print()


def test_data_formatter():
    """Test data formatting for LLM prompts"""
    print("\n=== Testing Data Formatter ===\n")

    formatter = DataFormatter()

    # Test company data formatting
    company = {
        'name': 'Apple Inc.',
        'symbol': 'AAPL',
        'sector': 'Technology',
        'industry': 'Consumer Electronics',
        'price': 178.50,
        'change_percent': 1.25,
        'market_cap': 2800000000000
    }

    metrics = {
        'pe_ratio': 28.5,
        'forward_pe': 25.2,
        'pb_ratio': 45.3,
        'ps_ratio': 7.2,
        'roe': 0.156,
        'profit_margin': 0.245,
        'revenue_growth': 0.082,
        'debt_to_equity': 1.95,
        'free_cash_flow': 98000000000,
        'dcf_value': 195.00
    }

    formatted = formatter.format_company_data(company, metrics)
    print("Formatted Company Data:")
    print(formatted)
    print()

    # Test comparison formatting
    companies = [
        {'symbol': 'AAPL', 'metrics': {'pe_ratio': 28.5, 'revenue_growth': 0.08, 'profit_margin': 0.24, 'roe': 0.15, 'debt_to_equity': 1.95}},
        {'symbol': 'MSFT', 'metrics': {'pe_ratio': 32.1, 'revenue_growth': 0.12, 'profit_margin': 0.35, 'roe': 0.38, 'debt_to_equity': 0.45}},
        {'symbol': 'GOOGL', 'metrics': {'pe_ratio': 22.3, 'revenue_growth': 0.15, 'profit_margin': 0.22, 'roe': 0.25, 'debt_to_equity': 0.10}}
    ]

    comparison = formatter.format_comparison_data(companies)
    print("Formatted Comparison:")
    print(comparison)


def test_configuration():
    """Test configuration loading"""
    print("\n=== Testing Configuration ===\n")

    config = get_config()

    print("Configuration Summary:")
    print(f"  Claude configured: {config.claude.is_configured}")
    print(f"  Claude model: {config.claude.default_model}")
    print(f"  Ollama URL: {config.ollama.base_url}")
    print(f"  Ollama model: {config.ollama.default_model}")
    print(f"  Prefer local: {config.router.prefer_local}")
    print(f"  Daily budget: ${config.budget.daily_budget_usd}")
    print(f"  Monthly budget: ${config.budget.monthly_budget_usd}")

    validation = config.validate()
    print(f"\nValidation:")
    print(f"  Valid: {validation['valid']}")
    if validation['warnings']:
        print(f"  Warnings: {validation['warnings']}")
    if validation['issues']:
        print(f"  Issues: {validation['issues']}")


def test_usage_tracker():
    """Test usage tracking"""
    print("\n=== Testing Usage Tracker ===\n")

    # Use temp database for testing
    import tempfile
    db_path = os.path.join(tempfile.gettempdir(), 'test_llm_usage.db')

    tracker = UsageTracker(db_path)

    # Log some test requests
    tracker.log_request(
        model='Claude (sonnet)',
        task_type='analysis',
        input_tokens=1500,
        output_tokens=800,
        cost_usd=0.015,
        latency_ms=2500,
        success=True
    )

    tracker.log_request(
        model='Ollama (phi3)',
        task_type='query_parsing',
        input_tokens=100,
        output_tokens=50,
        cost_usd=0.0,
        latency_ms=150,
        success=True
    )

    # Get stats
    daily = tracker.get_daily_usage()
    print(f"Daily Usage:")
    print(f"  Requests: {daily['requests']}")
    print(f"  Tokens: {daily['tokens']}")
    print(f"  Cost: ${daily['cost']:.4f}")

    session = tracker.get_session_stats()
    print(f"\nSession Stats:")
    print(f"  Requests: {session['requests']}")
    print(f"  Tokens: {session['tokens']}")
    print(f"  Cost: ${session['cost']:.4f}")

    budget = tracker.check_budget()
    print(f"\nBudget Status:")
    print(f"  Daily remaining: ${budget['daily']['remaining']:.2f}")
    print(f"  Can proceed: {budget['can_proceed']}")

    # Clean up
    os.remove(db_path)


def test_message_types():
    """Test message and response types"""
    print("\n=== Testing Message Types ===\n")

    # Test Message
    msg = Message(role='user', content='Analyze AAPL')
    print(f"Message: {msg.to_dict()}")

    # Test LLMResponse
    response = LLMResponse(
        content='Apple Inc. is a strong buy...',
        model='Claude (sonnet)',
        tokens_used=500,
        cost_usd=0.01,
        latency_ms=2000
    )
    print(f"\nResponse content: {str(response)[:50]}...")
    print(f"Model: {response.model}")
    print(f"Tokens: {response.tokens_used}")
    print(f"Cost: ${response.cost_usd}")
    print(f"Latency: {response.latency_ms}ms")


def test_task_types():
    """Test task type enum"""
    print("\n=== Testing Task Types ===\n")

    for task in TaskType:
        print(f"  {task.name}: {task.value}")


def main():
    """Run all tests"""
    print("=" * 60)
    print("LLM Integration Layer Tests")
    print("=" * 60)

    try:
        test_message_types()
        test_task_types()
        test_query_parser()
        test_data_formatter()
        test_configuration()
        test_usage_tracker()

        print("\n" + "=" * 60)
        print("All tests passed!")
        print("=" * 60)

    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
