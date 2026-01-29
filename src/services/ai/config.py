# src/services/ai/config.py

import os
from typing import Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class ClaudeConfig:
    """Configuration for Claude API"""
    api_key: str = field(default_factory=lambda: os.getenv('ANTHROPIC_API_KEY', ''))
    default_model: str = 'sonnet'
    max_tokens: int = 2000
    temperature: float = 0.7
    timeout: int = 120

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)


@dataclass
class OllamaConfig:
    """Configuration for Ollama local models"""
    base_url: str = field(default_factory=lambda: os.getenv('OLLAMA_URL', 'http://localhost:11434'))
    default_model: str = 'phi3'
    max_tokens: int = 500
    temperature: float = 0.7
    timeout: int = 60


@dataclass
class RouterConfig:
    """Configuration for model router"""
    prefer_local: bool = field(default_factory=lambda: os.getenv('LLM_PREFER_LOCAL', 'false').lower() == 'true')
    fallback_enabled: bool = True
    cache_responses: bool = True
    cache_ttl_seconds: int = 3600


@dataclass
class BudgetConfig:
    """Budget and cost configuration"""
    daily_budget_usd: float = field(default_factory=lambda: float(os.getenv('LLM_DAILY_BUDGET', '10.0')))
    monthly_budget_usd: float = field(default_factory=lambda: float(os.getenv('LLM_MONTHLY_BUDGET', '100.0')))
    alert_threshold: float = 0.8  # Alert when 80% of budget used
    hard_limit: bool = False  # Whether to block requests when budget exceeded


@dataclass
class AIConfig:
    """Main AI configuration container"""
    claude: ClaudeConfig = field(default_factory=ClaudeConfig)
    ollama: OllamaConfig = field(default_factory=OllamaConfig)
    router: RouterConfig = field(default_factory=RouterConfig)
    budget: BudgetConfig = field(default_factory=BudgetConfig)

    # Logging
    log_level: str = field(default_factory=lambda: os.getenv('LLM_LOG_LEVEL', 'INFO'))
    log_requests: bool = True
    log_responses: bool = False  # Only enable for debugging

    # Performance
    request_timeout: int = 120
    retry_attempts: int = 3
    retry_delay: float = 1.0

    @classmethod
    def from_env(cls) -> 'AIConfig':
        """Create configuration from environment variables"""
        return cls()

    @classmethod
    def from_dict(cls, config: Dict[str, Any]) -> 'AIConfig':
        """Create configuration from dictionary"""
        ai_config = cls()

        if 'claude' in config:
            ai_config.claude = ClaudeConfig(**config['claude'])
        if 'ollama' in config:
            ai_config.ollama = OllamaConfig(**config['ollama'])
        if 'router' in config:
            ai_config.router = RouterConfig(**config['router'])
        if 'budget' in config:
            ai_config.budget = BudgetConfig(**config['budget'])

        for key in ['log_level', 'log_requests', 'log_responses',
                    'request_timeout', 'retry_attempts', 'retry_delay']:
            if key in config:
                setattr(ai_config, key, config[key])

        return ai_config

    def to_dict(self) -> Dict[str, Any]:
        """Export configuration as dictionary"""
        return {
            'claude': {
                'api_key': '***' if self.claude.api_key else '',
                'default_model': self.claude.default_model,
                'max_tokens': self.claude.max_tokens,
                'temperature': self.claude.temperature,
                'timeout': self.claude.timeout
            },
            'ollama': {
                'base_url': self.ollama.base_url,
                'default_model': self.ollama.default_model,
                'max_tokens': self.ollama.max_tokens,
                'temperature': self.ollama.temperature,
                'timeout': self.ollama.timeout
            },
            'router': {
                'prefer_local': self.router.prefer_local,
                'fallback_enabled': self.router.fallback_enabled,
                'cache_responses': self.router.cache_responses,
                'cache_ttl_seconds': self.router.cache_ttl_seconds
            },
            'budget': {
                'daily_budget_usd': self.budget.daily_budget_usd,
                'monthly_budget_usd': self.budget.monthly_budget_usd,
                'alert_threshold': self.budget.alert_threshold,
                'hard_limit': self.budget.hard_limit
            },
            'log_level': self.log_level,
            'log_requests': self.log_requests,
            'request_timeout': self.request_timeout,
            'retry_attempts': self.retry_attempts
        }

    def validate(self) -> Dict[str, Any]:
        """Validate configuration and return status"""
        issues = []
        warnings = []

        # Check Claude configuration
        if not self.claude.is_configured:
            warnings.append("ANTHROPIC_API_KEY not set - Claude will not be available")

        # Check budget settings
        if self.budget.daily_budget_usd <= 0:
            issues.append("Daily budget must be positive")
        if self.budget.monthly_budget_usd <= 0:
            issues.append("Monthly budget must be positive")
        if self.budget.daily_budget_usd * 30 > self.budget.monthly_budget_usd:
            warnings.append("Daily budget allows exceeding monthly budget")

        return {
            'valid': len(issues) == 0,
            'issues': issues,
            'warnings': warnings
        }


# Model pricing information (for reference and calculations)
MODEL_PRICING = {
    'claude-sonnet-4-20250514': {
        'input_per_1m': 3.00,
        'output_per_1m': 15.00,
        'context_window': 200000
    },
    'claude-3-haiku-20240307': {
        'input_per_1m': 0.25,
        'output_per_1m': 1.25,
        'context_window': 200000
    },
    'ollama': {
        'input_per_1m': 0.0,
        'output_per_1m': 0.0,
        'context_window': 'varies'
    }
}

# Task-specific configurations
TASK_CONFIGS = {
    'query_parsing': {
        'max_tokens': 200,
        'temperature': 0.1,
        'prefer_local': True
    },
    'entity_extraction': {
        'max_tokens': 300,
        'temperature': 0.1,
        'prefer_local': True
    },
    'sentiment': {
        'max_tokens': 100,
        'temperature': 0.3,
        'prefer_local': True
    },
    'summarization': {
        'max_tokens': 500,
        'temperature': 0.3,
        'prefer_local': True,
        'cloud_threshold_chars': 3000
    },
    'analysis': {
        'max_tokens': 2000,
        'temperature': 0.7,
        'prefer_local': False
    },
    'report_generation': {
        'max_tokens': 3000,
        'temperature': 0.7,
        'prefer_local': False
    },
    'chat': {
        'max_tokens': 1500,
        'temperature': 0.7,
        'prefer_local': False
    }
}


# Singleton config instance
_config_instance: Optional[AIConfig] = None


def get_config() -> AIConfig:
    """Get or create the AI configuration singleton"""
    global _config_instance
    if _config_instance is None:
        _config_instance = AIConfig.from_env()
    return _config_instance


def set_config(config: AIConfig):
    """Set the AI configuration singleton"""
    global _config_instance
    _config_instance = config
