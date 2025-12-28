// src/api/routes/factors.js
// API routes for Factor Analysis

const express = require('express');
const router = express.Router();
const { getFactorAnalysisService } = require('../../services/factors');

// ============================================
// Factor Statistics
// ============================================

// GET /api/factors/stats - Get overall statistics
router.get('/stats', (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const stats = fas.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting factor stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/definitions - Get all factor definitions
router.get('/definitions', (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const definitions = fas.getFactorDefinitions();
    res.json(definitions);
  } catch (error) {
    console.error('Error getting factor definitions:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Stock Factor Scores
// ============================================

// GET /api/factors/stocks/:symbol - Get factor scores for a stock
router.get('/stocks/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const { date } = req.query;

    const fas = getFactorAnalysisService();
    const scores = fas.getStockFactorScores(symbol.toUpperCase(), date);

    if (!scores) {
      return res.status(404).json({ error: 'No factor scores found for this symbol' });
    }

    res.json(scores);
  } catch (error) {
    console.error('Error getting stock factor scores:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/stocks/:symbol/history - Get factor score history
router.get('/stocks/:symbol/history', (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 12, startDate } = req.query;

    const fas = getFactorAnalysisService();
    const history = fas.getStockFactorHistory(symbol.toUpperCase(), {
      limit: parseInt(limit),
      startDate
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting stock factor history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/top/:factor - Get top stocks by factor
router.get('/top/:factor', (req, res) => {
  try {
    const { factor } = req.params;
    const { date, limit = 20, minMarketCap, sector } = req.query;

    if (!date) {
      return res.status(400).json({ error: 'date parameter is required' });
    }

    const validFactors = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility', 'dividend'];
    if (!validFactors.includes(factor)) {
      return res.status(400).json({
        error: `Invalid factor. Valid options: ${validFactors.join(', ')}`
      });
    }

    const fas = getFactorAnalysisService();
    const stocks = fas.getTopByFactor(factor, date, {
      limit: parseInt(limit),
      minMarketCap: minMarketCap ? parseFloat(minMarketCap) : null,
      sector
    });

    res.json(stocks);
  } catch (error) {
    console.error('Error getting top stocks by factor:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Portfolio Factor Analysis
// ============================================

// GET /api/factors/investors/:id/profile - Get investor factor profile
router.get('/investors/:id/profile', (req, res) => {
  try {
    const { id } = req.params;

    const fas = getFactorAnalysisService();
    const profile = fas.getInvestorFactorProfile(parseInt(id));

    if (!profile) {
      return res.status(404).json({ error: 'No factor profile found for this investor' });
    }

    res.json(profile);
  } catch (error) {
    console.error('Error getting investor factor profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/investors/:id/history - Get investor factor exposure history
router.get('/investors/:id/history', (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const fas = getFactorAnalysisService();
    const history = fas.getInvestorFactorHistory(parseInt(id), {
      limit: parseInt(limit)
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting investor factor history:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/compare - Compare factor exposures between investors
router.get('/compare', (req, res) => {
  try {
    const { investors, date } = req.query;

    if (!investors) {
      return res.status(400).json({ error: 'investors parameter is required (comma-separated IDs)' });
    }

    const investorIds = investors.split(',').map(id => parseInt(id.trim()));

    const fas = getFactorAnalysisService();
    const comparison = fas.compareInvestorFactors(investorIds, date);

    res.json(comparison);
  } catch (error) {
    console.error('Error comparing investor factors:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Factor Performance Analysis
// ============================================

// GET /api/factors/performance - Get factor performance by decision outcome
router.get('/performance', (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const performance = fas.getFactorDecisionPerformance();
    res.json(performance);
  } catch (error) {
    console.error('Error getting factor performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/success - Analyze which factors lead to best outcomes
router.get('/success', (req, res) => {
  try {
    const { minDecisions = 100, factor } = req.query;

    const fas = getFactorAnalysisService();
    const analysis = fas.analyzeFactorSuccess({
      minDecisions: parseInt(minDecisions),
      factor
    });

    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing factor success:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Factor Regimes
// ============================================

// GET /api/factors/regime - Get current factor regime
router.get('/regime', (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const regime = fas.getCurrentFactorRegime();
    res.json(regime || { message: 'No factor regime data available' });
  } catch (error) {
    console.error('Error getting factor regime:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/factors/regime/history - Get factor regime history
router.get('/regime/history', (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const fas = getFactorAnalysisService();
    const history = fas.getFactorRegimeHistory({
      limit: parseInt(limit)
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting factor regime history:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Calculation Endpoints
// ============================================

// POST /api/factors/calculate - Calculate factor scores for a date
router.post('/calculate', async (req, res) => {
  try {
    const { date, universeFilter } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculateFactorScores(date, {
      verbose: true,
      universeFilter
    });

    res.json(result);
  } catch (error) {
    console.error('Error calculating factor scores:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/factors/calculate-historical - Calculate historical factor scores
router.post('/calculate-historical', async (req, res) => {
  try {
    const { startDate, endDate, frequency = 'monthly' } = req.body;

    const fas = getFactorAnalysisService();
    const result = await fas.calculateHistoricalFactorScores({
      startDate,
      endDate,
      frequency,
      verbose: true
    });

    res.json(result);
  } catch (error) {
    console.error('Error calculating historical factor scores:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/factors/portfolio-exposures - Calculate portfolio exposures
router.post('/portfolio-exposures', async (req, res) => {
  try {
    const { investorId, snapshotDate, benchmark = 'market' } = req.body;

    if (!investorId || !snapshotDate) {
      return res.status(400).json({ error: 'investorId and snapshotDate are required' });
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculatePortfolioExposures(investorId, snapshotDate, {
      verbose: true,
      benchmark
    });

    if (!result) {
      return res.status(404).json({ error: 'Could not calculate exposures for this date' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error calculating portfolio exposures:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/factors/attribution - Calculate factor attribution
router.post('/attribution', async (req, res) => {
  try {
    const { investorId, periodStart, periodEnd } = req.body;

    if (!investorId || !periodStart || !periodEnd) {
      return res.status(400).json({ error: 'investorId, periodStart, and periodEnd are required' });
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculateFactorAttribution(investorId, periodStart, periodEnd, {
      verbose: true
    });

    if (!result) {
      return res.status(404).json({ error: 'Could not calculate attribution for this period' });
    }

    res.json(result);
  } catch (error) {
    console.error('Error calculating factor attribution:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/factors/enrich-decisions - Enrich decisions with factor context
router.post('/enrich-decisions', async (req, res) => {
  try {
    const { limit = 10000 } = req.body;

    const fas = getFactorAnalysisService();
    const result = await fas.enrichAllDecisionsWithFactors({
      limit,
      verbose: true
    });

    res.json(result);
  } catch (error) {
    console.error('Error enriching decisions with factors:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
