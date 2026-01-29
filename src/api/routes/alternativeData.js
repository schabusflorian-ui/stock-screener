/**
 * Alternative Data API Routes
 *
 * Endpoints for congressional trades, short interest, government contracts,
 * and aggregated alternative data signals.
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const {
  AlternativeDataAggregator,
  QuiverQuantitativeService,
  FinraShortInterestService
} = require('../../services/alternativeData');

// Initialize services
let aggregator, quiver, finra;

function initServices() {
  if (!aggregator) {
    const dbConn = db.getDatabase();
    aggregator = new AlternativeDataAggregator(dbConn);
    quiver = new QuiverQuantitativeService(dbConn);
    finra = new FinraShortInterestService(dbConn);
  }
}

// ============================================
// Congressional Trading Endpoints
// ============================================

/**
 * GET /api/alt-data/congress/top-buys
 * Get top congressional stock purchases
 * NOTE: This route must come BEFORE /congress/:symbol to avoid being matched as a symbol
 */
router.get('/congress/top-buys', (req, res) => {
  try {
    initServices();
    const { lookback = '-30 days', limit = 20 } = req.query;

    const topBuys = aggregator.getTopCongressBuys({
      lookbackDays: lookback,
      limit: parseInt(limit)
    });

    res.json({
      lookback,
      count: topBuys.length,
      results: topBuys
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/congress/:symbol
 * Get congressional trading activity for a symbol
 */
router.get('/congress/:symbol', (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;
    const { lookback = '-90 days' } = req.query;

    const signal = quiver.getCongressSignal(symbol.toUpperCase(), lookback);

    res.json({
      symbol: symbol.toUpperCase(),
      lookback,
      ...signal
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/congress/fetch/:symbol
 * Fetch fresh congressional data for a symbol
 */
router.post('/congress/fetch/:symbol', async (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;

    const result = await quiver.fetchCongressionalTrades(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Short Interest Endpoints
// ============================================

/**
 * GET /api/alt-data/short-interest/:symbol
 * Get short interest data for a symbol
 */
router.get('/short-interest/:symbol', (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;

    const signal = finra.getShortInterestSignal(symbol.toUpperCase());
    const trends = finra.analyzeShortTrends(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      current: signal,
      trends
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/short-interest/:symbol/history
 * Get short interest history for a symbol
 */
router.get('/short-interest/:symbol/history', (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;
    const { lookback = '-365 days' } = req.query;

    const history = finra.getHistory(symbol.toUpperCase(), lookback);

    res.json({
      symbol: symbol.toUpperCase(),
      lookback,
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/squeeze-candidates
 * Get potential short squeeze candidates
 */
router.get('/squeeze-candidates', (req, res) => {
  try {
    initServices();
    const { limit = 20 } = req.query;

    const candidates = aggregator.getSqueezeCandidatesWithContext(parseInt(limit));

    res.json({
      count: candidates.length,
      results: candidates
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/most-shorted
 * Get most shorted stocks
 */
router.get('/most-shorted', (req, res) => {
  try {
    initServices();
    const { limit = 20 } = req.query;

    const mostShorted = finra.getMostShorted(parseInt(limit));

    res.json({
      count: mostShorted.length,
      results: mostShorted
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/short-interest/update/:symbol
 * Update short interest for a symbol
 */
router.post('/short-interest/update/:symbol', async (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;

    const result = await finra.updateShortInterest(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Government Contracts Endpoints
// ============================================

/**
 * GET /api/alt-data/contracts/:symbol
 * Get government contract activity for a symbol
 */
router.get('/contracts/:symbol', (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;
    const { lookback = '-365 days' } = req.query;

    const signal = quiver.getContractSignal(symbol.toUpperCase(), lookback);

    res.json({
      symbol: symbol.toUpperCase(),
      lookback,
      ...signal
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/contracts/fetch/:symbol
 * Fetch fresh contract data for a symbol
 */
router.post('/contracts/fetch/:symbol', async (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;

    const result = await quiver.fetchGovernmentContracts(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Aggregated Signals Endpoints
// ============================================

/**
 * GET /api/alt-data/signals/:symbol
 * Get all alternative data signals for a symbol
 */
router.get('/signals/:symbol', (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;

    const signals = aggregator.getSignals(symbol.toUpperCase());
    const combined = aggregator.calculateCombinedScore(signals);
    const screening = aggregator.getScreeningData(symbol.toUpperCase());

    res.json({
      symbol: symbol.toUpperCase(),
      signals,
      combined,
      screening
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/signals/update/:symbol
 * Update all signals for a symbol (fetch fresh data)
 */
router.post('/signals/update/:symbol', async (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;
    const { fetchNew = true } = req.body;

    const result = await aggregator.updateSymbol(symbol.toUpperCase(), fetchNew);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/top-signals
 * Get top bullish alternative data signals
 */
router.get('/top-signals', (req, res) => {
  try {
    initServices();
    const { limit = 20, direction = 'bullish' } = req.query;

    const signals = direction === 'bearish'
      ? aggregator.getTopBearish(parseInt(limit))
      : aggregator.getTopBullish(parseInt(limit));

    res.json({
      direction,
      count: signals.length,
      results: signals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/alt-data/summary
 * Get summary of all alternative data signals
 */
router.get('/summary', (req, res) => {
  try {
    initServices();
    const summary = aggregator.getSummary();

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/batch-update
 * Batch update signals for multiple symbols
 */
router.post('/batch-update', async (req, res) => {
  try {
    initServices();
    const { symbols, fetchNew = false, limit } = req.body;

    let targetSymbols = symbols;

    // If no symbols provided, get top by market cap
    if (!targetSymbols || targetSymbols.length === 0) {
      const dbConn = db.getDatabase();
      const companies = dbConn.prepare(`
        SELECT c.symbol
        FROM companies c
        JOIN price_metrics pm ON pm.company_id = c.id
        WHERE c.symbol NOT LIKE 'CIK_%'
          AND pm.market_cap IS NOT NULL
        ORDER BY pm.market_cap DESC
        LIMIT ?
      `).all(limit || 100);
      targetSymbols = companies.map(c => c.symbol);
    }

    const results = await aggregator.batchUpdate(targetSymbols, { fetchNew });

    res.json({
      updated: results.length,
      symbols: results.map(r => r.symbol)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/alt-data/full-update
 * Run full alternative data update for top companies
 */
router.post('/full-update', async (req, res) => {
  try {
    initServices();
    const { limit = 100, fetchNew = true } = req.body;

    const summary = await aggregator.runFullUpdate({ limit, fetchNew });

    res.json({
      message: 'Full update complete',
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
