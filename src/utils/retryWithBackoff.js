/**
 * Retry Logic with Exponential Backoff
 *
 * Automatically retries failed operations with increasing delays.
 */

/**
 * Default options for retry behavior
 */
const DEFAULT_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitter: true, // Add randomness to prevent thundering herd
  retryableErrors: null, // Function to determine if error is retryable
  onRetry: null // Callback when retry occurs
};

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean}
 */
function isRetryableError(error) {
  // Network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
    return true;
  }

  // Rate limiting (should retry after delay)
  if (error.status === 429) {
    return true;
  }

  // Server errors (5xx) - may be temporary
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Specific API errors that are retryable
  if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
    return true;
  }

  // Circuit breaker open (will retry after delay)
  if (error.message?.includes('temporarily unavailable')) {
    return true;
  }

  // Default: don't retry client errors (4xx except 429)
  return false;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {Object} options - Retry options
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, options) {
  const { initialDelay, maxDelay, backoffMultiplier, jitter } = options;

  // Exponential backoff: delay = initialDelay * multiplier^attempt
  let delay = initialDelay * Math.pow(backoffMultiplier, attempt);

  // Cap at maximum delay
  delay = Math.min(delay, maxDelay);

  // Add jitter (0-50% of delay) to prevent thundering herd
  if (jitter) {
    const jitterAmount = delay * 0.5 * Math.random();
    delay += jitterAmount;
  }

  return Math.floor(delay);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} - Result of successful execution
 */
async function retryWithBackoff(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const {
    maxRetries,
    retryableErrors,
    onRetry
  } = opts;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = retryableErrors
        ? retryableErrors(error)
        : isRetryableError(error);

      if (!shouldRetry || attempt >= maxRetries) {
        // No more retries
        break;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      // Log retry attempt
      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries} failed: ${error.message}. ` +
        `Retrying in ${delay}ms...`
      );

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          error,
          delay,
          nextAttempt: attempt + 2
        });
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Create a retry wrapper for a function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options
 * @returns {Function} Wrapped function with retry logic
 */
function withRetry(fn, options = {}) {
  return async (...args) => {
    return retryWithBackoff(() => fn(...args), options);
  };
}

/**
 * Retry with circuit breaker integration
 * @param {string} serviceName - Name of the service (for circuit breaker)
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @returns {Promise}
 */
async function retryWithCircuitBreaker(serviceName, fn, options = {}) {
  const { withCircuitBreaker } = require('./circuitBreaker');

  return retryWithBackoff(
    () => withCircuitBreaker(serviceName, fn),
    {
      ...options,
      // Override retryable to include circuit breaker errors
      retryableErrors: (error) => {
        // Circuit breaker open - retry after delay
        if (error.message?.includes('temporarily unavailable')) {
          return true;
        }
        // Use default or custom retryable check
        return options.retryableErrors
          ? options.retryableErrors(error)
          : isRetryableError(error);
      }
    }
  );
}

module.exports = {
  retryWithBackoff,
  withRetry,
  retryWithCircuitBreaker,
  isRetryableError,
  calculateDelay,
  DEFAULT_OPTIONS
};
