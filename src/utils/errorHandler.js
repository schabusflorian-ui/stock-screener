// src/utils/errorHandler.js
// Standardized error handling for consistent API responses

const { api: logger } = require('./logger');

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
 * Custom API Error class with standardized properties
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR, details = null) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
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
 * Factory functions for common error types
 */
const errors = {
  validation: (message, details = null) =>
    new ApiError(message, 400, ERROR_CODES.VALIDATION_ERROR, details),

  notFound: (resource = 'Resource') =>
    new ApiError(`${resource} not found`, 404, ERROR_CODES.NOT_FOUND),

  unauthorized: (message = 'Authentication required') =>
    new ApiError(message, 401, ERROR_CODES.UNAUTHORIZED),

  forbidden: (message = 'Access denied') =>
    new ApiError(message, 403, ERROR_CODES.FORBIDDEN),

  rateLimited: (retryAfter = 60) =>
    new ApiError('Rate limit exceeded', 429, ERROR_CODES.RATE_LIMITED, { retryAfter }),

  conflict: (message = 'Resource conflict') =>
    new ApiError(message, 409, ERROR_CODES.CONFLICT),

  badRequest: (message = 'Bad request') =>
    new ApiError(message, 400, ERROR_CODES.BAD_REQUEST),

  internal: (message = 'Internal server error') =>
    new ApiError(message, 500, ERROR_CODES.INTERNAL_ERROR),

  database: (message = 'Database error') =>
    new ApiError(message, 500, ERROR_CODES.DATABASE_ERROR),

  externalService: (service, message) =>
    new ApiError(`${service}: ${message}`, 502, ERROR_CODES.EXTERNAL_SERVICE_ERROR, { service }),

  circuitOpen: (service) =>
    new ApiError(`Service temporarily unavailable: ${service}`, 503, ERROR_CODES.CIRCUIT_OPEN, { service }),

  timeout: (operation = 'Operation') =>
    new ApiError(`${operation} timed out`, 504, ERROR_CODES.TIMEOUT),
};

/**
 * Express error handling middleware
 * Place at the end of middleware chain
 */
function errorMiddleware(err, req, res, next) {
  // Already sent response
  if (res.headersSent) {
    return next(err);
  }

  // Handle ApiError instances
  if (err instanceof ApiError) {
    logger.warn('API error', {
      correlationId: req.correlationId,
      code: err.code,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Joi validation errors
  if (err.isJoi || err.name === 'ValidationError') {
    const validationError = errors.validation(
      'Validation failed',
      err.details?.map(d => ({ field: d.path?.join('.'), message: d.message })) || err.message
    );

    return res.status(400).json(validationError.toJSON());
  }

  // Handle circuit breaker errors
  if (err.code === 'CIRCUIT_OPEN' || err.code === 'CIRCUIT_HALF_OPEN_LIMIT') {
    const circuitError = errors.circuitOpen(err.circuitBreaker || 'external service');
    return res.status(503).json(circuitError.toJSON());
  }

  // Handle unknown errors
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't expose internal error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  const internalError = errors.internal(message);
  return res.status(500).json(internalError.toJSON());
}

/**
 * Async handler wrapper to catch promise rejections
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Helper to send standardized success responses
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Helper to send paginated success responses
 */
function sendPaginated(res, data, pagination, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    pagination,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  ApiError,
  ERROR_CODES,
  errors,
  errorMiddleware,
  asyncHandler,
  sendSuccess,
  sendPaginated,
};
