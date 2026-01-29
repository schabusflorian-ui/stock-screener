// src/services/mlops/circuitBreaker.js
/**
 * Circuit Breaker for ML Model Resilience
 *
 * Implements the circuit breaker pattern to prevent cascading failures:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit tripped, requests fail fast or use fallback
 * - HALF_OPEN: Testing if service recovered
 *
 * Features:
 * - Automatic failure detection
 * - Configurable thresholds
 * - Fallback support
 * - Health monitoring
 * - Automatic recovery testing
 *
 * Pass Criteria:
 * - Fallback activates < 100ms
 * - Circuit opens after 5 consecutive failures
 * - Recovery time < 60s
 */

const EventEmitter = require('events');
const { unifiedCache } = require('../../lib/redisCache');

// Circuit states
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

// Cache TTL for circuit state (5 minutes)
const CIRCUIT_STATE_TTL = 5 * 60 * 1000;

class CircuitBreaker extends EventEmitter {
  /**
   * Create a circuit breaker
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    super();

    this.name = options.name || 'default';

    // Configuration
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 3;
    this.timeout = options.timeout || 30000; // 30s default timeout
    this.resetTimeout = options.resetTimeout || 30000; // Time before trying again
    this.monitoringWindow = options.monitoringWindow || 60000; // 1 minute window

    // State
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.openTime = null;
    this.halfOpenTime = null;

    // Statistics
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      fallbackCalls: 0,
      timeouts: 0,
      stateChanges: []
    };

    // Fallback function
    this.fallback = options.fallback || null;

    // Health check function (for proactive testing)
    this.healthCheck = options.healthCheck || null;

    // Start recovery timer if configured
    this._startRecoveryCheck();
  }

  /**
   * Execute a function through the circuit breaker
   * @param {Function} fn The function to execute
   * @param {Array} args Arguments to pass to the function
   * @returns {Promise} Result of the function or fallback
   */
  async execute(fn, ...args) {
    this.stats.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      if (this._shouldAttemptReset()) {
        this._transitionTo(CircuitState.HALF_OPEN);
      } else {
        return this._handleRejection('Circuit is open');
      }
    }

    // Execute the function
    try {
      const result = await this._executeWithTimeout(fn, args);
      this._recordSuccess();
      return result;
    } catch (error) {
      return this._handleFailure(error);
    }
  }

  /**
   * Execute function with timeout
   */
  async _executeWithTimeout(fn, args) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        this.stats.timeouts++;
        reject(new Error(`Circuit breaker timeout after ${this.timeout}ms`));
      }, this.timeout);
    });

    try {
      const result = await Promise.race([fn(...args), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  _recordSuccess() {
    this.stats.successfulCalls++;
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successes >= this.successThreshold) {
        this._transitionTo(CircuitState.CLOSED);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Handle a failed call
   */
  _handleFailure(error) {
    this.stats.failedCalls++;
    this.failures++;
    this.lastFailureTime = Date.now();

    // In half-open state, single failure opens circuit again
    if (this.state === CircuitState.HALF_OPEN) {
      this._transitionTo(CircuitState.OPEN);
    }
    // In closed state, check threshold
    else if (this.state === CircuitState.CLOSED) {
      if (this.failures >= this.failureThreshold) {
        this._transitionTo(CircuitState.OPEN);
      }
    }

    // Try fallback if available
    if (this.fallback) {
      return this._executeFallback(error);
    }

    throw error;
  }

  /**
   * Handle rejected call (circuit open)
   */
  _handleRejection(reason) {
    this.stats.rejectedCalls++;

    if (this.fallback) {
      return this._executeFallback(new Error(reason));
    }

    throw new Error(`Circuit breaker ${this.name}: ${reason}`);
  }

  /**
   * Execute fallback function
   */
  async _executeFallback(error) {
    this.stats.fallbackCalls++;
    this.emit('fallback', { error, circuitName: this.name });

    try {
      const result = await this.fallback(error);
      return result;
    } catch (fallbackError) {
      // Fallback also failed
      this.emit('fallback_failed', { error: fallbackError, originalError: error });
      throw fallbackError;
    }
  }

  /**
   * Check if we should attempt reset
   */
  _shouldAttemptReset() {
    if (!this.openTime) return false;
    return Date.now() - this.openTime >= this.resetTimeout;
  }

  /**
   * Transition to a new state
   */
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    const now = Date.now();

    if (newState === CircuitState.OPEN) {
      this.openTime = now;
      this.successes = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.halfOpenTime = now;
      this.successes = 0;
    } else if (newState === CircuitState.CLOSED) {
      this.failures = 0;
      this.openTime = null;
      this.halfOpenTime = null;
    }

    this.stats.stateChanges.push({
      from: oldState,
      to: newState,
      timestamp: new Date().toISOString()
    });

    this.emit('stateChange', {
      from: oldState,
      to: newState,
      circuitName: this.name
    });

    console.log(`[CircuitBreaker:${this.name}] State: ${oldState} -> ${newState}`);
  }

  /**
   * Start periodic recovery check
   */
  _startRecoveryCheck() {
    if (this.healthCheck) {
      setInterval(async () => {
        if (this.state === CircuitState.OPEN && this._shouldAttemptReset()) {
          try {
            await this.healthCheck();
            this._transitionTo(CircuitState.HALF_OPEN);
          } catch (e) {
            // Health check failed, stay open
          }
        }
      }, this.resetTimeout / 2);
    }
  }

  /**
   * Get current circuit status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime).toISOString() : null,
      openSince: this.openTime ? new Date(this.openTime).toISOString() : null,
      stats: this.stats
    };
  }

  /**
   * Force circuit open (for testing or manual intervention)
   */
  forceOpen() {
    this._transitionTo(CircuitState.OPEN);
  }

  /**
   * Force circuit closed (for recovery)
   */
  forceClose() {
    this._transitionTo(CircuitState.CLOSED);
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      rejectedCalls: 0,
      fallbackCalls: 0,
      timeouts: 0,
      stateChanges: []
    };
  }
}

/**
 * Circuit Breaker Manager
 * Manages multiple circuit breakers for different services
 * Uses Redis for distributed state synchronization across instances
 */
class CircuitBreakerManager {
  constructor() {
    this.breakers = new Map();
    this.REDIS_KEY_PREFIX = 'circuit:';
  }

  /**
   * Create or get a circuit breaker
   * Syncs initial state from Redis for distributed consistency
   */
  async getBreaker(name, options = {}) {
    if (!this.breakers.has(name)) {
      const breaker = new CircuitBreaker({ ...options, name });

      // Try to sync state from Redis (other instances may have updated it)
      await this._syncFromRedis(breaker);

      // Listen for state changes and sync to Redis
      breaker.on('stateChange', async ({ to }) => {
        await this._syncToRedis(breaker);
      });

      this.breakers.set(name, breaker);
    }
    return this.breakers.get(name);
  }

  /**
   * Sync circuit state to Redis
   */
  async _syncToRedis(breaker) {
    try {
      const state = {
        state: breaker.state,
        failures: breaker.failures,
        successes: breaker.successes,
        openTime: breaker.openTime,
        lastFailureTime: breaker.lastFailureTime,
        lastSuccessTime: breaker.lastSuccessTime,
        updatedAt: Date.now()
      };
      await unifiedCache.set(
        `${this.REDIS_KEY_PREFIX}${breaker.name}`,
        state,
        CIRCUIT_STATE_TTL
      );
    } catch (error) {
      console.error(`[CircuitBreakerManager] Failed to sync ${breaker.name} to Redis:`, error.message);
    }
  }

  /**
   * Sync circuit state from Redis
   */
  async _syncFromRedis(breaker) {
    try {
      const cached = await unifiedCache.get(`${this.REDIS_KEY_PREFIX}${breaker.name}`);
      if (cached && cached.updatedAt > Date.now() - CIRCUIT_STATE_TTL) {
        // Another instance has more recent state - adopt it
        if (cached.state !== breaker.state) {
          breaker.state = cached.state;
          breaker.failures = cached.failures || 0;
          breaker.successes = cached.successes || 0;
          breaker.openTime = cached.openTime || null;
          breaker.lastFailureTime = cached.lastFailureTime || null;
          breaker.lastSuccessTime = cached.lastSuccessTime || null;
          console.log(`[CircuitBreakerManager] Synced ${breaker.name} state from Redis: ${cached.state}`);
        }
      }
    } catch (error) {
      console.error(`[CircuitBreakerManager] Failed to sync ${breaker.name} from Redis:`, error.message);
    }
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }

  /**
   * Get aggregated health status
   */
  getHealthStatus() {
    const statuses = this.getAllStatus();
    const openCircuits = Object.values(statuses).filter(s => s.state === CircuitState.OPEN);

    return {
      healthy: openCircuits.length === 0,
      totalCircuits: this.breakers.size,
      openCircuits: openCircuits.length,
      halfOpenCircuits: Object.values(statuses).filter(s => s.state === CircuitState.HALF_OPEN).length,
      circuits: statuses
    };
  }

  /**
   * Force all circuits closed (emergency reset)
   * Also clears Redis state
   */
  async resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
      await this._syncToRedis(breaker);
    }
  }
}

// Create default manager instance
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
  CircuitBreaker,
  CircuitBreakerManager,
  CircuitState,
  circuitBreakerManager
};
