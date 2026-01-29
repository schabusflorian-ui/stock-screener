// src/lib/logger.js
// Centralized logging with environment-aware output

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

// Log levels in order of severity
const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LEVELS[LOG_LEVEL] ?? LEVELS.info;

/**
 * Format log message for output
 */
function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();

  if (isProduction) {
    // JSON format for production (easier to parse in log aggregators)
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta,
    });
  }

  // Human-readable format for development
  const prefix = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍',
  }[level] || '';

  const metaStr = Object.keys(meta).length > 0
    ? ` ${JSON.stringify(meta)}`
    : '';

  return `[${timestamp}] ${prefix} [${level.toUpperCase()}] ${message}${metaStr}`;
}

/**
 * Should this level be logged?
 */
function shouldLog(level) {
  if (isTest) return false; // Suppress logs in tests
  return LEVELS[level] <= currentLevel;
}

/**
 * Sanitize sensitive data from objects before logging
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = [
    'password', 'secret', 'token', 'apiKey', 'api_key', 'apikey',
    'authorization', 'auth', 'credential', 'private', 'key',
    'session', 'cookie', 'jwt', 'bearer'
  ];

  const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive words
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Sanitize URLs to remove API keys
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // Remove common API key patterns from URLs
  return url
    .replace(/([?&])(apikey|api_key|key|token|secret)=[^&]*/gi, '$1$2=[REDACTED]')
    .replace(/([?&])apikey=[^&]*/gi, '$1apikey=[REDACTED]');
}

/**
 * Logger instance
 */
const logger = {
  error(message, error = null, meta = {}) {
    if (!shouldLog('error')) return;

    const logMeta = { ...sanitize(meta) };

    if (error) {
      logMeta.error = {
        message: error.message,
        name: error.name,
        // Only include stack in non-production
        ...(isProduction ? {} : { stack: error.stack }),
      };
    }

    console.error(formatMessage('error', message, logMeta));
  },

  warn(message, meta = {}) {
    if (!shouldLog('warn')) return;
    console.warn(formatMessage('warn', message, sanitize(meta)));
  },

  info(message, meta = {}) {
    if (!shouldLog('info')) return;
    console.log(formatMessage('info', message, sanitize(meta)));
  },

  debug(message, meta = {}) {
    if (!shouldLog('debug')) return;
    console.log(formatMessage('debug', message, sanitize(meta)));
  },

  // Log HTTP request (for morgan replacement)
  http(req, res, duration) {
    if (!shouldLog('info')) return;

    const meta = {
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
    };

    // Add user ID if authenticated
    if (req.user?.id) {
      meta.userId = req.user.id;
    }

    const level = res.statusCode >= 500 ? 'error' :
                  res.statusCode >= 400 ? 'warn' : 'info';

    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      formatMessage(level, `${req.method} ${sanitizeUrl(req.originalUrl || req.url)} ${res.statusCode}`, meta)
    );
  },

  // Log with custom level
  log(level, message, meta = {}) {
    if (!shouldLog(level)) return;

    const logFn = level === 'error' ? console.error :
                  level === 'warn' ? console.warn : console.log;

    logFn(formatMessage(level, message, sanitize(meta)));
  },

  // Child logger with preset context
  child(context) {
    return {
      error: (msg, err, meta) => logger.error(msg, err, { ...context, ...meta }),
      warn: (msg, meta) => logger.warn(msg, { ...context, ...meta }),
      info: (msg, meta) => logger.info(msg, { ...context, ...meta }),
      debug: (msg, meta) => logger.debug(msg, { ...context, ...meta }),
    };
  },

  // Utility functions
  sanitize,
  sanitizeUrl,
};

module.exports = logger;
