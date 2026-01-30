// src/api/routes/auth.js
// Authentication routes

const express = require('express');
const passport = require('passport');
const router = express.Router();

// DEV-ONLY: Admin bypass for testing (REMOVE IN PRODUCTION WITH OAUTH)
// Access via: https://your-app.railway.app/api/auth/dev-login?secret=YOUR_SECRET
router.get('/dev-login', (req, res) => {
  const devSecret = process.env.DEV_AUTH_SECRET;

  if (!devSecret) {
    return res.status(404).json({ error: 'Not found' });
  }

  if (req.query.secret !== devSecret) {
    return res.status(403).json({ error: 'Invalid secret' });
  }

  // Create admin session without OAuth
  req.session.userId = 'dev-admin';
  req.session.isAdmin = true;

  // Set user in session for passport compatibility
  req.login({
    id: 'dev-admin',
    email: 'admin@dev.local',
    name: 'Development Admin',
    picture: null
  }, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Session creation failed' });
    }
    res.redirect('/');
  });
});

// GET /api/auth/google - Initiate Google OAuth
router.get('/google', (req, res, next) => {
  if (!passport || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({
      success: false,
      error: 'OAuth not configured. Contact administrator.',
      hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'
    });
  }
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })(req, res, next);
});

// GET /api/auth/google/callback - Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  if (!passport || !process.env.GOOGLE_CLIENT_ID) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=oauth_not_configured`);
  }

  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=auth_failed`
  })(req, res, next);
}, (req, res) => {
  // Successful authentication
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/`);
});

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => {
  // Check for dev admin session (bypass mode)
  if (req.session?.userId === 'dev-admin' && req.session?.isAdmin) {
    return res.json({
      success: true,
      user: {
        id: 'dev-admin',
        email: 'admin@dev.local',
        name: 'Development Admin',
        picture: null,
        isAdmin: true
      }
    });
  }

  // Regular OAuth authentication
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture
      }
    });
  } else {
    res.json({
      success: false,
      user: null
    });
  }
});

// POST /api/auth/logout - Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, error: 'Session destruction failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

// GET /api/auth/status - Check auth status (lightweight)
router.get('/status', (req, res) => {
  // Check for dev admin session (bypass mode)
  if (req.session?.userId === 'dev-admin' && req.session?.isAdmin) {
    return res.json({
      authenticated: true,
      userId: 'dev-admin',
      isAdmin: true
    });
  }

  res.json({
    authenticated: req.isAuthenticated(),
    userId: req.user?.id || null
  });
});

module.exports = router;
