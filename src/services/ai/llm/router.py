# src/services/ai/llm/router.py

import logging
from typing import List, Optional, Dict
from .base import BaseLLM, LLMResponse, Message, TaskType
from .claude_client import ClaudeClient
from .ollama_client import OllamaClient

logger = logging.getLogger(__name__)


class ModelRouter:
    """
    Smart routing between local and cloud models.

    Strategy:
    - Use local (Ollama) for simple, fast tasks → FREE
    - Use Claude for complex reasoning → PAID but smart
    - Fall back gracefully if a model is unavailable

    Cost optimization:
    - Query parsing: Ollama (free)
    - Entity extraction: Ollama (free)
    - Summarization: Ollama for short, Claude for long
    - Full analysis: Claude (needs quality)
    - Report generation: Claude (needs quality)
    """

    # Task routing configuration
    TASK_ROUTING = {
        TaskType.QUERY_PARSING: {
            'prefer': 'local',
            'local_model': 'phi3',
            'max_tokens': 200
        },
        TaskType.ENTITY_EXTRACTION: {
            'prefer': 'local',
            'local_model': 'phi3',
            'max_tokens': 300
        },
        TaskType.SENTIMENT: {
            'prefer': 'local',
            'local_model': 'phi3',
            'max_tokens': 100
        },
        TaskType.SUMMARIZATION: {
            'prefer': 'local',  # For short content
            'local_model': 'llama3.2:3b',
            'cloud_threshold': 3000,  # Use Claude if input > 3000 chars
            'max_tokens': 500
        },
        TaskType.ANALYSIS: {
            'prefer': 'cloud',
            'cloud_model': 'sonnet',
            'max_tokens': 2000
        },
        TaskType.REPORT_GENERATION: {
            'prefer': 'cloud',
            'cloud_model': 'sonnet',
            'max_tokens': 3000
        },
        TaskType.CHAT: {
            'prefer': 'cloud',
            'cloud_model': 'sonnet',
            'fallback_local': 'mistral',
            'max_tokens': 1500
        }
    }

    def __init__(self,
                 claude_api_key: str = None,
                 ollama_url: str = None,
                 prefer_local: bool = False):
        """
        Initialize router with available models.

        Args:
            claude_api_key: Anthropic API key
            ollama_url: Ollama server URL
            prefer_local: Always try local first (saves money)
        """
        self.prefer_local = prefer_local
        self._models: Dict[str, BaseLLM] = {}
        self._availability: Dict[str, bool] = {}

        # Initialize Claude (haiku is widely available on all tiers)
        try:
            self._models['claude_sonnet'] = ClaudeClient('haiku', claude_api_key)  # Use haiku as primary
            self._models['claude_haiku'] = ClaudeClient('haiku', claude_api_key)
        except Exception as e:
            logger.warning(f"Claude not available: {e}")

        # Initialize Ollama models
        for model in ['phi3', 'llama3.2:3b', 'mistral']:
            try:
                client = OllamaClient(model, ollama_url)
                self._models[f'ollama_{model}'] = client
            except Exception as e:
                logger.debug(f"Ollama {model} not available: {e}")

        # Check availability
        self._check_availability()

    def _check_availability(self):
        """Check which models are available"""
        for name, model in self._models.items():
            try:
                self._availability[name] = model.is_available()
                if self._availability[name]:
                    logger.info(f"Model available: {name}")
                else:
                    logger.warning(f"Model not available: {name}")
            except Exception:
                self._availability[name] = False

    def refresh_availability(self):
        """Refresh model availability status"""
        self._check_availability()

    def get_model(self, task: TaskType, input_length: int = 0) -> Optional[BaseLLM]:
        """
        Get the best model for a task.

        Args:
            task: Type of task
            input_length: Length of input (for routing decisions)

        Returns:
            Best available LLM for the task
        """
        config = self.TASK_ROUTING.get(task, self.TASK_ROUTING[TaskType.CHAT])

        # Determine preference
        prefer = 'local' if self.prefer_local else config['prefer']

        # Check cloud threshold for summarization
        if task == TaskType.SUMMARIZATION:
            if input_length > config.get('cloud_threshold', 3000):
                prefer = 'cloud'

        # Try to get preferred model
        if prefer == 'local':
            local_model = config.get('local_model', 'phi3')
            model_key = f'ollama_{local_model}'

            if self._availability.get(model_key):
                return self._models[model_key]

            # Try any available Ollama model
            for key, available in self._availability.items():
                if key.startswith('ollama_') and available:
                    return self._models[key]

            # Fall back to Claude
            if self._availability.get('claude_sonnet'):
                return self._models['claude_sonnet']

        else:  # prefer cloud
            cloud_model = config.get('cloud_model', 'sonnet')
            model_key = f'claude_{cloud_model}'

            if self._availability.get(model_key):
                return self._models[model_key]

            # Try other Claude model
            if self._availability.get('claude_haiku'):
                return self._models['claude_haiku']

            # Fall back to local
            fallback = config.get('fallback_local', 'mistral')
            if self._availability.get(f'ollama_{fallback}'):
                return self._models[f'ollama_{fallback}']

            for key, available in self._availability.items():
                if key.startswith('ollama_') and available:
                    return self._models[key]

        raise RuntimeError("No LLM models available")

    def route(self,
              task: TaskType,
              prompt: str = None,
              messages: List[Message] = None,
              system: str = None,
              temperature: float = 0.7,
              max_tokens: int = None) -> LLMResponse:
        """
        Route a request to the best model.

        Args:
            task: Type of task
            prompt: For completion tasks
            messages: For chat tasks
            system: System prompt
            temperature: Generation temperature
            max_tokens: Override default max tokens for this request

        Returns:
            LLMResponse from the selected model
        """
        input_length = len(prompt) if prompt else sum(len(m.content) for m in (messages or []))
        config = self.TASK_ROUTING.get(task, self.TASK_ROUTING[TaskType.CHAT])
        max_tokens = max_tokens or config.get('max_tokens', 1000)

        model = self.get_model(task, input_length)
        logger.info(f"Routing {task.value} to {model.name}")

        if messages:
            return model.chat(messages, max_tokens, temperature, system)
        elif prompt:
            return model.complete(prompt, max_tokens, temperature)
        else:
            raise ValueError("Must provide either prompt or messages")

    def parse_query(self, query: str) -> LLMResponse:
        """Parse user query into intent and entities"""
        prompt = f"""Parse this investment query. Return JSON only.

Query: "{query}"

Return this exact JSON format:
{{
    "intent": "analyze|compare|screen|lookup|explain|chat",
    "symbols": ["AAPL", "MSFT"],
    "metrics": ["pe_ratio", "revenue_growth"],
    "topics": ["valuation", "growth"],
    "time_period": "current|historical|forward"
}}

JSON only, no explanation:"""

        return self.route(TaskType.QUERY_PARSING, prompt=prompt, temperature=0.1)

    def extract_entities(self, text: str) -> LLMResponse:
        """Extract financial entities from text"""
        prompt = f"""Extract financial entities from this text. Return JSON only.

Text: "{text}"

Return:
{{
    "companies": ["company names mentioned"],
    "tickers": ["AAPL", "MSFT"],
    "metrics": ["P/E", "revenue"],
    "amounts": ["$100M", "15%"],
    "dates": ["Q3 2024", "2025"]
}}

JSON:"""

        return self.route(TaskType.ENTITY_EXTRACTION, prompt=prompt, temperature=0.1)

    def summarize(self, text: str, max_length: int = 500) -> LLMResponse:
        """Summarize text content"""
        prompt = f"""Summarize this financial content in {max_length} characters or less.
Focus on key metrics, insights, and actionable information.

Content:
{text}

Summary:"""

        return self.route(TaskType.SUMMARIZATION, prompt=prompt, temperature=0.3)

    def analyze(self,
                system_prompt: str,
                data_context: str,
                user_query: str,
                history: List[Message] = None) -> LLMResponse:
        """
        Run full investment analysis.

        This always uses Claude for quality.
        """
        messages = history.copy() if history else []

        full_query = f"""## CURRENT DATA
{data_context}

## USER QUESTION
{user_query}

Analyze the data above and provide your investment perspective."""

        messages.append(Message(role='user', content=full_query))

        return self.route(
            TaskType.ANALYSIS,
            messages=messages,
            system=system_prompt,
            temperature=0.7
        )

    def get_stats(self) -> Dict:
        """Get router statistics"""
        return {
            'models': {
                name: {
                    'available': self._availability.get(name, False),
                    'is_local': model.is_local,
                    'cost_per_1k': model.cost_per_1k_tokens
                }
                for name, model in self._models.items()
            },
            'prefer_local': self.prefer_local
        }

    def get_available_models(self) -> List[str]:
        """Get list of available model names"""
        return [name for name, available in self._availability.items() if available]

    def has_cloud_model(self) -> bool:
        """Check if any cloud model is available"""
        return any(
            available and name.startswith('claude_')
            for name, available in self._availability.items()
        )

    def has_local_model(self) -> bool:
        """Check if any local model is available"""
        return any(
            available and name.startswith('ollama_')
            for name, available in self._availability.items()
        )
