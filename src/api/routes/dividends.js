/**
 * API Routes for Dividend Data
 * Provides endpoints for dividend yields, aristocrats, history, etc.
 */

const express = require('express');
const router = express.Router();
const DividendService = require('../../services/dividendService');

/**
 * GET /api/dividends/summary
 * Get overall dividend statistics
 */
router.get('/summary', (req, res) => {
  try {
    const summary = DividendService.getDividendSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching dividend summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend summary'
    });
  }
});

/**
 * GET /api/dividends/top-yielders
 * Get stocks with highest dividend yields
 */
router.get('/top-yielders', (req, res) => {
  try {
    const { minYield, maxYield, sector, minYearsGrowth, limit } = req.query;

    const yielders = DividendService.getTopDividendYielders({
      minYield: minYield ? parseFloat(minYield) : 0,
      maxYield: maxYield ? parseFloat(maxYield) : 20,
      sector: sector || null,
      minYearsGrowth: minYearsGrowth ? parseInt(minYearsGrowth) : 0,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({
      success: true,
      count: yielders.length,
      data: yielders
    });
  } catch (error) {
    console.error('Error fetching top yielders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top dividend yielders'
    });
  }
});

/**
 * GET /api/dividends/aristocrats
 * Get dividend aristocrats (25+ years growth)
 */
router.get('/aristocrats', (req, res) => {
  try {
    const aristocrats = DividendService.getDividendAristocrats();
    res.json({
      success: true,
      count: aristocrats.length,
      data: aristocrats
    });
  } catch (error) {
    console.error('Error fetching dividend aristocrats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend aristocrats'
    });
  }
});

/**
 * GET /api/dividends/kings
 * Get dividend kings (50+ years growth)
 */
router.get('/kings', (req, res) => {
  try {
    const kings = DividendService.getDividendKings();
    res.json({
      success: true,
      count: kings.length,
      data: kings
    });
  } catch (error) {
    console.error('Error fetching dividend kings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend kings'
    });
  }
});

/**
 * GET /api/dividends/upcoming
 * Get upcoming ex-dividend dates
 */
router.get('/upcoming', (req, res) => {
  try {
    const { days } = req.query;
    const upcoming = DividendService.getUpcomingExDividends(
      days ? parseInt(days) : 14
    );
    res.json({
      success: true,
      count: upcoming.length,
      data: upcoming
    });
  } catch (error) {
    console.error('Error fetching upcoming ex-dividends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming ex-dividend dates'
    });
  }
});

/**
 * GET /api/dividends/growth-leaders
 * Get companies with highest dividend growth
 */
router.get('/growth-leaders', (req, res) => {
  try {
    const { period, limit } = req.query;
    const leaders = DividendService.getDividendGrowthLeaders(
      period || '5y',
      limit ? parseInt(limit) : 50
    );
    res.json({
      success: true,
      count: leaders.length,
      data: leaders
    });
  } catch (error) {
    console.error('Error fetching dividend growth leaders:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend growth leaders'
    });
  }
});

/**
 * GET /api/dividends/by-sector
 * Get dividend statistics grouped by sector
 */
router.get('/by-sector', (req, res) => {
  try {
    const sectors = DividendService.getDividendsBySector();
    res.json({
      success: true,
      data: sectors
    });
  } catch (error) {
    console.error('Error fetching dividends by sector:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sector dividend data'
    });
  }
});

/**
 * GET /api/dividends/screen
 * Screen dividend stocks based on criteria
 */
router.get('/screen', (req, res) => {
  try {
    const {
      minYield, maxYield,
      minPayoutRatio, maxPayoutRatio,
      minYearsGrowth, minGrowth5y,
      sector, sp500Only,
      aristocratsOnly, kingsOnly,
      sortBy, sortOrder, limit
    } = req.query;

    const results = DividendService.screenDividendStocks({
      minYield: minYield ? parseFloat(minYield) : null,
      maxYield: maxYield ? parseFloat(maxYield) : null,
      minPayoutRatio: minPayoutRatio ? parseFloat(minPayoutRatio) : null,
      maxPayoutRatio: maxPayoutRatio ? parseFloat(maxPayoutRatio) : null,
      minYearsGrowth: minYearsGrowth ? parseInt(minYearsGrowth) : null,
      minGrowth5y: minGrowth5y ? parseFloat(minGrowth5y) : null,
      sector: sector || null,
      sp500Only: sp500Only === 'true',
      aristocratsOnly: aristocratsOnly === 'true',
      kingsOnly: kingsOnly === 'true',
      sortBy: sortBy || 'dividend_yield',
      sortOrder: sortOrder || 'DESC',
      limit: limit ? parseInt(limit) : 100
    });

    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('Error screening dividend stocks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to screen dividend stocks'
    });
  }
});

/**
 * GET /api/dividends/company/:symbol
 * Get dividend metrics for a specific company
 */
router.get('/company/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const metrics = DividendService.getDividendMetricsBySymbol(symbol.toUpperCase());

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: `No dividend data found for ${symbol}`
      });
    }

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching company dividend metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend metrics'
    });
  }
});

/**
 * GET /api/dividends/company/:symbol/history
 * Get dividend payment history for a specific company
 */
router.get('/company/:symbol/history', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit } = req.query;

    // First get company ID
    const db = require('../../database').getDatabase();
    const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({
        success: false,
        error: `Company ${symbol} not found`
      });
    }

    const history = DividendService.getDividendHistory(
      company.id,
      limit ? parseInt(limit) : 40
    );

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      count: history.length,
      data: history
    });
  } catch (error) {
    console.error('Error fetching dividend history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dividend history'
    });
  }
});

module.exports = router;
