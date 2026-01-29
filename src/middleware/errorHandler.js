// src/middleware/errorHandler.js
// Centralized error handling middleware with standardized responses

const logger = require('../lib/logger');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Standard error codes for consistent client handling
 */
const ERROR_CODES = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  BAD_REQUEST: 'BAD_REQUEST',
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  TIMEOUT: 'TIMEOUT',
};

/**
 * Custom error class with status code
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || ERROR_CODES.INTERNAL_ERROR;
    this.details = details;
    this.isOperational = true; // Distinguish from programming errors
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Common error types - factory functions for consistent error creation
 */
const errors = {
  notFound: (resource = 'Resource') => new AppError(`${resource} not found`, 404, ERROR_CODES.NOT_FOUND),
  badRequest: (message = 'Invalid request', details = null) => new AppError(message, 400, ERROR_CODES.BAD_REQUEST, details),
  unauthorized: (message = 'Unauthorized') => new AppError(message, 401, ERROR_CODES.UNAUTHORIZED),
  forbidden: (message = 'Forbidden') => new AppError(message, 403, ERROR_CODES.FORBIDDEN),
  conflict: (message = 'Conflict') => new AppError(message, 409, ERROR_CODES.CONFLICT),
  validation: (message = 'Validation failed', details = null) => new AppError(message, 422, ERROR_CODES.VALIDATION_ERROR, details),
  rateLimit: (retryAfter = 60) => new AppError('Too many requests', 429, ERROR_CODES.RATE_LIMITED, { retryAfter }),
  internal: (message = 'Internal server error') => new AppError(message, 500, ERROR_CODES.INTERNAL_ERROR),
  database: (message = 'Database error') => new AppError(message, 500, ERROR_CODES.DATABASE_ERROR),
  externalService: (service, message) => new AppError(`${service}: ${message}`, 502, ERROR_CODES.EXTERNAL_SERVICE_ERROR, { service }),
  circuitOpen: (service) => new AppError(`Service temporarily unavailable: ${service}`, 503, ERROR_CODES.CIRCUIT_OPEN, { service }),
  timeout: (operation = 'Operation') => new AppError(`${operation} timed out`, 504, ERROR_CODES.TIMEOUT),
};

/**
 * 404 handler - catches unmatched routes
 */
function notFoundHandler(req, res, next) {
  const err = new AppError(`Route not found: ${req.method} ${req.path}`, 404, 'ROUTE_NOT_FOUND');
  next(err);
}

/**
 * Main error handler middleware
 * Provides standardized error responses with correlation ID support
 */
function errorHandler(err, req, res, next) {
  // Already sent response
  if (res.headersSent) {
    return next(err);
  }

  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || ERROR_CODES.INTERNAL_ERROR;
  let details = err.details || null;

  // Handle specific error types
  if (err.name === 'ValidationError' || err.isJoi) {
    statusCode = 422;
    code = ERROR_CODES.VALIDATION_ERROR;
    details = err.details?.map(d => ({ field: d.path?.join('.'), message: d.message })) || details;
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ERROR_CODES.UNAUTHORIZED;
    message = 'Invalid or expired token';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 409;
    code = ERROR_CODES.CONFLICT;
    message = 'Database constraint violation';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    code = ERROR_CODES.EXTERNAL_SERVICE_ERROR;
    message = 'Service temporarily unavailable';
  } else if (err.code === 'CIRCUIT_OPEN' || err.code === 'CIRCUIT_HALF_OPEN_LIMIT') {
    statusCode = 503;
    code = ERROR_CODES.CIRCUIT_OPEN;
    message = `Service temporarily unavailable: ${err.circuitBreaker || 'external service'}`;
    details = { service: err.circuitBreaker };
  } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    statusCode = 504;
    code = ERROR_CODES.TIMEOUT;
    message = 'Request timed out';
  }

  // Get correlation ID from request
  const correlationId = req.correlationId || req.id || null;

  // Log the error with correlation ID
  const logContext = {
    correlationId,
    statusCode,
    code,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
  };

  if (statusCode >= 500) {
    logger.error(`Server error: ${req.method} ${req.path}`, err, logContext);
  } else {
    logger.warn(`Client error: ${req.method} ${req.path}`, { ...logContext, message });
  }

  // Build standardized response
  const response = {
    success: false,
    error: {
      code,
      message: isProduction && statusCode >= 500
        ? 'An unexpected error occurred'
        : message,
      timestamp: new Date().toISOString(),
    },
  };

  // Include correlation ID for request tracing
  if (correlationId) {
    response.error.correlationId = correlationId;
  }

  // Include additional details
  if (details && !isProduction) {
    response.error.details = details;
  }

  // Include stack trace in non-production
  if (!isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

/**
 * Async route wrapper - catches promise rejections
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrap all route handlers in a router to catch async errors
 */
function wrapRouter(router) {
  const methods = ['get', 'post', 'put', 'patch', 'delete'];

  methods.forEach(method => {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) => {
      const wrappedHandlers = handlers.map(handler =>
        typeof handler === 'function' ? asyncHandler(handler) : handler
      );
      return original(path, ...wrappedHandlers);
    };
  });

  return router;
}

module.exports = {
  AppError,
  ERROR_CODES,
  errors,
  notFoundHandler,
  errorHandler,
  asyncHandler,
  wrapRouter,
};
