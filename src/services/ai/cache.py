# src/services/ai/cache.py
"""
Response caching for AI services.

Provides in-memory caching with TTL for:
- NL query results
- Analyst responses
- LLM completions

Cache keys are based on query content + context hash.
"""

import hashlib
import logging
import time
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass, field
from functools import wraps
from threading import Lock

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """A single cache entry with metadata."""
    value: Any
    created_at: float
    ttl_seconds: int
    hits: int = 0

    def is_expired(self) -> bool:
        """Check if entry has expired."""
        return time.time() - self.created_at > self.ttl_seconds

    def remaining_ttl(self) -> float:
        """Get remaining TTL in seconds."""
        return max(0, self.ttl_seconds - (time.time() - self.created_at))


class ResponseCache:
    """
    In-memory response cache with TTL and LRU eviction.

    Features:
    - TTL-based expiration
    - Max size limit with LRU eviction
    - Thread-safe operations
    - Hit/miss statistics
    - Automatic cleanup
    """

    DEFAULT_TTL = 3600  # 1 hour default
    MAX_SIZE = 1000     # Maximum cache entries

    def __init__(self, default_ttl: int = None, max_size: int = None):
        """
        Initialize cache.

        Args:
            default_ttl: Default TTL in seconds
            max_size: Maximum number of entries
        """
        self.default_ttl = default_ttl or self.DEFAULT_TTL
        self.max_size = max_size or self.MAX_SIZE
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()
        self._stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'expirations': 0
        }

    def _make_key(self, *args, **kwargs) -> str:
        """Create a cache key from arguments."""
        # Create a string representation of all arguments
        key_parts = [str(arg) for arg in args]
        key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
        key_string = "|".join(key_parts)

        # Hash for consistent key length
        return hashlib.md5(key_string.encode()).hexdigest()

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._stats['misses'] += 1
                return None

            if entry.is_expired():
                del self._cache[key]
                self._stats['expirations'] += 1
                self._stats['misses'] += 1
                return None

            # Update hit count and stats
            entry.hits += 1
            self._stats['hits'] += 1

            return entry.value

    def set(self, key: str, value: Any, ttl: int = None):
        """
        Set a value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: TTL in seconds (uses default if not specified)
        """
        with self._lock:
            # Evict if at max size
            if len(self._cache) >= self.max_size:
                self._evict_lru()

            self._cache[key] = CacheEntry(
                value=value,
                created_at=time.time(),
                ttl_seconds=ttl or self.default_ttl
            )

    def _evict_lru(self):
        """Evict least recently used entry."""
        if not self._cache:
            return

        # Find entry with lowest hits and oldest creation
        oldest_key = min(
            self._cache.keys(),
            key=lambda k: (self._cache[k].hits, -self._cache[k].created_at)
        )

        del self._cache[oldest_key]
        self._stats['evictions'] += 1

    def invalidate(self, key: str):
        """Remove a specific entry."""
        with self._lock:
            self._cache.pop(key, None)

    def invalidate_pattern(self, pattern: str):
        """Remove entries matching a pattern prefix."""
        with self._lock:
            keys_to_remove = [
                k for k in self._cache.keys()
                if k.startswith(pattern)
            ]
            for key in keys_to_remove:
                del self._cache[key]

    def clear(self):
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()

    def cleanup_expired(self):
        """Remove all expired entries."""
        with self._lock:
            expired_keys = [
                k for k, v in self._cache.items()
                if v.is_expired()
            ]
            for key in expired_keys:
                del self._cache[key]
                self._stats['expirations'] += 1

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats['hits'] + self._stats['misses']
            hit_rate = self._stats['hits'] / total_requests if total_requests > 0 else 0

            return {
                **self._stats,
                'size': len(self._cache),
                'max_size': self.max_size,
                'hit_rate': round(hit_rate, 3),
                'total_requests': total_requests
            }


def cached(cache: ResponseCache, ttl: int = None, key_prefix: str = ""):
    """
    Decorator to cache function results.

    Args:
        cache: ResponseCache instance
        ttl: TTL in seconds
        key_prefix: Optional prefix for cache keys

    Usage:
        @cached(my_cache, ttl=300, key_prefix="nl_query")
        async def process_query(query: str, context: dict):
            # expensive operation
            return result
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Build cache key
            key = key_prefix + cache._make_key(*args, **kwargs)

            # Check cache
            cached_value = cache.get(key)
            if cached_value is not None:
                logger.debug(f"Cache hit for {func.__name__}")
                return cached_value

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            cache.set(key, result, ttl)
            logger.debug(f"Cached result for {func.__name__}")

            return result

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Build cache key
            key = key_prefix + cache._make_key(*args, **kwargs)

            # Check cache
            cached_value = cache.get(key)
            if cached_value is not None:
                logger.debug(f"Cache hit for {func.__name__}")
                return cached_value

            # Execute function
            result = func(*args, **kwargs)

            # Cache result
            cache.set(key, result, ttl)
            logger.debug(f"Cached result for {func.__name__}")

            return result

        # Return appropriate wrapper based on function type
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


# Singleton cache instances for different purposes
_nl_query_cache: Optional[ResponseCache] = None
_analyst_cache: Optional[ResponseCache] = None
_llm_cache: Optional[ResponseCache] = None


def get_nl_query_cache() -> ResponseCache:
    """Get or create NL query cache."""
    global _nl_query_cache
    if _nl_query_cache is None:
        _nl_query_cache = ResponseCache(
            default_ttl=1800,  # 30 minutes for queries
            max_size=500
        )
    return _nl_query_cache


def get_analyst_cache() -> ResponseCache:
    """Get or create analyst response cache."""
    global _analyst_cache
    if _analyst_cache is None:
        _analyst_cache = ResponseCache(
            default_ttl=3600,  # 1 hour for analyst responses
            max_size=200
        )
    return _analyst_cache


def get_llm_cache() -> ResponseCache:
    """Get or create LLM completion cache."""
    global _llm_cache
    if _llm_cache is None:
        _llm_cache = ResponseCache(
            default_ttl=7200,  # 2 hours for LLM completions
            max_size=300
        )
    return _llm_cache
