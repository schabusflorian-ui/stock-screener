// src/lib/requestDeduplicator.js
/**
 * Request Deduplication System (Phase 3.4)
 *
 * Eliminates duplicate API calls by coalescing concurrent identical requests.
 *
 * Key Safety Features:
 * - Only deduplicates requests with IDENTICAL parameters
 * - Uses JSON stringification for exact parameter matching
 * - Each unique parameter set gets its own coalescer
 * - Preserves all unique requests (no data loss)
 *
 * Example:
 * - 100 concurrent requests for getQuote('AAPL') → 1 API call
 * - getQuote('AAPL') + getQuote('MSFT') → 2 API calls (different symbols)
 * - getQuote('AAPL', {detailed: true}) + getQuote('AAPL') → 2 API calls (different params)
 */

/**
 * Request Deduplicator - Prevents duplicate concurrent API calls
 *
 * Uses a map of in-flight requests to share results among concurrent callers.
 * Automatically cleans up completed requests.
 */
class RequestDeduplicator {
  constructor(name = 'RequestDeduplicator') {
    this.name = name;
    this.inFlight = new Map(); // request key → Promise
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      uniqueRequests: 0
    };
  }

  /**
   * Execute a request, deduplicating if an identical request is in-flight
   *
   * @param {string} key - Unique key for this request (usually JSON.stringify(params))
   * @param {Function} requestFn - Async function that makes the actual API call
   * @returns {Promise<*>} - Result of the request
   */
  async execute(key, requestFn) {
    this.stats.totalRequests++;

    // Check if an identical request is already in-flight
    if (this.inFlight.has(key)) {
      this.stats.deduplicatedRequests++;
      console.log(`   🔗 [${this.name}] Deduplicating: ${key.slice(0, 80)}...`);
      return this.inFlight.get(key);
    }

    // No in-flight request - create new one
    this.stats.uniqueRequests++;

    const promise = requestFn()
      .then(result => {
        // Clean up after completion
        this.inFlight.delete(key);
        return result;
      })
      .catch(error => {
        // Clean up after error
        this.inFlight.delete(key);
        throw error;
      });

    // Store in-flight promise
    this.inFlight.set(key, promise);

    return promise;
  }

  /**
   * Get deduplication statistics
   */
  getStats() {
    return {
      ...this.stats,
      inFlightCount: this.inFlight.size,
      deduplicationRate: this.stats.totalRequests > 0
        ? Math.round((this.stats.deduplicatedRequests / this.stats.totalRequests) * 100)
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      uniqueRequests: 0
    };
  }

  /**
   * Clear all in-flight requests (for testing/cleanup)
   */
  clear() {
    this.inFlight.clear();
  }
}

/**
 * Create a request key from parameters
 *
 * This function creates a unique, deterministic key from parameters.
 * Only requests with IDENTICAL keys will be deduplicated.
 *
 * @param {string} method - Method name (e.g., 'getQuote', 'getCompanyOverview')
 * @param {...any} args - All arguments to the method
 * @returns {string} - Unique key for this exact request
 */
function createRequestKey(method, ...args) {
  // Sort object keys for consistent stringification
  const normalize = (obj) => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(normalize);

    const sorted = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = normalize(obj[key]);
    });
    return sorted;
  };

  const normalizedArgs = args.map(normalize);
  return JSON.stringify({ method, args: normalizedArgs });
}

/**
 * Wrap a provider method with request deduplication
 *
 * Example usage:
 * ```javascript
 * class MyProvider {
 *   constructor() {
 *     this.deduplicator = new RequestDeduplicator('MyProvider');
 *
 *     // Wrap methods that make API calls
 *     this.getQuote = wrapWithDeduplication(
 *       this.deduplicator,
 *       'getQuote',
 *       this._getQuoteImpl.bind(this)
 *     );
 *   }
 *
 *   async _getQuoteImpl(symbol) {
 *     // Actual API call
 *     return apiCall(symbol);
 *   }
 * }
 * ```
 *
 * @param {RequestDeduplicator} deduplicator - Deduplicator instance
 * @param {string} methodName - Name of the method (for logging)
 * @param {Function} originalFn - Original function that makes the API call
 * @returns {Function} - Wrapped function with deduplication
 */
function wrapWithDeduplication(deduplicator, methodName, originalFn) {
  return async function(...args) {
    const key = createRequestKey(methodName, ...args);
    return deduplicator.execute(key, () => originalFn(...args));
  };
}

/**
 * Decorator to add deduplication to a provider class
 *
 * Automatically wraps specified methods with request deduplication.
 *
 * @param {Array<string>} methodNames - Names of methods to wrap
 * @returns {Function} - Class decorator
 */
function withDeduplication(methodNames = []) {
  return function(ProviderClass) {
    const originalConstructor = ProviderClass;

    function DecoratedProvider(...args) {
      const instance = new originalConstructor(...args);

      // Add deduplicator if not already present
      if (!instance.deduplicator) {
        instance.deduplicator = new RequestDeduplicator(instance.name || 'Provider');
      }

      // Wrap specified methods
      methodNames.forEach(methodName => {
        const originalMethod = instance[methodName];
        if (typeof originalMethod === 'function') {
          instance[methodName] = wrapWithDeduplication(
            instance.deduplicator,
            methodName,
            originalMethod.bind(instance)
          );
        }
      });

      return instance;
    }

    // Preserve prototype chain
    DecoratedProvider.prototype = originalConstructor.prototype;

    return DecoratedProvider;
  };
}

module.exports = {
  RequestDeduplicator,
  createRequestKey,
  wrapWithDeduplication,
  withDeduplication
};
