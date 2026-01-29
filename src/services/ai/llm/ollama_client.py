# src/services/ai/llm/ollama_client.py

import os
import time
import json
import logging
from typing import List, Dict, Generator, Optional

try:
    import requests
except ImportError:
    requests = None

from .base import BaseLLM, LLMResponse, Message

logger = logging.getLogger(__name__)


class OllamaClient(BaseLLM):
    """
    Ollama client for local model inference.

    Benefits:
    - Zero API cost
    - Full privacy
    - No rate limits
    - Works offline

    Good for:
    - Query parsing
    - Entity extraction
    - Quick summarization
    - Development/testing

    Setup:
        curl -fsSL https://ollama.com/install.sh | sh
        ollama pull phi3           # Small, fast
        ollama pull llama3.2:3b    # Better quality
        ollama pull mistral        # Good all-around
    """

    DEFAULT_URL = "http://localhost:11434"

    RECOMMENDED_MODELS = {
        'phi3': {
            'context_window': 4096,
            'speed': 'fast',
            'quality': 'good',
            'use_for': ['parsing', 'extraction']
        },
        'llama3.2:1b': {
            'context_window': 8192,
            'speed': 'very_fast',
            'quality': 'basic',
            'use_for': ['parsing']
        },
        'llama3.2:3b': {
            'context_window': 8192,
            'speed': 'fast',
            'quality': 'good',
            'use_for': ['parsing', 'extraction', 'summarization']
        },
        'mistral': {
            'context_window': 32768,
            'speed': 'medium',
            'quality': 'high',
            'use_for': ['summarization', 'analysis']
        },
        'qwen2.5:7b': {
            'context_window': 32768,
            'speed': 'medium',
            'quality': 'high',
            'use_for': ['analysis', 'summarization']
        }
    }

    def __init__(self, model: str = 'phi3', base_url: str = None):
        if requests is None:
            raise ImportError("requests library required: pip install requests")

        self.model = model
        self.base_url = base_url or os.getenv('OLLAMA_URL', self.DEFAULT_URL)
        self.model_config = self.RECOMMENDED_MODELS.get(model, {
            'context_window': 4096,
            'speed': 'medium',
            'quality': 'unknown'
        })

    @property
    def name(self) -> str:
        return f"Ollama ({self.model})"

    @property
    def is_local(self) -> bool:
        return True

    @property
    def cost_per_1k_tokens(self) -> float:
        return 0.0

    @property
    def max_context_tokens(self) -> int:
        return self.model_config.get('context_window', 4096)

    def is_available(self) -> bool:
        """Check if Ollama is running and model exists"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code != 200:
                return False

            models = response.json().get('models', [])
            model_names = [m.get('name', '') for m in models]

            # Check if our model is available
            for name in model_names:
                if name.startswith(self.model) or self.model in name:
                    return True

            return False
        except Exception:
            return False

    def list_models(self) -> List[str]:
        """List available Ollama models"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if response.status_code == 200:
                models = response.json().get('models', [])
                return [m.get('name', '') for m in models]
        except Exception:
            pass
        return []

    def pull_model(self, model: str = None) -> bool:
        """Pull a model from Ollama library"""
        model = model or self.model
        try:
            logger.info(f"Pulling model: {model}")
            response = requests.post(
                f"{self.base_url}/api/pull",
                json={'name': model},
                timeout=600,
                stream=True
            )

            # Stream the download progress
            for line in response.iter_lines():
                if line:
                    data = json.loads(line)
                    status = data.get('status', '')
                    if 'pulling' in status or 'downloading' in status:
                        logger.debug(status)

            return response.status_code == 200
        except Exception as e:
            logger.error(f"Failed to pull model: {e}")
            return False

    def complete(self,
                 prompt: str,
                 max_tokens: int = 500,
                 temperature: float = 0.7,
                 stop: List[str] = None) -> LLMResponse:
        """Generate completion"""
        start_time = time.time()

        payload = {
            'model': self.model,
            'prompt': prompt,
            'stream': False,
            'options': {
                'num_predict': max_tokens,
                'temperature': temperature
            }
        }

        if stop:
            payload['options']['stop'] = stop

        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama error: {e}")
            raise

        latency_ms = int((time.time() - start_time) * 1000)
        tokens = data.get('eval_count', 0) + data.get('prompt_eval_count', 0)

        return LLMResponse(
            content=data.get('response', ''),
            model=self.name,
            tokens_used=tokens,
            cost_usd=0.0,
            latency_ms=latency_ms,
            metadata={
                'eval_count': data.get('eval_count'),
                'prompt_eval_count': data.get('prompt_eval_count')
            }
        )

    def chat(self,
             messages: List[Message],
             max_tokens: int = 500,
             temperature: float = 0.7,
             system: str = None) -> LLMResponse:
        """Generate chat response"""
        start_time = time.time()

        # Format messages for Ollama
        formatted_messages = []

        if system:
            formatted_messages.append({'role': 'system', 'content': system})

        for msg in messages:
            if msg.role == 'system' and not system:
                formatted_messages.append({'role': 'system', 'content': msg.content})
            elif msg.role != 'system':
                formatted_messages.append(msg.to_dict())

        payload = {
            'model': self.model,
            'messages': formatted_messages,
            'stream': False,
            'options': {
                'num_predict': max_tokens,
                'temperature': temperature
            }
        }

        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Ollama chat error: {e}")
            raise

        latency_ms = int((time.time() - start_time) * 1000)
        content = data.get('message', {}).get('content', '')
        tokens = data.get('eval_count', 0) + data.get('prompt_eval_count', 0)

        return LLMResponse(
            content=content,
            model=self.name,
            tokens_used=tokens,
            cost_usd=0.0,
            latency_ms=latency_ms
        )

    def stream_chat(self,
                    messages: List[Message],
                    max_tokens: int = 500,
                    temperature: float = 0.7,
                    system: str = None) -> Generator[str, None, None]:
        """Stream chat response"""
        formatted_messages = []

        if system:
            formatted_messages.append({'role': 'system', 'content': system})

        for msg in messages:
            if msg.role != 'system':
                formatted_messages.append(msg.to_dict())

        payload = {
            'model': self.model,
            'messages': formatted_messages,
            'stream': True,
            'options': {
                'num_predict': max_tokens,
                'temperature': temperature
            }
        }

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            stream=True,
            timeout=60
        )

        for line in response.iter_lines():
            if line:
                try:
                    data = json.loads(line)
                    content = data.get('message', {}).get('content', '')
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue
