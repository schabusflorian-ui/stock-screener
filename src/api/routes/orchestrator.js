// src/api/routes/orchestrator.js
// API routes for Trading Orchestrator

const express = require('express');
const router = express.Router();
const db = require('../../database');
const { getOrchestrator } = require('../../services/agent');

// Initialize orchestrator lazily
let orchestrator = null;

function ensureOrchestrator() {
  if (!orchestrator) {
    orchestrator = getOrchestrator(db.getDatabase());
  }
  return orchestrator;
}

// ============================================
// DAILY ANALYSIS ENDPOINTS
// ============================================

/**
 * POST /api/orchestrator/run/:portfolioId
 * Run complete daily analysis for a portfolio
 */
router.post('/run/:portfolioId', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const portfolioId = parseInt(req.params.portfolioId);

    console.log(`API: Starting daily analysis for portfolio ${portfolioId}`);

    const analysis = await orch.runDailyAnalysis(portfolioId);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error running daily analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestrator/latest/:portfolioId
 * Get latest analysis for a portfolio
 */
router.get('/latest/:portfolioId', (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const portfolioId = parseInt(req.params.portfolioId);

    const analysis = orch.getLatestAnalysis(portfolioId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: `No analysis found for portfolio ${portfolioId}`,
      });
    }

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Error getting latest analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestrator/history/:portfolioId
 * Get analysis history for a portfolio
 */
router.get('/history/:portfolioId', (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const portfolioId = parseInt(req.params.portfolioId);
    const days = parseInt(req.query.days) || 30;

    const history = orch.getAnalysisHistory(portfolioId, days);

    res.json({
      success: true,
      portfolioId,
      days,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error getting analysis history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// QUICK ANALYSIS ENDPOINTS
// ============================================

/**
 * GET /api/orchestrator/quick-scan
 * Quick scan for opportunities without full analysis
 */
router.get('/quick-scan', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const limit = parseInt(req.query.limit) || 10;
    const types = req.query.types ? req.query.types.split(',') : undefined;

    const result = await orch.quickScan({ limit, types });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error running quick scan:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestrator/analyze/:symbol
 * Analyze a single symbol
 */
router.get('/analyze/:symbol', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const { symbol } = req.params;
    const portfolioId = req.query.portfolioId ? parseInt(req.query.portfolioId) : null;

    const result = await orch.analyzeSymbol(symbol, portfolioId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error analyzing symbol:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/orchestrator/analyze
 * Analyze symbol with options in body
 */
router.post('/analyze', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const { symbol, portfolioId } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const result = await orch.analyzeSymbol(symbol, portfolioId || null);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error analyzing symbol:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// MARKET REGIME ENDPOINTS
// ============================================

/**
 * GET /api/orchestrator/regime
 * Get current market regime
 */
router.get('/regime', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const regime = await orch.getCurrentRegime();

    res.json({
      success: true,
      regime,
    });
  } catch (error) {
    console.error('Error getting regime:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestrator/regime/history
 * Get market regime history
 */
router.get('/regime/history', (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const days = parseInt(req.query.days) || 30;

    const history = orch.getRegimeHistory(days);

    res.json({
      success: true,
      days,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('Error getting regime history:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// SYSTEM STATS ENDPOINTS
// ============================================

/**
 * GET /api/orchestrator/stats
 * Get system-wide statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const orch = ensureOrchestrator();
    const stats = await orch.getSystemStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/orchestrator/dashboard
 * Get dashboard summary for all portfolios
 */
router.get('/dashboard', async (req, res) => {
  try {
    const database = db.getDatabase();

    // Get all portfolios with their latest analysis
    const portfolios = database.prepare(`
      SELECT p.id, p.name, p.current_value, p.current_cash,
        (SELECT COUNT(*) FROM portfolio_positions WHERE portfolio_id = p.id) as position_count
      FROM portfolios p
      WHERE p.is_archived = 0
      ORDER BY p.current_value DESC
    `).all();

    // Get latest analysis for each
    const portfolioSummaries = portfolios.map(p => {
      const latestAnalysis = database.prepare(`
        SELECT * FROM daily_analyses
        WHERE portfolio_id = ?
        ORDER BY date DESC, created_at DESC
        LIMIT 1
      `).get(p.id);

      return {
        portfolio: p,
        hasRecentAnalysis: latestAnalysis && latestAnalysis.date === new Date().toISOString().split('T')[0],
        lastAnalysisDate: latestAnalysis?.date,
        regime: latestAnalysis?.regime,
        recommendationsCount: latestAnalysis?.recommendations_count || 0,
      };
    });

    // Get current regime
    const orch = ensureOrchestrator();
    const currentRegime = await orch.getCurrentRegime();

    // Get recent recommendations
    const recentRecommendations = database.prepare(`
      SELECT ar.*, c.symbol, c.name as company_name
      FROM agent_recommendations ar
      JOIN companies c ON ar.company_id = c.id
      WHERE ar.action IN ('strong_buy', 'buy', 'strong_sell', 'sell')
      ORDER BY ar.created_at DESC
      LIMIT 10
    `).all();

    res.json({
      success: true,
      currentRegime,
      portfolioSummaries,
      recentRecommendations: recentRecommendations.map(r => ({
        ...r,
        reasoning: r.reasoning ? JSON.parse(r.reasoning) : [],
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * POST /api/orchestrator/run-all
 * Run analysis for all portfolios
 */
router.post('/run-all', async (req, res) => {
  try {
    const database = db.getDatabase();
    const orch = ensureOrchestrator();

    // Get all active portfolios
    const portfolios = database.prepare(`
      SELECT id, name FROM portfolios WHERE is_archived = 0
    `).all();

    const results = [];

    for (const portfolio of portfolios) {
      try {
        console.log(`Running analysis for portfolio: ${portfolio.name}`);
        const analysis = await orch.runDailyAnalysis(portfolio.id);
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: true,
          recommendationsCount: analysis.recommendations.length,
          regime: analysis.regime?.regime,
        });
      } catch (error) {
        results.push({
          portfolioId: portfolio.id,
          name: portfolio.name,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      summary: {
        total: portfolios.length,
        successful,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error('Error running all analyses:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
