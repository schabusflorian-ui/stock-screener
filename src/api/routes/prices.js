// src/api/routes/prices.js
const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const db = require('../../database');

/**
 * GET /api/prices/status
 * Get price import status overview
 */
router.get('/status', (req, res) => {
  try {
    const database = db.getDatabase();

    // Get import statistics
    const stats = database.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT company_id) FROM daily_prices) as companies_with_prices,
        (SELECT COUNT(*) FROM daily_prices) as total_price_records,
        (SELECT COUNT(*) FROM price_import_log WHERE status = 'success') as successful_imports,
        (SELECT COUNT(*) FROM price_import_log WHERE status = 'failed') as failed_imports,
        (SELECT MIN(date) FROM daily_prices) as earliest_date,
        (SELECT MAX(date) FROM daily_prices) as latest_date,
        (SELECT COUNT(*) FROM companies WHERE is_active = 1) as total_companies
    `).get();

    // Get recent import activity
    const recentImports = database.prepare(`
      SELECT
        pil.symbol,
        pil.status,
        pil.records_imported,
        pil.date_from,
        pil.date_to,
        pil.completed_at,
        pil.error_message
      FROM price_import_log pil
      ORDER BY pil.completed_at DESC
      LIMIT 20
    `).all();

    // Get companies missing price data
    const missingCount = database.prepare(`
      SELECT COUNT(*) as count
      FROM companies c
      LEFT JOIN daily_prices dp ON c.id = dp.company_id
      WHERE c.is_active = 1
      GROUP BY c.id
      HAVING COUNT(dp.id) = 0
    `).all().length;

    res.json({
      success: true,
      data: {
        overview: {
          companiesWithPrices: stats.companies_with_prices || 0,
          totalPriceRecords: stats.total_price_records || 0,
          successfulImports: stats.successful_imports || 0,
          failedImports: stats.failed_imports || 0,
          totalCompanies: stats.total_companies || 0,
          companiesMissingPrices: missingCount,
          dateRange: {
            earliest: stats.earliest_date,
            latest: stats.latest_date
          },
          coverage: stats.total_companies > 0
            ? ((stats.companies_with_prices / stats.total_companies) * 100).toFixed(2) + '%'
            : '0%'
        },
        recentImports
      }
    });
  } catch (error) {
    console.error('Error getting price status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/metrics
 * Get price metrics for all companies or filtered set
 */
router.get('/metrics', (req, res) => {
  try {
    const { limit = 100, offset = 0, sort = 'last_price_date', order = 'DESC' } = req.query;

    const database = db.getDatabase();

    // Validate sort column
    const validSorts = ['last_price', 'change_1d', 'change_1w', 'change_1m', 'change_ytd',
                        'high_52w', 'low_52w', 'rsi_14', 'volatility_30d', 'last_price_date'];
    const sortCol = validSorts.includes(sort) ? sort : 'last_price_date';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const metrics = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.*
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
      ORDER BY pm.${sortCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset));

    const total = database.prepare(`
      SELECT COUNT(*) as count FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
    `).get();

    res.json({
      success: true,
      data: {
        metrics,
        pagination: {
          total: total.count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });
  } catch (error) {
    console.error('Error getting price metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/:symbol
 * Get historical prices for a specific company
 */
router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      startDate,
      endDate,
      limit = 365,
      period // '1m', '3m', '6m', '1y', '5y', 'max'
    } = req.query;

    const database = db.getDatabase();

    // Get company
    const company = database.prepare('SELECT id, symbol, name, sector, industry FROM companies WHERE symbol = ? COLLATE NOCASE').get(symbol);

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Determine date range based on period
    let effectiveLimit = parseInt(limit);
    if (period) {
      const periodMap = {
        '1m': 22,    // ~22 trading days
        '3m': 65,    // ~65 trading days
        '6m': 130,   // ~130 trading days
        '1y': 252,   // ~252 trading days
        '5y': 1260,  // ~1260 trading days
        'max': 10000 // All data
      };
      effectiveLimit = periodMap[period] || 252;
    }

    // Build query
    let sql = `
      SELECT date, open, high, low, close, adjusted_close, volume
      FROM daily_prices
      WHERE company_id = ?
    `;
    const params = [company.id];

    if (startDate) {
      sql += ' AND date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY date DESC LIMIT ?';
    params.push(effectiveLimit);

    const prices = database.prepare(sql).all(...params);

    // Get metrics
    const metrics = database.prepare('SELECT * FROM price_metrics WHERE company_id = ?').get(company.id);

    res.json({
      success: true,
      data: {
        company: {
          symbol: company.symbol,
          name: company.name,
          sector: company.sector,
          industry: company.industry
        },
        metrics: metrics || null,
        prices: prices.reverse(), // Return in ascending order (oldest first)
        count: prices.length
      }
    });
  } catch (error) {
    console.error('Error getting prices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/:symbol/metrics
 * Get just the price metrics for a company
 */
router.get('/:symbol/metrics', (req, res) => {
  try {
    const { symbol } = req.params;
    const database = db.getDatabase();

    const company = database.prepare('SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE').get(symbol);

    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    const metrics = database.prepare('SELECT * FROM price_metrics WHERE company_id = ?').get(company.id);

    res.json({
      success: true,
      data: metrics || null
    });
  } catch (error) {
    console.error('Error getting price metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prices/import
 * Trigger bulk price import (runs in background)
 */
router.post('/import', (req, res) => {
  try {
    const { limit, batchSize = 50, delay = 2 } = req.body || {};

    const pythonScript = path.join(__dirname, '../../../python-services/price_fetcher.py');
    const dbPath = path.join(__dirname, '../../../data/stocks.db');

    // Build command args
    const args = [
      pythonScript,
      '--db', dbPath,
      '--batch-size', batchSize.toString(),
      '--delay', delay.toString()
    ];

    if (limit) {
      args.push('--limit', limit.toString());
    }

    // Spawn Python process in background
    const pythonProcess = spawn('python3', args, {
      cwd: path.join(__dirname, '../../../python-services'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Log output but don't wait for completion
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Price Import] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Price Import Error] ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`[Price Import] Process exited with code ${code}`);
    });

    // Unref so Node.js doesn't wait for the child process
    pythonProcess.unref();

    res.json({
      success: true,
      message: 'Price import started in background. Check /api/prices/status for progress.',
      pid: pythonProcess.pid
    });
  } catch (error) {
    console.error('Error starting price import:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/prices/calculate-metrics
 * Calculate/recalculate price metrics for all companies
 */
router.post('/calculate-metrics', (req, res) => {
  try {
    const pythonScript = path.join(__dirname, '../../../python-services/price_fetcher.py');
    const dbPath = path.join(__dirname, '../../../data/stocks.db');

    // We need to run only the calculate_price_metrics function
    const pythonCode = `
import sys
sys.path.insert(0, '${path.join(__dirname, '../../../python-services')}')
from price_fetcher import calculate_price_metrics
calculate_price_metrics('${dbPath}')
`;

    const pythonProcess = spawn('python3', ['-c', pythonCode], {
      cwd: path.join(__dirname, '../../../python-services'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Price Metrics] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Price Metrics Error] ${data.toString().trim()}`);
    });

    pythonProcess.unref();

    res.json({
      success: true,
      message: 'Price metrics calculation started. This may take a few minutes.',
      pid: pythonProcess.pid
    });
  } catch (error) {
    console.error('Error calculating price metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/gainers
 * Get top gainers by various periods
 */
router.get('/screen/gainers', (req, res) => {
  try {
    const { period = '1d', limit = 20 } = req.query;

    const database = db.getDatabase();

    const periodColumn = {
      '1d': 'change_1d',
      '1w': 'change_1w',
      '1m': 'change_1m',
      '3m': 'change_3m',
      '6m': 'change_6m',
      '1y': 'change_1y',
      'ytd': 'change_ytd'
    }[period] || 'change_1d';

    const gainers = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.${periodColumn} as change_pct,
        pm.volume as avg_volume_30d
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1 AND pm.${periodColumn} IS NOT NULL
      ORDER BY pm.${periodColumn} DESC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        gainers
      }
    });
  } catch (error) {
    console.error('Error getting gainers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/losers
 * Get top losers by various periods
 */
router.get('/screen/losers', (req, res) => {
  try {
    const { period = '1d', limit = 20 } = req.query;

    const database = db.getDatabase();

    const periodColumn = {
      '1d': 'change_1d',
      '1w': 'change_1w',
      '1m': 'change_1m',
      '3m': 'change_3m',
      '6m': 'change_6m',
      '1y': 'change_1y',
      'ytd': 'change_ytd'
    }[period] || 'change_1d';

    const losers = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.${periodColumn} as change_pct,
        pm.volume as avg_volume_30d
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1 AND pm.${periodColumn} IS NOT NULL
      ORDER BY pm.${periodColumn} ASC
      LIMIT ?
    `).all(parseInt(limit));

    res.json({
      success: true,
      data: {
        period,
        losers
      }
    });
  } catch (error) {
    console.error('Error getting losers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/52w-highs
 * Get stocks near 52-week highs
 */
router.get('/screen/52w-highs', (req, res) => {
  try {
    const { threshold = 5, limit = 50 } = req.query;

    const database = db.getDatabase();

    const nearHighs = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.high_52w,
        pm.high_52w_date,
        ROUND((pm.last_price / pm.high_52w - 1) * 100, 2) as pct_from_high
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.high_52w IS NOT NULL
        AND pm.last_price IS NOT NULL
        AND pm.high_52w > 0
        AND ((pm.high_52w - pm.last_price) / pm.high_52w * 100) <= ?
      ORDER BY pct_from_high DESC
      LIMIT ?
    `).all(parseFloat(threshold), parseInt(limit));

    res.json({
      success: true,
      data: {
        threshold: parseFloat(threshold),
        count: nearHighs.length,
        stocks: nearHighs
      }
    });
  } catch (error) {
    console.error('Error getting 52w highs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/52w-lows
 * Get stocks near 52-week lows
 */
router.get('/screen/52w-lows', (req, res) => {
  try {
    const { threshold = 5, limit = 50 } = req.query;

    const database = db.getDatabase();

    const nearLows = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.low_52w,
        pm.low_52w_date,
        ROUND((pm.last_price / pm.low_52w - 1) * 100, 2) as pct_from_low
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.low_52w IS NOT NULL
        AND pm.last_price IS NOT NULL
        AND pm.low_52w > 0
        AND ((pm.last_price - pm.low_52w) / pm.low_52w * 100) <= ?
      ORDER BY pct_from_low ASC
      LIMIT ?
    `).all(parseFloat(threshold), parseInt(limit));

    res.json({
      success: true,
      data: {
        threshold: parseFloat(threshold),
        count: nearLows.length,
        stocks: nearLows
      }
    });
  } catch (error) {
    console.error('Error getting 52w lows:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/oversold
 * Get oversold stocks (RSI < 30)
 */
router.get('/screen/oversold', (req, res) => {
  try {
    const { threshold = 30, limit = 50 } = req.query;

    const database = db.getDatabase();

    const oversold = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.rsi_14,
        pm.change_1w,
        pm.change_1m
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.rsi_14 IS NOT NULL
        AND pm.rsi_14 < ?
      ORDER BY pm.rsi_14 ASC
      LIMIT ?
    `).all(parseFloat(threshold), parseInt(limit));

    res.json({
      success: true,
      data: {
        threshold: parseFloat(threshold),
        count: oversold.length,
        stocks: oversold
      }
    });
  } catch (error) {
    console.error('Error getting oversold stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/overbought
 * Get overbought stocks (RSI > 70)
 */
router.get('/screen/overbought', (req, res) => {
  try {
    const { threshold = 70, limit = 50 } = req.query;

    const database = db.getDatabase();

    const overbought = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.rsi_14,
        pm.change_1w,
        pm.change_1m
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.rsi_14 IS NOT NULL
        AND pm.rsi_14 > ?
      ORDER BY pm.rsi_14 DESC
      LIMIT ?
    `).all(parseFloat(threshold), parseInt(limit));

    res.json({
      success: true,
      data: {
        threshold: parseFloat(threshold),
        count: overbought.length,
        stocks: overbought
      }
    });
  } catch (error) {
    console.error('Error getting overbought stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/screen/outperformers
 * Get stocks outperforming the market (positive alpha)
 */
router.get('/screen/outperformers', (req, res) => {
  try {
    const { period = 'ytd', limit = 50 } = req.query;

    const database = db.getDatabase();

    const alphaColumn = {
      '1d': 'alpha_1d',
      '1w': 'alpha_1w',
      '1m': 'alpha_1m',
      '3m': 'alpha_3m',
      '6m': 'alpha_6m',
      '1y': 'alpha_1y',
      'ytd': 'alpha_ytd'
    }[period] || 'alpha_ytd';

    const changeColumn = alphaColumn.replace('alpha_', 'change_');

    const outperformers = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.${changeColumn} as stock_change,
        pm.${alphaColumn} as alpha,
        pm.benchmark_symbol
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.${alphaColumn} IS NOT NULL
        AND pm.${alphaColumn} > 0
      ORDER BY pm.${alphaColumn} DESC
      LIMIT ?
    `).all(parseInt(limit));

    // Get benchmark performance for context
    const benchmark = database.prepare(`
      SELECT symbol, ${changeColumn.replace('change_', 'change_')} as benchmark_change
      FROM index_prices WHERE is_primary = 1
    `).get();

    res.json({
      success: true,
      data: {
        period,
        benchmark: benchmark || null,
        count: outperformers.length,
        stocks: outperformers
      }
    });
  } catch (error) {
    console.error('Error getting outperformers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/prices/screen/underperformers
 * Get stocks underperforming the market (negative alpha)
 */
router.get('/screen/underperformers', (req, res) => {
  try {
    const { period = 'ytd', limit = 50 } = req.query;

    const database = db.getDatabase();

    const alphaColumn = {
      '1d': 'alpha_1d',
      '1w': 'alpha_1w',
      '1m': 'alpha_1m',
      '3m': 'alpha_3m',
      '6m': 'alpha_6m',
      '1y': 'alpha_1y',
      'ytd': 'alpha_ytd'
    }[period] || 'alpha_ytd';

    const changeColumn = alphaColumn.replace('alpha_', 'change_');

    const underperformers = database.prepare(`
      SELECT
        c.symbol,
        c.name,
        c.sector,
        pm.last_price,
        pm.${changeColumn} as stock_change,
        pm.${alphaColumn} as alpha,
        pm.benchmark_symbol
      FROM price_metrics pm
      JOIN companies c ON pm.company_id = c.id
      WHERE c.is_active = 1
        AND pm.${alphaColumn} IS NOT NULL
        AND pm.${alphaColumn} < 0
      ORDER BY pm.${alphaColumn} ASC
      LIMIT ?
    `).all(parseInt(limit));

    // Get benchmark performance for context
    const benchmark = database.prepare(`
      SELECT symbol, ${changeColumn.replace('change_', 'change_')} as benchmark_change
      FROM index_prices WHERE is_primary = 1
    `).get();

    res.json({
      success: true,
      data: {
        period,
        benchmark: benchmark || null,
        count: underperformers.length,
        stocks: underperformers
      }
    });
  } catch (error) {
    console.error('Error getting underperformers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
