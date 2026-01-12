// src/middleware/index.js
// Export all middleware

const { createHealthCheckRouter } = require('./healthCheck');
const { createRateLimiter, createStrictRateLimiter, createApiRateLimiter } = require('./rateLimiter');
const {
  etagMiddleware,
  fieldSelectionMiddleware,
  paginationMiddleware,
  responseTimeMiddleware,
  cacheControl,
  apiOptimization,
} = require('./apiOptimization');

module.exports = {
  // Health checks
  createHealthCheckRouter,

  // Rate limiting
  createRateLimiter,
  createStrictRateLimiter,
  createApiRateLimiter,

  // API optimization
  etagMiddleware,
  fieldSelectionMiddleware,
  paginationMiddleware,
  responseTimeMiddleware,
  cacheControl,
  apiOptimization,
};
