// src/api/routes/attribution.js
// API Routes for Performance Attribution and Factor Analysis (Agent 3)

const express = require('express');
const router = express.Router();
const { PerformanceAttribution } = require('../../services/analytics/performanceAttribution');
const { RegimeDetector, REGIMES, REGIME_DESCRIPTIONS } = require('../../services/trading/regimeDetector');

// Helper to get database from request
const getDb = (req) => req.app.get('db');

// ============================================
// Market Regime Routes
// ============================================

/**
 * GET /api/attribution/regime
 * Get current market regime
 */
router.get('/regime', async (req, res) => {
  try {
    const db = getDb(req);
    const detector = new RegimeDetector(db);
    const regime = await detector.detectRegime();
    res.json({ success: true, data: regime });
  } catch (error) {
    console.error('Error getting regime:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/regime/history
 * Get regime history
 */
router.get('/regime/history', async (req, res) => {
  try {
    const db = getDb(req);
    const { days = 30 } = req.query;
    const detector = new RegimeDetector(db);
    const history = await detector.getRegimeHistory(parseInt(days));
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error getting regime history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/regime/definitions
 * Get regime definitions and descriptions
 */
router.get('/regime/definitions', (req, res) => {
  res.json({
    success: true,
    data: {
      regimes: REGIMES,
      descriptions: REGIME_DESCRIPTIONS
    }
  });
});

// ============================================
// Trade Attribution Routes
// ============================================

/**
 * GET /api/attribution/portfolios/:id/summary
 * Get attribution summary for a portfolio
 */
router.get('/portfolios/:id/summary', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '90d' } = req.query;
    const attribution = new PerformanceAttribution(db);
    const report = await attribution.generateAttributionReport(portfolioId, period);
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error getting attribution summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/portfolios/:id/factors
 * Get factor performance for a portfolio
 */
router.get('/portfolios/:id/factors', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '90d' } = req.query;
    const attribution = new PerformanceAttribution(db);
    const factors = await attribution.getFactorPerformance(portfolioId, period);
    res.json({ success: true, data: factors });
  } catch (error) {
    console.error('Error getting factor performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/portfolios/:id/regime
 * Get performance breakdown by market regime
 */
router.get('/portfolios/:id/regime', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '90d' } = req.query;
    const attribution = new PerformanceAttribution(db);
    const regimePerf = await attribution.getPerformanceByRegime(portfolioId, period);
    res.json({
      success: true,
      data: {
        portfolioId,
        period,
        regimes: regimePerf
      }
    });
  } catch (error) {
    console.error('Error getting regime performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/portfolios/:id/sector
 * Get performance breakdown by sector
 */
router.get('/portfolios/:id/sector', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '90d' } = req.query;
    const attribution = new PerformanceAttribution(db);
    const sectorPerf = await attribution.getPerformanceBySector(portfolioId, period);
    res.json({
      success: true,
      data: {
        portfolioId,
        period,
        sectors: sectorPerf
      }
    });
  } catch (error) {
    console.error('Error getting sector performance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/trade/:transactionId
 * Analyze a single trade and return factor attribution
 */
router.get('/trade/:transactionId', async (req, res) => {
  try {
    const db = getDb(req);
    const transactionId = parseInt(req.params.transactionId);
    const attribution = new PerformanceAttribution(db);
    const analysis = await attribution.analyzeTrade(transactionId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Trade not found or not eligible for attribution analysis'
      });
    }

    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Error analyzing trade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/attribution/portfolios/:id/analyze
 * Analyze trades for a portfolio in a date range
 */
router.post('/portfolios/:id/analyze', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const { period = '90d' } = req.body;

    const attribution = new PerformanceAttribution(db);
    const database = db.getDatabase ? db.getDatabase() : db;

    const periodDays = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all': 9999 };
    const days = periodDays[period] || 90;

    // Get all sell transactions
    const trades = database.prepare(`
      SELECT id
      FROM portfolio_transactions
      WHERE portfolio_id = ?
        AND transaction_type = 'sell'
        AND executed_at >= datetime('now', '-' || ? || ' days')
    `).all(portfolioId, days);

    let analyzed = 0;
    let failed = 0;
    const errors = [];

    for (const trade of trades) {
      try {
        const analysis = await attribution.analyzeTrade(trade.id);
        if (analysis) analyzed++;
      } catch (err) {
        failed++;
        errors.push({ transactionId: trade.id, error: err.message });
      }
    }

    res.json({
      success: true,
      data: {
        portfolioId,
        period,
        totalTrades: trades.length,
        analyzed,
        failed,
        errors: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Error analyzing trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Agent Recommendations Routes
// ============================================

/**
 * GET /api/attribution/recommendations
 * Get recent agent recommendations
 */
router.get('/recommendations', async (req, res) => {
  try {
    const db = getDb(req);
    const { portfolioId, limit = 20, executed } = req.query;

    let query = `SELECT ar.*, c.symbol, c.name as company_name
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      WHERE 1=1`;
    const params = [];

    if (portfolioId) {
      query += ' AND ar.portfolio_id = ?';
      params.push(parseInt(portfolioId));
    }
    if (executed !== undefined) {
      query += ' AND ar.was_executed = ?';
      params.push(executed === 'true' ? 1 : 0);
    }

    query += ' ORDER BY ar.created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const recommendations = await db.prepare(query).all(...params);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/recommendations/:id
 * Get a specific recommendation
 */
router.get('/recommendations/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const id = parseInt(req.params.id);
    const rec = await db.prepare(`SELECT ar.*, c.symbol, c.name as company_name
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      WHERE ar.id = ?`).get(id);
    if (!rec) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: rec });
  } catch (error) {
    console.error('Error getting recommendation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Opportunity Scanner Routes
// ============================================

/**
 * GET /api/attribution/portfolios/:id/recommendation
 * Get the latest recommendation for a portfolio
 */
router.get('/portfolios/:id/recommendation', (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);

    const rec = db.prepare(`
      SELECT ar.*, c.symbol, c.name as company_name
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      WHERE ar.portfolio_id = ?
      ORDER BY ar.created_at DESC
      LIMIT 1
    `).get(portfolioId);

    if (!rec) {
      return res.json({ success: true, data: null });
    }

    // Parse JSON fields
    if (rec.factors) rec.factors = JSON.parse(rec.factors);
    if (rec.risk_assessment) rec.risk_assessment = JSON.parse(rec.risk_assessment);

    res.json({ success: true, data: rec });
  } catch (error) {
    console.error('Error getting portfolio recommendation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/signals/:symbol
 * Get signal strength for a specific symbol
 */
router.get('/signals/:symbol', async (req, res) => {
  try {
    const db = getDb(req);
    const symbol = req.params.symbol.toUpperCase();

    // Get company
    const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol);
    if (!company) {
      return res.status(404).json({ success: false, error: 'Company not found' });
    }

    // Default signal data
    const signalData = {
      technical: { strength: 0.5, confidence: 0.5, signal: null },
      sentiment: { strength: 0.5, confidence: 0.5, signal: null },
      insider: { strength: 0.5, confidence: 0.5, signal: null },
      fundamental: { strength: 0.5, confidence: 0.5, signal: null },
      momentum: { strength: 0.5, confidence: 0.5, signal: null }
    };

    // Try to get from aggregated_signals table first
    const aggSignal = db.prepare(`
      SELECT * FROM aggregated_signals
      WHERE company_id = ?
      ORDER BY calculated_at DESC
      LIMIT 1
    `).get(company.id);

    if (aggSignal) {
      signalData.technical = {
        strength: (aggSignal.technical_score + 1) / 2, // Convert -1 to 1 range to 0-1
        confidence: aggSignal.technical_confidence || 0.5,
        signal: aggSignal.technical_signal
      };
      signalData.sentiment = {
        strength: (aggSignal.sentiment_score + 1) / 2,
        confidence: aggSignal.sentiment_confidence || 0.5,
        signal: aggSignal.sentiment_signal
      };
      signalData.insider = {
        strength: (aggSignal.insider_score + 1) / 2,
        confidence: aggSignal.insider_confidence || 0.5,
        signal: aggSignal.insider_signal
      };
      signalData.fundamental = {
        strength: (aggSignal.analyst_score + 1) / 2 || 0.5,
        confidence: aggSignal.analyst_confidence || 0.5,
        signal: aggSignal.analyst_signal
      };
      signalData.momentum = {
        strength: (aggSignal.weighted_score + 1) / 2,
        confidence: aggSignal.overall_confidence || 0.5,
        signal: aggSignal.overall_signal
      };

      return res.json({
        success: true,
        data: signalData,
        meta: {
          regime: aggSignal.market_regime,
          overallSignal: aggSignal.overall_signal,
          calculatedAt: aggSignal.calculated_at
        }
      });
    }

    res.json({ success: true, data: signalData });
  } catch (error) {
    console.error('Error getting signal strength:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/portfolios/:id/signals
 * Get aggregated signal strength for a portfolio's holdings
 */
router.get('/portfolios/:id/signals', async (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);

    // Default signal data
    const defaultSignals = {
      technical: { strength: 0.5, confidence: 0.5 },
      sentiment: { strength: 0.5, confidence: 0.5 },
      insider: { strength: 0.5, confidence: 0.5 },
      fundamental: { strength: 0.5, confidence: 0.5 },
      momentum: { strength: 0.5, confidence: 0.5 }
    };

    // Get portfolio positions (use portfolio_positions table)
    const positions = db.prepare(`
      SELECT pp.company_id, c.symbol
      FROM portfolio_positions pp
      JOIN companies c ON pp.company_id = c.id
      WHERE pp.portfolio_id = ? AND pp.shares > 0
    `).all(portfolioId);

    if (positions.length === 0) {
      return res.json({ success: true, data: defaultSignals });
    }

    // Aggregate signals across positions using aggregated_signals table
    const signalTotals = {
      technical: { strength: 0, confidence: 0, count: 0 },
      sentiment: { strength: 0, confidence: 0, count: 0 },
      insider: { strength: 0, confidence: 0, count: 0 },
      fundamental: { strength: 0, confidence: 0, count: 0 },
      momentum: { strength: 0, confidence: 0, count: 0 }
    };

    for (const pos of positions) {
      const aggSignal = db.prepare(`
        SELECT * FROM aggregated_signals
        WHERE company_id = ?
        ORDER BY calculated_at DESC
        LIMIT 1
      `).get(pos.company_id);

      if (aggSignal) {
        signalTotals.technical.strength += (aggSignal.technical_score + 1) / 2;
        signalTotals.technical.confidence += aggSignal.technical_confidence || 0.5;
        signalTotals.technical.count++;

        signalTotals.sentiment.strength += (aggSignal.sentiment_score + 1) / 2;
        signalTotals.sentiment.confidence += aggSignal.sentiment_confidence || 0.5;
        signalTotals.sentiment.count++;

        signalTotals.insider.strength += (aggSignal.insider_score + 1) / 2;
        signalTotals.insider.confidence += aggSignal.insider_confidence || 0.5;
        signalTotals.insider.count++;

        signalTotals.fundamental.strength += (aggSignal.analyst_score + 1) / 2 || 0.5;
        signalTotals.fundamental.confidence += aggSignal.analyst_confidence || 0.5;
        signalTotals.fundamental.count++;

        signalTotals.momentum.strength += (aggSignal.weighted_score + 1) / 2;
        signalTotals.momentum.confidence += aggSignal.overall_confidence || 0.5;
        signalTotals.momentum.count++;
      }
    }

    // Calculate averages
    const signalData = {};
    for (const [type, data] of Object.entries(signalTotals)) {
      signalData[type] = {
        strength: data.count > 0 ? data.strength / data.count : 0.5,
        confidence: data.count > 0 ? data.confidence / data.count : 0.5
      };
    }

    res.json({ success: true, data: signalData, positionCount: positions.length });
  } catch (error) {
    console.error('Error getting portfolio signals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/attribution/opportunities
 * Get scanned opportunities
 */
router.get('/opportunities', async (req, res) => {
  try {
    const db = getDb(req);
    const { limit = 50, triggerType, minScore = 0 } = req.query;

    let query = `SELECT osr.*, c.symbol, c.name as company_name
      FROM opportunity_scanner_results osr
      JOIN companies c ON osr.company_id = c.id
      WHERE osr.is_actionable = 1 AND osr.score >= ?`;
    const params = [parseFloat(minScore)];

    if (triggerType) {
      query += ' AND osr.trigger_type = ?';
      params.push(triggerType);
    }

    query += ' ORDER BY osr.score DESC, osr.scan_date DESC LIMIT ?';
    params.push(parseInt(limit));

    const opportunities = await db.prepare(query).all(...params);
    res.json({ success: true, data: opportunities });
  } catch (error) {
    console.error('Error getting opportunities:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Risk Limits Routes
// ============================================

/**
 * GET /api/attribution/portfolios/:id/risk-limits
 * Get risk limits for a portfolio
 */
router.get('/portfolios/:id/risk-limits', (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    let limits = db.prepare('SELECT * FROM portfolio_risk_limits WHERE portfolio_id = ?').get(portfolioId);

    if (!limits) {
      // Return defaults
      limits = {
        portfolio_id: portfolioId,
        max_position_size: 0.10,
        max_sector_exposure: 0.30,
        max_correlation: 0.70,
        max_drawdown: 0.20,
        min_cash_reserve: 0.05,
        vix_scaling_enabled: 1,
        vix_scale_threshold: 25,
        regime_scaling_enabled: 1,
        kelly_fraction_cap: 0.25,
        use_half_kelly: 1
      };
    }
    res.json({ success: true, data: limits });
  } catch (error) {
    console.error('Error getting risk limits:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/attribution/portfolios/:id/risk-limits
 * Update risk limits for a portfolio
 */
router.put('/portfolios/:id/risk-limits', (req, res) => {
  try {
    const db = getDb(req);
    const portfolioId = parseInt(req.params.id);
    const limits = req.body;

    // Check if exists
    const existing = db.prepare('SELECT id FROM portfolio_risk_limits WHERE portfolio_id = ?').get(portfolioId);

    if (existing) {
      db.prepare(`UPDATE portfolio_risk_limits SET
        max_position_size = COALESCE(?, max_position_size),
        max_sector_exposure = COALESCE(?, max_sector_exposure),
        max_correlation = COALESCE(?, max_correlation),
        max_drawdown = COALESCE(?, max_drawdown),
        min_cash_reserve = COALESCE(?, min_cash_reserve),
        vix_scaling_enabled = COALESCE(?, vix_scaling_enabled),
        vix_scale_threshold = COALESCE(?, vix_scale_threshold),
        vix_position_reduction = COALESCE(?, vix_position_reduction),
        regime_scaling_enabled = COALESCE(?, regime_scaling_enabled),
        kelly_fraction_cap = COALESCE(?, kelly_fraction_cap),
        use_half_kelly = COALESCE(?, use_half_kelly),
        updated_at = datetime('now')
        WHERE portfolio_id = ?`).run(
        limits.max_position_size, limits.max_sector_exposure, limits.max_correlation,
        limits.max_drawdown, limits.min_cash_reserve, limits.vix_scaling_enabled,
        limits.vix_scale_threshold, limits.vix_position_reduction, limits.regime_scaling_enabled,
        limits.kelly_fraction_cap, limits.use_half_kelly, portfolioId
      );
    } else {
      db.prepare(`INSERT INTO portfolio_risk_limits (portfolio_id, max_position_size,
        max_sector_exposure, max_correlation, max_drawdown, min_cash_reserve,
        vix_scaling_enabled, vix_scale_threshold, regime_scaling_enabled,
        kelly_fraction_cap, use_half_kelly)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        portfolioId, limits.max_position_size || 0.10, limits.max_sector_exposure || 0.30,
        limits.max_correlation || 0.70, limits.max_drawdown || 0.20,
        limits.min_cash_reserve || 0.05, limits.vix_scaling_enabled ?? 1,
        limits.vix_scale_threshold || 25, limits.regime_scaling_enabled ?? 1,
        limits.kelly_fraction_cap || 0.25, limits.use_half_kelly ?? 1
      );
    }

    const updated = db.prepare('SELECT * FROM portfolio_risk_limits WHERE portfolio_id = ?').get(portfolioId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating risk limits:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
