// src/api/routes/recommendations.js
// API routes for recommendation tracking and performance analytics

const express = require('express');
const { getDatabaseAsync, isPostgres } = require('../../database');
const router = express.Router();
const { RecommendationTracker } = require('../../services/agent/recommendationTracker');

// Middleware to get tracker service
const getTracker = async () => {
  const database = await getDatabaseAsync();
  return new RecommendationTracker(database.raw || database);
};

// ============================================
// Recommendation Listing Routes
// ============================================

// GET /api/recommendations - List recent recommendations
router.get('/', async (req, res) => {
  try {
    const tracker = await getTracker();
    const {
      limit = 50,
      portfolioId,
      symbol,
      action,
      outcome,
      regime
    } = req.query;

    const options = {};
    if (portfolioId) options.portfolioId = parseInt(portfolioId);
    if (symbol) options.symbol = symbol.toUpperCase();
    if (action) options.action = action.toUpperCase();
    if (outcome) options.outcome = outcome.toUpperCase();
    if (regime) options.regime = regime.toUpperCase();

    const recommendations = tracker.getRecentRecommendations(parseInt(limit), options);

    res.json({
      success: true,
      count: recommendations.length,
      recommendations
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/:id - Get single recommendation with outcome
router.get('/:id', async (req, res) => {
  try {
    const tracker = await getTracker();
    const { id } = req.params;
    const database = await getDatabaseAsync();

    const recommendationResult = await database.query(`
      SELECT
        ro.*,
        c.symbol,
        c.name as company_name
      FROM recommendation_outcomes ro
      LEFT JOIN companies c ON ro.company_id = c.id
      WHERE ro.id = ?
    `, [parseInt(id)]);
    const recommendation = recommendationResult.rows[0];

    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    // Parse signal breakdown JSON
    if (recommendation.signal_breakdown) {
      try {
        recommendation.signal_breakdown = JSON.parse(recommendation.signal_breakdown);
      } catch (e) {
        // Keep as string if parse fails
      }
    }

    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Error fetching recommendation:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Performance Analytics Routes
// ============================================

// GET /api/recommendations/performance - Aggregate performance stats
router.get('/performance/summary', (req, res) => {
  try {
    const tracker = getTracker(req);
    const {
      period = '90d',
      signalType,
      regime,
      action
    } = req.query;

    const options = { period };
    if (signalType) options.signalType = signalType;
    if (regime) options.regime = regime.toUpperCase();
    if (action) options.action = action.toUpperCase();

    const stats = tracker.getPerformanceStats(options);

    res.json({
      success: true,
      period,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching performance stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/performance/by-signal - IC by signal type
router.get('/performance/by-signal', (req, res) => {
  try {
    const tracker = getTracker(req);
    const { period = '90d' } = req.query;

    const icBySignal = tracker.getICBySignalType(period);

    res.json({
      success: true,
      period,
      signals: icBySignal
    });
  } catch (error) {
    console.error('Error fetching IC by signal:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/performance/by-regime - Performance by market regime
router.get('/performance/by-regime', (req, res) => {
  try {
    const tracker = getTracker(req);
    const { period = '90d' } = req.query;

    const hitRateByRegime = tracker.getHitRateByRegime(period);

    res.json({
      success: true,
      period,
      regimes: hitRateByRegime
    });
  } catch (error) {
    console.error('Error fetching performance by regime:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/performance/optimal-weights - Get IC-optimized weights
router.get('/performance/optimal-weights', (req, res) => {
  try {
    const tracker = getTracker(req);
    const { lookbackDays = 90 } = req.query;

    const { weights, ics } = tracker.getOptimalWeights(parseInt(lookbackDays));

    res.json({
      success: true,
      lookbackDays: parseInt(lookbackDays),
      optimizedWeights: weights,
      informationCoefficients: ics
    });
  } catch (error) {
    console.error('Error fetching optimal weights:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Recommendation Tracking Routes
// ============================================

// POST /api/recommendations - Track a new recommendation
router.post('/', (req, res) => {
  try {
    const tracker = getTracker(req);
    const { recommendation, portfolioId } = req.body;

    if (!recommendation) {
      return res.status(400).json({ error: 'recommendation object required' });
    }

    const id = tracker.trackRecommendation(recommendation, portfolioId || null);

    res.json({
      success: true,
      message: 'Recommendation tracked',
      id
    });
  } catch (error) {
    console.error('Error tracking recommendation:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/recommendations/:id/execute - Mark recommendation as executed
router.post('/:id/execute', (req, res) => {
  try {
    const tracker = getTracker(req);
    const { id } = req.params;
    const { executedPrice, executedAt } = req.body;

    if (!executedPrice) {
      return res.status(400).json({ error: 'executedPrice required' });
    }

    const success = tracker.markExecuted(
      parseInt(id),
      parseFloat(executedPrice),
      executedAt || null
    );

    if (!success) {
      return res.status(404).json({ error: 'Recommendation not found' });
    }

    res.json({
      success: true,
      message: 'Recommendation marked as executed'
    });
  } catch (error) {
    console.error('Error marking recommendation executed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Admin / Maintenance Routes
// ============================================

// POST /api/recommendations/update-outcomes - Trigger outcome update
router.post('/update-outcomes', async (req, res) => {
  try {
    const { outcomeUpdater } = require('../../jobs/outcomeUpdater');

    const result = await outcomeUpdater.updateOutcomes();

    res.json({
      success: true,
      message: 'Outcome update completed',
      result
    });
  } catch (error) {
    console.error('Error updating outcomes:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/update-status - Get outcome updater status
router.get('/update-status', (req, res) => {
  try {
    const { outcomeUpdater } = require('../../jobs/outcomeUpdater');

    const status = outcomeUpdater.getStatus();

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Error getting update status:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/recommendations/recalculate-performance - Recalculate signal performance
router.post('/recalculate-performance', (req, res) => {
  try {
    const tracker = getTracker(req);

    tracker.recalculateSignalPerformance();

    res.json({
      success: true,
      message: 'Signal performance recalculated'
    });
  } catch (error) {
    console.error('Error recalculating performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/recommendations/signal-weights/:regime - Get current signal weights for regime
router.get('/signal-weights/:regime', (req, res) => {
  try {
    const { outcomeUpdater } = require('../../jobs/outcomeUpdater');
    const { regime } = req.params;

    const weights = outcomeUpdater.getSignalWeights(regime.toUpperCase());

    res.json({
      success: true,
      ...weights
    });
  } catch (error) {
    console.error('Error getting signal weights:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
