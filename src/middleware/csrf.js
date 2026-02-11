/**
 * CSRF Protection Middleware
 * Protects against Cross-Site Request Forgery attacks
 */

const csrf = require('csurf');

// Configure CSRF protection
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Middleware to add CSRF token to response
const addCsrfToken = (req, res, next) => {
  // Add token to locals for templates
  res.locals.csrfToken = req.csrfToken();

  // Also add to response header for SPA consumption
  res.set('X-CSRF-Token', req.csrfToken());
  next();
};

// Error handler for CSRF failures
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') {
    return next(err);
  }

  // CSRF token validation failed
  console.warn('CSRF attack detected:', {
    ip: req.ip,
    path: req.path,
    method: req.method,
    userAgent: req.get('User-Agent')
  });

  res.status(403).json({
    success: false,
    error: 'Invalid or missing CSRF token',
    code: 'CSRF_INVALID'
  });
};

// Endpoint to get a fresh CSRF token (for SPAs)
const getCsrfToken = (req, res) => {
  res.json({
    success: true,
    csrfToken: req.csrfToken()
  });
};

// Routes that should be excluded from CSRF protection
// (webhooks, external API callbacks, analytics, read-only factor validation, streaming endpoints, etc.)
const csrfExcludedPaths = [
  '/api/webhooks/',
  '/api/health',
  '/api/health/detailed',
  '/api/analytics/',  // Analytics tracking endpoints
  '/api/factors/validate',   // Read-only formula validation (Quant Lab)
  '/api/factors/preview',     // Read-only factor preview (Quant Lab)
  '/api/analyst/conversations/', // Analyst chat streaming (authenticated via session)
];

// Conditional CSRF middleware that skips excluded paths
const conditionalCsrf = (req, res, next) => {
  // Skip CSRF for excluded paths
  if (csrfExcludedPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Skip CSRF for GET, HEAD, OPTIONS (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Apply CSRF protection
  csrfProtection(req, res, next);
};

module.exports = {
  csrfProtection,
  conditionalCsrf,
  addCsrfToken,
  csrfErrorHandler,
  getCsrfToken
};
