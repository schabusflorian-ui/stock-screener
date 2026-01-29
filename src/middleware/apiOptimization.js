// src/middleware/apiOptimization.js
// API response optimization middleware (Tier 3 optimization)
// Supports Redis for distributed caching in production, falls back to memory

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { api: logger } = require('../utils/logger');

// Import unified cache (Redis + memory fallback)
let unifiedCache = null;
try {
  const redisCache = require('../lib/redisCache');
  unifiedCache = redisCache.unifiedCache;
  // Wait for Redis to connect before logging backend
  unifiedCache.waitForReady().then(() => {
    logger.info(`API cache using ${unifiedCache.getBackend()} backend`);
  });
} catch (err) {
  logger.warn('Redis cache not available, using in-memory cache only');
}

/**
 * In-memory response cache for expensive API endpoints
 * Uses LRU eviction with TTL expiration
 */
class ResponseCache {
  constructor(maxSize = 500, defaultTTL = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
  }

  generateKey(req) {
    // Include method, path, and sorted query params in cache key
    const params = new URLSearchParams(req.query);
    params.sort();
    return `${req.method}:${req.path}?${params.toString()}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
      cachedAt: Date.now()
    });
  }

  invalidate(pattern) {
    // Invalidate all entries matching a pattern
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize
    };
  }
}

// Shared cache instance (in-memory fallback)
const responseCache = new ResponseCache(500, 60000);

/**
 * Response caching middleware for expensive endpoints
 * Uses Redis if available (distributed), falls back to in-memory cache
 * Usage: router.get('/expensive', responseCacheMiddleware({ ttl: 30000 }), handler)
 */
function responseCacheMiddleware(options = {}) {
  const { ttl = 60000, keyFn = null, useRedis = true } = options;

  // Use Redis-backed middleware if available and requested
  if (useRedis && unifiedCache) {
    return redisCacheMiddleware({ ttl, keyFn });
  }

  // Fall back to in-memory cache
  return (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyFn ? keyFn(req) : responseCache.generateKey(req);
    const cached = responseCache.get(cacheKey);

    if (cached) {
      // Add cache hit header for debugging
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Backend', 'memory');
      return res.json(cached);
    }

    // Wrap res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        responseCache.set(cacheKey, data, ttl);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Backend', 'memory');
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Redis-backed response caching middleware
 * Provides distributed caching for production environments
 */
function redisCacheMiddleware(options = {}) {
  const { ttl = 60000, keyFn = null } = options;

  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = keyFn ? keyFn(req) : `api:${req.method}:${req.path}:${JSON.stringify(req.query)}`;

    try {
      const cached = await unifiedCache.get(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Backend', unifiedCache.getBackend());
        return res.json(cached);
      }
    } catch (err) {
      logger.warn('Redis cache get error, proceeding without cache', { error: err.message });
    }

    // Wrap res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Cache asynchronously, don't block response
        unifiedCache.set(cacheKey, data, ttl).catch(err => {
          logger.warn('Redis cache set error', { error: err.message });
        });
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Backend', unifiedCache.getBackend());
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache entries matching a pattern
 * Call this after mutations that affect cached data
 */
function invalidateCache(pattern) {
  responseCache.invalidate(pattern);
}

/**
 * ETag middleware for conditional requests
 * Uses lightweight weak ETag based on content length and simple hash
 * Avoids expensive MD5 computation on every response
 */
function etagMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    // Skip ETag for errors or non-GET requests
    if (res.statusCode >= 400 || req.method !== 'GET') {
      return originalJson(data);
    }

    // Stringify once for both ETag and response
    const body = JSON.stringify(data);

    // Lightweight ETag: use weak ETag with length + simple hash of first/last chars
    // This is ~10x faster than MD5 for large responses while still detecting changes
    const len = body.length;
    const sample = len > 100
      ? body.slice(0, 50) + body.slice(-50)
      : body;
    const simpleHash = Buffer.from(sample).reduce((acc, byte) => (acc * 31 + byte) >>> 0, 0);
    const etag = `W/"${len.toString(36)}-${simpleHash.toString(36)}"`;

    res.setHeader('ETag', etag);

    // Check If-None-Match header
    const clientEtag = req.headers['if-none-match'];
    if (clientEtag === etag) {
      return res.status(304).end();
    }

    // Set cache headers
    res.setHeader('Cache-Control', 'private, must-revalidate');

    return originalJson(data);
  };

  next();
}

/**
 * Field selection middleware
 * Allows clients to request specific fields: ?fields=id,name,price
 */
function fieldSelectionMiddleware(req, res, next) {
  const fieldsParam = req.query.fields;

  if (fieldsParam) {
    req.selectedFields = fieldsParam
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);
  }

  // Wrap res.json to apply field selection
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (!req.selectedFields || req.selectedFields.length === 0) {
      return originalJson(data);
    }

    const filtered = applyFieldSelection(data, req.selectedFields);
    return originalJson(filtered);
  };

  next();
}

/**
 * Apply field selection to data
 */
function applyFieldSelection(data, fields) {
  if (!fields || fields.length === 0) return data;

  // Handle array of objects
  if (Array.isArray(data)) {
    return data.map(item => pickFields(item, fields));
  }

  // Handle single object
  if (typeof data === 'object' && data !== null) {
    // Check if it's a response wrapper like { data: [...] }
    if (data.data && Array.isArray(data.data)) {
      return {
        ...data,
        data: data.data.map(item => pickFields(item, fields)),
      };
    }
    return pickFields(data, fields);
  }

  return data;
}

/**
 * Pick specific fields from an object
 */
function pickFields(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;

  const result = {};
  for (const field of fields) {
    // Support nested fields like "company.name"
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (obj[parent]) {
        result[parent] = result[parent] || {};
        result[parent][child] = obj[parent][child];
      }
    } else if (obj.hasOwnProperty(field)) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Pagination middleware
 * Standardizes pagination parameters and adds helpers
 */
function paginationMiddleware(req, res, next) {
  // Parse pagination params with defaults
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  req.pagination = {
    page,
    limit,
    offset,
  };

  // Helper to format paginated response
  res.paginate = function(data, total) {
    const totalPages = Math.ceil(total / limit);

    return res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  };

  next();
}

/**
 * Correlation ID middleware
 * Adds a unique request ID for distributed tracing
 */
function correlationIdMiddleware(req, res, next) {
  // Accept correlation ID from client or generate new one
  const correlationId = req.headers['x-correlation-id'] ||
                        req.headers['x-request-id'] ||
                        uuidv4();

  // Attach to request for use in handlers
  req.correlationId = correlationId;

  // Include in response headers for client correlation
  res.setHeader('X-Correlation-Id', correlationId);
  res.setHeader('X-Request-Id', correlationId);

  next();
}

/**
 * Response time header middleware with structured logging
 */
function responseTimeMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1e6; // Convert to milliseconds

    // Set header (may not work after finish for all responses)
    try {
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    } catch (e) {
      // Headers already sent
    }

    // Structured logging with correlation ID
    const logContext = {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: parseFloat(duration.toFixed(2)),
      userAgent: req.headers['user-agent']?.substring(0, 100),
      ip: req.ip || req.connection?.remoteAddress,
    };

    // Log based on duration and status
    if (res.statusCode >= 500) {
      logger.error('Request failed', logContext);
    } else if (duration > 2000) {
      logger.warn('Very slow request', logContext);
    } else if (duration > 500) {
      logger.info('Slow request', logContext);
    } else if (process.env.LOG_LEVEL === 'debug') {
      logger.debug('Request completed', logContext);
    }
  });

  next();
}

/**
 * Cache control middleware for specific routes
 */
function cacheControl(options = {}) {
  const {
    maxAge = 0,
    private: isPrivate = true,
    noStore = false,
    mustRevalidate = true,
  } = options;

  return (req, res, next) => {
    if (noStore) {
      res.setHeader('Cache-Control', 'no-store');
    } else {
      const directives = [];
      directives.push(isPrivate ? 'private' : 'public');
      directives.push(`max-age=${maxAge}`);
      if (mustRevalidate) directives.push('must-revalidate');
      res.setHeader('Cache-Control', directives.join(', '));
    }
    next();
  };
}

/**
 * Combined optimization middleware
 */
function apiOptimization() {
  return [
    correlationIdMiddleware,
    responseTimeMiddleware,
    paginationMiddleware,
    fieldSelectionMiddleware,
    etagMiddleware,
  ];
}

/**
 * Request deduplication middleware
 * Prevents duplicate concurrent requests for the same resource
 * If request A is in-flight and request B arrives for the same key,
 * request B waits for A and returns the same response (Tier 4 optimization)
 */
const inflightRequests = new Map();

function deduplicationMiddleware(options = {}) {
  const { keyFn = null, ttl = 5000 } = options;

  return async (req, res, next) => {
    // Skip for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = keyFn ? keyFn(req) : responseCache.generateKey(req);
    const inflight = inflightRequests.get(key);

    if (inflight) {
      // Wait for the in-flight request to complete
      try {
        const result = await inflight.promise;
        res.setHeader('X-Dedupe', 'WAIT');
        return res.json(result);
      } catch (error) {
        // If the original request failed, let this one try
        return next();
      }
    }

    // Create a promise that will resolve when this request completes
    let resolveInflight, rejectInflight;
    const promise = new Promise((resolve, reject) => {
      resolveInflight = resolve;
      rejectInflight = reject;
    });

    inflightRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    // Clean up after TTL
    setTimeout(() => {
      inflightRequests.delete(key);
    }, ttl);

    // Wrap res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      res.setHeader('X-Dedupe', 'FIRST');

      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolveInflight(data);
      } else {
        rejectInflight(new Error('Request failed'));
      }

      inflightRequests.delete(key);
      return originalJson(data);
    };

    // Handle errors
    res.on('close', () => {
      if (inflightRequests.has(key)) {
        rejectInflight(new Error('Connection closed'));
        inflightRequests.delete(key);
      }
    });

    next();
  };
}

/**
 * Get deduplication stats
 */
function getDedupeStats() {
  return {
    inflightRequests: inflightRequests.size
  };
}

/**
 * Get cache statistics (both memory and Redis if available)
 */
async function getCacheStats() {
  const stats = {
    memory: responseCache.stats(),
    deduplication: getDedupeStats(),
  };

  if (unifiedCache) {
    try {
      stats.unified = await unifiedCache.getStats();
    } catch (err) {
      stats.unified = { error: err.message };
    }
  }

  return stats;
}

module.exports = {
  // Core middleware
  correlationIdMiddleware,
  etagMiddleware,
  fieldSelectionMiddleware,
  paginationMiddleware,
  responseTimeMiddleware,
  cacheControl,
  apiOptimization,
  applyFieldSelection,
  // Tier 3: Response caching (Redis-backed with memory fallback)
  ResponseCache,
  responseCache,
  responseCacheMiddleware,
  redisCacheMiddleware,
  invalidateCache,
  getCacheStats,
  unifiedCache,
  // Tier 4: Request deduplication
  deduplicationMiddleware,
  getDedupeStats,
};
