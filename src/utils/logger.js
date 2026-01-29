// src/utils/logger.js
// Structured logging utility for consistent log formatting across the application

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

// Default log level from environment or 'info'
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

// Whether to output JSON format (for production) or pretty format (for development)
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Format log entry as JSON for production or pretty-print for development
 */
function formatLogEntry(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...context
  };

  if (isProduction) {
    return JSON.stringify(entry);
  }

  // Pretty format for development
  let contextStr = '';
  if (Object.keys(context).length > 0) {
    try {
      contextStr = ` ${JSON.stringify(context)}`;
    } catch (e) {
      // Handle circular references or other stringify errors
      contextStr = ` [Context serialization failed: ${e.message}]`;
    }
  }

  const levelColors = {
    error: '\x1b[31m', // red
    warn: '\x1b[33m',  // yellow
    info: '\x1b[36m',  // cyan
    debug: '\x1b[90m', // gray
    trace: '\x1b[90m'  // gray
  };
  const reset = '\x1b[0m';
  const color = levelColors[level] || '';

  return `${color}[${timestamp}] ${level.toUpperCase()}${reset}: ${message}${contextStr}`;
}

/**
 * Create a logger instance with optional default context
 */
function createLogger(defaultContext = {}) {
  const log = (level, message, context = {}) => {
    if (LOG_LEVELS[level] > currentLevel) return;

    const mergedContext = { ...defaultContext, ...context };
    const formatted = formatLogEntry(level, message, mergedContext);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    error: (message, context) => log('error', message, context),
    warn: (message, context) => log('warn', message, context),
    info: (message, context) => log('info', message, context),
    debug: (message, context) => log('debug', message, context),
    trace: (message, context) => log('trace', message, context),

    // Create a child logger with additional default context
    child: (childContext) => createLogger({ ...defaultContext, ...childContext }),

    // Log with timing (useful for performance tracking)
    time: (label) => {
      const start = Date.now();
      return {
        end: (message, context = {}) => {
          const duration = Date.now() - start;
          log('info', message || label, { ...context, duration_ms: duration });
        }
      };
    }
  };
}

// Default logger instance
const logger = createLogger();

// Named service loggers for easy identification
const serviceLoggers = {
  api: createLogger({ service: 'api' }),
  jobs: createLogger({ service: 'jobs' }),
  database: createLogger({ service: 'database' }),
  sentiment: createLogger({ service: 'sentiment' }),
  trading: createLogger({ service: 'trading' }),
  agent: createLogger({ service: 'agent' }),
  ml: createLogger({ service: 'ml' }),
  prism: createLogger({ service: 'prism' }),
  xbrl: createLogger({ service: 'xbrl' }),
  sec: createLogger({ service: 'sec' })
};

module.exports = {
  logger,
  createLogger,
  ...serviceLoggers,
  LOG_LEVELS
};
