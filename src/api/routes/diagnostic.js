// src/api/routes/diagnostic.js
// Diagnostic endpoints for troubleshooting Railway deployment

const express = require('express');
const router = express.Router();
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

// GET /api/diagnostic/db - Check database connectivity and schema
router.get('/db', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const dbType = isUsingPostgres() ? 'PostgreSQL' : 'SQLite';

    const checks = {
      database: {
        type: dbType,
        connected: false,
        error: null
      },
      migrations: {
        tableExists: false,
        count: 0,
        error: null
      },
      users: {
        tableExists: false,
        count: 0,
        error: null
      }
    };

    // Check database connection
    try {
      await database.query('SELECT 1 as test');
      checks.database.connected = true;
    } catch (error) {
      checks.database.error = error.message;
    }

    // Check schema_migrations table
    try {
      const result = await database.query('SELECT COUNT(*) as count FROM schema_migrations');
      checks.migrations.tableExists = true;
      checks.migrations.count = parseInt(result.rows[0].count);
    } catch (error) {
      checks.migrations.error = error.message;
    }

    // Check users table
    try {
      const result = await database.query('SELECT COUNT(*) as count FROM users');
      checks.users.tableExists = true;
      checks.users.count = parseInt(result.rows[0].count);
    } catch (error) {
      checks.users.error = error.message;
    }

    // Get migration list if table exists
    if (checks.migrations.tableExists) {
      try {
        const result = await database.query('SELECT name FROM schema_migrations ORDER BY name');
        checks.migrations.list = result.rows.map(r => r.name);
      } catch (error) {
        checks.migrations.listError = error.message;
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      checks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

// GET /api/diagnostic/env - Check environment variables (sanitized)
router.get('/env', (req, res) => {
  const envVars = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 15)}...` : 'NOT SET',
    REDIS_URL: process.env.REDIS_URL ? 'SET' : 'NOT SET',
    SESSION_SECRET: process.env.SESSION_SECRET ? `SET (${process.env.SESSION_SECRET.length} chars)` : 'NOT SET',
    APP_URL: process.env.APP_URL || 'NOT SET',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
  };

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    environment: envVars
  });
});

// GET /api/diagnostic/oauth - Check OAuth configuration
router.get('/oauth', (req, res) => {
  const passport = require('passport');

  const oauthConfig = {
    passportInitialized: !!passport,
    googleClientId: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET',
    appUrl: process.env.APP_URL || 'NOT SET',
    callbackUrl: process.env.APP_URL
      ? `${process.env.APP_URL}/api/auth/google/callback`
      : 'http://localhost:3000/api/auth/google/callback (default)',
  };

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    oauth: oauthConfig
  });
});

module.exports = router;
