/**
 * Logger Utility
 *
 * Provides consistent logging across the application.
 * In production, logs can be disabled or sent to a logging service.
 */

const isDev = process.env.NODE_ENV === 'development';

const logger = {
  /**
   * Log informational message
   */
  info: (message, ...args) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },

  /**
   * Log warning message
   */
  warn: (message, ...args) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },

  /**
   * Log error message
   */
  error: (message, error = null, ...args) => {
    // Always log errors, even in production
    console.error(`[ERROR] ${message}`, error, ...args);

    // In production, you might want to send to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  },

  /**
   * Log debug message (only in development)
   */
  debug: (message, ...args) => {
    if (isDev) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },

  /**
   * Log API request (useful for debugging)
   */
  api: (method, url, data = null) => {
    if (isDev) {
      console.log(`[API] ${method} ${url}`, data || '');
    }
  },

  /**
   * Log performance timing
   */
  perf: (label, startTime) => {
    if (isDev) {
      const duration = Date.now() - startTime;
      console.log(`[PERF] ${label}: ${duration}ms`);
    }
  }
};

export default logger;
