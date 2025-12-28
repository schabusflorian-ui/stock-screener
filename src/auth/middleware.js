// src/auth/middleware.js
// Authentication middleware functions

/**
 * Require authentication for a route
 * Returns 401 if not authenticated
 */
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    success: false,
    error: 'Authentication required'
  });
}

/**
 * Optional auth - attaches user to req if authenticated
 * Does not block unauthenticated requests
 */
function optionalAuth(req, res, next) {
  // User is already attached by passport if authenticated
  next();
}

/**
 * Get user ID from request (returns null if not authenticated)
 */
function getUserId(req) {
  return req.user?.id || null;
}

/**
 * Require user ID - throws if not authenticated
 */
function requireUserId(req) {
  if (!req.user?.id) {
    const error = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  return req.user.id;
}

module.exports = {
  requireAuth,
  optionalAuth,
  getUserId,
  requireUserId
};
