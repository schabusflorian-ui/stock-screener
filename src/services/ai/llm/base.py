# src/services/ai/llm/base.py

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Generator
from dataclasses import dataclass, field
from enum import Enum
import time


class TaskType(Enum):
    """Types of tasks for routing decisions"""
    QUERY_PARSING = "query_parsing"
    ENTITY_EXTRACTION = "entity_extraction"
    SENTIMENT = "sentiment"
    SUMMARIZATION = "summarization"
    ANALYSIS = "analysis"
    REPORT_GENERATION = "report_generation"
    CHAT = "chat"


@dataclass
class LLMResponse:
    """Standardized response from any LLM"""
    content: str
    model: str
    tokens_used: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    metadata: Dict = field(default_factory=dict)

    def __str__(self):
        return self.content


@dataclass
class Message:
    """Chat message format"""
    role: str  # 'system', 'user', 'assistant'
    content: str

    def to_dict(self):
        return {'role': self.role, 'content': self.content}


class BaseLLM(ABC):
    """
    Abstract base class for LLM providers.

    All LLM clients implement this interface for consistency.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Model/provider name"""
        pass

    @property
    @abstractmethod
    def is_local(self) -> bool:
        """Whether this is a local model (free)"""
        pass

    @property
    @abstractmethod
    def cost_per_1k_tokens(self) -> float:
        """Cost in USD per 1000 tokens"""
        pass

    @property
    @abstractmethod
    def max_context_tokens(self) -> int:
        """Maximum context window"""
        pass

    @abstractmethod
    def complete(self,
                 prompt: str,
                 max_tokens: int = 1000,
                 temperature: float = 0.7,
                 stop: List[str] = None) -> LLMResponse:
        """Generate completion for a prompt"""
        pass

    @abstractmethod
    def chat(self,
             messages: List[Message],
             max_tokens: int = 1000,
             temperature: float = 0.7,
             system: str = None) -> LLMResponse:
        """Generate response for chat messages"""
        pass

    def is_available(self) -> bool:
        """Check if model is available"""
        try:
            response = self.complete("Say 'ok'", max_tokens=10)
            return len(response.content) > 0
        except Exception:
            return False
