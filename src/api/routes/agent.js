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
      query += ' AND ro.signal_type = ?';
    }

    query += ' ORDER BY ro.updated_at DESC LIMIT ?';

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

// ============================================
// AGENT CONTROL DASHBOARD ENDPOINTS
// ============================================

// In-memory state for agent status per portfolio
const agentState = new Map();

function getAgentState(portfolioId) {
  if (!agentState.has(portfolioId)) {
    agentState.set(portfolioId, {
      running: false,
      mode: 'paper',
      lastScan: null,
      nextScan: null,
      activities: []
    });
  }
  return agentState.get(portfolioId);
}

function logActivity(portfolioId, type, message, details = null) {
  const state = getAgentState(portfolioId);
  const activity = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type,
    message,
    details
  };
  state.activities.unshift(activity);
  if (state.activities.length > 100) {
    state.activities = state.activities.slice(0, 100);
  }
  return activity;
}

/**
 * GET /api/agent/portfolios/:portfolioId/status
 * Get agent status
 */
router.get('/portfolios/:portfolioId/status', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const state = getAgentState(parseInt(portfolioId, 10));
    res.json({
      running: state.running,
      mode: state.mode,
      lastScan: state.lastScan,
      nextScan: state.nextScan
    });
  } catch (error) {
    console.error('Error getting agent status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agent/portfolios/:portfolioId/start
 * Start the agent
 */
router.post('/portfolios/:portfolioId/start', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const id = parseInt(portfolioId, 10);
    const state = getAgentState(id);

    state.running = true;
    if (state.mode === 'paused') state.mode = 'paper';

    const nextScan = new Date();
    nextScan.setMinutes(nextScan.getMinutes() + 30);
    state.nextScan = nextScan.toISOString();

    logActivity(id, 'started', 'Agent started');

    res.json({ success: true, running: state.running, mode: state.mode, nextScan: state.nextScan });
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agent/portfolios/:portfolioId/pause
 * Pause the agent
 */
router.post('/portfolios/:portfolioId/pause', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const id = parseInt(portfolioId, 10);
    const state = getAgentState(id);

    state.running = false;
    state.mode = 'paused';
    state.nextScan = null;

    logActivity(id, 'paused', 'Agent paused');

    res.json({ success: true, running: state.running, mode: state.mode });
  } catch (error) {
    console.error('Error pausing agent:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/agent/portfolios/:portfolioId/scan
 * Run immediate scan
 */
router.post('/portfolios/:portfolioId/scan', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const id = parseInt(portfolioId, 10);
    const state = getAgentState(id);
    const database = db.getDatabase();

    logActivity(id, 'scan', 'Starting manual scan...');

    const positions = database.prepare(`
      SELECT DISTINCT symbol FROM portfolio_positions
      WHERE portfolio_id = ? AND quantity > 0
    `).all(id);

    const scannedCount = positions.length || 0;
    state.lastScan = new Date().toISOString();

    if (state.running) {
      const nextScan = new Date();
      nextScan.setMinutes(nextScan.getMinutes() + 30);
      state.nextScan = nextScan.toISOString();
    }

    logActivity(id, 'scan', `Scanned ${scannedCount} positions`, { count: scannedCount });

    res.json({ success: true, scanned: scannedCount, lastScan: state.lastScan, nextScan: state.nextScan });
  } catch (error) {
    console.error('Error running scan:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agent/portfolios/:portfolioId/activity
 * Get agent activity log
 */
router.get('/portfolios/:portfolioId/activity', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 50 } = req.query;
    const id = parseInt(portfolioId, 10);
    const state = getAgentState(id);
    const database = db.getDatabase();

    const recentExecutions = database.prepare(`
      SELECT id, symbol, action, status, approved_at, executed_at, rejected_at, target_value
      FROM pending_executions
      WHERE portfolio_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(id, parseInt(limit, 10));

    const executionActivities = recentExecutions.map(exec => {
      let type, message;
      if (exec.status === 'executed') {
        type = 'executed';
        message = `Executed ${exec.action.toUpperCase()} ${exec.symbol} - $${exec.target_value?.toLocaleString() || 0}`;
      } else if (exec.status === 'rejected') {
        type = 'rejected';
        message = `Rejected ${exec.action.toUpperCase()} ${exec.symbol}`;
      } else if (exec.status === 'pending') {
        type = 'pending';
        message = `Queued ${exec.action.toUpperCase()} ${exec.symbol} - awaiting approval`;
      } else {
        type = 'scan';
        message = `${exec.action.toUpperCase()} ${exec.symbol} - ${exec.status}`;
      }
      return {
        id: exec.id,
        timestamp: exec.executed_at || exec.approved_at || exec.rejected_at,
        type,
        message,
        details: { symbol: exec.symbol, action: exec.action }
      };
    }).filter(a => a.timestamp);

    const allActivities = [...state.activities, ...executionActivities]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit, 10));

    res.json(allActivities);
  } catch (error) {
    console.error('Error getting activity:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agent/portfolios/:portfolioId/context
 * Get market context
 */
router.get('/portfolios/:portfolioId/context', (req, res) => {
  try {
    const database = db.getDatabase();

    let regime = 'NEUTRAL', regimeConfidence = 0.5, vix = null, vixLevel = null;

    try {
      const regimeData = database.prepare(`
        SELECT regime, confidence, vix_value, vix_level
        FROM market_regime_history
        ORDER BY date DESC LIMIT 1
      `).get();

      if (regimeData) {
        regime = regimeData.regime || 'NEUTRAL';
        regimeConfidence = regimeData.confidence || 0.5;
        vix = regimeData.vix_value;
        vixLevel = regimeData.vix_level;
      }
    } catch (e) { /* Table may not exist */ }

    const signalStrength = { positive: 0, negative: 0, neutral: 0 };
    try {
      const signals = database.prepare(`
        SELECT signal_type, score FROM agent_signals
        WHERE date(created_at) = date('now')
      `).all();

      signals.forEach(s => {
        if (s.score > 0.2) signalStrength.positive++;
        else if (s.score < -0.2) signalStrength.negative++;
        else signalStrength.neutral++;
      });
    } catch (e) { /* Table may not exist */ }

    let positionAdjustment = 'Normal';
    if (regime === 'HIGH_VOL' || regime === 'CRISIS') positionAdjustment = 'Reduced';

    res.json({
      regime,
      regimeConfidence,
      vix,
      vixLevel,
      breadth: null,
      breadthLevel: null,
      signalStrength,
      positionAdjustment
    });
  } catch (error) {
    console.error('Error getting market context:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agent/portfolios/:portfolioId/stats/today
 * Get today's stats
 */
router.get('/portfolios/:portfolioId/stats/today', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const database = db.getDatabase();

    const stats = database.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as executed,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM pending_executions
      WHERE portfolio_id = ? AND date(created_at) = date('now')
    `).get(parseInt(portfolioId, 10));

    const winRate = stats.executed > 0 ? Math.round((stats.executed / (stats.executed + stats.rejected || 1)) * 100) : 0;

    let signalsGenerated = 0;
    try {
      const signalCount = database.prepare(`
        SELECT COUNT(*) as count FROM agent_signals WHERE date(created_at) = date('now')
      `).get();
      signalsGenerated = signalCount?.count || 0;
    } catch (e) { /* Table may not exist */ }

    const total = (stats.executed || 0) + (stats.rejected || 0);
    const approvalRate = total > 0 ? Math.round(((stats.executed || 0) / total) * 100) : 0;

    res.json({
      executed: stats.executed || 0,
      winRate,
      pnl: 0,
      signalsGenerated,
      approvalRate
    });
  } catch (error) {
    console.error('Error getting today stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/agent/portfolios/:portfolioId/settings
 * Get agent settings
 */
router.get('/portfolios/:portfolioId/settings', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const database = db.getDatabase();

    let settings = null;
    try {
      settings = database.prepare('SELECT * FROM execution_settings WHERE portfolio_id = ?')
        .get(parseInt(portfolioId, 10));
    } catch (e) { /* Table may not exist */ }

    let riskLimits = null;
    try {
      riskLimits = database.prepare('SELECT * FROM risk_limits WHERE portfolio_id = ?')
        .get(parseInt(portfolioId, 10));
    } catch (e) { /* Table may not exist */ }

    res.json({
      execution: settings || {
        autoExecute: false,
        minConfidence: 0.6,
        maxTradesPerDay: 5,
        requireConfirmation: true
      },
      riskLimits: riskLimits || {
        maxPositionSize: 0.05,
        maxSectorExposure: 0.30,
        minCashReserve: 0.05
      }
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/agent/portfolios/:portfolioId/settings
 * Update agent settings
 */
router.put('/portfolios/:portfolioId/settings', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { execution, mode } = req.body;
    const id = parseInt(portfolioId, 10);
    const database = db.getDatabase();

    if (mode) {
      const state = getAgentState(id);
      state.mode = mode;
      logActivity(id, 'configured', `Mode changed to ${mode}`);
    }

    if (execution) {
      database.prepare(`
        INSERT OR REPLACE INTO execution_settings (
          portfolio_id, auto_execute, min_confidence, max_trades_per_day, require_confirmation
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        execution.autoExecute ? 1 : 0,
        execution.minConfidence || 0.6,
        execution.maxTradesPerDay || 5,
        execution.requireConfirmation ? 1 : 0
      );
    }

    logActivity(id, 'configured', 'Settings updated');

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
