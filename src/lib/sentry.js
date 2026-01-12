// src/lib/sentry.js
// Sentry error tracking integration

let Sentry = null;
let isInitialized = false;

/**
 * Initialize Sentry error tracking
 * @param {Object} app - Express app instance (optional)
 */
function initSentry(app = null) {
  const config = require('../config');

  // Skip if no DSN configured or already initialized
  if (!config.monitoring?.sentry?.dsn || isInitialized) {
    return null;
  }

  try {
    Sentry = require('@sentry/node');

    const initOptions = {
      dsn: config.monitoring.sentry.dsn,
      environment: config.env,
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring
      tracesSampleRate: config.monitoring.sentry.tracesSampleRate || 0.1,

      // Capture console.error as breadcrumbs
      integrations: [
        Sentry.captureConsoleIntegration({
          levels: ['error', 'warn'],
        }),
      ],

      // Filter sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }

        // Remove sensitive data from body
        if (event.request?.data) {
          const data = typeof event.request.data === 'string'
            ? JSON.parse(event.request.data)
            : event.request.data;

          if (data.password) data.password = '[FILTERED]';
          if (data.token) data.token = '[FILTERED]';
          if (data.apiKey) data.apiKey = '[FILTERED]';

          event.request.data = JSON.stringify(data);
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Network errors
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        // Rate limiting
        'Too many requests',
      ],
    };

    Sentry.init(initOptions);
    isInitialized = true;

    console.log('✅ Sentry error tracking initialized');

    return Sentry;
  } catch (err) {
    console.warn('⚠️  Sentry initialization failed:', err.message);
    console.warn('   Install with: npm install @sentry/node');
    return null;
  }
}

/**
 * Get Sentry request handler middleware
 * Must be the first middleware
 */
function getRequestHandler() {
  if (!Sentry) return (req, res, next) => next();

  return Sentry.Handlers.requestHandler({
    // Include user info
    user: ['id', 'email', 'username'],
  });
}

/**
 * Get Sentry tracing handler middleware
 * Should come after request handler
 */
function getTracingHandler() {
  if (!Sentry) return (req, res, next) => next();

  return Sentry.Handlers.tracingHandler();
}

/**
 * Get Sentry error handler middleware
 * Must be before other error handlers
 */
function getErrorHandler() {
  if (!Sentry) return (err, req, res, next) => next(err);

  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Capture 4xx and 5xx errors
      if (error.status >= 400) {
        return true;
      }
      return true;
    },
  });
}

/**
 * Capture an exception manually
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
  if (!Sentry) {
    console.error('Error:', error);
    return null;
  }

  return Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message manually
 * @param {string} message - Message to capture
 * @param {string} level - Log level (info, warning, error)
 */
function captureMessage(message, level = 'info') {
  if (!Sentry) {
    console.log(`[${level}]`, message);
    return null;
  }

  return Sentry.captureMessage(message, level);
}

/**
 * Set user context for error tracking
 * @param {Object} user - User info { id, email, username }
 */
function setUser(user) {
  if (!Sentry) return;

  Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
  if (!Sentry) return;

  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Flush pending events (call before process exit)
 * @param {number} timeout - Timeout in ms
 */
async function flush(timeout = 2000) {
  if (!Sentry) return;

  await Sentry.close(timeout);
}

/**
 * Check if Sentry is enabled
 */
function isEnabled() {
  return isInitialized && Sentry !== null;
}

module.exports = {
  initSentry,
  getRequestHandler,
  getTracingHandler,
  getErrorHandler,
  captureException,
  captureMessage,
  setUser,
  addBreadcrumb,
  flush,
  isEnabled,
};
