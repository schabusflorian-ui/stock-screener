# src/services/ai/llm/__init__.py

"""
LLM Clients and Router

Provides:
- BaseLLM: Abstract base class for LLM providers
- ClaudeClient: Claude API client for complex reasoning
- OllamaClient: Local model client for lightweight tasks
- ModelRouter: Smart routing between models
"""

from .base import BaseLLM, LLMResponse, Message, TaskType
from .claude_client import ClaudeClient
from .ollama_client import OllamaClient
from .router import ModelRouter

__all__ = [
    'BaseLLM',
    'LLMResponse',
    'Message',
    'TaskType',
    'ClaudeClient',
    'OllamaClient',
    'ModelRouter'
]
