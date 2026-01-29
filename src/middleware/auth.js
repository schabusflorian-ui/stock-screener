// src/middleware/auth.js
// Authentication and authorization middleware

const { getPortfolioService } = require('../services/portfolio');

// Check if OAuth is configured
const isOAuthConfigured = () => {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
};

// Check if we're in explicit dev mode
// IMPORTANT: Dev bypass only works when ALL conditions are met:
// 1. NODE_ENV is NOT production or staging
// 2. ALLOW_DEV_AUTH is explicitly set to 'true'
// 3. Not running in a cloud environment (no RAILWAY_ENVIRONMENT, FLY_APP_NAME, etc.)
const isDevModeEnabled = () => {
  // Never enable dev mode in production-like environments
  const productionLikeEnvs = ['production', 'staging', 'uat', 'preprod'];
  if (productionLikeEnvs.includes(process.env.NODE_ENV)) {
    return false;
  }
  // Check for cloud environment indicators
  const cloudIndicators = [
    'RAILWAY_ENVIRONMENT',
    'RAILWAY_PROJECT_ID',
    'FLY_APP_NAME',
    'HEROKU_APP_NAME',
    'AWS_EXECUTION_ENV',
    'GOOGLE_CLOUD_PROJECT',
    'AZURE_FUNCTIONS_ENVIRONMENT',
  ];
  if (cloudIndicators.some(indicator => process.env[indicator])) {
    return false;
  }
  // Require explicit opt-in
  return process.env.ALLOW_DEV_AUTH === 'true';
};

// Check for local admin bypass header (matches frontend localStorage admin bypass)
// Only works in dev mode with explicit ALLOW_DEV_AUTH
const hasLocalAdminBypass = (req) => {
  if (!isDevModeEnabled()) return false;
  return req.headers['x-admin-bypass'] === 'true' || req.get('X-Admin-Bypass') === 'true';
};

/**
 * Require authenticated user
 * In production: Always requires OAuth authentication
 * In development: Requires ALLOW_DEV_AUTH=true for bypass
 */
const requireAuth = (req, res, next) => {
  // Production ALWAYS requires authentication - no bypass
  if (process.env.NODE_ENV === 'production') {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Development mode with explicit dev auth enabled
  if (isDevModeEnabled() && !isOAuthConfigured()) {
    req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: false };
    return next();
  }

  // Check for local admin bypass header (dev only with ALLOW_DEV_AUTH)
  if (hasLocalAdminBypass(req)) {
    req.user = req.user || { id: 'admin', email: 'admin@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  // Standard authentication check
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }

  // If OAuth is configured, require it
  if (isOAuthConfigured()) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // No authentication configured - reject with helpful error
  // SECURITY: Never auto-grant access without explicit ALLOW_DEV_AUTH=true
  if (process.env.NODE_ENV === 'development') {
    console.warn('WARNING: No authentication configured. Set ALLOW_DEV_AUTH=true to enable dev bypass.');
  }

  return res.status(401).json({
    error: 'Authentication required. Set ALLOW_DEV_AUTH=true for development bypass.',
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
 * In dev mode: requires ALLOW_DEV_AUTH=true for bypass
 */
const requireAdmin = (req, res, next) => {
  // Production: strict admin check only
  if (process.env.NODE_ENV === 'production') {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }
    // Continue to admin check below
  } else {
    // Development mode
    // Check for local admin bypass (requires ALLOW_DEV_AUTH=true)
    if (hasLocalAdminBypass(req)) {
      req.user = req.user || { id: 'admin', email: 'admin@local', is_admin: true };
      req.isAdmin = true;
      return next();
    }

    // Dev mode without OAuth - warn but DON'T auto-grant admin
    if (isDevModeEnabled() && !isOAuthConfigured()) {
      console.warn('WARNING: Admin access attempted in dev mode. Use x-admin-bypass header.');
      req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: false };
      // Fall through to admin check - will fail unless x-admin-bypass used
    }

    if (!req.isAuthenticated || !req.isAuthenticated()) {
      if (!isDevModeEnabled()) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }
    }
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

  // Dev mode with explicit opt-in: everyone has access
  // SECURITY: Requires both non-production AND explicit ALLOW_DEV_AUTH=true
  if (isDevModeEnabled() && !isOAuthConfigured()) {
    req.isAdmin = true;
    return next();
  }

  // Check for local admin bypass (requires dev mode enabled)
  if (hasLocalAdminBypass(req)) {
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
 * In dev mode with explicit opt-in, everyone is admin
 * SECURITY: Requires ALLOW_DEV_AUTH=true for any dev bypass
 */
const checkAdmin = (req, res, next) => {
  // Dev mode with explicit opt-in: everyone is admin
  if (isDevModeEnabled() && !isOAuthConfigured()) {
    req.user = req.user || { id: 'dev-user', email: 'dev@local', is_admin: true };
    req.isAdmin = true;
    return next();
  }

  // Check for local admin bypass (requires dev mode enabled)
  if (hasLocalAdminBypass(req)) {
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
