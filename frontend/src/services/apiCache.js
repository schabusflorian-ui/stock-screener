/**
 * API Caching Layer
 *
 * Provides request deduplication, caching, and intelligent cache invalidation.
 * Reduces redundant API calls and improves frontend performance.
 */

// Cache configuration
const CACHE_CONFIG = {
  // Default TTL in milliseconds
  defaultTTL: 5 * 60 * 1000, // 5 minutes

  // Endpoint-specific TTL overrides
  ttlOverrides: {
    // Static data - long cache
    '/screening/options': 30 * 60 * 1000,     // 30 minutes
    '/screening/presets': 30 * 60 * 1000,     // 30 minutes
    '/sectors': 15 * 60 * 1000,               // 15 minutes
    '/indices': 15 * 60 * 1000,               // 15 minutes
    '/classifications': 30 * 60 * 1000,       // 30 minutes
    '/fiscal/stats': 30 * 60 * 1000,          // 30 minutes
    '/dcf/benchmarks': 30 * 60 * 1000,        // 30 minutes

    // Semi-dynamic data - medium cache
    '/companies': 10 * 60 * 1000,             // 10 minutes
    '/stats/dashboard': 10 * 60 * 1000,       // 10 minutes
    '/stats/highlights': 10 * 60 * 1000,      // 10 minutes

    // Dynamic data - short cache
    '/prices': 2 * 60 * 1000,                 // 2 minutes
    '/sentiment/trending': 3 * 60 * 1000,     // 3 minutes
    '/alerts': 2 * 60 * 1000,                 // 2 minutes

    // Real-time data - very short cache
    '/updates/progress': 10 * 1000,           // 10 seconds
    '/updates/status': 30 * 1000,             // 30 seconds
  },

  // Patterns to never cache
  noCachePatterns: [
    /\/refresh$/,
    /\/update$/,
    /\/scan$/,
    /\/check$/,
  ],

  // Max cache entries to prevent memory bloat
  maxEntries: 500
};

// In-memory cache storage
const cache = new Map();

// Pending requests for deduplication
const pendingRequests = new Map();

/**
 * Generate a cache key from request config
 */
function getCacheKey(url, params = {}) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${url}${sortedParams ? '?' + sortedParams : ''}`;
}

/**
 * Determine if a URL should be cached
 */
function shouldCache(url) {
  // Check against no-cache patterns
  return !CACHE_CONFIG.noCachePatterns.some(pattern => pattern.test(url));
}

/**
 * Get TTL for a specific endpoint
 */
function getTTL(url) {
  // Check for exact matches
  for (const [pattern, ttl] of Object.entries(CACHE_CONFIG.ttlOverrides)) {
    if (url.startsWith(pattern)) {
      return ttl;
    }
  }
  return CACHE_CONFIG.defaultTTL;
}

/**
 * Check if cache entry is valid
 */
function isValid(entry) {
  if (!entry) return false;
  return Date.now() < entry.expiry;
}

/**
 * Evict oldest entries if cache is too large
 */
function evictIfNeeded() {
  if (cache.size <= CACHE_CONFIG.maxEntries) return;

  // Get entries sorted by access time
  const entries = Array.from(cache.entries())
    .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

  // Remove oldest 20% of entries
  const toRemove = Math.floor(cache.size * 0.2);
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0]);
  }
}

/**
 * Get cached response
 */
function get(key) {
  const entry = cache.get(key);
  if (isValid(entry)) {
    entry.lastAccess = Date.now();
    entry.hits++;
    return entry.data;
  }
  // Remove expired entry
  if (entry) {
    cache.delete(key);
  }
  return null;
}

/**
 * Set cache entry
 */
function set(key, data, url) {
  evictIfNeeded();

  cache.set(key, {
    data,
    expiry: Date.now() + getTTL(url),
    lastAccess: Date.now(),
    hits: 0,
    createdAt: Date.now()
  });
}

/**
 * Invalidate cache entries matching a pattern
 */
function invalidate(pattern) {
  if (typeof pattern === 'string') {
    // Exact match or prefix match
    for (const key of cache.keys()) {
      if (key.startsWith(pattern)) {
        cache.delete(key);
      }
    }
  } else if (pattern instanceof RegExp) {
    // Regex match
    for (const key of cache.keys()) {
      if (pattern.test(key)) {
        cache.delete(key);
      }
    }
  }
}

/**
 * Clear all cache entries
 */
function clear() {
  cache.clear();
  pendingRequests.clear();
}

/**
 * Wrap an API call with caching and deduplication
 */
function withCache(apiCall, url, params = {}) {
  const key = getCacheKey(url, params);

  // Check cache first
  const cached = get(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  // Check for pending request (deduplication)
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  // Make the API call
  const promise = apiCall()
    .then(response => {
      // Cache the response if appropriate
      if (shouldCache(url)) {
        set(key, response, url);
      }
      pendingRequests.delete(key);
      return response;
    })
    .catch(error => {
      pendingRequests.delete(key);
      throw error;
    });

  // Store pending request for deduplication
  pendingRequests.set(key, promise);

  return promise;
}

/**
 * Get cache statistics
 */
function getStats() {
  let totalHits = 0;
  let totalEntries = 0;
  let expiredEntries = 0;
  const now = Date.now();

  for (const entry of cache.values()) {
    totalEntries++;
    totalHits += entry.hits;
    if (now >= entry.expiry) {
      expiredEntries++;
    }
  }

  return {
    totalEntries,
    expiredEntries,
    activeEntries: totalEntries - expiredEntries,
    totalHits,
    pendingRequests: pendingRequests.size,
    maxEntries: CACHE_CONFIG.maxEntries
  };
}

/**
 * Preload cache for common data
 */
async function preload(apiCalls) {
  const results = await Promise.allSettled(apiCalls);
  return results.filter(r => r.status === 'fulfilled').length;
}

// Export as singleton
const apiCache = {
  get,
  set,
  invalidate,
  clear,
  withCache,
  getStats,
  preload,
  getCacheKey,
  shouldCache,
  getTTL,

  // Expose config for testing/debugging
  config: CACHE_CONFIG
};

export default apiCache;
