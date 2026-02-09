/**
 * Risk Management API Routes
 *
 * Endpoints for margin of safety, Buffett-Taleb risk checks,
 * barbell allocation, drawdown management, and tail hedges.
 */

const express = require('express');
const router = express.Router();
const db = require('../../database');
const {
  MarginOfSafetyCalculator,
  BuffettTalebRiskManager
} = require('../../services/riskManagement');

// Initialize services
let mosCalculator, riskManager;

function initServices() {
  if (!mosCalculator) {
    const dbConn = db.getDatabase();
    mosCalculator = new MarginOfSafetyCalculator(dbConn);
    riskManager = new BuffettTalebRiskManager(dbConn);
  }
}

// ============================================
// Margin of Safety Endpoints
// ============================================

/**
 * GET /api/risk/margin-of-safety/:companyId
 * Get intrinsic value and margin of safety for a company
 */
router.get('/margin-of-safety/:companyId', async (req, res) => {
  try {
    initServices();
    const { companyId } = req.params;
    const { recalc = false } = req.query;

    const result = await mosCalculator.calculateIntrinsicValue(
      parseInt(companyId),
      { forceRecalcDCF: recalc === 'true' }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/margin-of-safety/symbol/:symbol
 * Get intrinsic value by symbol
 */
router.get('/margin-of-safety/symbol/:symbol', async (req, res) => {
  try {
    initServices();
    const { symbol } = req.params;
    const { recalc = false } = req.query;

    const dbConn = db.getDatabase();
    const company = await dbConn.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const result = await mosCalculator.calculateIntrinsicValue(
      company.id,
      { forceRecalcDCF: recalc === 'true' }
    );

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/undervalued
 * Get list of undervalued stocks
 */
router.get('/undervalued', async (req, res) => {
  try {
    initServices();
    const { minMargin = 0.25, limit = 50 } = req.query;

    const stocks = await mosCalculator.getUndervaluedStocks(
      parseFloat(minMargin),
      parseInt(limit)
    );

    res.json({
      minMargin: parseFloat(minMargin),
      count: stocks.length,
      results: stocks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/risk/margin-of-safety/batch
 * Batch calculate intrinsic values
 */
router.post('/margin-of-safety/batch', async (req, res) => {
  try {
    initServices();
    const { companyIds, options = {} } = req.body;

    if (!companyIds || !Array.isArray(companyIds)) {
      return res.status(400).json({ error: 'companyIds array required' });
    }

    const results = await mosCalculator.batchCalculate(companyIds, options);

    res.json({
      calculated: results.length,
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Risk Configuration Endpoints
// ============================================

/**
 * GET /api/risk/config/:portfolioId
 * Get risk configuration for a portfolio
 */
router.get('/config/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const config = await riskManager.getConfig(parseInt(portfolioId));

    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/risk/config/:portfolioId
 * Update risk configuration for a portfolio
 */
router.put('/config/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;
    const config = req.body;

    const updatedConfig = await riskManager.saveConfig(parseInt(portfolioId), config);

    res.json({
      message: 'Risk configuration updated',
      config: updatedConfig
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Trade Risk Assessment Endpoints
// ============================================

/**
 * POST /api/risk/assess/:portfolioId
 * Full risk assessment for a proposed trade
 */
router.post('/assess/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;
    const { companyId, positionValue, symbol, options = {} } = req.body;

    // If symbol provided instead of companyId, look it up
    let targetCompanyId = companyId;
    if (!targetCompanyId && symbol) {
      const dbConn = db.getDatabase();
      const company = await dbConn.prepare('SELECT id FROM companies WHERE symbol = ?').get(symbol.toUpperCase());
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }
      targetCompanyId = company.id;
    }

    if (!targetCompanyId) {
      return res.status(400).json({ error: 'companyId or symbol required' });
    }

    const assessment = await riskManager.assessTradeRisk(
      parseInt(portfolioId),
      targetCompanyId,
      positionValue || 0,
      options
    );

    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Barbell Allocation Endpoints
// ============================================

/**
 * GET /api/risk/barbell/:portfolioId
 * Get barbell allocation analysis for a portfolio
 */
router.get('/barbell/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const barbell = await riskManager.checkBarbellAllocation(parseInt(portfolioId));

    res.json(barbell);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Concentration Endpoints
// ============================================

/**
 * GET /api/risk/concentration/:portfolioId
 * Check concentration limits for a portfolio
 */
router.get('/concentration/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const concentration = await riskManager.checkConcentration(parseInt(portfolioId));

    res.json(concentration);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Drawdown Endpoints
// ============================================

/**
 * GET /api/risk/drawdown/:portfolioId
 * Get drawdown status for a portfolio
 */
router.get('/drawdown/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const drawdown = await riskManager.checkDrawdown(parseInt(portfolioId));

    res.json(drawdown);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/drawdown/:portfolioId/history
 * Get drawdown history for a portfolio
 */
router.get('/drawdown/:portfolioId/history', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const dbConn = db.getDatabase();
    const history = await dbConn.prepare(`
      SELECT * FROM drawdown_history
      WHERE portfolio_id = ?
      ORDER BY start_date DESC
      LIMIT ?
    `).all(parseInt(portfolioId), parseInt(limit));

    res.json({
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Tail Hedge Endpoints
// ============================================

/**
 * GET /api/risk/tail-hedge/:portfolioId
 * Get tail hedge recommendation for a portfolio
 */
router.get('/tail-hedge/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const recommendation = await riskManager.getTailHedgeRecommendation(parseInt(portfolioId));

    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Circle of Competence Endpoints
// ============================================

/**
 * GET /api/risk/competence/:portfolioId/:companyId
 * Check if company is within circle of competence
 */
router.get('/competence/:portfolioId/:companyId', async (req, res) => {
  try {
    initServices();
    const { portfolioId, companyId } = req.params;

    const competence = await riskManager.checkCircleOfCompetence(
      parseInt(companyId),
      parseInt(portfolioId)
    );

    res.json(competence);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Risk Events Endpoints
// ============================================

/**
 * GET /api/risk/events/:portfolioId
 * Get risk events for a portfolio
 */
router.get('/events/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;
    const { limit = 50, severity, unresolved } = req.query;

    const events = await riskManager.getRiskEvents(parseInt(portfolioId), {
      limit: parseInt(limit),
      severity,
      unresolved: unresolved === 'true'
    });

    res.json({
      count: events.length,
      events
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/risk/events/:eventId/resolve
 * Resolve a risk event
 */
router.post('/events/:eventId/resolve', async (req, res) => {
  try {
    initServices();
    const { eventId } = req.params;
    const { action, resolvedBy } = req.body;

    const dbConn = db.getDatabase();
    await dbConn.prepare(`
      UPDATE risk_events SET
        resolved = 1,
        resolution_action = ?,
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = ?
      WHERE id = ?
    `).run(action, resolvedBy, parseInt(eventId));

    res.json({ message: 'Risk event resolved', eventId: parseInt(eventId) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Portfolio Summary Endpoints
// ============================================

/**
 * GET /api/risk/summary/:portfolioId
 * Get comprehensive risk summary for a portfolio
 */
router.get('/summary/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const summary = await riskManager.getPortfolioRiskSummary(parseInt(portfolioId));

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/risk/health/:portfolioId
 * Get simple health score for a portfolio
 */
router.get('/health/:portfolioId', async (req, res) => {
  try {
    initServices();
    const { portfolioId } = req.params;

    const summary = await riskManager.getPortfolioRiskSummary(parseInt(portfolioId));

    res.json({
      portfolioId: parseInt(portfolioId),
      health: summary.overallHealth
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
