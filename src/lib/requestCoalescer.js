// src/lib/requestCoalescer.js
// Batches multiple concurrent requests into single API calls

/**
 * Request Coalescer
 * Batches multiple concurrent requests for the same resource type into a single batch call
 *
 * Example: 10 concurrent quote requests become 1 batch API call
 */
class RequestCoalescer {
  /**
   * @param {Function} batchFn - Async function that takes array of keys and returns object { key: result }
   * @param {Object} options
   * @param {number} options.delay - Ms to wait before executing batch (default: 10)
   * @param {number} options.maxBatchSize - Max items per batch (default: 50)
   * @param {number} options.maxWaitTime - Max time to wait for batch (default: 100)
   */
  constructor(batchFn, options = {}) {
    this.batchFn = batchFn;
    this.delay = options.delay || 10;
    this.maxBatchSize = options.maxBatchSize || 50;
    this.maxWaitTime = options.maxWaitTime || 100;

    this.pending = new Map(); // key -> { resolve, reject, addedAt }
    this.timer = null;
    this.batchStartTime = null;
  }

  /**
   * Get a value, batching with other concurrent requests
   * @param {string} key - The key to fetch
   * @returns {Promise<*>} - The result for this key
   */
  async get(key) {
    // Check if we already have a pending request for this key
    if (this.pending.has(key)) {
      return this.pending.get(key).promise;
    }

    // Create a new pending request
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pending.set(key, {
      resolve,
      reject,
      promise,
      addedAt: Date.now(),
    });

    // Start batch timer if this is the first request
    if (!this.batchStartTime) {
      this.batchStartTime = Date.now();
    }

    // Execute immediately if batch is full
    if (this.pending.size >= this.maxBatchSize) {
      this._executeBatch();
    } else if (!this.timer) {
      // Schedule batch execution
      this.timer = setTimeout(() => this._executeBatch(), this.delay);
    } else {
      // Check if we've waited too long
      const waitTime = Date.now() - this.batchStartTime;
      if (waitTime >= this.maxWaitTime) {
        this._executeBatch();
      }
    }

    return promise;
  }

  /**
   * Get multiple values at once
   * @param {string[]} keys - Array of keys to fetch
   * @returns {Promise<Object>} - Object with { key: value } for each key
   */
  async getMany(keys) {
    const results = await Promise.all(keys.map(key => this.get(key)));
    const resultMap = {};
    keys.forEach((key, i) => {
      resultMap[key] = results[i];
    });
    return resultMap;
  }

  /**
   * Execute the batched request
   */
  async _executeBatch() {
    // Clear timer
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Get all pending requests
    const batch = new Map(this.pending);
    this.pending.clear();
    this.batchStartTime = null;

    if (batch.size === 0) return;

    const keys = Array.from(batch.keys());

    try {
      // Execute batch function
      const results = await this.batchFn(keys);

      // Resolve individual promises
      for (const [key, { resolve }] of batch) {
        const result = results[key];
        resolve(result);
      }
    } catch (err) {
      // Reject all promises on error
      for (const { reject } of batch.values()) {
        reject(err);
      }
    }
  }

  /**
   * Get statistics about coalescing
   */
  getStats() {
    return {
      pendingRequests: this.pending.size,
      hasPendingTimer: !!this.timer,
    };
  }
}

/**
 * Create a coalescer for quote fetching
 */
function createQuoteCoalescer(fetchBatchQuotes) {
  return new RequestCoalescer(
    async (symbols) => {
      // Fetch all quotes in one batch call
      return fetchBatchQuotes(symbols);
    },
    {
      delay: 15,
      maxBatchSize: 20,
      maxWaitTime: 50,
    }
  );
}

/**
 * Create a coalescer for company data
 */
function createCompanyCoalescer(fetchBatchCompanies) {
  return new RequestCoalescer(
    async (symbols) => {
      return fetchBatchCompanies(symbols);
    },
    {
      delay: 20,
      maxBatchSize: 50,
      maxWaitTime: 100,
    }
  );
}

module.exports = {
  RequestCoalescer,
  createQuoteCoalescer,
  createCompanyCoalescer,
};
