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

// GET /api/diagnostic/data - Check data availability for key features
router.get('/data', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const checks = {
      sectors: { available: false, details: {} },
      factors: { available: false, details: {} },
      alpha: { available: false, details: {} }
    };

    // Check 1: Sectors data (calculated_metrics)
    try {
      const sectorsCount = await database.query(`
        SELECT COUNT(DISTINCT company_id) as companies_with_metrics,
               COUNT(*) as total_metrics,
               MAX(fiscal_period) as latest_period
        FROM calculated_metrics
        WHERE period_type = 'annual'
      `);

      const metricsData = sectorsCount.rows[0];
      checks.sectors.available = parseInt(metricsData.companies_with_metrics) > 0;
      checks.sectors.details = {
        companiesWithMetrics: parseInt(metricsData.companies_with_metrics),
        totalRecords: parseInt(metricsData.total_metrics),
        latestPeriod: metricsData.latest_period
      };

      if (checks.sectors.available) {
        const sectorBreakdown = await database.query(`
          SELECT c.sector, COUNT(DISTINCT c.id) as company_count
          FROM companies c
          JOIN calculated_metrics m ON c.id = m.company_id
          WHERE m.period_type = 'annual'
            AND c.sector IS NOT NULL
          GROUP BY c.sector
          ORDER BY company_count DESC
          LIMIT 5
        `);
        checks.sectors.details.topSectors = sectorBreakdown.rows;
      }
    } catch (error) {
      checks.sectors.error = error.message;
    }

    // Check 2: Factor Analysis data
    try {
      const factorScoresCheck = await database.query(`
        SELECT COUNT(*) as records,
               COUNT(DISTINCT company_id) as companies,
               MAX(date) as latest_date
        FROM factor_scores
      `);

      const scoresData = factorScoresCheck.rows[0];
      checks.factors.available = parseInt(scoresData.records) > 0;
      checks.factors.details = {
        totalRecords: parseInt(scoresData.records),
        companies: parseInt(scoresData.companies),
        latestDate: scoresData.latest_date
      };

      // Also check factor_performance table
      try {
        const perfCheck = await database.query(`
          SELECT COUNT(*) as records FROM factor_performance
        `);
        checks.factors.details.performanceRecords = parseInt(perfCheck.rows[0].records);
      } catch (e) {
        checks.factors.details.performanceTableError = e.message.includes('does not exist') ? 'Table does not exist' : e.message;
      }
    } catch (error) {
      checks.factors.error = error.message.includes('does not exist') ? 'factor_scores table does not exist' : error.message;
    }

    // Check 3: Alpha vs S&P 500 data (index_prices)
    try {
      const indexCheck = await database.query(`
        SELECT COUNT(*) as records,
               COUNT(DISTINCT index_symbol) as indices,
               MAX(date) as latest_date
        FROM index_prices
      `);

      const indexData = indexCheck.rows[0];
      checks.alpha.available = parseInt(indexData.records) > 0;
      checks.alpha.details = {
        totalRecords: parseInt(indexData.records),
        indicesTracked: parseInt(indexData.indices),
        latestDate: indexData.latest_date
      };

      if (checks.alpha.available) {
        // Check for SPY specifically
        const spyCheck = await database.query(`
          SELECT COUNT(*) as records,
                 MIN(date) as earliest,
                 MAX(date) as latest
          FROM index_prices
          WHERE index_symbol = 'SPY'
        `);
        checks.alpha.details.spyData = spyCheck.rows[0];
      }

      // Check price_metrics for companies
      const priceMetricsCheck = await database.query(`
        SELECT COUNT(DISTINCT company_id) as companies_with_prices
        FROM price_metrics
        WHERE last_price IS NOT NULL
      `);
      checks.alpha.details.companiesWithPrices = parseInt(priceMetricsCheck.rows[0].companies_with_prices);
    } catch (error) {
      checks.alpha.error = error.message.includes('does not exist') ? 'index_prices table does not exist' : error.message;
    }

    // Overall status
    const allAvailable = checks.sectors.available && checks.factors.available && checks.alpha.available;

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      databaseType: isUsingPostgres() ? 'PostgreSQL' : 'SQLite',
      allFeaturesAvailable: allAvailable,
      checks,
      recommendations: {
        sectors: !checks.sectors.available ? 'Run metrics calculation job to populate calculated_metrics table' : 'OK',
        factors: !checks.factors.available ? 'Run factor calculation job to populate factor_scores table' : 'OK',
        alpha: !checks.alpha.available ? 'Run index price update to populate index_prices table' : 'OK'
      }
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

module.exports = router;
