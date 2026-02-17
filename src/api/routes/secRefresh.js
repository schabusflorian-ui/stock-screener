// src/api/routes/secRefresh.js
// API endpoints for SEC Direct Refresh

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../lib/db');
const { spawn } = require('child_process');
const path = require('path');

/**
 * GET /api/sec-refresh/status
 * Get status of SEC direct refresh
 */
// Cache for SEC status to avoid slow queries on every request
let secStatusCache = {
  data: null,
  lastUpdated: null
};
const SEC_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/status', async (req, res) => {
  try {
    // Return cached data if fresh enough
    if (secStatusCache.data && secStatusCache.lastUpdated &&
        (Date.now() - secStatusCache.lastUpdated) < SEC_STATUS_CACHE_TTL) {
      return res.json({
        success: true,
        data: secStatusCache.data,
        cached: true
      });
    }

    const database = await getDatabaseAsync();

    // Get watchlist count (fast)
    const watchlistCountResult = await database.query(`
      SELECT COUNT(*) as count
      FROM watchlist w
      JOIN companies c ON c.id = w.company_id
      WHERE c.symbol IS NOT NULL AND c.symbol NOT LIKE 'CIK_%'
    `);
    const watchlistCount = watchlistCountResult.rows[0];

    // Get total active companies count (fast)
    const activeCompaniesCountResult = await database.query(`
      SELECT COUNT(*) as count FROM companies WHERE is_active = true AND symbol IS NOT NULL
    `);
    const activeCompaniesCount = activeCompaniesCountResult.rows[0];

    // Get total filings count (fast - simple count)
    const filingsCountResult = await database.query(`
      SELECT COUNT(*) as count FROM financial_data
    `);
    const filingsCount = filingsCountResult.rows[0];

    // Get the last time data was actually updated (created_at from financial_data)
    const lastUpdateResult = await database.query(`
      SELECT MAX(created_at) as last_update FROM financial_data
    `);
    const lastUpdate = lastUpdateResult.rows[0];

    // Get the most recent filing date (handles mixed formats)
    // String format YYYY-MM-DD sorts correctly for recent dates
    const recentFilingResult = await database.query(`
      SELECT MAX(filed_date) as latest_filed
      FROM financial_data
      WHERE filed_date LIKE '202%-%'
    `);
    const recentFiling = recentFilingResult.rows[0];

    const statusData = {
      watchlistCount: watchlistCount?.count || 0,
      activeCompanies: activeCompaniesCount?.count || 0,
      totalFilings: filingsCount?.count || 0,
      lastUpdate: lastUpdate?.last_update || null,
      latestFiling: recentFiling?.latest_filed || null,
      lastCheck: new Date().toISOString()
    };

    // Cache the result
    secStatusCache = {
      data: statusData,
      lastUpdated: Date.now()
    };

    res.json({
      success: true,
      data: statusData
    });
  } catch (error) {
    console.error('Error getting SEC refresh status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sec-refresh/run
 * Trigger SEC direct refresh
 * Body: { mode: 'watchlist' | 'all' | 'symbols', symbols?: ['AAPL', 'MSFT'] }
 */
router.post('/run', async (req, res) => {
  try {
    const { mode = 'watchlist', symbols = [] } = req.body || {};

    const scriptPath = path.join(__dirname, '..', '..', 'jobs', 'secDirectRefresh.js');

    let args = [];
    if (mode === 'watchlist') {
      args = ['watchlist'];
    } else if (mode === 'all') {
      args = ['all'];
    } else if (mode === 'symbols' && symbols.length > 0) {
      args = [symbols.join(',')];
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid mode or missing symbols'
      });
    }

    // Spawn process in background
    const child = spawn('node', [scriptPath, ...args], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    res.json({
      success: true,
      message: `SEC refresh started for ${mode}`,
      mode,
      symbolCount: mode === 'symbols' ? symbols.length : null
    });
  } catch (error) {
    console.error('Error starting SEC refresh:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/sec-refresh/watchlist
 * Get watchlist symbols
 */
router.get('/watchlist', async (req, res) => {
  try {
    const database = await getDatabaseAsync();
    const watchlist = database.prepare(`
      SELECT c.symbol, c.name, c.cik
      FROM watchlist w
      JOIN companies c ON c.id = w.company_id
      WHERE c.symbol IS NOT NULL AND c.symbol NOT LIKE 'CIK_%'
      ORDER BY w.added_at DESC
    `).all();

    res.json({
      success: true,
      data: watchlist
    });
  } catch (error) {
    console.error('Error getting watchlist:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
