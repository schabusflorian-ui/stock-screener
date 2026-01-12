// src/middleware/rateLimiter.js
// Rate limiting middleware for API protection

/**
 * Simple in-memory rate limiter
 * For production with multiple servers, use Redis-based limiter
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

    // Store: { key: { count, resetTime } }
    this.store = new Map();

    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
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
   */
  increment(key) {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      entry = {
        count: 1,
        resetTime: now + this.windowMs,
      };
    } else {
      entry.count++;
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
 */
function createRateLimiter(options = {}) {
  const config = require('../config');

  // Use config defaults if not specified
  const limiterOptions = {
    windowMs: options.windowMs || config.rateLimit?.windowMs || 60000,
    maxRequests: options.maxRequests || config.rateLimit?.maxRequests || 100,
    ...options,
  };

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
  createRateLimiter,
  createStrictRateLimiter,
  createApiRateLimiter,
};
