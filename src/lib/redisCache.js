// src/lib/redisCache.js
// Redis caching service for production - provides distributed caching with TTL support
// Falls back to memory cache if Redis is unavailable

const Redis = require('ioredis');
const { MemoryCache, TTL } = require('./memoryCache');

/**
 * Redis Cache with same interface as MemoryCache
 * Provides distributed caching for production environments
 */
class RedisCache {
  constructor(options = {}) {
    this.prefix = options.prefix || 'cache:';
    this.defaultTTL = options.defaultTTL || 300000; // 5 minutes in ms
    this.connected = false;
    this.client = null;

    // Stats tracking
    this.hits = 0;
    this.misses = 0;

    // Try to connect to Redis
    const redisUrl = options.url || process.env.REDIS_URL;
    if (redisUrl) {
      this._connect(redisUrl, options);
    }
  }

  /**
   * Connect to Redis
   */
  _connect(url, options = {}) {
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 100,
        enableReadyCheck: true,
        lazyConnect: false,
        connectTimeout: 5000,
        ...options.redisOptions
      });

      // Create a promise that resolves when connected
      this.readyPromise = new Promise((resolve) => {
        this.client.on('ready', () => {
          console.log('[Redis Cache] Connected and ready');
          this.connected = true;
          resolve(true);
        });

        // Resolve after timeout if not connected (fall back to memory)
        setTimeout(() => {
          if (!this.connected) {
            console.log('[Redis Cache] Connection timeout, falling back to memory cache');
            resolve(false);
          }
        }, 3000);
      });

      this.client.on('error', (err) => {
        console.error('[Redis Cache] Connection error:', err.message);
        this.connected = false;
      });

      this.client.on('close', () => {
        console.log('[Redis Cache] Connection closed');
        this.connected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('[Redis Cache] Reconnecting...');
      });

    } catch (err) {
      console.error('[Redis Cache] Failed to initialize:', err.message);
      this.connected = false;
      this.readyPromise = Promise.resolve(false);
    }
  }

  /**
   * Wait for Redis to be ready
   */
  async waitForReady() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    return false;
  }

  /**
   * Build prefixed key
   */
  _key(key) {
    return this.prefix + key;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} Cached value or undefined
   */
  async get(key) {
    if (!this.connected || !this.client) {
      this.misses++;
      return undefined;
    }

    try {
      const data = await this.client.get(this._key(key));

      if (!data) {
        this.misses++;
        return undefined;
      }

      this.hits++;
      return JSON.parse(data);
    } catch (err) {
      console.error('[Redis Cache] Get error:', err.message);
      this.misses++;
      return undefined;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  async set(key, value, ttlMs = this.defaultTTL) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await this.client.setex(this._key(key), ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[Redis Cache] Set error:', err.message);
      return false;
    }
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async delete(key) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      await this.client.del(this._key(key));
      return true;
    } catch (err) {
      console.error('[Redis Cache] Delete error:', err.message);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   * @param {string} pattern - Pattern with * wildcard
   */
  async deletePattern(pattern) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const keys = await this.client.keys(this._key(pattern));
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (err) {
      console.error('[Redis Cache] DeletePattern error:', err.message);
      return false;
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const exists = await this.client.exists(this._key(key));
      return exists === 1;
    } catch (err) {
      console.error('[Redis Cache] Has error:', err.message);
      return false;
    }
  }

  /**
   * Get or fetch pattern - returns cached value or calls fetchFn
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Async function to fetch value if not cached
   * @param {number} ttlMs - TTL in milliseconds
   * @returns {Promise<*>}
   */
  async getOrFetch(key, fetchFn, ttlMs = this.defaultTTL) {
    const cached = await this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await fetchFn();
    await this.set(key, value, ttlMs);
    return value;
  }

  /**
   * Get multiple values
   * @param {string[]} keys - Array of keys
   * @returns {Promise<Object>} Map of key -> value
   */
  async mget(keys) {
    if (!this.connected || !this.client || keys.length === 0) {
      return {};
    }

    try {
      const prefixedKeys = keys.map(k => this._key(k));
      const values = await this.client.mget(...prefixedKeys);

      const result = {};
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            result[key] = JSON.parse(values[index]);
            this.hits++;
          } catch (e) {
            this.misses++;
          }
        } else {
          this.misses++;
        }
      });
      return result;
    } catch (err) {
      console.error('[Redis Cache] Mget error:', err.message);
      return {};
    }
  }

  /**
   * Set multiple values
   * @param {Object} entries - Object of key -> value pairs
   * @param {number} ttlMs - TTL in milliseconds
   */
  async mset(entries, ttlMs = this.defaultTTL) {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const pipeline = this.client.pipeline();
      const ttlSeconds = Math.ceil(ttlMs / 1000);

      for (const [key, value] of Object.entries(entries)) {
        pipeline.setex(this._key(key), ttlSeconds, JSON.stringify(value));
      }

      await pipeline.exec();
      return true;
    } catch (err) {
      console.error('[Redis Cache] Mset error:', err.message);
      return false;
    }
  }

  /**
   * Clear all cache entries with this prefix
   */
  async clear() {
    if (!this.connected || !this.client) {
      return false;
    }

    try {
      const keys = await this.client.keys(this._key('*'));
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      this.hits = 0;
      this.misses = 0;
      return true;
    } catch (err) {
      console.error('[Redis Cache] Clear error:', err.message);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    const total = this.hits + this.misses;
    const stats = {
      connected: this.connected,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
    };

    if (this.connected && this.client) {
      try {
        const info = await this.client.info('memory');
        const usedMemory = info.match(/used_memory_human:(\S+)/);
        if (usedMemory) {
          stats.usedMemory = usedMemory[1];
        }

        const keys = await this.client.keys(this._key('*'));
        stats.size = keys.length;
      } catch (err) {
        // Ignore stats errors
      }
    }

    return stats;
  }

  /**
   * Check if Redis is connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Disconnect from Redis
   */
  async destroy() {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }
}

/**
 * Unified Cache - uses Redis if available, falls back to Memory
 * Provides a single interface regardless of backend
 */
class UnifiedCache {
  constructor(options = {}) {
    this.redisCache = null;
    this.memoryCache = new MemoryCache({
      maxSize: options.maxSize || 2000,
      defaultTTL: options.defaultTTL || 300000,
    });

    // Try to initialize Redis if URL is provided
    const redisUrl = options.redisUrl || process.env.REDIS_URL;
    if (redisUrl) {
      this.redisCache = new RedisCache({
        url: redisUrl,
        prefix: options.prefix || 'app:cache:',
        defaultTTL: options.defaultTTL || 300000,
      });
    }
  }

  /**
   * Get the active cache (Redis if connected, else Memory)
   */
  _getCache() {
    if (this.redisCache && this.redisCache.isConnected()) {
      return this.redisCache;
    }
    return this.memoryCache;
  }

  /**
   * Check which cache backend is in use
   */
  getBackend() {
    if (this.redisCache && this.redisCache.isConnected()) {
      return 'redis';
    }
    return 'memory';
  }

  // Proxy all cache methods to the active cache
  async get(key) {
    const cache = this._getCache();
    return cache.get(key);
  }

  async set(key, value, ttlMs) {
    const cache = this._getCache();
    return cache.set(key, value, ttlMs);
  }

  async delete(key) {
    const cache = this._getCache();
    return cache.delete(key);
  }

  async deletePattern(pattern) {
    const cache = this._getCache();
    return cache.deletePattern(pattern);
  }

  async has(key) {
    const cache = this._getCache();
    return cache.has(key);
  }

  async getOrFetch(key, fetchFn, ttlMs) {
    const cache = this._getCache();
    return cache.getOrFetch(key, fetchFn, ttlMs);
  }

  async mget(keys) {
    const cache = this._getCache();
    return cache.mget(keys);
  }

  async mset(entries, ttlMs) {
    const cache = this._getCache();
    return cache.mset(entries, ttlMs);
  }

  async clear() {
    const cache = this._getCache();
    return cache.clear();
  }

  async getStats() {
    const cache = this._getCache();
    const stats = await cache.getStats();
    return {
      ...stats,
      backend: this.getBackend(),
    };
  }

  async destroy() {
    if (this.redisCache) {
      await this.redisCache.destroy();
    }
    this.memoryCache.destroy();
  }

  /**
   * Wait for cache to be ready (Redis connection)
   */
  async waitForReady() {
    if (this.redisCache) {
      return this.redisCache.waitForReady();
    }
    return true; // Memory cache is always ready
  }
}

// Create singleton unified cache
const unifiedCache = new UnifiedCache({
  prefix: 'prism:',
  defaultTTL: TTL.METRICS,
});

// Graceful shutdown
process.on('SIGTERM', () => unifiedCache.destroy());
process.on('SIGINT', () => unifiedCache.destroy());

module.exports = {
  RedisCache,
  UnifiedCache,
  unifiedCache,
  TTL,
};
