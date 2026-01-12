// src/middleware/errorHandler.js
// Centralized error handling middleware

const logger = require('../lib/logger');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Custom error class with status code
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguish from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error types
 */
const errors = {
  notFound: (resource = 'Resource') => new AppError(`${resource} not found`, 404, 'NOT_FOUND'),
  badRequest: (message = 'Invalid request') => new AppError(message, 400, 'BAD_REQUEST'),
  unauthorized: (message = 'Unauthorized') => new AppError(message, 401, 'UNAUTHORIZED'),
  forbidden: (message = 'Forbidden') => new AppError(message, 403, 'FORBIDDEN'),
  conflict: (message = 'Conflict') => new AppError(message, 409, 'CONFLICT'),
  validation: (message = 'Validation failed') => new AppError(message, 422, 'VALIDATION_ERROR'),
  rateLimit: () => new AppError('Too many requests', 429, 'RATE_LIMIT'),
  internal: (message = 'Internal server error') => new AppError(message, 500, 'INTERNAL_ERROR'),
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
 */
function errorHandler(err, req, res, next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired token';
  } else if (err.code === 'SQLITE_CONSTRAINT') {
    statusCode = 409;
    code = 'CONSTRAINT_ERROR';
    message = 'Database constraint violation';
  } else if (err.code === 'ECONNREFUSED') {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'Service temporarily unavailable';
  }

  // Log the error
  if (statusCode >= 500) {
    logger.error(`Server error: ${req.method} ${req.path}`, err, {
      statusCode,
      code,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.id,
    });
  } else {
    logger.warn(`Client error: ${req.method} ${req.path}`, {
      statusCode,
      code,
      message,
      url: req.originalUrl,
    });
  }

  // Build response
  const response = {
    success: false,
    error: {
      code,
      message: isProduction && statusCode >= 500
        ? 'An unexpected error occurred'
        : message,
    },
  };

  // Include additional details in non-production
  if (!isProduction) {
    response.error.stack = err.stack;
    if (err.details) {
      response.error.details = err.details;
    }
  }

  // Include request ID if available (for debugging)
  if (req.id) {
    response.error.requestId = req.id;
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
  errors,
  notFoundHandler,
  errorHandler,
  asyncHandler,
  wrapRouter,
};
