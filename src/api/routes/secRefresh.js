// src/api/routes/secRefresh.js
// API endpoints for SEC Direct Refresh

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { spawn } = require('child_process');
const path = require('path');

const database = db.getDatabase();

/**
 * GET /api/sec-refresh/status
 * Get status of SEC direct refresh
 */
router.get('/status', (req, res) => {
  try {
    // Get watchlist count
    const watchlistCount = database.prepare(`
      SELECT COUNT(*) as count
      FROM watchlist w
      JOIN companies c ON c.id = w.company_id
      WHERE c.symbol IS NOT NULL AND c.symbol NOT LIKE 'CIK_%'
    `).get();

    // Get recent updates
    const recentUpdates = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        MAX(fd.filed_date) as latest_filing,
        COUNT(DISTINCT fd.fiscal_date_ending) as periods
      FROM companies c
      JOIN financial_data fd ON fd.company_id = c.id
      WHERE c.symbol IS NOT NULL
        AND fd.filed_date >= date('now', '-30 days')
      GROUP BY c.id
      ORDER BY latest_filing DESC
      LIMIT 10
    `).all();

    // Get companies with stale data (no filing in 120 days)
    const staleCompanies = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        MAX(fd.filed_date) as latest_filing,
        julianday('now') - julianday(MAX(fd.filed_date)) as days_since
      FROM companies c
      JOIN financial_data fd ON fd.company_id = c.id
      WHERE c.symbol IS NOT NULL
        AND c.is_active = 1
      GROUP BY c.id
      HAVING days_since > 120
      ORDER BY days_since DESC
      LIMIT 20
    `).all();

    res.json({
      success: true,
      data: {
        watchlistCount: watchlistCount.count,
        recentUpdates,
        staleCompanies,
        lastCheck: new Date().toISOString()
      }
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
router.post('/run', (req, res) => {
  try {
    const { mode = 'watchlist', symbols = [] } = req.body;

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
router.get('/watchlist', (req, res) => {
  try {
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
