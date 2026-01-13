/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by temporarily blocking calls to failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are blocked
 * - HALF_OPEN: Testing if service has recovered
 */

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN'
};

class CircuitBreaker {
  /**
   * Create a circuit breaker
   * @param {Object} options - Configuration options
   * @param {string} options.name - Name for logging
   * @param {number} options.failureThreshold - Number of failures before opening (default: 5)
   * @param {number} options.successThreshold - Successes needed to close from half-open (default: 2)
   * @param {number} options.timeout - Time in ms to wait before half-open (default: 30000)
   * @param {number} options.resetTimeout - Time in ms before resetting failure count (default: 60000)
   */
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 30000; // 30 seconds
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute

    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
  }

  /**
   * Execute a function through the circuit breaker
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Result of the function or error if circuit is open
   */
  async execute(fn) {
    if (this.state === STATES.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        // Transition to half-open
        this.state = STATES.HALF_OPEN;
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN`);
      } else {
        const waitTime = Math.ceil((this.nextAttempt - Date.now()) / 1000);
        throw new Error(`Service ${this.name} is temporarily unavailable. Retry in ${waitTime}s.`);
      }
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
   * Handle successful execution
   */
  onSuccess() {
    if (this.state === STATES.HALF_OPEN) {
      this.successes++;
      console.log(`[CircuitBreaker:${this.name}] Success in HALF_OPEN (${this.successes}/${this.successThreshold})`);

      if (this.successes >= this.successThreshold) {
        this.state = STATES.CLOSED;
        this.failures = 0;
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED - service recovered`);
      }
    } else if (this.state === STATES.CLOSED) {
      // Reset failure count after success in closed state
      if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.failures = 0;
      }
    }
  }

  /**
   * Handle failed execution
   */
  onFailure(error) {
    this.failures++;
    this.lastFailureTime = Date.now();

    console.log(`[CircuitBreaker:${this.name}] Failure ${this.failures}/${this.failureThreshold}: ${error.message}`);

    if (this.state === STATES.HALF_OPEN) {
      // Immediately open on any failure in half-open state
      this.state = STATES.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN - failed in half-open state`);
    } else if (this.failures >= this.failureThreshold) {
      this.state = STATES.OPEN;
      this.nextAttempt = Date.now() + this.timeout;
      console.log(`[CircuitBreaker:${this.name}] Circuit OPEN - threshold reached`);
    }
  }

  /**
   * Get current circuit state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt,
      isAvailable: this.state !== STATES.OPEN || Date.now() >= this.nextAttempt
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttempt = null;
    console.log(`[CircuitBreaker:${this.name}] Manually reset to CLOSED`);
  }
}

// Registry of circuit breakers for different services
const circuitBreakers = new Map();

/**
 * Get or create a circuit breaker for a service
 * @param {string} name - Service name
 * @param {Object} options - Circuit breaker options
 * @returns {CircuitBreaker}
 */
function getCircuitBreaker(name, options = {}) {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, new CircuitBreaker({ name, ...options }));
  }
  return circuitBreakers.get(name);
}

/**
 * Get all circuit breaker states
 * @returns {Object[]}
 */
function getAllCircuitStates() {
  const states = [];
  for (const [name, breaker] of circuitBreakers) {
    states.push(breaker.getState());
  }
  return states;
}

/**
 * Execute a function with circuit breaker protection
 * @param {string} serviceName - Name of the service
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Circuit breaker options (used if creating new breaker)
 * @returns {Promise}
 */
async function withCircuitBreaker(serviceName, fn, options = {}) {
  const breaker = getCircuitBreaker(serviceName, options);
  return breaker.execute(fn);
}

// Pre-configured circuit breakers for common external services
const EXTERNAL_SERVICES = {
  ANTHROPIC: 'anthropic',
  YAHOO_FINANCE: 'yahoo_finance',
  FMP: 'fmp', // Financial Modeling Prep
  SEC_EDGAR: 'sec_edgar',
  NEWS_API: 'news_api',
  QUIVER: 'quiver' // Quiver Quantitative
};

// Initialize circuit breakers for external services with appropriate settings
function initializeCircuitBreakers() {
  // LLM service - more tolerant of failures (expensive retries)
  getCircuitBreaker(EXTERNAL_SERVICES.ANTHROPIC, {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 60000 // 1 minute
  });

  // Yahoo Finance - moderate tolerance
  getCircuitBreaker(EXTERNAL_SERVICES.YAHOO_FINANCE, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000 // 30 seconds
  });

  // FMP - moderate tolerance
  getCircuitBreaker(EXTERNAL_SERVICES.FMP, {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000
  });

  // SEC EDGAR - more tolerant (important data source)
  getCircuitBreaker(EXTERNAL_SERVICES.SEC_EDGAR, {
    failureThreshold: 7,
    successThreshold: 2,
    timeout: 45000
  });

  // News API - less critical, stricter
  getCircuitBreaker(EXTERNAL_SERVICES.NEWS_API, {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 20000
  });

  // Quiver Quantitative - alternative data
  getCircuitBreaker(EXTERNAL_SERVICES.QUIVER, {
    failureThreshold: 4,
    successThreshold: 2,
    timeout: 30000
  });
}

// Initialize on module load
initializeCircuitBreakers();

module.exports = {
  CircuitBreaker,
  STATES,
  EXTERNAL_SERVICES,
  getCircuitBreaker,
  getAllCircuitStates,
  withCircuitBreaker
};
