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

  // Create admin session using Passport's login method
  req.login({
    id: 'dev-admin',
    email: 'admin@dev.local',
    name: 'Development Admin',
    picture: null,
    isDevAdmin: true  // Flag to identify dev admin sessions
  }, (err) => {
    if (err) {
      console.error('[DevLogin] Session creation failed:', err);
      return res.status(500).json({ error: 'Session creation failed' });
    }

    // CRITICAL: Save session before redirecting
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('[DevLogin] Session save failed:', saveErr);
        return res.status(500).json({ error: 'Session save failed' });
      }
      console.log('[DevLogin] Session saved successfully for dev-admin');
      res.redirect('/');
    });
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
    // Use relative redirect - works in all environments
    return res.redirect('/login?error=oauth_not_configured');
  }

  passport.authenticate('google', {
    // Use relative redirect - works in all environments
    failureRedirect: '/login?error=auth_failed'
  })(req, res, next);
}, (req, res) => {
  // Successful authentication
  // CRITICAL: Save session before redirecting to prevent session loss
  req.session.save((err) => {
    if (err) {
      console.error('[OAuth] Session save failed:', err);
      return res.redirect('/login?error=session_failed');
    }
    console.log('[OAuth] Session saved successfully for user:', req.user?.email);
    // Redirect to homepage
    res.redirect('/');
  });
});

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => {
  // Check authentication via Passport
  if (req.isAuthenticated() && req.user) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        picture: req.user.picture,
        isAdmin: req.user.isDevAdmin || false  // Include dev admin flag if present
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
  res.json({
    authenticated: req.isAuthenticated(),
    userId: req.user?.id || null,
    isAdmin: req.user?.isDevAdmin || false
  });
});

module.exports = router;
