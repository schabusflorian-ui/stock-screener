/**
 * API Routes for Market Indices
 * Provides endpoints for S&P 500, Dow Jones, NASDAQ, Russell 2000 data
 */

const express = require('express');
const router = express.Router();
const IndexService = require('../../services/indexService');

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
    const { startDate, endDate, limit } = req.query;

    const prices = IndexService.getHistoricalPrices(decodedSymbol, {
      startDate,
      endDate,
      limit: limit ? parseInt(limit) : 252
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
