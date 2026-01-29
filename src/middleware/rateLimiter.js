// src/middleware/rateLimiter.js
// Rate limiting middleware for API protection
// Supports Redis for distributed rate limiting in production

/**
 * Redis-backed rate limiter for distributed environments
 * Falls back to in-memory limiter if Redis is unavailable
 */
class RedisRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.message = options.message || 'Too many requests, please try again later';
    this.statusCode = options.statusCode || 429;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip);
    this.skip = options.skip || (() => false);
    this.onLimitReached = options.onLimitReached || null;
    this.prefix = options.prefix || 'ratelimit:';
    this.fallbackLimiter = options.fallbackLimiter || null; // In-memory fallback

    this.client = null;
    this.connected = false;

    // Try to connect to Redis
    const redisUrl = options.redisUrl || process.env.REDIS_URL;
    if (redisUrl) {
      this._connect(redisUrl);
    }
  }

  _connect(url) {
    try {
      const Redis = require('ioredis');
      this.client = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      this.client.on('ready', () => {
        console.log('[Rate Limiter] Connected to Redis');
        this.connected = true;
      });

      this.client.on('error', (err) => {
        console.error('[Rate Limiter] Redis error:', err.message);
        this.connected = false;
      });

      this.client.on('close', () => {
        this.connected = false;
      });
    } catch (err) {
      console.error('[Rate Limiter] Failed to connect to Redis:', err.message);
      this.connected = false;
    }
  }

  /**
   * Get current count and increment atomically using Redis MULTI
   */
  async _checkAndIncrement(key) {
    if (!this.connected || !this.client) {
      return null; // Signal to fallback
    }

    try {
      const redisKey = this.prefix + key;
      const ttlSeconds = Math.ceil(this.windowMs / 1000);

      // Use Redis pipeline for atomic increment and TTL check
      const results = await this.client
        .multi()
        .incr(redisKey)
        .ttl(redisKey)
        .exec();

      const count = results[0][1];
      const ttl = results[1][1];

      // Set TTL on first request (when count is 1) or if TTL is not set
      if (count === 1 || ttl === -1) {
        await this.client.expire(redisKey, ttlSeconds);
      }

      // Calculate reset time
      const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : this.windowMs);

      return { count, resetTime };
    } catch (err) {
      console.error('[Rate Limiter] Redis error:', err.message);
      return null;
    }
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      // Skip if configured
      if (this.skip(req)) {
        return next();
      }

      const key = this.keyGenerator(req);
      const result = await this._checkAndIncrement(key);

      // If Redis query failed, use in-memory fallback
      // SECURITY: Never fail open - always enforce rate limiting
      if (!result) {
        console.warn('[Rate Limiter] Redis query failed, using in-memory fallback');
        if (this.fallbackLimiter) {
          return this.fallbackLimiter.middleware()(req, res, next);
        }
        // No fallback configured - fail closed (reject request)
        console.error('[Rate Limiter] SECURITY: No fallback configured, rejecting request');
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Rate limiting service temporarily unavailable',
        });
      }

      const { count, resetTime } = result;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (count > this.maxRequests) {
        // Rate limit exceeded
        res.setHeader('Retry-After', Math.ceil((resetTime - Date.now()) / 1000));

        if (this.onLimitReached) {
          this.onLimitReached(req, res, key);
        }

        return res.status(this.statusCode).json({
          error: 'Too Many Requests',
          message: this.message,
          retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
        });
      }

      next();
    };
  }

  /**
   * Check if Redis is connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.client) {
      this.client.quit();
    }
  }
}

/**
 * In-memory rate limiter with bounded storage
 *
 * SECURITY NOTE: For production with multiple servers, use Redis-based limiter.
 * This in-memory implementation is suitable for single-server deployments only.
 *
 * Memory protection features:
 * - Maximum store size limit (prevents unbounded memory growth)
 * - LRU eviction when limit is reached
 * - Periodic cleanup of expired entries
 */
class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
    this.message = options.message || 'Too many requests, please try again later';
    this.statusCode = options.statusCode || 429;
    this.keyGenerator = options.keyGenerator || ((req) => req.ip);
    this.skip = options.skip || (() => false);
    this.onLimitReached = options.onLimitReached || null;

    // Maximum number of unique keys to store (prevents memory leak)
    // 10,000 entries * ~100 bytes each = ~1MB max memory usage
    this.maxStoreSize = options.maxStoreSize || 10000;

    // Store: { key: { count, resetTime, lastAccess } }
    // Using Map for O(1) operations and insertion order for LRU
    this.store = new Map();

    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Clean up expired entries and enforce size limit
   */
  cleanup() {
    const now = Date.now();

    // First pass: remove expired entries
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
      }
    }

    // Second pass: if still over limit, remove oldest entries (LRU eviction)
    if (this.store.size > this.maxStoreSize) {
      const entriesToRemove = this.store.size - this.maxStoreSize;
      let removed = 0;
      for (const key of this.store.keys()) {
        if (removed >= entriesToRemove) break;
        this.store.delete(key);
        removed++;
      }
    }
  }

  /**
   * Get current count for a key
   */
  getCount(key) {
    const entry = this.store.get(key);
    if (!entry || entry.resetTime < Date.now()) {
      return 0;
    }
    return entry.count;
  }

  /**
   * Increment count for a key
   * Enforces size limit to prevent memory leak between cleanup intervals
   */
  increment(key) {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      // New entry - check if we need to make room
      if (!this.store.has(key) && this.store.size >= this.maxStoreSize) {
        // Remove oldest entry (first in Map iteration order)
        const oldestKey = this.store.keys().next().value;
        this.store.delete(oldestKey);
      }

      entry = {
        count: 1,
        resetTime: now + this.windowMs,
        lastAccess: now,
      };
    } else {
      entry.count++;
      entry.lastAccess = now;
      // Re-insert to move to end of Map (most recently used)
      this.store.delete(key);
    }

    this.store.set(key, entry);
    return entry;
  }

  /**
   * Express middleware
   */
  middleware() {
    return async (req, res, next) => {
      // Skip if configured
      if (this.skip(req)) {
        return next();
      }

      const key = this.keyGenerator(req);
      const entry = this.increment(key);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000));

      if (entry.count > this.maxRequests) {
        // Rate limit exceeded
        res.setHeader('Retry-After', Math.ceil((entry.resetTime - Date.now()) / 1000));

        if (this.onLimitReached) {
          this.onLimitReached(req, res, key);
        }

        return res.status(this.statusCode).json({
          error: 'Too Many Requests',
          message: this.message,
          retryAfter: Math.ceil((entry.resetTime - Date.now()) / 1000),
        });
      }

      next();
    };
  }

  /**
   * Stop cleanup interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Create rate limiter middleware
 * Uses Redis in production for distributed rate limiting
 * Falls back to in-memory for development
 */
function createRateLimiter(options = {}) {
  const config = require('../config');

  // Use config defaults if not specified
  const limiterOptions = {
    windowMs: options.windowMs || config.rateLimit?.windowMs || 60000,
    maxRequests: options.maxRequests || config.rateLimit?.maxRequests || 100,
    ...options,
  };

  // Try Redis first if REDIS_URL is available
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      // Create memory limiter as fallback
      const memoryLimiter = new RateLimiter(limiterOptions);

      // Create Redis limiter with fallback configured
      const redisLimiter = new RedisRateLimiter({
        ...limiterOptions,
        redisUrl,
        fallbackLimiter: memoryLimiter, // SECURITY: Fail-closed with in-memory fallback
      });

      // Return wrapper that checks Redis connection status
      return async (req, res, next) => {
        if (redisLimiter.isConnected()) {
          return redisLimiter.middleware()(req, res, next);
        }
        // Redis disconnected - use memory limiter
        console.warn('[Rate Limiter] Redis disconnected, using in-memory limiter');
        return memoryLimiter.middleware()(req, res, next);
      };
    } catch (err) {
      console.warn('[Rate Limiter] Redis initialization failed, using in-memory:', err.message);
    }
  }

  // Fallback to in-memory limiter
  const limiter = new RateLimiter(limiterOptions);
  return limiter.middleware();
}

/**
 * Create stricter limiter for sensitive endpoints (auth, etc.)
 */
function createStrictRateLimiter() {
  return createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 10, // 10 requests per minute
    message: 'Too many authentication attempts, please try again later',
  });
}

/**
 * Create limiter for API-heavy endpoints
 */
function createApiRateLimiter() {
  return createRateLimiter({
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 requests per minute
    message: 'API rate limit exceeded, please slow down',
  });
}

module.exports = {
  RateLimiter,
  RedisRateLimiter,
  createRateLimiter,
  createStrictRateLimiter,
  createApiRateLimiter,
};
