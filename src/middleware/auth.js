// src/middleware/auth.js
// Authentication and authorization middleware

const { getPortfolioService } = require('../services/portfolio');

// Check if OAuth is configured
const isOAuthConfigured = () => {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
};

// Check for local admin bypass header (matches frontend localStorage admin bypass)
// Headers are normalized to lowercase by express
const hasLocalAdminBypass = (req) => {
  return req.headers['x-admin-bypass'] === 'true' || req.get('X-Admin-Bypass') === 'true';
};

/**
 * Require authenticated user
 * If OAuth is not configured, allow all requests (dev mode)
 * Also allows requests with x-admin-bypass header in non-production
 */
const requireAuth = (req, res, next) => {
  // If OAuth isn't configured, skip auth checks (dev mode)
  if (!isOAuthConfigured()) {
    req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: true };
    return next();
  }

  // Check for local admin bypass (non-production only)
  if (process.env.NODE_ENV !== 'production' && hasLocalAdminBypass(req)) {
    req.user = req.user || { id: 'admin', email: 'admin@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({
    error: 'Authentication required',
    code: 'AUTH_REQUIRED'
  });
};

/**
 * Optional auth - attaches user if present but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  // User already attached by passport if authenticated
  next();
};

/**
 * Require admin access
 * Admin is determined by:
 * 1. User has is_admin flag in database
 * 2. User email matches ADMIN_EMAILS environment variable
 * In dev mode without OAuth, all users are admin
 */
const requireAdmin = (req, res, next) => {
  // Dev mode: everyone is admin
  if (!isOAuthConfigured()) {
    req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  // Check for local admin bypass (non-production only)
  if (process.env.NODE_ENV !== 'production' && hasLocalAdminBypass(req)) {
    req.user = req.user || { id: 'admin', email: 'admin@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  const user = req.user;

  // Check if user is admin
  if (user.is_admin) {
    return next();
  }

  // Check against admin emails from environment
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  if (adminEmails.includes(user.email?.toLowerCase())) {
    return next();
  }

  return res.status(403).json({
    error: 'Admin access required',
    code: 'ADMIN_REQUIRED'
  });
};

/**
 * Verify portfolio ownership
 * Must be used after requireAuth
 * Allows access if user owns portfolio OR is admin
 * In dev mode without OAuth, all users have access
 */
const requirePortfolioOwnership = (req, res, next) => {
  const db = req.app.get('db');
  const service = getPortfolioService(db);
  const portfolioId = parseInt(req.params.id);

  if (!portfolioId || isNaN(portfolioId)) {
    return res.status(400).json({
      error: 'Invalid portfolio ID',
      code: 'INVALID_PORTFOLIO_ID'
    });
  }

  // Check if portfolio exists
  const portfolio = service.getPortfolio(portfolioId);
  if (!portfolio) {
    return res.status(404).json({
      error: 'Portfolio not found',
      code: 'PORTFOLIO_NOT_FOUND'
    });
  }

  // Dev mode: everyone has access
  if (!isOAuthConfigured()) {
    req.isAdmin = true;
    return next();
  }

  // Check for local admin bypass (non-production only)
  if (process.env.NODE_ENV !== 'production' && hasLocalAdminBypass(req)) {
    req.isAdmin = true;
    return next();
  }

  const userId = req.user?.id;

  // Admin can access any portfolio
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  if (req.user?.is_admin || adminEmails.includes(req.user?.email?.toLowerCase())) {
    req.isAdmin = true;
    return next();
  }

  // Check ownership
  if (service.isPortfolioOwner(portfolioId, userId)) {
    return next();
  }

  return res.status(403).json({
    error: 'Access denied - you do not own this portfolio',
    code: 'ACCESS_DENIED'
  });
};

/**
 * Attach user ID to request for convenience
 */
const attachUserId = (req, res, next) => {
  req.userId = req.user?.id || null;
  next();
};

/**
 * Check if user is admin (adds isAdmin flag to request)
 * In dev mode without OAuth, everyone is admin
 */
const checkAdmin = (req, res, next) => {
  // Dev mode: everyone is admin
  if (!isOAuthConfigured()) {
    req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  // Check for local admin bypass (non-production only)
  if (process.env.NODE_ENV !== 'production' && hasLocalAdminBypass(req)) {
    req.user = req.user || { id: 'admin', email: 'admin@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  if (!req.user) {
    req.isAdmin = false;
    return next();
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  req.isAdmin = req.user.is_admin || adminEmails.includes(req.user.email?.toLowerCase());
  next();
};

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  requirePortfolioOwnership,
  attachUserId,
  checkAdmin
};
