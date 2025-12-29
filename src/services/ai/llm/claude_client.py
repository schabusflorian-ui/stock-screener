# src/services/ai/llm/claude_client.py

import os
import time
import json
import logging
from typing import List, Dict, Generator, Optional

try:
    import requests
except ImportError:
    requests = None

from .base import BaseLLM, LLMResponse, Message, TaskType

logger = logging.getLogger(__name__)


class ClaudeClient(BaseLLM):
    """
    Claude API client for complex reasoning and analysis.

    Used for:
    - Full investment analysis
    - Complex multi-step reasoning
    - Report generation
    - Maintaining analyst personas

    Requires: ANTHROPIC_API_KEY environment variable
    """

    API_URL = "https://api.anthropic.com/v1/messages"
    API_VERSION = "2023-06-01"

    MODELS = {
        'sonnet': {
            'id': 'claude-sonnet-4-20250514',
            'input_cost_per_1m': 3.00,
            'output_cost_per_1m': 15.00,
            'context_window': 200000,
        },
        'haiku': {
            'id': 'claude-3-haiku-20240307',
            'input_cost_per_1m': 0.25,
            'output_cost_per_1m': 1.25,
            'context_window': 200000,
        }
    }

    def __init__(self, model: str = 'sonnet', api_key: str = None):
        if requests is None:
            raise ImportError("requests library required: pip install requests")

        self.model_key = model
        self.model_config = self.MODELS.get(model, self.MODELS['sonnet'])
        self.api_key = api_key or os.getenv('ANTHROPIC_API_KEY')

        if not self.api_key:
            logger.warning("ANTHROPIC_API_KEY not set - Claude will not be available")

    @property
    def name(self) -> str:
        return f"Claude ({self.model_key})"

    @property
    def is_local(self) -> bool:
        return False

    @property
    def cost_per_1k_tokens(self) -> float:
        return (self.model_config['input_cost_per_1m'] +
                self.model_config['output_cost_per_1m']) / 2000

    @property
    def max_context_tokens(self) -> int:
        return self.model_config['context_window']

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        input_cost = (input_tokens / 1_000_000) * self.model_config['input_cost_per_1m']
        output_cost = (output_tokens / 1_000_000) * self.model_config['output_cost_per_1m']
        return input_cost + output_cost

    def complete(self,
                 prompt: str,
                 max_tokens: int = 1000,
                 temperature: float = 0.7,
                 stop: List[str] = None) -> LLMResponse:
        """Generate completion (uses chat API internally)"""
        messages = [Message(role='user', content=prompt)]
        return self.chat(messages, max_tokens, temperature)

    def chat(self,
             messages: List[Message],
             max_tokens: int = 1000,
             temperature: float = 0.7,
             system: str = None) -> LLMResponse:
        """Generate chat response"""
        if not self.api_key:
            raise ValueError("Claude API key not configured")

        start_time = time.time()

        # Format messages
        formatted_messages = []
        system_prompt = system

        for msg in messages:
            if msg.role == 'system':
                system_prompt = msg.content
            else:
                formatted_messages.append(msg.to_dict())

        # Build request
        payload = {
            'model': self.model_config['id'],
            'max_tokens': max_tokens,
            'temperature': temperature,
            'messages': formatted_messages
        }

        if system_prompt:
            payload['system'] = system_prompt

        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key,
            'anthropic-version': self.API_VERSION
        }

        try:
            response = requests.post(
                self.API_URL,
                json=payload,
                headers=headers,
                timeout=120
            )
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Claude API error: {e}")
            raise

        content = data['content'][0]['text']
        input_tokens = data['usage']['input_tokens']
        output_tokens = data['usage']['output_tokens']
        latency_ms = int((time.time() - start_time) * 1000)
        cost = self._calculate_cost(input_tokens, output_tokens)

        return LLMResponse(
            content=content,
            model=self.name,
            tokens_used=input_tokens + output_tokens,
            cost_usd=cost,
            latency_ms=latency_ms,
            metadata={
                'input_tokens': input_tokens,
                'output_tokens': output_tokens,
                'stop_reason': data.get('stop_reason')
            }
        )

    def stream_chat(self,
                    messages: List[Message],
                    max_tokens: int = 1000,
                    temperature: float = 0.7,
                    system: str = None) -> Generator[str, None, None]:
        """Stream chat response token by token"""
        if not self.api_key:
            raise ValueError("Claude API key not configured")

        formatted_messages = []
        system_prompt = system

        for msg in messages:
            if msg.role == 'system':
                system_prompt = msg.content
            else:
                formatted_messages.append(msg.to_dict())

        payload = {
            'model': self.model_config['id'],
            'max_tokens': max_tokens,
            'temperature': temperature,
            'messages': formatted_messages,
            'stream': True
        }

        if system_prompt:
            payload['system'] = system_prompt

        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key,
            'anthropic-version': self.API_VERSION
        }

        response = requests.post(
            self.API_URL,
            json=payload,
            headers=headers,
            stream=True,
            timeout=120
        )

        for line in response.iter_lines():
            if line:
                line = line.decode('utf-8')
                if line.startswith('data: '):
                    try:
                        data = json.loads(line[6:])
                        if data['type'] == 'content_block_delta':
                            yield data['delta'].get('text', '')
                    except json.JSONDecodeError:
                        continue

    def is_available(self) -> bool:
        """Check if Claude API is accessible"""
        if not self.api_key:
            return False
        try:
            self.complete("test", max_tokens=5)
            return True
        except Exception:
            return False
