// src/api/routes/batch.js
// Batch API endpoint for combining multiple requests into a single HTTP call
// Tier 3 optimization - reduces network round-trips
// Phase 3.3: Optimized with direct service layer access (5-10x faster)

const express = require('express');
const router = express.Router();
const { routeRequest } = require('./batchRouter');

/**
 * POST /api/batch
 * Execute multiple API requests in a single HTTP call
 *
 * Request body:
 * {
 *   "requests": [
 *     { "id": "req1", "method": "GET", "path": "/api/companies/AAPL" },
 *     { "id": "req2", "method": "GET", "path": "/api/prices/AAPL" },
 *     { "id": "req3", "method": "GET", "path": "/api/companies/MSFT/metrics" }
 *   ]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "results": [
 *     { "id": "req1", "status": 200, "data": {...} },
 *     { "id": "req2", "status": 200, "data": {...} },
 *     { "id": "req3", "status": 200, "data": {...} }
 *   ]
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { requests } = req.body;

    // Validate input
    if (!requests || !Array.isArray(requests)) {
      return res.status(400).json({
        success: false,
        error: 'requests array is required'
      });
    }

    if (requests.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'requests array cannot be empty'
      });
    }

    if (requests.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 20 requests per batch'
      });
    }

    // Validate each request
    for (const request of requests) {
      if (!request.path) {
        return res.status(400).json({
          success: false,
          error: 'Each request must have a path'
        });
      }

      if (!request.path.startsWith('/api/')) {
        return res.status(400).json({
          success: false,
          error: 'All paths must start with /api/'
        });
      }

      // Only allow GET requests for now (safe, cacheable)
      if (request.method && request.method.toUpperCase() !== 'GET') {
        return res.status(400).json({
          success: false,
          error: 'Only GET requests are supported in batch mode'
        });
      }
    }

    // Execute all requests in parallel
    const results = await Promise.all(
      requests.map(async (request, index) => {
        const id = request.id || `req_${index}`;

        try {
          // Use internal request handling
          const result = await executeInternalRequest(req, request.path, request.query);
          return {
            id,
            status: 200,
            data: result
          };
        } catch (error) {
          return {
            id,
            status: error.status || 500,
            error: error.message || 'Internal error'
          };
        }
      })
    );

    res.json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    console.error('Batch request error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Execute an internal request without HTTP overhead
 * Phase 3.3: Routes directly to service layer (5-10x faster than HTTP loopback)
 */
async function executeInternalRequest(originalReq, path, queryParams = {}) {
  const db = originalReq.app.get('db');
  const user = originalReq.user || null;

  try {
    // Route directly to service layer - no HTTP overhead!
    return await routeRequest(db, path, queryParams, user);
  } catch (error) {
    // Preserve error status codes
    throw error;
  }
}

/**
 * GET /api/batch/symbols
 * Specialized batch endpoint for fetching data for multiple symbols
 * More efficient than generic batch for common use case
 *
 * Query params:
 *   symbols: comma-separated list of symbols (e.g., AAPL,MSFT,GOOGL)
 *   include: comma-separated data types (e.g., prices,metrics,sentiment)
 */
router.get('/symbols', async (req, res) => {
  try {
    const { symbols, include = 'prices' } = req.query;

    if (!symbols) {
      return res.status(400).json({
        success: false,
        error: 'symbols parameter is required'
      });
    }

    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    if (symbolList.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one symbol is required'
      });
    }

    if (symbolList.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 symbols per request'
      });
    }

    const includeTypes = include.split(',').map(t => t.trim().toLowerCase());
    const db = req.app.get('db');

    // Fetch data in parallel for all symbols
    const results = {};

    await Promise.all(symbolList.map(async (symbol) => {
      results[symbol] = {};

      // Build parallel fetches for each data type
      const fetches = [];

      if (includeTypes.includes('prices')) {
        fetches.push(
          fetchPriceData(db, symbol).then(data => {
            results[symbol].prices = data;
          })
        );
      }

      if (includeTypes.includes('metrics')) {
        fetches.push(
          fetchMetricsData(db, symbol).then(data => {
            results[symbol].metrics = data;
          })
        );
      }

      if (includeTypes.includes('info')) {
        fetches.push(
          fetchCompanyInfo(db, symbol).then(data => {
            results[symbol].info = data;
          })
        );
      }

      await Promise.all(fetches);
    }));

    res.json({
      success: true,
      count: symbolList.length,
      data: results
    });
  } catch (error) {
    console.error('Batch symbols error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper: Fetch price data for a symbol
 */
function fetchPriceData(db, symbol) {
  const stmt = db.prepare(`
    SELECT last_price, change_1d, change_1w, change_1m, change_ytd,
           volume, avg_volume_20d, high_52w, low_52w
    FROM price_metrics
    WHERE symbol = ?
  `);

  return stmt.get(symbol) || null;
}

/**
 * Helper: Fetch metrics data for a symbol
 */
function fetchMetricsData(db, symbol) {
  const stmt = db.prepare(`
    SELECT cm.*
    FROM calculated_metrics cm
    JOIN companies c ON cm.company_id = c.id
    WHERE c.symbol = ?
    ORDER BY cm.fiscal_period DESC
    LIMIT 1
  `);

  return stmt.get(symbol) || null;
}

/**
 * Helper: Fetch company info for a symbol
 */
function fetchCompanyInfo(db, symbol) {
  const stmt = db.prepare(`
    SELECT id, symbol, name, sector, industry, country, market_cap, description
    FROM companies
    WHERE symbol = ?
  `);

  return stmt.get(symbol) || null;
}

module.exports = router;
