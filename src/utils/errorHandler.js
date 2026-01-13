/**
 * Standardized Error Handling Utilities
 *
 * Provides consistent error response format across all API routes.
 * Prevents internal details from leaking to clients in production.
 */

// Environment check
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Standard API error response format
 * @typedef {Object} APIError
 * @property {boolean} success - Always false for errors
 * @property {Object} error - Error details
 * @property {string} error.code - Machine-readable error code
 * @property {string} error.message - Human-readable error message
 * @property {string} [error.details] - Additional context (non-production only)
 */

/**
 * Error codes for different error types
 */
const ERROR_CODES = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  LLM_ERROR: 'LLM_ERROR',
};

/**
 * HTTP status codes for error types
 */
const STATUS_CODES = {
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [ERROR_CODES.TIMEOUT]: 504,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.EXTERNAL_API_ERROR]: 502,
  [ERROR_CODES.LLM_ERROR]: 500,
};

/**
 * Custom API Error class
 */
class APIError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.statusCode = STATUS_CODES[code] || 500;
    this.details = details;
  }
}

/**
 * Create a standardized error response object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {*} [details] - Additional details (hidden in production)
 * @returns {APIError} Standardized error response
 */
function createError(code, message, details = null) {
  const response = {
    success: false,
    error: {
      code,
      message,
    }
  };

  // Only include details in non-production environments
  if (!isProduction && details) {
    response.error.details = details;
  }

  return response;
}

/**
 * Send a standardized error response
 * @param {Response} res - Express response object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {*} [details] - Additional details (hidden in production)
 */
function sendError(res, code, message, details = null) {
  const statusCode = STATUS_CODES[code] || 500;
  const response = createError(code, message, details);

  // Log the error server-side
  console.error(`[API Error] ${code}: ${message}`, details ? details : '');

  return res.status(statusCode).json(response);
}

/**
 * Express error handling middleware
 * Catches unhandled errors and formats them consistently
 */
function errorMiddleware(err, req, res, next) {
  // Log the full error server-side
  console.error('[Unhandled Error]', err);

  // Handle known API errors
  if (err instanceof APIError) {
    return sendError(res, err.code, err.message, err.details);
  }

  // Handle validation errors (e.g., from express-validator)
  if (err.name === 'ValidationError' || err.array) {
    const validationErrors = err.array ? err.array() : err.errors;
    return sendError(
      res,
      ERROR_CODES.VALIDATION_ERROR,
      'Validation failed',
      validationErrors
    );
  }

  // Handle database errors
  if (err.code === 'SQLITE_ERROR' || err.code?.startsWith('SQLITE_')) {
    return sendError(
      res,
      ERROR_CODES.DATABASE_ERROR,
      'Database operation failed',
      isProduction ? null : err.message
    );
  }

  // Handle timeout errors
  if (err.message?.includes('timeout') || err.message?.includes('timed out')) {
    return sendError(
      res,
      ERROR_CODES.TIMEOUT,
      'Request timed out. Please try again.',
      isProduction ? null : err.message
    );
  }

  // Handle rate limiting
  if (err.status === 429) {
    return sendError(
      res,
      ERROR_CODES.RATE_LIMITED,
      'Too many requests. Please slow down.',
      null
    );
  }

  // Default to internal error
  return sendError(
    res,
    ERROR_CODES.INTERNAL_ERROR,
    'An unexpected error occurred',
    isProduction ? null : err.message
  );
}

/**
 * Async route wrapper that catches errors and passes them to error middleware
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function that catches errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create a safe error message from an Error object
 * Strips sensitive information in production
 * @param {Error} error - The error object
 * @returns {string} Safe error message
 */
function safeErrorMessage(error) {
  if (isProduction) {
    // In production, return generic messages for certain error types
    if (error.code === 'ECONNREFUSED') {
      return 'Service temporarily unavailable';
    }
    if (error.code === 'ENOTFOUND') {
      return 'External service unavailable';
    }
    if (error.message?.includes('ANTHROPIC')) {
      return 'AI service error';
    }
    // Generic fallback
    return 'An error occurred while processing your request';
  }

  // In development, return the actual message
  return error.message;
}

module.exports = {
  ERROR_CODES,
  STATUS_CODES,
  APIError,
  createError,
  sendError,
  errorMiddleware,
  asyncHandler,
  safeErrorMessage,
  isProduction,
};