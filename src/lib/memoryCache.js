// src/lib/memoryCache.js
// In-memory caching service with TTL support
// Used as fallback when Redis is unavailable

/**
 * Cache entry with expiration
 */
class CacheEntry {
  constructor(value, ttlMs) {
    this.value = value;
    this.expiresAt = Date.now() + ttlMs;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

/**
 * In-memory cache with automatic expiration
 */
class MemoryCache {
  constructor(options = {}) {
    this.store = new Map();
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes default
    this.cleanupInterval = options.cleanupInterval || 60000; // 1 minute

    // Stats
    this.hits = 0;
    this.misses = 0;

    // Periodic cleanup
    this._cleanupTimer = setInterval(() => this._cleanup(), this.cleanupInterval);
    if (this._cleanupTimer && typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
    if (this._cleanupTimer && typeof this._cleanupTimer.unref === 'function') {
      this._cleanupTimer.unref();
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (entry.isExpired()) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds (optional)
   */
  set(key, value, ttlMs = this.defaultTTL) {
    // Evict oldest entries if at capacity
    if (this.store.size >= this.maxSize) {
      this._evictOldest();
    }

    this.store.set(key, new CacheEntry(value, ttlMs));
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern with * wildcard
   */
  deletePattern(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.isExpired()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get or fetch pattern - returns cached value or calls fetchFn
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch value if not cached
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {Promise<*>}
   */
  async getOrFetch(key, fetchFn, ttlMs = this.defaultTTL) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetchFn();
    this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Get multiple values
   * @param {string[]} keys - Array of keys
   * @returns {Object} Map of key -> value (only existing keys)
   */
  mget(keys) {
    const result = {};
    for (const key of keys) {
      const value = this.get(key);
      if (value !== undefined) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Set multiple values
   * @param {Object} entries - Object of key -> value pairs
   * @param {number} ttlMs - TTL in milliseconds
   */
  mset(entries, ttlMs = this.defaultTTL) {
    for (const [key, value] of Object.entries(entries)) {
      this.set(key, value, ttlMs);
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
    };
  }

  /**
   * Clean up expired entries
   */
  _cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Evict oldest entries when at capacity
   */
  _evictOldest() {
    const entriesToRemove = Math.ceil(this.maxSize * 0.1); // Remove 10%
    const keys = Array.from(this.store.keys()).slice(0, entriesToRemove);
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  /**
   * Stop cleanup timer
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }
}

// TTL constants in milliseconds
const TTL = {
  QUOTE: 30 * 1000,           // 30 seconds - frequently changing
  PRICE_HISTORY: 5 * 60 * 1000, // 5 minutes
  FUNDAMENTALS: 60 * 60 * 1000, // 1 hour
  COMPANY_PROFILE: 24 * 60 * 60 * 1000, // 24 hours
  SEARCH: 10 * 60 * 1000,     // 10 minutes
  SCREENING: 5 * 60 * 1000,   // 5 minutes
  METRICS: 15 * 60 * 1000,    // 15 minutes
  INDEX: 60 * 60 * 1000,      // 1 hour
};

module.exports = {
  MemoryCache,
  CacheEntry,
  TTL,
};
