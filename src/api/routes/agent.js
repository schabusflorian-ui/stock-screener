// src/api/routes/agent.js
// API routes for AI Trading Agent

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { getTradingAgent, getRiskManager, getScanner } = require('../../services/agent');
const { SignalOptimizer } = require('../../services/agent/signalOptimizer');
const { RecommendationTracker } = require('../../services/agent/recommendationTracker');

// Initialize services lazily
let tradingAgent = null;
let riskManager = null;
let scanner = null;
let signalOptimizer = null;
let recommendationTracker = null;

function ensureServices() {
  const database = db.getDatabase();
  if (!tradingAgent) tradingAgent = getTradingAgent(database);
  if (!riskManager) riskManager = getRiskManager(database);
  if (!scanner) scanner = getScanner(database);
  if (!signalOptimizer) signalOptimizer = new SignalOptimizer(database);
  if (!recommendationTracker) recommendationTracker = new RecommendationTracker(database);
}

// ============================================
// RECOMMENDATION ENDPOINTS
// ============================================

/**
 * GET /api/agent/recommendation/:symbol
 * Get trading recommendation for a symbol
 */
router.get('/recommendation/:symbol', async (req, res) => {
  try {
    ensureServices();
    const { symbol } = req.params;
    const portfolioId = req.query.portfolioId ? parseInt(req.query.portfolioId) : null;

    // Get portfolio context if provided
    let portfolioContext = null;
    if (portfolioId) {
      const database = db.getDatabase();
      const portfolio = database.prepare('SELECT * FROM portfolios WHERE id = ?').get(portfolioId);
      const positions = database.prepare(`
        SELECT pp.*, c.symbol, c.sector
        FROM portfolio_positions pp
        JOIN companies c ON pp.company_id = c.id
        WHERE pp.portfolio_id = ?
      `).all(portfolioId);

      if (portfolio) {
        const totalValue = positions.reduce((sum, p) => sum + (p.current_value || 0), 0);
        portfolioContext = {
          portfolioId,
          positions,
          totalValue,
          cash: portfolio.current_cash || 0,
        };
      }
    }

    const recommendation = await tradingAgent.getRecommendation(symbol, portfolioContext);

    res.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agent/recommendation
 * Get recommendation with full context in body
 */
router.post('/recommendation', async (req, res) => {
  try {
    ensureServices();
    const { symbol, portfolioId, portfolioContext, regime } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const recommendation = await tradingAgent.getRecommendation(
      symbol,
      portfolioContext || null,
      regime || null
    );

    // Run risk check if portfolioId provided
    let riskCheck = null;
    if (portfolioId && recommendation.action !== 'hold') {
      riskCheck = await riskManager.validate(recommendation, portfolioId, regime);
    }

    res.json({
      success: true,
      recommendation,
      riskCheck,
      actionable: riskCheck ? riskCheck.approved : true,
    });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agent/batch
 * Get recommendations for multiple symbols
 */
router.post('/batch', async (req, res) => {
  try {
    ensureServices();
    const { symbols, portfolioId, portfolioContext, regime } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required',
      });
    }

    const result = await tradingAgent.batchRecommendations(
      symbols,
      portfolioContext || null,
      regime || null
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error getting batch recommendations:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/history/:symbol
 * Get recommendation history for a symbol
 */
router.get('/history/:symbol', (req, res) => {
  try {
    ensureServices();
    const { symbol } = req.params;
    const days = parseInt(req.query.days) || 30;

    const history = tradingAgent.getRecommendationHistory(symbol, days);

    res.json({
      success: true,
      symbol,
      days,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error getting recommendation history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/latest/:symbol
 * Get latest recommendation for a symbol
 */
router.get('/latest/:symbol', (req, res) => {
  try {
    ensureServices();
    const { symbol } = req.params;

    const recommendation = tradingAgent.getLatestRecommendation(symbol);

    if (!recommendation) {
      return res.status(404).json({
        success: false,
        error: `No recommendation found for ${symbol}`,
      });
    }

    res.json({
      success: true,
      recommendation,
    });
  } catch (error) {
    console.error('Error getting latest recommendation:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// RISK CHECK ENDPOINTS
// ============================================

/**
 * POST /api/agent/risk-check
 * Validate a recommendation against risk limits
 */
router.post('/risk-check', async (req, res) => {
  try {
    ensureServices();
    const { recommendation, portfolioId, regime } = req.body;

    if (!recommendation || !portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'Recommendation and portfolioId are required',
      });
    }

    const riskCheck = await riskManager.validate(
      recommendation,
      parseInt(portfolioId),
      regime || null
    );

    res.json({
      success: true,
      riskCheck,
    });
  } catch (error) {
    console.error('Error running risk check:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/risk-history/:portfolioId
 * Get risk check history for a portfolio
 */
router.get('/risk-history/:portfolioId', (req, res) => {
  try {
    ensureServices();
    const { portfolioId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const history = riskManager.getRiskCheckHistory(parseInt(portfolioId), limit);

    res.json({
      success: true,
      portfolioId: parseInt(portfolioId),
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error getting risk history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/risk-limits
 * Get current risk limits
 */
router.get('/risk-limits', (req, res) => {
  try {
    ensureServices();
    const limits = riskManager.getLimits();

    res.json({
      success: true,
      limits,
    });
  } catch (error) {
    console.error('Error getting risk limits:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /api/agent/risk-limits
 * Update risk limits
 */
router.put('/risk-limits', (req, res) => {
  try {
    ensureServices();
    const newLimits = req.body;

    riskManager.updateLimits(newLimits);
    const limits = riskManager.getLimits();

    res.json({
      success: true,
      message: 'Risk limits updated',
      limits,
    });
  } catch (error) {
    console.error('Error updating risk limits:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// OPPORTUNITY SCANNER ENDPOINTS
// ============================================

/**
 * GET /api/agent/opportunities
 * Scan for trading opportunities
 */
router.get('/opportunities', async (req, res) => {
  try {
    ensureServices();
    const limit = parseInt(req.query.limit) || 20;
    const types = req.query.types ? req.query.types.split(',') : undefined;

    const result = await scanner.scan({ limit, types });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error scanning opportunities:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/agent/opportunities/symbols
 * Get opportunities for specific symbols
 */
router.post('/opportunities/symbols', async (req, res) => {
  try {
    ensureServices();
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({
        success: false,
        error: 'Symbols array is required',
      });
    }

    const result = await scanner.scanSymbols(symbols);

    res.json({
      success: true,
      count: result.length,
      opportunities: result,
    });
  } catch (error) {
    console.error('Error scanning symbols:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/agent/opportunities/sectors
 * Get sector breakdown of opportunities
 */
router.get('/opportunities/sectors', async (req, res) => {
  try {
    ensureServices();
    const sectors = await scanner.getSectorBreakdown();

    res.json({
      success: true,
      sectors,
    });
  } catch (error) {
    console.error('Error getting sector breakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// STATS & INFO ENDPOINTS
// ============================================

/**
 * GET /api/agent/stats
 * Get agent statistics
 */
router.get('/stats', (req, res) => {
  try {
    const database = db.getDatabase();

    const recStats = database.prepare(`
      SELECT
        COUNT(*) as total_recommendations,
        SUM(CASE WHEN action = 'strong_buy' THEN 1 ELSE 0 END) as strong_buys,
        SUM(CASE WHEN action = 'buy' THEN 1 ELSE 0 END) as buys,
        SUM(CASE WHEN action = 'hold' THEN 1 ELSE 0 END) as holds,
        SUM(CASE WHEN action = 'sell' THEN 1 ELSE 0 END) as sells,
        SUM(CASE WHEN action = 'strong_sell' THEN 1 ELSE 0 END) as strong_sells,
        AVG(confidence) as avg_confidence,
        AVG(ABS(score)) as avg_score
      FROM agent_recommendations
      WHERE date >= date('now', '-30 days')
    `).get();

    const recentRecs = database.prepare(`
      SELECT ar.*, c.symbol, c.name
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      ORDER BY ar.created_at DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      stats: recStats,
      recentRecommendations: recentRecs.map(r => ({
        ...r,
        reasoning: r.reasoning ? JSON.parse(r.reasoning) : [],
      })),
    });
  } catch (error) {
    console.error('Error getting agent stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// SIGNAL OPTIMIZER ENDPOINTS
// ============================================

/**
 * GET /api/agent/signal-weights
 * Get current optimized signal weights (default or all regimes)
 */
router.get('/signal-weights', (req, res) => {
  try {
    ensureServices();
    const { regime = 'ALL' } = req.query;

    const weights = signalOptimizer.getWeightsForRegime(regime);
    const comparison = signalOptimizer.getWeightComparison(regime);

    res.json({
      success: true,
      regime,
      weights,
      comparison
    });
  } catch (error) {
    console.error('Error getting signal weights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/signal-weights/:regime
 * Get optimized signal weights for a specific regime
 */
router.get('/signal-weights/:regime', (req, res) => {
  try {
    ensureServices();
    const { regime } = req.params;

    const storedWeights = signalOptimizer.getStoredWeights(regime);
    const comparison = signalOptimizer.getWeightComparison(regime);

    res.json({
      success: true,
      regime,
      ...storedWeights,
      comparison
    });
  } catch (error) {
    console.error('Error getting signal weights for regime:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/signal-weights-all
 * Get all stored weights for all regimes
 */
router.get('/signal-weights-all', (req, res) => {
  try {
    ensureServices();

    const allWeights = signalOptimizer.getAllStoredWeights();
    const baseWeights = signalOptimizer.baseWeights;

    res.json({
      success: true,
      baseWeights,
      regimeWeights: allWeights
    });
  } catch (error) {
    console.error('Error getting all signal weights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/signal-weights/recalculate
 * Trigger recalculation of signal weights for all regimes
 */
router.post('/signal-weights/recalculate', (req, res) => {
  try {
    ensureServices();

    const results = signalOptimizer.recalculateAllWeights();

    res.json({
      success: true,
      message: 'Signal weights recalculated for all regimes',
      results
    });
  } catch (error) {
    console.error('Error recalculating signal weights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/signal-contribution
 * Get signal contribution analysis
 */
router.get('/signal-contribution', (req, res) => {
  try {
    ensureServices();
    const { lookbackDays = 90 } = req.query;

    const analysis = signalOptimizer.getSignalContributionAnalysis(parseInt(lookbackDays));

    res.json({
      success: true,
      ...analysis
    });
  } catch (error) {
    console.error('Error getting signal contribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// RECOMMENDATION TRACKER ENDPOINTS
// ============================================

/**
 * GET /api/agent/tracker/performance
 * Get signal performance metrics
 */
router.get('/tracker/performance', (req, res) => {
  try {
    ensureServices();
    const { lookbackDays = 90 } = req.query;

    const { weights, ics } = recommendationTracker.getOptimalWeights(parseInt(lookbackDays));

    res.json({
      success: true,
      lookbackDays: parseInt(lookbackDays),
      optimizedWeights: weights,
      signalICs: ics
    });
  } catch (error) {
    console.error('Error getting tracker performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/tracker/ic/:signalType
 * Get Information Coefficient for a specific signal type
 */
router.get('/tracker/ic/:signalType', (req, res) => {
  try {
    ensureServices();
    const { signalType } = req.params;
    const { lookbackDays = 90 } = req.query;

    const ic = recommendationTracker.calculateSignalIC(signalType, parseInt(lookbackDays));

    res.json({
      success: true,
      signalType,
      lookbackDays: parseInt(lookbackDays),
      ...ic
    });
  } catch (error) {
    console.error('Error getting signal IC:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/tracker/outcomes
 * Get recent recommendation outcomes
 */
router.get('/tracker/outcomes', (req, res) => {
  try {
    const database = db.getDatabase();
    const { limit = 50, signalType } = req.query;

    let query = `
      SELECT ro.*, ar.action, ar.score, ar.confidence, c.symbol, c.name
      FROM recommendation_outcomes ro
      JOIN agent_recommendations ar ON ro.recommendation_id = ar.id
      JOIN companies c ON ar.company_id = c.id
      WHERE ro.actual_return IS NOT NULL
    `;

    if (signalType) {
      query += ` AND ro.signal_type = ?`;
    }

    query += ` ORDER BY ro.updated_at DESC LIMIT ?`;

    const outcomes = signalType
      ? database.prepare(query).all(signalType, parseInt(limit))
      : database.prepare(query).all(parseInt(limit));

    res.json({
      success: true,
      count: outcomes.length,
      outcomes
    });
  } catch (error) {
    console.error('Error getting tracker outcomes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/tracker/update-outcomes
 * Manually trigger outcome updates
 */
router.post('/tracker/update-outcomes', (req, res) => {
  try {
    ensureServices();

    const result = recommendationTracker.updateAllOutcomes();

    res.json({
      success: true,
      message: `Updated ${result.updated} outcomes (${result.errors} errors)`,
      ...result
    });
  } catch (error) {
    console.error('Error updating outcomes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/agent/tracker/recalculate
 * Recalculate signal performance metrics
 */
router.post('/tracker/recalculate', (req, res) => {
  try {
    ensureServices();

    recommendationTracker.recalculateSignalPerformance();

    res.json({
      success: true,
      message: 'Signal performance metrics recalculated'
    });
  } catch (error) {
    console.error('Error recalculating signal performance:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/agent/tracker/signal-summary
 * Get summary of all signal types' performance
 */
router.get('/tracker/signal-summary', (req, res) => {
  try {
    const database = db.getDatabase();

    // Get signal performance from database
    const summary = database.prepare(`
      SELECT
        signal_type,
        COUNT(*) as total_signals,
        SUM(CASE WHEN actual_return > 0 THEN 1 ELSE 0 END) as winning_signals,
        AVG(actual_return) as avg_return,
        AVG(ABS(predicted_return - actual_return)) as avg_error,
        MIN(updated_at) as oldest_signal,
        MAX(updated_at) as newest_signal
      FROM recommendation_outcomes
      WHERE actual_return IS NOT NULL
      GROUP BY signal_type
      ORDER BY avg_return DESC
    `).all();

    // Add hit rate calculation
    const enriched = summary.map(s => ({
      ...s,
      hitRate: s.total_signals > 0
        ? ((s.winning_signals / s.total_signals) * 100).toFixed(1) + '%'
        : 'N/A'
    }));

    res.json({
      success: true,
      signalTypes: enriched.length,
      summary: enriched
    });
  } catch (error) {
    console.error('Error getting signal summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
