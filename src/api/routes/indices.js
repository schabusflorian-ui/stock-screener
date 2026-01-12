/**
 * API Routes for Market Indices
 * Provides endpoints for S&P 500, Dow Jones, NASDAQ, Russell 2000 data
 */

const express = require('express');
const router = express.Router();
const IndexService = require('../../services/indexService');
const IndexPriceService = require('../../services/indexPriceService');

/**
 * GET /api/indices
 * Get all indices with current metrics
 */
router.get('/', (req, res) => {
  try {
    const indices = IndexService.getAllIndices();
    res.json({
      success: true,
      data: indices
    });
  } catch (error) {
    console.error('Error fetching indices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch indices'
    });
  }
});

/**
 * GET /api/indices/summary
 * Get market summary with all indices and sentiment
 */
router.get('/summary', (req, res) => {
  try {
    const summary = IndexService.getMarketSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching market summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market summary'
    });
  }
});

/**
 * GET /api/indices/stats
 * Get price statistics for all indices (data availability)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = IndexService.getPriceStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching index stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch index stats'
    });
  }
});

/**
 * GET /api/indices/sp500/constituents
 * Get S&P 500 constituent companies
 */
router.get('/sp500/constituents', (req, res) => {
  try {
    const constituents = IndexService.getSP500Constituents();
    res.json({
      success: true,
      count: constituents.length,
      data: constituents
    });
  } catch (error) {
    console.error('Error fetching S&P 500 constituents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch S&P 500 constituents'
    });
  }
});

/**
 * GET /api/indices/constituents/:indexCode
 * Get constituents for any index by code (SPX, DJI, NDX, RUT)
 * Query params:
 *   - limit: number of results (default all)
 *   - sortBy: column to sort by (market_cap, symbol, name)
 */
router.get('/constituents/:indexCode', (req, res) => {
  try {
    const { indexCode } = req.params;
    const { limit, sortBy = 'market_cap' } = req.query;

    const constituents = IndexService.getConstituents(indexCode.toUpperCase(), {
      limit: limit ? parseInt(limit) : null,
      sortBy
    });

    if (!constituents) {
      return res.status(404).json({
        success: false,
        error: `Index ${indexCode} not found`
      });
    }

    res.json({
      success: true,
      indexCode: indexCode.toUpperCase(),
      count: constituents.length,
      data: constituents
    });
  } catch (error) {
    console.error('Error fetching constituents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch constituents'
    });
  }
});

// ============================================
// ETF-based Index Endpoints (with alpha)
// IMPORTANT: These must come BEFORE /:symbol route
// ============================================

/**
 * GET /api/indices/etfs
 * Get all ETF-based indices (SPY, QQQ, DIA, sector ETFs)
 */
router.get('/etfs', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const indices = indexPriceService.getAllIndices();
    res.json({
      success: true,
      data: indices
    });
  } catch (error) {
    console.error('Error fetching ETF indices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/indices/etfs/market
 * Get market ETFs only (SPY, QQQ, DIA, IWM, VTI)
 */
router.get('/etfs/market', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const indices = indexPriceService.getMarketIndices();
    res.json({
      success: true,
      data: indices
    });
  } catch (error) {
    console.error('Error fetching market ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/indices/etfs/sectors
 * Get sector ETFs (XLK, XLF, XLV, etc.)
 */
router.get('/etfs/sectors', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const sectors = indexPriceService.getSectorIndices();
    res.json({
      success: true,
      data: sectors
    });
  } catch (error) {
    console.error('Error fetching sector ETFs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/indices/benchmark
 * Get primary benchmark (SPY) with current performance
 */
router.get('/benchmark', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const benchmark = indexPriceService.getBenchmark();
    res.json({
      success: true,
      data: benchmark
    });
  } catch (error) {
    console.error('Error fetching benchmark:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/indices/alpha/timeseries/:symbol
 * Get alpha time series data for a stock (daily alpha vs SPY)
 * This endpoint returns daily alpha values over time for charting
 * IMPORTANT: Must come BEFORE /alpha/:symbol to avoid route conflict
 * Query params:
 *   - period: '1m', '3m', '6m', '1y', '2y', '5y', 'max' (default '1y')
 *   - rollingWindow: '30d', '60d', '90d' - calculate rolling alpha instead of cumulative
 */
router.get('/alpha/timeseries/:symbol', (req, res) => {
  try {
    const db = req.app.get('db');
    const { symbol } = req.params;
    const { period = '1y', rollingWindow } = req.query;

    // Get company_id
    const company = db.prepare(`
      SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE
    `).get(symbol);

    if (!company) {
      return res.status(404).json({
        success: false,
        error: 'Company not found'
      });
    }

    // Calculate date range based on period
    const periodDays = {
      '1m': 30,
      '3m': 90,
      '6m': 180,
      '1y': 365,
      '2y': 730,
      '5y': 1825,
      'max': 3650
    };

    const days = periodDays[period] || 365;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get stock daily prices
    const stockPrices = db.prepare(`
      SELECT date, adjusted_close as close
      FROM daily_prices
      WHERE company_id = ?
        AND date >= ?
        AND adjusted_close IS NOT NULL
      ORDER BY date ASC
    `).all(company.id, startDateStr);

    // Get SPY prices for the same period from daily_prices table (current data)
    // SPY is tracked as a company in the companies table with current prices
    let benchmarkPrices = [];
    const spyCompany = db.prepare(`
      SELECT id FROM companies WHERE symbol = 'SPY' COLLATE NOCASE
    `).get();

    if (spyCompany) {
      benchmarkPrices = db.prepare(`
        SELECT date, adjusted_close as close
        FROM daily_prices
        WHERE company_id = ?
          AND date >= ?
          AND adjusted_close IS NOT NULL
        ORDER BY date ASC
      `).all(spyCompany.id, startDateStr);
    }

    // Fallback to index_daily_prices table if SPY not in companies
    if (!benchmarkPrices || benchmarkPrices.length === 0) {
      try {
        benchmarkPrices = db.prepare(`
          SELECT date, close
          FROM index_daily_prices
          WHERE symbol = 'SPY'
            AND date >= ?
            AND close IS NOT NULL
          ORDER BY date ASC
        `).all(startDateStr);
      } catch (e) {
        // Table might not exist
      }
    }

    // Build date-indexed maps for alignment
    const stockMap = new Map(stockPrices.map(p => [p.date, p.close]));
    const benchmarkMap = new Map(benchmarkPrices.map(p => [p.date, p.close]));

    // Get all unique dates where we have both stock and benchmark data
    const commonDates = [...stockMap.keys()].filter(d => benchmarkMap.has(d)).sort();

    if (commonDates.length < 2) {
      return res.json({
        success: true,
        data: {
          symbol,
          benchmark: 'SPY',
          period,
          timeseries: []
        }
      });
    }

    // Parse rolling window if specified (e.g., '30d' -> 30)
    let rollingDays = null;
    if (rollingWindow) {
      const match = rollingWindow.match(/^(\d+)d$/);
      if (match) {
        rollingDays = parseInt(match[1], 10);
      }
    }

    // Calculate cumulative returns and alpha for each date
    const baseStockPrice = stockMap.get(commonDates[0]);
    const baseBenchmarkPrice = benchmarkMap.get(commonDates[0]);

    let prevStockPrice = baseStockPrice;
    let prevBenchmarkPrice = baseBenchmarkPrice;

    const timeseries = commonDates.map((date, idx) => {
      const stockPrice = stockMap.get(date);
      const benchmarkPrice = benchmarkMap.get(date);

      // Cumulative returns from period start
      const stockReturn = ((stockPrice - baseStockPrice) / baseStockPrice) * 100;
      const benchmarkReturn = ((benchmarkPrice - baseBenchmarkPrice) / baseBenchmarkPrice) * 100;
      const alpha = stockReturn - benchmarkReturn;

      // Daily returns (single day change)
      const dailyStockReturn = idx === 0 ? 0 : ((stockPrice - prevStockPrice) / prevStockPrice) * 100;
      const dailyBenchmarkReturn = idx === 0 ? 0 : ((benchmarkPrice - prevBenchmarkPrice) / prevBenchmarkPrice) * 100;
      const dailyAlpha = dailyStockReturn - dailyBenchmarkReturn;

      // Rolling window returns (if specified)
      let rollingStockReturn = null;
      let rollingBenchmarkReturn = null;
      let rollingAlpha = null;

      if (rollingDays && idx >= rollingDays) {
        const rollingBaseDate = commonDates[idx - rollingDays];
        const rollingBaseStockPrice = stockMap.get(rollingBaseDate);
        const rollingBaseBenchmarkPrice = benchmarkMap.get(rollingBaseDate);

        if (rollingBaseStockPrice && rollingBaseBenchmarkPrice) {
          rollingStockReturn = ((stockPrice - rollingBaseStockPrice) / rollingBaseStockPrice) * 100;
          rollingBenchmarkReturn = ((benchmarkPrice - rollingBaseBenchmarkPrice) / rollingBaseBenchmarkPrice) * 100;
          rollingAlpha = rollingStockReturn - rollingBenchmarkReturn;
        }
      }

      prevStockPrice = stockPrice;
      prevBenchmarkPrice = benchmarkPrice;

      const result = {
        date,
        // Cumulative from period start
        stockReturn: Math.round(stockReturn * 100) / 100,
        benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
        alpha: Math.round(alpha * 100) / 100,
        // Daily (single day)
        dailyStockReturn: Math.round(dailyStockReturn * 100) / 100,
        dailyBenchmarkReturn: Math.round(dailyBenchmarkReturn * 100) / 100,
        dailyAlpha: Math.round(dailyAlpha * 100) / 100,
        // Prices
        stockPrice: Math.round(stockPrice * 100) / 100,
        benchmarkPrice: Math.round(benchmarkPrice * 100) / 100
      };

      // Add rolling window data if calculated
      if (rollingDays) {
        result.rollingStockReturn = rollingStockReturn !== null ? Math.round(rollingStockReturn * 100) / 100 : null;
        result.rollingBenchmarkReturn = rollingBenchmarkReturn !== null ? Math.round(rollingBenchmarkReturn * 100) / 100 : null;
        result.rollingAlpha = rollingAlpha !== null ? Math.round(rollingAlpha * 100) / 100 : null;
      }

      return result;
    });

    // Calculate summary statistics
    const latestAlpha = timeseries[timeseries.length - 1]?.alpha || 0;
    const maxAlpha = Math.max(...timeseries.map(t => t.alpha));
    const minAlpha = Math.min(...timeseries.map(t => t.alpha));
    const avgAlpha = timeseries.reduce((sum, t) => sum + t.alpha, 0) / timeseries.length;

    // Calculate rolling alpha summary if rolling window was requested
    // Uses same field names as summary for consistent frontend consumption
    let rollingSummary = null;
    if (rollingDays) {
      const rollingAlphas = timeseries
        .map(t => t.rollingAlpha)
        .filter(a => a !== null);
      if (rollingAlphas.length > 0) {
        const latestRollingAlpha = rollingAlphas[rollingAlphas.length - 1];
        rollingSummary = {
          windowDays: rollingDays,
          currentAlpha: Math.round(latestRollingAlpha * 100) / 100,
          maxAlpha: Math.round(Math.max(...rollingAlphas) * 100) / 100,
          minAlpha: Math.round(Math.min(...rollingAlphas) * 100) / 100,
          avgAlpha: Math.round(rollingAlphas.reduce((s, a) => s + a, 0) / rollingAlphas.length * 100) / 100,
          outperforming: latestRollingAlpha > 0
        };
      }
    }

    res.json({
      success: true,
      data: {
        symbol,
        benchmark: 'SPY',
        period,
        rollingWindow: rollingDays ? `${rollingDays}d` : null,
        dataPoints: timeseries.length,
        summary: {
          currentAlpha: Math.round(latestAlpha * 100) / 100,
          maxAlpha: Math.round(maxAlpha * 100) / 100,
          minAlpha: Math.round(minAlpha * 100) / 100,
          avgAlpha: Math.round(avgAlpha * 100) / 100,
          outperforming: latestAlpha > 0
        },
        rollingSummary,
        timeseries
      }
    });
  } catch (error) {
    console.error('Error fetching alpha timeseries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/indices/alpha/:symbol
 * Get alpha metrics for a specific stock vs SPY (snapshot)
 */
router.get('/alpha/:symbol', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const alpha = indexPriceService.getStockAlpha(req.params.symbol);
    if (!alpha) {
      return res.status(404).json({
        success: false,
        error: 'Stock not found or no alpha data'
      });
    }
    res.json({
      success: true,
      data: alpha
    });
  } catch (error) {
    console.error('Error fetching alpha:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/indices/etfs/update
 * Trigger ETF index price update (admin)
 * Returns immediately and runs processing in background
 */
router.post('/etfs/update', (req, res) => {
  try {
    const db = req.app.get('db');

    // Return immediately
    res.json({
      success: true,
      message: 'ETF index price update started in background'
    });

    // Run in background
    setImmediate(async () => {
      try {
        const indexPriceService = new IndexPriceService(db);
        const result = await indexPriceService.fullUpdate();
        console.log('[Index Update] Completed:', result);
      } catch (error) {
        console.error('[Index Update] Error:', error.message);
      }
    });
  } catch (error) {
    console.error('Error updating ETF indices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/indices/alpha/calculate
 * Recalculate alpha for all stocks
 */
router.post('/alpha/calculate', (req, res) => {
  try {
    const db = req.app.get('db');
    const indexPriceService = new IndexPriceService(db);
    const result = indexPriceService.calculateAlphaForAll();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error calculating alpha:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Parameterized Routes (must come LAST)
// ============================================

/**
 * GET /api/indices/:symbol
 * Get single index by symbol
 */
router.get('/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    // URL decode the symbol (^GSPC comes as %5EGSPC)
    const decodedSymbol = decodeURIComponent(symbol);

    const index = IndexService.getIndexBySymbol(decodedSymbol);

    if (!index) {
      return res.status(404).json({
        success: false,
        error: `Index ${decodedSymbol} not found`
      });
    }

    res.json({
      success: true,
      data: index
    });
  } catch (error) {
    console.error('Error fetching index:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch index'
    });
  }
});

/**
 * GET /api/indices/:symbol/prices
 * Get historical prices for an index
 * Query params:
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 *   - limit: number (default 252)
 */
router.get('/:symbol/prices', (req, res) => {
  try {
    const { symbol } = req.params;
    const decodedSymbol = decodeURIComponent(symbol);
    const { startDate, endDate, limit, period } = req.query;

    // Calculate start date based on period if provided
    let calculatedStartDate = startDate;
    let calculatedLimit = limit ? parseInt(limit) : null;

    if (period && !startDate) {
      const now = new Date();
      const periodMap = {
        '1m': 30,
        '3m': 90,
        '6m': 180,
        '1y': 365,
        '2y': 730,
        '3y': 1095,
        '5y': 1825,
        '10y': 3650,
        'max': null, // No limit - get all data
        'all': null  // Alias for max
      };

      const days = periodMap[period];
      if (days !== undefined) {
        if (days === null) {
          // 'max'/'all' - no date limit, no record limit
          // Explicitly set to null and skip the default below
          calculatedLimit = null;
          calculatedStartDate = 'max'; // Flag to skip default limit
        } else {
          const startDateObj = new Date(now);
          startDateObj.setDate(startDateObj.getDate() - days);
          calculatedStartDate = startDateObj.toISOString().split('T')[0];
        }
      }
    }

    // Default to 1 year if no period or dates specified
    if (!calculatedStartDate && calculatedLimit === undefined) {
      calculatedLimit = 252;
    }

    // Clear the 'max' flag
    if (calculatedStartDate === 'max') {
      calculatedStartDate = null;
    }

    const prices = IndexService.getHistoricalPrices(decodedSymbol, {
      startDate: calculatedStartDate,
      endDate,
      limit: calculatedLimit
    });

    res.json({
      success: true,
      symbol: decodedSymbol,
      count: prices.length,
      data: prices
    });
  } catch (error) {
    console.error('Error fetching index prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch index prices'
    });
  }
});

/**
 * GET /api/indices/:symbol/returns
 * Get period returns for an index
 */
router.get('/:symbol/returns', (req, res) => {
  try {
    const { symbol } = req.params;
    const decodedSymbol = decodeURIComponent(symbol);

    const returns = IndexService.getIndexReturns(decodedSymbol);

    if (!returns) {
      return res.status(404).json({
        success: false,
        error: `Returns for ${decodedSymbol} not found`
      });
    }

    res.json({
      success: true,
      symbol: decodedSymbol,
      data: returns
    });
  } catch (error) {
    console.error('Error fetching index returns:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch index returns'
    });
  }
});

/**
 * GET /api/indices/:symbol/compare/:companyId
 * Compare company performance against index
 * Query params:
 *   - period: '1m', '3m', '6m', '1y', 'ytd' (default '1y')
 */
router.get('/:symbol/compare/:companyId', (req, res) => {
  try {
    const { symbol, companyId } = req.params;
    const { period = '1y' } = req.query;
    const decodedSymbol = decodeURIComponent(symbol);

    const comparison = IndexService.compareToIndex(
      parseInt(companyId),
      decodedSymbol,
      period
    );

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error comparing to index:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to compare to index'
    });
  }
});

/**
 * GET /api/indices/:symbol/normalized
 * Get normalized price series for charting (base 100)
 * Query params:
 *   - companyId: company to compare (optional)
 *   - period: '1m', '3m', '6m', '1y', '2y', '5y' (default '1y')
 */
router.get('/:symbol/normalized', (req, res) => {
  try {
    const { symbol } = req.params;
    const { companyId, period = '1y' } = req.query;
    const decodedSymbol = decodeURIComponent(symbol);

    const data = IndexService.getNormalizedPrices(
      decodedSymbol,
      companyId ? parseInt(companyId) : null,
      period
    );

    res.json({
      success: true,
      period,
      data
    });
  } catch (error) {
    console.error('Error fetching normalized prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch normalized prices'
    });
  }
});

module.exports = router;
