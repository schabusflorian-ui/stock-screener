// src/api/routes/auth.js
// Authentication routes

const express = require('express');
const passport = require('passport');
const router = express.Router();

// GET /api/auth/google - Initiate Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// GET /api/auth/google/callback - Google OAuth callback
router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/login?error=auth_failed`
  }),
  (req, res) => {
    // Successful authentication
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/`);
  }
);

// GET /api/auth/me - Get current user
router.get('/me', (req, res) => {
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
  res.json({
    authenticated: req.isAuthenticated(),
    userId: req.user?.id || null
  });
});

module.exports = router;
