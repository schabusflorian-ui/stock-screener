// src/utils/circuitBreaker.js
// Circuit breaker pattern for external API resilience

const { api: logger } = require('./logger');

/**
 * Circuit Breaker States
 */
const STATES = {
  CLOSED: 'CLOSED',       // Normal operation, requests go through
  OPEN: 'OPEN',           // Failing, reject requests immediately
  HALF_OPEN: 'HALF_OPEN', // Testing if service recovered
};

/**
 * Circuit Breaker implementation
 * Prevents cascading failures when external services are down
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.halfOpenMax = options.halfOpenMax || 3; // Max requests in half-open state
    this.monitorInterval = options.monitorInterval || 10000; // Stats logging interval

    // State
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenAttempts = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();

    // Stats
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      rejectedByCircuit: 0,
      lastError: null,
    };

    // Set up reset timer
    this.resetTimer = null;
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Result of the function or circuit breaker error
   */
  async execute(fn) {
    this.stats.totalRequests++;

    // Check if circuit is open
    if (this.state === STATES.OPEN) {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.transitionTo(STATES.HALF_OPEN);
      } else {
        this.stats.rejectedByCircuit++;
        const error = new Error(`Circuit breaker [${this.name}] is OPEN`);
        error.code = 'CIRCUIT_OPEN';
        error.circuitBreaker = this.name;
        throw error;
      }
    }

    // Check half-open limit
    if (this.state === STATES.HALF_OPEN && this.halfOpenAttempts >= this.halfOpenMax) {
      this.stats.rejectedByCircuit++;
      const error = new Error(`Circuit breaker [${this.name}] half-open limit reached`);
      error.code = 'CIRCUIT_HALF_OPEN_LIMIT';
      error.circuitBreaker = this.name;
      throw error;
    }

    if (this.state === STATES.HALF_OPEN) {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful request
   */
  onSuccess() {
    this.successes++;
    this.stats.totalSuccesses++;

    if (this.state === STATES.HALF_OPEN) {
      // Service recovered, close the circuit
      logger.info(`Circuit breaker [${this.name}] recovered`, {
        previousState: this.state,
        halfOpenAttempts: this.halfOpenAttempts,
      });
      this.transitionTo(STATES.CLOSED);
    }

    // Reset failure count on success in closed state
    if (this.state === STATES.CLOSED && this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Handle failed request
   */
  onFailure(error) {
    this.failures++;
    this.stats.totalFailures++;
    this.stats.lastError = error.message;
    this.lastFailureTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      // Still failing, open the circuit again
      logger.warn(`Circuit breaker [${this.name}] half-open test failed`, {
        error: error.message,
      });
      this.transitionTo(STATES.OPEN);
      return;
    }

    if (this.state === STATES.CLOSED && this.failures >= this.failureThreshold) {
      // Too many failures, open the circuit
      logger.error(`Circuit breaker [${this.name}] opened`, {
        failures: this.failures,
        threshold: this.failureThreshold,
        error: error.message,
      });
      this.transitionTo(STATES.OPEN);
    }
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState) {
    const previousState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === STATES.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.halfOpenAttempts = 0;
    } else if (newState === STATES.HALF_OPEN) {
      this.halfOpenAttempts = 0;
    }

    logger.info(`Circuit breaker [${this.name}] state change`, {
      from: previousState,
      to: newState,
    });
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      failureThreshold: this.failureThreshold,
      lastFailureTime: this.lastFailureTime,
      lastStateChange: this.lastStateChange,
      stats: { ...this.stats },
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    logger.info(`Circuit breaker [${this.name}] manually reset`);
    this.transitionTo(STATES.CLOSED);
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      rejectedByCircuit: 0,
      lastError: null,
    };
  }

  /**
   * Check if circuit is currently allowing requests
   */
  isAllowing() {
    if (this.state === STATES.CLOSED) return true;
    if (this.state === STATES.OPEN) {
      return Date.now() - this.lastFailureTime >= this.resetTimeout;
    }
    return this.halfOpenAttempts < this.halfOpenMax;
  }
}

/**
 * Registry for managing multiple circuit breakers
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
  }

  /**
   * Get or create a circuit breaker
   */
  get(name, options = {}) {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker({ name, ...options }));
    }
    return this.breakers.get(name);
  }

  /**
   * Get all circuit breakers status
   */
  getAll() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus();
    }
    return status;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Global registry instance
const registry = new CircuitBreakerRegistry();

/**
 * Wrap an async function with circuit breaker protection
 * @param {string} name - Circuit breaker name
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Circuit breaker options
 */
function withCircuitBreaker(name, fn, options = {}) {
  const breaker = registry.get(name, options);

  return async function(...args) {
    return breaker.execute(() => fn(...args));
  };
}

/**
 * Decorator for adding circuit breaker to a method
 */
function circuitBreaker(name, options = {}) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    const breaker = registry.get(name, options);

    descriptor.value = async function(...args) {
      return breaker.execute(() => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  registry,
  withCircuitBreaker,
  circuitBreaker,
  STATES,
};
