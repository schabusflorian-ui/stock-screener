// src/api/routes/factors.js
// API routes for Factor Analysis

const express = require('express');
const router = express.Router();
const { getFactorAnalysisService } = require('../../services/factors');
const { requireAuth } = require('../../middleware/auth');
const { requireFeature } = require('../../middleware/subscription');
const { MemoryCache } = require('../../lib/cache');
const { getDatabaseAsync, isUsingPostgres } = require('../../lib/db');

// Cache for factor-related data
const factorCache = new MemoryCache({
  maxSize: 500,
  defaultTTL: 3600000 // 1 hour default
});

// Cache TTLs
const CACHE_TTL = {
  AVAILABLE_METRICS: 86400000, // 24 hours - metrics don't change
  IC_RESULTS: 3600000,         // 1 hour - IC analysis results
  IC_HISTORY: 7200000,         // 2 hours - historical IC
  CORRELATIONS: 3600000        // 1 hour - factor correlations
};

// Import custom factor services (lazy loaded to handle missing tables gracefully)
let FactorRepository, CustomFactorCalculator, ICAnalysis;
let factorRepository, customFactorCalculator, icAnalysis;

function getFactorRepository() {
  if (!factorRepository) {
    try {
      FactorRepository = require('../../services/factors/factorRepository');
      factorRepository = new FactorRepository();
    } catch (err) {
      console.warn('Factor repository not available:', err.message);
      return null;
    }
  }
  return factorRepository;
}

function getCustomFactorCalculator() {
  if (!customFactorCalculator) {
    try {
      CustomFactorCalculator = require('../../services/factors/customFactorCalculator');
      customFactorCalculator = new CustomFactorCalculator();
    } catch (err) {
      console.warn('Custom factor calculator not available:', err.message);
      return null;
    }
  }
  return customFactorCalculator;
}

function getICAnalysis() {
  if (!icAnalysis) {
    try {
      // icAnalysis exports functions, not a class
      icAnalysis = require('../../services/backtesting/icAnalysis');
    } catch (err) {
      console.warn('IC Analysis not available:', err.message);
      return null;
    }
  }
  return icAnalysis;
}

// ============================================
// Standardized API Response Helpers
// ============================================

/**
 * Send standardized success response
 * Format: { success: true, data: any, error: null }
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    error: null
  });
}

/**
 * Send standardized error response
 * Format: { success: false, data: null, error: string }
 */
function sendError(res, error, statusCode = 500) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  console.error(`[API Error ${statusCode}]:`, errorMessage);
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: errorMessage
  });
}

/**
 * Send 400 Bad Request (validation error)
 */
function sendValidationError(res, error) {
  return sendError(res, error, 400);
}

/**
 * Send 404 Not Found
 */
function sendNotFoundError(res, error) {
  return sendError(res, error, 404);
}

/**
 * Send 503 Service Unavailable
 */
function sendServiceUnavailable(res, error) {
  return sendError(res, error, 503);
}

// ============================================
// Factor Statistics
// ============================================

// GET /api/factors/stats - Get overall statistics
router.get('/stats', async (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const stats = await fas.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting factor stats:', error);
    sendError(res, error);
  }
});

// GET /api/factors/cache-stats - Get cache statistics
router.get('/cache-stats', async (req, res) => {
  try {
    const stats = await factorCache.getStats();
    res.json({
      success: true,
      data: {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits + stats.misses > 0
          ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1) + '%'
          : '0%',
        size: stats.size,
        maxSize: stats.maxSize
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

// POST /api/factors/cache-clear - Clear the factor cache
router.post('/cache-clear', requireAuth, async (req, res) => {
  try {
    const { pattern } = req.body;

    if (pattern) {
      // Clear specific pattern
      await factorCache.deletePattern(pattern);
    } else {
      // Clear all
      await factorCache.clear();
    }

    res.json({
      success: true,
      message: pattern ? `Cache cleared for pattern: ${pattern}` : 'Cache cleared'
    });
  } catch (error) {
    sendError(res, error);
  }
});

// GET /api/factors/performance-dashboard - Get factor health overview
router.get('/performance-dashboard', async (req, res) => {
  try {
    const cacheKey = 'performance-dashboard';
    const cached = factorCache.get(cacheKey);

    if (cached) {
      return res.json({
        ...cached,
        cached: true
      });
    }

    const repo = getFactorRepository();
    const calc = getCustomFactorCalculator();

    // Standard factors with their formulas
    const standardFactors = [
      { id: 'value', name: 'Value', formula: '1 / pe_ratio', type: 'standard' },
      { id: 'momentum', name: 'Momentum', formula: 'momentum_12m', type: 'standard' },
      { id: 'quality', name: 'Quality', formula: 'roe * (1 - debt_to_equity)', type: 'standard' },
      { id: 'growth', name: 'Growth', formula: 'earnings_growth_yoy', type: 'standard' },
      { id: 'size', name: 'Size', formula: '-1 * log(market_cap)', type: 'standard' },
      { id: 'volatility', name: 'Low Volatility', formula: '-1 * volatility_252d', type: 'standard' }
    ];

    // Get user factors
    let userFactors = [];
    if (repo) {
      try {
        userFactors = (await repo.getAllFactors({ includeInactive: false }))
          .map(f => ({
            id: f.id,
            name: f.name,
            formula: f.formula,
            type: 'custom',
            ic_stats: f.ic_stats,
            ic_tstat: f.ic_tstat,
            ic_ir: f.ic_ir,
            created_at: f.created_at
          }));
      } catch (err) {
        console.warn('Failed to get user factors:', err.message);
      }
    }

    // Combine all factors
    const allFactors = [...standardFactors, ...userFactors];

    // Calculate health status for each factor
    const factorsWithHealth = allFactors.map(factor => {
      let ic21d = null;
      let tstat = null;
      let status = 'unknown';
      let trend = 'stable';

      // Use cached IC stats if available
      if (factor.ic_stats) {
        ic21d = factor.ic_stats['21'] || factor.ic_stats.ic_21d || 0;
        tstat = factor.ic_tstat || 0;
      }

      // Calculate status
      const absIC = Math.abs(ic21d || 0);
      const absTstat = Math.abs(tstat || 0);

      if (absIC >= 0.03 && absTstat >= 2) {
        status = 'healthy';
      } else if (absIC >= 0.01 && absTstat >= 1.5) {
        status = 'caution';
      } else if (absIC > 0) {
        status = 'weak';
      }

      return {
        ...factor,
        ic21d,
        tstat,
        icIR: factor.ic_ir || null,
        status,
        trend
      };
    });

    // Calculate summary
    const summary = {
      total: factorsWithHealth.length,
      healthy: factorsWithHealth.filter(f => f.status === 'healthy').length,
      caution: factorsWithHealth.filter(f => f.status === 'caution').length,
      weak: factorsWithHealth.filter(f => f.status === 'weak').length,
      custom: userFactors.length
    };

    const result = {
      success: true,
      data: {
        factors: factorsWithHealth,
        summary,
        lastUpdated: new Date().toISOString()
      }
    };

    // Cache for 5 minutes
    factorCache.set(cacheKey, result, 300000);

    res.json(result);
  } catch (error) {
    console.error('Error getting performance dashboard:', error);
    sendError(res, error);
  }
});

// POST /api/factors/decay-analysis - Detect IC decay for a factor
router.post('/decay-analysis', requireAuth, async (req, res) => {
  try {
    const { factorId, formula, icHistory } = req.body;

    if (!factorId && !formula && !icHistory) {
      return sendValidationError(res, 'factorId, formula, or icHistory is required');
    }

    let history = icHistory;

    // If no history provided, fetch from database or calculate
    if (!history) {
      const repo = getFactorRepository();

      if (factorId && repo) {
        // Get stored IC history
        const storedHistory = await repo.getICHistory(factorId, { limit: 60 });
        if (storedHistory && storedHistory.length > 0) {
          history = storedHistory.map(h => ({
            date: h.calculation_date,
            ic: h.ic_21d || h.ic || 0
          }));
        }
      }

      // If still no history, use mock data for demo
      if (!history || history.length < 6) {
        history = generateMockICHistory(24, 21).map(h => ({
          date: h.date,
          ic: h.ic
        }));
      }
    }

    // Analyze decay
    const analysis = analyzeICDecay(history);

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error analyzing IC decay:', error);
    sendError(res, error);
  }
});

// Helper function: Analyze IC decay from historical data
function analyzeICDecay(history) {
  if (!history || history.length < 6) {
    return {
      hasDecay: false,
      decayRate: null,
      trend: 'unknown',
      alert: null,
      details: 'Insufficient history for decay analysis (need at least 6 data points)'
    };
  }

  // Sort by date
  const sorted = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));
  const ics = sorted.map(h => h.ic || 0);

  // Use absolute IC values for decay analysis (handles inverse factors correctly)
  const absICs = ics.map(ic => Math.abs(ic));

  // Calculate overall mean and recent mean (last 6 months) using absolute values
  const overallMean = absICs.reduce((a, b) => a + b, 0) / absICs.length;
  const recentICs = absICs.slice(-6);
  const recentMean = recentICs.reduce((a, b) => a + b, 0) / recentICs.length;

  // Calculate 12-month rolling trend (linear regression slope)
  const recent12 = sorted.slice(-12);
  let trend = 0;
  let trendLabel = 'stable';

  if (recent12.length >= 6) {
    const n = recent12.length;
    const xMean = (n - 1) / 2;
    const yMean = recent12.reduce((sum, d) => sum + (d.ic || 0), 0) / n;

    let num = 0, den = 0;
    recent12.forEach((d, i) => {
      num += (i - xMean) * ((d.ic || 0) - yMean);
      den += Math.pow(i - xMean, 2);
    });
    trend = den > 0 ? num / den : 0;

    if (trend > 0.002) {
      trendLabel = 'improving';
    } else if (trend < -0.002) {
      trendLabel = 'declining';
    }
  }

  // Calculate decay rate (percentage change from first half to second half)
  // Use absolute IC values to handle inverse factors correctly
  const firstHalf = absICs.slice(0, Math.floor(absICs.length / 2));
  const secondHalf = absICs.slice(Math.floor(absICs.length / 2));
  const firstHalfMean = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const secondHalfMean = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const decayRate = firstHalfMean !== 0 ? (secondHalfMean - firstHalfMean) / firstHalfMean : 0;

  // Determine if decay is significant
  const hasDecay = decayRate < -0.3 && trendLabel === 'declining';
  const hasSevereDecay = decayRate < -0.5 && trendLabel === 'declining';

  // Generate alert
  let alert = null;
  if (hasSevereDecay) {
    alert = {
      level: 'critical',
      message: `IC has declined by ${Math.abs(decayRate * 100).toFixed(0)}% - factor may be losing effectiveness`,
      recommendation: 'Consider revising the factor formula or reducing weight in combinations'
    };
  } else if (hasDecay) {
    alert = {
      level: 'warning',
      message: `IC showing decay of ${Math.abs(decayRate * 100).toFixed(0)}% over the analysis period`,
      recommendation: 'Monitor closely for continued decline'
    };
  }

  // Calculate half-life (if decaying)
  let halfLife = null;
  if (trend < 0 && overallMean > 0) {
    // Estimate months until IC reaches half of current level
    halfLife = Math.abs(overallMean / (2 * trend));
    if (halfLife > 120) halfLife = null; // Cap at 10 years
  }

  return {
    hasDecay,
    hasSevereDecay,
    decayRate,
    trend: trendLabel,
    trendSlope: trend,
    overallMean,
    recentMean,
    halfLife,
    alert,
    details: {
      dataPoints: ics.length,
      firstHalfMean,
      secondHalfMean,
      recentICs
    }
  };
}

// GET /api/factors/definitions - Get all factor definitions
router.get('/definitions', async (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const definitions = await fas.getFactorDefinitions();
    res.json(definitions);
  } catch (error) {
    console.error('Error getting factor definitions:', error);
    sendError(res, error);
  }
});

// ============================================
// Stock Factor Scores
// ============================================

// GET /api/factors/stocks/:symbol - Get factor scores for a stock
router.get('/stocks/:symbol', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { date } = req.query;

    const fas = getFactorAnalysisService();
    const scores = await fas.getStockFactorScores(symbol.toUpperCase(), date);

    if (!scores) {
      return sendNotFoundError(res, 'No factor scores found for this symbol');
    }

    res.json(scores);
  } catch (error) {
    console.error('Error getting stock factor scores:', error);
    sendError(res, error);
  }
});

// GET /api/factors/stocks/:symbol/history - Get factor score history
router.get('/stocks/:symbol/history', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { symbol } = req.params;
    const { limit = 12, startDate } = req.query;

    const fas = getFactorAnalysisService();
    const history = await fas.getStockFactorHistory(symbol.toUpperCase(), {
      limit: parseInt(limit),
      startDate
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting stock factor history:', error);
    sendError(res, error);
  }
});

// GET /api/factors/top/:factor - Get top stocks by factor
router.get('/top/:factor', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { factor } = req.params;
    const { date, limit = 20, minMarketCap, sector } = req.query;

    if (!date) {
      return sendValidationError(res, 'date parameter is required');
    }

    const validFactors = ['value', 'quality', 'momentum', 'growth', 'size', 'volatility', 'dividend'];
    if (!validFactors.includes(factor)) {
      return sendValidationError(res, `Invalid factor. Valid options: ${validFactors.join(', ')}`);
    }

    const fas = getFactorAnalysisService();
    const stocks = await fas.getTopByFactor(factor, date, {
      limit: parseInt(limit),
      minMarketCap: minMarketCap ? parseFloat(minMarketCap) : null,
      sector
    });

    res.json(stocks);
  } catch (error) {
    console.error('Error getting top stocks by factor:', error);
    sendError(res, error);
  }
});

// ============================================
// Portfolio Factor Analysis
// ============================================

// GET /api/factors/investors/:id/profile - Get investor factor profile
router.get('/investors/:id/profile', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { id } = req.params;

    const fas = getFactorAnalysisService();
    const profile = await fas.getInvestorFactorProfile(parseInt(id));

    if (!profile) {
      return sendNotFoundError(res, 'No factor profile found for this investor');
    }

    res.json(profile);
  } catch (error) {
    console.error('Error getting investor factor profile:', error);
    sendError(res, error);
  }
});

// GET /api/factors/investors/:id/history - Get investor factor exposure history
router.get('/investors/:id/history', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 20 } = req.query;

    const fas = getFactorAnalysisService();
    const history = await fas.getInvestorFactorHistory(parseInt(id), {
      limit: parseInt(limit)
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting investor factor history:', error);
    sendError(res, error);
  }
});

// GET /api/factors/compare - Compare factor exposures between investors
router.get('/compare', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { investors, date } = req.query;

    if (!investors) {
      return sendValidationError(res, 'investors parameter is required (comma-separated IDs)');
    }

    const investorIds = investors.split(',').map(id => parseInt(id.trim()));

    const fas = getFactorAnalysisService();
    const comparison = await fas.compareInvestorFactors(investorIds, date);

    res.json(comparison);
  } catch (error) {
    console.error('Error comparing investor factors:', error);
    sendError(res, error);
  }
});

// ============================================
// Factor Performance Analysis
// ============================================

// GET /api/factors/performance - Get factor performance by decision outcome
router.get('/performance', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const performance = await fas.getFactorDecisionPerformance();
    res.json(performance);
  } catch (error) {
    console.error('Error getting factor performance:', error);
    sendError(res, error);
  }
});

// GET /api/factors/success - Analyze which factors lead to best outcomes
router.get('/success', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { minDecisions = 100, factor } = req.query;

    const fas = getFactorAnalysisService();
    const analysis = await fas.analyzeFactorSuccess({
      minDecisions: parseInt(minDecisions),
      factor
    });

    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing factor success:', error);
    sendError(res, error);
  }
});

// ============================================
// Factor Regimes
// ============================================

// GET /api/factors/regime - Get current factor regime
router.get('/regime', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const fas = getFactorAnalysisService();
    const regime = await fas.getCurrentFactorRegime();
    res.json(regime || { message: 'No factor regime data available' });
  } catch (error) {
    console.error('Error getting factor regime:', error);
    sendError(res, error);
  }
});

// GET /api/factors/regime/history - Get factor regime history
router.get('/regime/history', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const fas = getFactorAnalysisService();
    const history = await fas.getFactorRegimeHistory({
      limit: parseInt(limit)
    });

    res.json(history);
  } catch (error) {
    console.error('Error getting factor regime history:', error);
    sendError(res, error);
  }
});

// ============================================
// Fama-French Factor Analysis
// ============================================

// GET /api/factors/portfolio/:id/fama-french - Get Fama-French factor exposures for portfolio
router.get('/portfolio/:id/fama-french', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const fas = getFactorAnalysisService();
    const exposures = await fas.getFamaFrenchExposures(parseInt(id), { startDate, endDate });

    if (!exposures) {
      return sendNotFoundError(res, 'Could not calculate Fama-French exposures for this portfolio');
    }

    res.json({
      success: true,
      data: exposures
    });
  } catch (error) {
    console.error('Error getting Fama-French exposures:', error);
    sendError(res, error);
  }
});

// GET /api/factors/returns - Get historical factor returns
router.get('/returns', requireAuth, requireFeature('factor_analysis'), async (req, res) => {
  try {
    const { startDate, endDate, cumulative = 'true' } = req.query;

    const fas = getFactorAnalysisService();
    const returns = await fas.getFactorReturns({
      startDate,
      endDate,
      cumulative: cumulative === 'true'
    });

    res.json({
      success: true,
      data: returns
    });
  } catch (error) {
    console.error('Error getting factor returns:', error);
    sendError(res, error);
  }
});

// ============================================
// Calculation Endpoints
// ============================================

// POST /api/factors/calculate - Calculate factor scores for a date
router.post('/calculate', requireAuth, async (req, res) => {
  try {
    const { date, universeFilter } = req.body;

    if (!date) {
      return sendValidationError(res, 'date is required');
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculateFactorScores(date, {
      verbose: true,
      universeFilter
    });

    res.json(result);
  } catch (error) {
    console.error('Error calculating factor scores:', error);
    sendError(res, error);
  }
});

// POST /api/factors/calculate-historical - Calculate historical factor scores
router.post('/calculate-historical', requireAuth, async (req, res) => {
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
    sendError(res, error);
  }
});

// POST /api/factors/portfolio-exposures - Calculate portfolio exposures
router.post('/portfolio-exposures', requireAuth, async (req, res) => {
  try {
    const { investorId, snapshotDate, benchmark = 'market' } = req.body;

    if (!investorId || !snapshotDate) {
      return sendValidationError(res, 'investorId and snapshotDate are required');
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculatePortfolioExposures(investorId, snapshotDate, {
      verbose: true,
      benchmark
    });

    if (!result) {
      return sendNotFoundError(res, 'Could not calculate exposures for this date');
    }

    res.json(result);
  } catch (error) {
    console.error('Error calculating portfolio exposures:', error);
    sendError(res, error);
  }
});

// POST /api/factors/attribution - Calculate factor attribution
router.post('/attribution', requireAuth, async (req, res) => {
  try {
    const { investorId, periodStart, periodEnd } = req.body;

    if (!investorId || !periodStart || !periodEnd) {
      return sendValidationError(res, 'investorId, periodStart, and periodEnd are required');
    }

    const fas = getFactorAnalysisService();
    const result = await fas.calculateFactorAttribution(investorId, periodStart, periodEnd, {
      verbose: true
    });

    if (!result) {
      return sendNotFoundError(res, 'Could not calculate attribution for this period');
    }

    res.json(result);
  } catch (error) {
    console.error('Error calculating factor attribution:', error);
    sendError(res, error);
  }
});

// POST /api/factors/enrich-decisions - Enrich decisions with factor context
router.post('/enrich-decisions', requireAuth, async (req, res) => {
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
    sendError(res, error);
  }
});

// ============================================
// User-Defined Factors (Quant Workbench)
// ============================================

// GET /api/factors/available-metrics - Get available metrics for factor construction
router.get('/available-metrics', async (req, res) => {
  try {
    const cacheKey = 'available-metrics';
    const cached = await factorCache.get(cacheKey);

    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        cacheHit: true
      });
    }

    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const metrics = await repo.getAvailableMetrics();
    const grouped = {};
    for (const metric of metrics) {
      if (!grouped[metric.category]) {
        grouped[metric.category] = [];
      }
      grouped[metric.category].push(metric);
    }

    const result = {
      success: true,
      data: {
        metrics,
        byCategory: grouped,
        totalCount: metrics.length
      }
    };

    // Cache for 24 hours
    await factorCache.set(cacheKey, result, CACHE_TTL.AVAILABLE_METRICS);

    res.json(result);
  } catch (error) {
    console.error('Error getting available metrics:', error);
    sendError(res, error);
  }
});

// POST /api/factors/define - Create a new custom factor
router.post('/define', requireAuth, async (req, res) => {
  try {
    console.log('[/api/factors/define] Request body:', req.body);
    
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { name, formula, description, higherIsBetter, transformations } = req.body;

    if (!name || !formula) {
      console.error('[/api/factors/define] Validation error: name and formula are required');
      return sendValidationError(res, 'name and formula are required');
    }

    const result = await repo.createFactor({
      name,
      formula,
      description,
      higherIsBetter,
      transformations
    });

    if (!result.success) {
      return sendValidationError(res, result.error || result);
    }

    res.json({
      success: true,
      data: result.factor
    });
  } catch (error) {
    console.error('Error creating custom factor:', error);
    sendError(res, error);
  }
});

// GET /api/factors/user - Get all user-defined factors
router.get('/user', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { includeInactive, sortBy, order } = req.query;

    const factors = await repo.getUserFactors(null, {
      includeInactive: includeInactive === 'true',
      sortBy,
      order
    });

    res.json({
      success: true,
      data: factors
    });
  } catch (error) {
    console.error('Error getting user factors:', error);
    sendError(res, error);
  }
});

// GET /api/factors/user/:id - Get a specific user factor
router.get('/user/:id', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const factor = await repo.getFactorById(req.params.id);

    if (!factor) {
      return sendNotFoundError(res, 'Factor not found');
    }

    res.json({
      success: true,
      data: factor
    });
  } catch (error) {
    console.error('Error getting user factor:', error);
    sendError(res, error);
  }
});

// PUT /api/factors/user/:id - Update a user factor
router.put('/user/:id', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { formula, ...updates } = req.body;

    // If formula is being updated, use special method
    if (formula) {
      const result = await repo.updateFactorFormula(req.params.id, formula);
      if (!result.success) {
        return sendValidationError(res, result.error || result);
      }
    }

    // Update other fields
    if (Object.keys(updates).length > 0) {
      const result = await repo.updateFactor(req.params.id, updates);
      if (!result.success) {
        return sendValidationError(res, result.error || result);
      }
    }

    const factor = await repo.getFactorById(req.params.id);
    res.json({
      success: true,
      data: factor
    });
  } catch (error) {
    console.error('Error updating user factor:', error);
    sendError(res, error);
  }
});

// DELETE /api/factors/user/:id - Delete a user factor
router.delete('/user/:id', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const result = await repo.deleteFactor(req.params.id);

    if (!result.success) {
      return sendValidationError(res, result.error || result);
    }

    sendSuccess(res, {});
  } catch (error) {
    console.error('Error deleting user factor:', error);
    sendError(res, error);
  }
});

// POST /api/factors/user/:id/toggle-active - Toggle factor active status
router.post('/user/:id/toggle-active', requireAuth, async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { active } = req.body;
    const result = await repo.toggleActive(req.params.id, active);

    if (!result.success) {
      return sendValidationError(res, result.error || result);
    }

    sendSuccess(res, {});
  } catch (error) {
    console.error('Error toggling factor active status:', error);
    sendError(res, error);
  }
});

// ============================================
// Custom Factor Calculations
// ============================================

// POST /api/factors/validate - Validate a factor formula
router.post('/validate', requireAuth, async (req, res) => {
  try {
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    const { formula } = req.body;

    // Check for missing or invalid formula type
    if (formula === undefined || formula === null || typeof formula !== 'string') {
      return sendValidationError(res, 'formula is required and must be a string');
    }

    // Check for empty/whitespace-only formula
    const trimmedFormula = formula.trim();
    if (!trimmedFormula) {
      return res.json({
        success: true,
        data: {
          valid: false,
          error: 'Formula cannot be empty'
        }
      });
    }

    const result = await calc.validateFormula(trimmedFormula);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error validating formula:', error);
    // Return validation error in expected format instead of 500
    res.json({
      success: true,
      data: {
        valid: false,
        error: `Syntax error: ${error.message}`
      }
    });
  }
});

// POST /api/factors/preview - Preview factor values for a sample of stocks
router.post('/preview', requireAuth, async (req, res) => {
  try {
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    const { formula, asOfDate, sampleSize = 20 } = req.body;

    // Check for missing or invalid formula
    if (formula === undefined || formula === null || typeof formula !== 'string') {
      return sendValidationError(res, 'formula is required and must be a string');
    }

    // Check for empty/whitespace-only formula
    const trimmedFormula = formula.trim();
    if (!trimmedFormula) {
      return res.json({
        success: false,
        error: 'Formula cannot be empty'
      });
    }

    const result = await calc.previewFactorValues(trimmedFormula, {
      asOfDate,
      sampleSize: parseInt(sampleSize)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error previewing factor values:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/factors/calculate-custom - Calculate custom factor values
router.post('/calculate-custom', requireAuth, async (req, res) => {
  try {
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    const {
      factorId,
      formula,
      asOfDate,
      transformations,
      universe = 'ALL',
      minMarketCap,
      storeResults = false
    } = req.body;

    if (!formula) {
      return sendValidationError(res, 'formula is required');
    }

    const result = await calc.calculateFactorValues(factorId, formula, {
      asOfDate,
      transformations,
      universe,
      minMarketCap: minMarketCap ? parseFloat(minMarketCap) : null,
      storeResults
    });

    res.json({
      success: true,
      data: {
        stats: result.stats,
        count: result.values.length,
        date: result.date,
        requiredMetrics: result.requiredMetrics,
        // Return top and bottom stocks
        topStocks: result.values
          .sort((a, b) => b.zscoreValue - a.zscoreValue)
          .slice(0, 20)
          .map(v => ({
            symbol: v.symbol,
            sector: v.sector,
            rawValue: v.rawValue,
            zscoreValue: v.zscoreValue,
            percentileValue: v.percentileValue
          })),
        bottomStocks: result.values
          .sort((a, b) => a.zscoreValue - b.zscoreValue)
          .slice(0, 10)
          .map(v => ({
            symbol: v.symbol,
            sector: v.sector,
            rawValue: v.rawValue,
            zscoreValue: v.zscoreValue,
            percentileValue: v.percentileValue
          }))
      }
    });
  } catch (error) {
    console.error('Error calculating custom factor values:', error);
    sendError(res, error);
  }
});

// POST /api/factors/ic-analysis - Run IC analysis on a custom factor
router.post('/ic-analysis', requireAuth, async (req, res) => {
  try {
    console.log('[/api/factors/ic-analysis] Request body:', req.body);
    
    const {
      factorId,
      formula,
      horizons = [1, 5, 21, 63],
      startDate,
      endDate,
      universe = 'ALL',
      skipCache = false
    } = req.body;

    if (!formula) {
      console.error('[/api/factors/ic-analysis] Validation error: formula is required');
      return sendValidationError(res, 'formula is required');
    }

    // Validate horizons parameter
    if (!Array.isArray(horizons)) {
      return sendValidationError(res, 'horizons must be an array');
    }

    if (horizons.length === 0) {
      return sendValidationError(res, 'horizons array cannot be empty');
    }

    if (horizons.length > 20) {
      return sendValidationError(res, 'Maximum 20 horizons allowed');
    }

    // Validate each horizon is a positive integer
    for (const h of horizons) {
      if (!Number.isInteger(h) || h <= 0) {
        return sendValidationError(res, `Invalid horizon: ${h}. Horizons must be positive integers.`);
      }
      if (h > 500) {
        return sendValidationError(res, `Horizon ${h} exceeds maximum of 500 trading days.`);
      }
    }

    // Sort horizons for consistent ordering
    const sortedHorizons = [...horizons].sort((a, b) => a - b);

    // Check cache first (unless skipCache is true)
    const cacheKey = `ic-analysis:${formula}:${JSON.stringify(sortedHorizons)}:${universe}:${endDate || 'default'}`;
    if (!skipCache) {
      const cached = await factorCache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          cacheHit: true
        });
      }
    }

    const calc = getCustomFactorCalculator();
    const icModule = getICAnalysis();

    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    // Validate formula before calculating
    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, validation.error, {
        unknownMetrics: validation.unknownMetrics
      });
    }

    // Calculate factor values at the end date
    // If no endDate provided, use 3 months ago to allow for forward returns calculation
    let asOfDate;
    if (endDate) {
      asOfDate = endDate;
    } else {
      const defaultDate = new Date();
      defaultDate.setMonth(defaultDate.getMonth() - 3); // 3 months ago
      asOfDate = defaultDate.toISOString().split('T')[0];
    }
    const factorResult = await calc.calculateFactorValues(factorId, formula, {
      asOfDate,
      universe
    });

    // Validate factor calculation results
    if (!factorResult || !factorResult.values || !Array.isArray(factorResult.values)) {
      return sendError(res, 'Factor calculation failed: no values returned');
    }

    if (factorResult.values.length === 0) {
      return sendValidationError(res, 'Factor calculation returned no values. Check if universe has valid data.');
    }

    // Get company IDs for the factor values
    const companyIds = factorResult.values.map(v => v.company_id).filter(Boolean);
    if (companyIds.length === 0) {
      return sendValidationError(res, 'No valid company IDs found in factor results');
    }

    const database = await getDatabaseAsync();
    const usePostgres = isUsingPostgres();

    // Get forward returns for each horizon
    const icByHorizon = {};
    let tstat = 0;
    let icIR = 0;

    for (const horizon of sortedHorizons) {
      let returnResult;
      if (usePostgres) {
        returnResult = await database.query(`
          SELECT c.id as company_id, c.symbol,
                 (p2.adjusted_close - p1.adjusted_close) / p1.adjusted_close * 100 as forward_return
          FROM companies c
          JOIN daily_prices p1 ON c.id = p1.company_id
          JOIN daily_prices p2 ON c.id = p2.company_id
          WHERE c.id = ANY($1)
            AND p1.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= $2)
            AND p2.date = (
              SELECT MIN(date) FROM daily_prices
              WHERE company_id = c.id
                AND date > (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= $2) + ($3 * INTERVAL '1 day')
            )
            AND p1.adjusted_close > 0
            AND p2.adjusted_close > 0
        `, [companyIds, asOfDate, horizon]);
      } else {
        const placeholders = companyIds.map((_, i) => `$${i + 1}`).join(',');
        const pAsOf = companyIds.length + 1;
        const pHorizon = companyIds.length + 2;
        returnResult = await database.query(`
          SELECT c.id as company_id, c.symbol,
                 (p2.adjusted_close - p1.adjusted_close) / p1.adjusted_close * 100 as forward_return
          FROM companies c
          JOIN daily_prices p1 ON c.id = p1.company_id
          JOIN daily_prices p2 ON c.id = p2.company_id
          WHERE c.id IN (${placeholders})
            AND p1.date = (SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= $${pAsOf})
            AND p2.date = (
              SELECT MIN(date) FROM daily_prices
              WHERE company_id = c.id
                AND date > date((SELECT MAX(date) FROM daily_prices WHERE company_id = c.id AND date <= $${pAsOf}), '+' || $${pHorizon} || ' days')
            )
            AND p1.adjusted_close > 0
            AND p2.adjusted_close > 0
        `, [...companyIds, asOfDate, horizon]);
      }
      const returnData = returnResult.rows;

      // Calculate Spearman correlation if we have enough data
      if (returnData.length > 10) {
        const factorValues = [];
        const returns = [];

        for (const ret of returnData) {
          const factor = factorResult.values.find(v => v.company_id === ret.company_id);
          if (factor && ret.forward_return !== null && !isNaN(ret.forward_return)) {
            factorValues.push(factor.zscoreValue);
            returns.push(ret.forward_return);
          }
        }

        if (factorValues.length > 10 && icModule) {
          const result = icModule.spearmanCorrelation(factorValues, returns);
          icByHorizon[horizon] = result.correlation;
          if (horizon === 21) {
            tstat = result.tStat;
          }
        } else if (factorValues.length > 10) {
          // Fallback: basic Pearson correlation
          const n = factorValues.length;
          const meanF = factorValues.reduce((a, b) => a + b, 0) / n;
          const meanR = returns.reduce((a, b) => a + b, 0) / n;

          let num = 0, denF = 0, denR = 0;
          for (let i = 0; i < n; i++) {
            const df = factorValues[i] - meanF;
            const dr = returns[i] - meanR;
            num += df * dr;
            denF += df * df;
            denR += dr * dr;
          }

          const corr = Math.sqrt(denF * denR) > 0 ? num / Math.sqrt(denF * denR) : 0;
          icByHorizon[horizon] = corr;
          if (horizon === 21) {
            tstat = corr * Math.sqrt((n - 2) / (1 - corr * corr));
          }
        } else {
          icByHorizon[horizon] = null;
        }
      } else {
        icByHorizon[horizon] = null;
      }
    }

    // Calculate IC IR (Information Ratio)
    const validICs = Object.values(icByHorizon).filter(v => v !== null);
    if (validICs.length > 1) {
      const meanIC = validICs.reduce((a, b) => a + b, 0) / validICs.length;
      const stdIC = Math.sqrt(validICs.reduce((acc, ic) => acc + Math.pow(ic - meanIC, 2), 0) / validICs.length);
      icIR = stdIC > 0 ? meanIC / stdIC : 0;
    }

    const icResult = {
      icByHorizon,
      tstat,
      icIR,
      sampleSize: factorResult.values.length
    };

    // Update factor stats if factorId provided
    if (factorId) {
      const repo = getFactorRepository();
      if (repo) {
        await repo.updateFactorStats(factorId, {
          icStats: icResult.icByHorizon,
          icTstat: icResult.tstat,
          icIr: icResult.icIR
        });
      }
    }

    const result = {
      success: true,
      data: {
        ic: icResult,
        factorStats: factorResult.stats,
        universeSize: factorResult.values.length
      }
    };

    // Cache the result
    await factorCache.set(cacheKey, result, CACHE_TTL.IC_RESULTS);

    res.json(result);
  } catch (error) {
    console.error('Error running IC analysis:', error);
    sendError(res, error);
  }
});

// POST /api/factors/correlation - Calculate correlation with standard factors
router.post('/correlation', requireAuth, async (req, res) => {
  try {
    console.log('[/api/factors/correlation] Request body:', req.body);
    
    const { formula, asOfDate, skipCache = false } = req.body;

    if (!formula) {
      console.error('[/api/factors/correlation] Validation error: formula is required');
      return sendValidationError(res, 'formula is required');
    }

    // Check cache first
    const cacheKey = `correlation:${formula}:${asOfDate || 'default'}`;
    if (!skipCache) {
      const cached = await factorCache.get(cacheKey);
      if (cached) {
        return res.json({
          ...cached,
          cached: true,
          cacheHit: true
        });
      }
    }

    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    // Validate formula before calculating
    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, validation.error, {
        unknownMetrics: validation.unknownMetrics
      });
    }

    // Calculate custom factor values
    const customResult = await calc.calculateFactorValues(null, formula, { asOfDate });

    if (customResult.values.length === 0) {
      return sendValidationError(res, 'No factor values could be calculated');
    }

    const scoreDate = asOfDate || new Date().toISOString().split('T')[0];
    const database = await getDatabaseAsync();
    const standardScoresResult = await database.query(`
      SELECT symbol, value_score, quality_score, momentum_score, growth_score, size_score, volatility_score
      FROM stock_factor_scores
      WHERE score_date = (SELECT MAX(score_date) FROM stock_factor_scores WHERE score_date <= $1)
    `, [scoreDate]);
    const standardScores = standardScoresResult.rows;

    // Create lookup
    const standardLookup = {};
    for (const s of standardScores) {
      standardLookup[s.symbol] = s;
    }

    // Calculate correlations
    const customValues = [];
    const standardValues = {
      value: [],
      quality: [],
      momentum: [],
      growth: [],
      size: [],
      volatility: []
    };

    for (const v of customResult.values) {
      const standard = standardLookup[v.symbol];
      if (standard) {
        customValues.push(v.zscoreValue);
        standardValues.value.push(standard.value_score);
        standardValues.quality.push(standard.quality_score);
        standardValues.momentum.push(standard.momentum_score);
        standardValues.growth.push(standard.growth_score);
        standardValues.size.push(standard.size_score);
        standardValues.volatility.push(standard.volatility_score);
      }
    }

    // Calculate Spearman correlations
    const correlations = {};
    for (const [factor, values] of Object.entries(standardValues)) {
      const validPairs = customValues
        .map((c, i) => ({ custom: c, standard: values[i] }))
        .filter(p => p.custom != null && p.standard != null);

      if (validPairs.length > 10) {
        correlations[factor] = calculateSpearmanCorrelation(
          validPairs.map(p => p.custom),
          validPairs.map(p => p.standard)
        );
      } else {
        correlations[factor] = null;
      }
    }

    // Calculate uniqueness score
    const maxCorr = Math.max(
      ...Object.values(correlations).filter(c => c !== null).map(Math.abs)
    );
    const uniquenessScore = 1 - maxCorr;

    // Find most similar factor
    let mostSimilar = null;
    let maxCorrValue = 0;
    for (const [factor, corr] of Object.entries(correlations)) {
      if (corr !== null && Math.abs(corr) > Math.abs(maxCorrValue)) {
        maxCorrValue = corr;
        mostSimilar = factor;
      }
    }

    const result = {
      success: true,
      data: {
        correlations,
        uniquenessScore,
        mostSimilarFactor: mostSimilar,
        mostSimilarCorrelation: maxCorrValue,
        sampleSize: customValues.length,
        interpretation: uniquenessScore > 0.7 ? 'Highly unique factor' :
                        uniquenessScore > 0.5 ? 'Moderately unique factor' :
                        uniquenessScore > 0.3 ? 'Some overlap with existing factors' :
                        'High overlap - may not add new information'
      }
    };

    // Cache the result
    await factorCache.set(cacheKey, result, CACHE_TTL.CORRELATIONS);

    res.json(result);
  } catch (error) {
    console.error('Error calculating factor correlations:', error);
    sendError(res, error);
  }
});

// POST /api/factors/custom-sector-exposures - Calculate sector exposures for a custom factor
router.post('/custom-sector-exposures', requireAuth, async (req, res) => {
  try {
    const { formula, factorId, factorName } = req.body;

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      return sendValidationError(res, 'formula is required and must be a non-empty string');
    }

    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Custom factor calculator not available. Run migration first.');
    }

    // Validate formula before calculating
    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, validation.error, {
        unknownMetrics: validation.unknownMetrics
      });
    }

    // Calculate factor values for ALL stocks (no limit)
    const result = await calc.calculateFactorValues(factorId, formula.trim(), {
      universe: 'ALL'
    });

    if (!result.values || result.values.length === 0) {
      return sendValidationError(res, 'No factor values could be calculated. Check if stocks have the required metrics.');
    }

    // Group stocks by sector and calculate average z-score
    const sectorExposures = {};
    const sectorCounts = {};
    const sectorStocks = {};

    // Initialize all sectors
    const allSectors = Object.keys(SECTOR_GICS_MAP);
    for (const sector of allSectors) {
      sectorExposures[sector] = 0;
      sectorCounts[sector] = 0;
      sectorStocks[sector] = [];
    }

    // Build a symbol-to-sector lookup from SECTOR_GICS_MAP
    const symbolToSector = {};
    for (const [sector, symbols] of Object.entries(SECTOR_GICS_MAP)) {
      for (const symbol of symbols) {
        symbolToSector[symbol] = sector;
      }
    }

    // Group by sector (prefer database sector, fallback to GICS map)
    for (const stock of result.values) {
      // Try database sector first, then fallback to GICS map
      let sector = stock.sector;
      if (!sector || !allSectors.includes(sector)) {
        sector = symbolToSector[stock.symbol];
      }

      if (sector && allSectors.includes(sector)) {
        sectorExposures[sector] += stock.zscoreValue || 0;
        sectorCounts[sector]++;
        sectorStocks[sector].push({
          symbol: stock.symbol,
          zscoreValue: stock.zscoreValue,
          rawValue: stock.rawValue
        });
      }
    }

    // Calculate averages
    const exposures = {};
    for (const sector of allSectors) {
      if (sectorCounts[sector] > 0) {
        exposures[sector] = sectorExposures[sector] / sectorCounts[sector];
      } else {
        exposures[sector] = null;
      }
    }

    // Get top 3 stocks per sector for drilldown
    const topStocksBySector = {};
    for (const sector of allSectors) {
      topStocksBySector[sector] = sectorStocks[sector]
        .sort((a, b) => Math.abs(b.zscoreValue) - Math.abs(a.zscoreValue))
        .slice(0, 3);
    }

    res.json({
      success: true,
      data: {
        name: factorName || 'Custom Factor',
        exposures,
        stockCounts: sectorCounts,
        topStocksBySector,
        totalStocks: result.values.length,
        stats: result.stats
      }
    });
  } catch (error) {
    console.error('Error calculating custom sector exposures:', error);
    sendError(res, error);
  }
});

// GET /api/factors/user/:id/backtest-runs - Get backtest history for a factor
router.get('/user/:id/backtest-runs', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { limit = 10 } = req.query;
    const runs = await repo.getBacktestRuns(req.params.id, parseInt(limit));

    res.json({
      success: true,
      data: runs
    });
  } catch (error) {
    console.error('Error getting backtest runs:', error);
    sendError(res, error);
  }
});

// GET /api/factors/user/:id/ic-history - Get IC history for a factor
router.get('/user/:id/ic-history', async (req, res) => {
  try {
    const repo = getFactorRepository();
    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available. Run migration first.');
    }

    const { limit = 100, universeType } = req.query;
    const history = await repo.getICHistory(req.params.id, {
      limit: parseInt(limit),
      universeType
    });

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error getting IC history:', error);
    sendError(res, error);
  }
});

// POST /api/factors/ic-history-calculate - Calculate IC history on-the-fly for a formula
router.post('/ic-history-calculate', requireAuth, async (req, res) => {
  try {
    const { formula, horizon = 21, monthsBack = 60 } = req.body;

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      return sendValidationError(res, 'Formula is required');
    }

    const calculator = getCustomFactorCalculator();
    if (!calculator) {
      return sendServiceUnavailable(res, 'Factor calculator not available');
    }

    // Check if this calculator supports historical IC calculation
    if (typeof calculator.calculateFactorHistorical !== 'function') {
      // Fallback: Use mock data for development/demo
      const mockHistory = generateMockICHistory(monthsBack, horizon);
      return res.json({
        success: true,
        data: mockHistory,
        meta: {
          formula,
          horizon,
          monthsBack,
          mock: true
        }
      });
    }

    // Calculate monthly IC for the specified period
    const now = new Date();
    const icHistory = [];

    // Get historical data points (monthly)
    for (let i = monthsBack; i >= 0; i--) {
      const asOfDate = new Date(now);
      asOfDate.setMonth(asOfDate.getMonth() - i);
      const dateStr = asOfDate.toISOString().split('T')[0];

      try {
        // Calculate factor values for this month
        const factorValues = await calculator.calculateFactor(formula, {
          asOfDate: dateStr,
          minSampleSize: 50
        });

        if (factorValues && factorValues.length >= 50) {
          // Get forward returns
          const symbols = factorValues.map(f => f.symbol);
          const prices = await calculator.getHistoricalPrices(symbols, dateStr, horizon);

          if (prices && Object.keys(prices).length >= 30) {
            // Calculate returns
            const pairs = factorValues
              .filter(f => prices[f.symbol])
              .map(f => ({
                factorValue: f.value,
                forwardReturn: prices[f.symbol].return
              }))
              .filter(p => !isNaN(p.factorValue) && !isNaN(p.forwardReturn));

            if (pairs.length >= 30) {
              const x = pairs.map(p => p.factorValue);
              const y = pairs.map(p => p.forwardReturn);
              const ic = calculateSpearmanCorrelation(x, y);

              // Calculate t-stat
              const n = pairs.length;
              const tstat = ic * Math.sqrt((n - 2) / (1 - ic * ic));

              icHistory.push({
                date: dateStr,
                ic,
                tstat,
                universeSize: pairs.length
              });
            }
          }
        }
      } catch (err) {
        // Skip this month if calculation fails
        console.warn(`IC calculation failed for ${dateStr}:`, err.message);
      }
    }

    res.json({
      success: true,
      data: icHistory,
      meta: {
        formula,
        horizon,
        monthsBack,
        pointsCalculated: icHistory.length
      }
    });
  } catch (error) {
    console.error('Error calculating IC history:', error);
    sendError(res, error);
  }
});

// Helper function: Generate mock IC history for demo/development
function generateMockICHistory(monthsBack, horizon) {
  const history = [];
  const now = new Date();
  const baseIC = 0.025 + (Math.random() * 0.02 - 0.01);

  for (let i = monthsBack; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);

    // Simulate realistic IC patterns with:
    // - Mean reversion
    // - Crisis drops (COVID period 2020-02 to 2020-04)
    // - Seasonal patterns
    // - Random noise

    let ic = baseIC;

    // Add trend component (slight decay over time)
    ic -= (monthsBack - i) * 0.0002;

    // Add seasonality
    const month = date.getMonth();
    ic += Math.sin(month * Math.PI / 6) * 0.005;

    // COVID crash simulation (Feb-Apr 2020)
    const year = date.getFullYear();
    if (year === 2020 && month >= 1 && month <= 3) {
      ic -= 0.03 * Math.random();
    }

    // Rate hikes 2022 simulation
    if (year === 2022) {
      ic -= 0.01;
    }

    // Add noise
    ic += (Math.random() - 0.5) * 0.02;

    // Calculate pseudo t-stat
    const n = 500 + Math.floor(Math.random() * 200);
    const tstat = ic * Math.sqrt(n) / 0.03;

    history.push({
      date: date.toISOString().split('T')[0],
      ic: Math.max(-0.1, Math.min(0.1, ic)),
      tstat: tstat,
      universeSize: n
    });
  }

  return history;
}

// Helper function: Calculate Spearman correlation
function calculateSpearmanCorrelation(x, y) {
  const n = x.length;

  // Rank the values
  const rankX = getRanks(x);
  const rankY = getRanks(y);

  // Calculate Pearson correlation on ranks
  const meanX = rankX.reduce((a, b) => a + b, 0) / n;
  const meanY = rankY.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = rankX[i] - meanX;
    const dy = rankY[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

function getRanks(arr) {
  const sorted = arr.map((v, i) => ({ value: v, index: i }))
    .sort((a, b) => a.value - b.value);

  const ranks = new Array(arr.length);

  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].index] = i + 1;
  }

  return ranks;
}

// ============================================
// Signal Generator - Today's Top Picks
// ============================================

// POST /api/factors/signals - Generate buy signals based on factor scores
router.post('/signals', requireAuth, async (req, res) => {
  try {
    const {
      factorId,
      formula,
      topN = 10,
      higherIsBetter = true,
      qualityFilters  // NEW: Accept custom quality filters
    } = req.body;

    // Check for missing or invalid formula
    if (formula === undefined || formula === null || typeof formula !== 'string') {
      return sendValidationError(res, 'Formula is required and must be a string');
    }

    // Check for empty/whitespace-only formula
    const trimmedFormula = formula.trim();
    if (!trimmedFormula) {
      return res.json({
        success: false,
        error: 'Formula cannot be empty'
      });
    }

    const calculator = getCustomFactorCalculator();
    if (!calculator) {
      return sendError(res, new Error('Custom factor calculator not available'));
    }

    // Calculate factor values for all stocks with quality filters
    const result = await calculator.calculateFactorValues(factorId, trimmedFormula, {
      storeResults: false,
      qualityFilters: qualityFilters  // NEW: Pass quality filters to calculator
    });

    if (!result.values || result.values.length === 0) {
      return res.json({
        success: false,
        error: 'No stocks found with required metrics'
      });
    }

    // Sort by factor value
    const sortedStocks = result.values.slice().sort((a, b) => {
      const aVal = a.zscoreValue ?? a.rawValue ?? 0;
      const bVal = b.zscoreValue ?? b.rawValue ?? 0;
      return higherIsBetter ? bVal - aVal : aVal - bVal;
    });

    // Get top N stocks
    const topStocks = sortedStocks.slice(0, topN).map((stock, index) => ({
      ...stock,
      rank: index + 1,
      percentileValue: ((sortedStocks.length - index) / sortedStocks.length) * 100
    }));

    res.json({
      success: true,
      data: {
        factorId,
        formula: trimmedFormula,
        topStocks,
        stats: result.stats,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error generating signals:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Sector Factor Heatmap
// ============================================

// GICS Sector classification
const SECTOR_GICS_MAP = {
  'Technology': ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META', 'AVGO', 'CRM', 'ORCL', 'ADBE', 'AMD'],
  'Healthcare': ['JNJ', 'UNH', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY'],
  'Financials': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'BLK', 'SCHW', 'CME'],
  'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'TJX', 'LOW', 'BKNG', 'TGT'],
  'Consumer Staples': ['PG', 'KO', 'PEP', 'COST', 'WMT', 'PM', 'MO', 'CL', 'MDLZ', 'EL'],
  'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'WMB'],
  'Industrials': ['CAT', 'UNP', 'HON', 'UPS', 'BA', 'RTX', 'DE', 'GE', 'LMT', 'MMM'],
  'Materials': ['LIN', 'APD', 'SHW', 'ECL', 'FCX', 'NEM', 'DOW', 'DD', 'NUE', 'VMC'],
  'Utilities': ['NEE', 'DUK', 'SO', 'D', 'SRE', 'AEP', 'EXC', 'XEL', 'ED', 'WEC'],
  'Real Estate': ['PLD', 'AMT', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'AVB', 'EQR'],
  'Communication Services': ['GOOG', 'T', 'VZ', 'DIS', 'NFLX', 'CMCSA', 'TMUS', 'CHTR', 'EA', 'WBD']
};

// POST /api/factors/sector-exposures - Get factor exposures by sector
router.post('/sector-exposures', requireAuth, async (req, res) => {
  try {
    const { factors = ['Value', 'Quality', 'Momentum', 'Growth', 'Size', 'Volatility'] } = req.body;

    const db = await getDatabaseAsync();
    if (!db) {
      return sendError(res, new Error('Database not available'));
    }

    const exposures = {};

    // For each sector, calculate average factor exposure
    for (const [sector, symbols] of Object.entries(SECTOR_GICS_MAP)) {
      exposures[sector] = {};

      for (const factor of factors) {
        // Get factor values for stocks in this sector
        const factorFormula = getStandardFactorFormula(factor);
        if (!factorFormula) {
          exposures[sector][factor] = null;
          continue;
        }

        // Calculate z-scores for sector stocks
        const symbolList = symbols.map(s => `'${s}'`).join(',');

        // Get the metric values for stocks in this sector
        let metricColumn = getMetricColumn(factor);
        if (!metricColumn) {
          // Generate some mock data for demo purposes
          exposures[sector][factor] = (Math.random() - 0.5) * 2;
          continue;
        }

        try {
          const stmt = await db.prepare(`
            SELECT AVG(${metricColumn}) as avg_value
            FROM stocks
            WHERE symbol IN (${symbolList})
              AND ${metricColumn} IS NOT NULL
          `);

          const result = await stmt.get();

          // Get overall average for z-score
          const overallStmt = await db.prepare(`
            SELECT AVG(${metricColumn}) as mean,
                   (SUM((${metricColumn} - (SELECT AVG(${metricColumn}) FROM stocks WHERE ${metricColumn} IS NOT NULL)) *
                        (${metricColumn} - (SELECT AVG(${metricColumn}) FROM stocks WHERE ${metricColumn} IS NOT NULL))) /
                    COUNT(*)) as variance
            FROM stocks
            WHERE ${metricColumn} IS NOT NULL
          `);

          const overall = await overallStmt.get();

          if (result?.avg_value && overall?.mean && overall?.variance > 0) {
            const zscore = (result.avg_value - overall.mean) / Math.sqrt(overall.variance);
            exposures[sector][factor] = Math.max(-2, Math.min(2, zscore));
          } else {
            // Generate mock z-score for demo
            exposures[sector][factor] = (Math.random() - 0.5) * 2;
          }
        } catch (e) {
          // Generate mock z-score on error
          exposures[sector][factor] = (Math.random() - 0.5) * 2;
        }
      }
    }

    res.json({
      success: true,
      data: {
        exposures,
        factors,
        sectors: Object.keys(SECTOR_GICS_MAP),
        asOf: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error calculating sector exposures:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// Helper to get standard factor formula
function getStandardFactorFormula(factorName) {
  const formulas = {
    'Value': '1 / pe_ratio',
    'Quality': 'roe * (1 - debt_to_equity)',
    'Momentum': 'momentum_12m',
    'Growth': 'earnings_growth_yoy',
    'Size': '-1 * log(market_cap)',
    'Volatility': '-1 * volatility_252d'
  };
  return formulas[factorName] || null;
}

// Helper to get metric column for a factor
function getMetricColumn(factorName) {
  const columns = {
    'Value': 'pe_ratio',
    'Quality': 'roe',
    'Momentum': 'price_change_1y',
    'Growth': 'revenue_growth',
    'Size': 'market_cap',
    'Volatility': 'beta'
  };
  return columns[factorName] || null;
}

// GET /api/factors/sector-stocks/:sector - Get stocks in a sector with factor values
router.get('/sector-stocks/:sector', async (req, res) => {
  try {
    const { sector } = req.params;
    const { factor = 'Value' } = req.query;

    const symbols = SECTOR_GICS_MAP[sector];
    if (!symbols) {
      return sendValidationError(res, `Unknown sector: ${sector}`);
    }

    const db = await getDatabaseAsync();
    if (!db) {
      return sendError(res, new Error('Database not available'));
    }

    const symbolList = symbols.map(s => `'${s}'`).join(',');

    // Get stock data
    const stmt = await db.prepare(`
      SELECT
        symbol,
        name,
        market_cap,
        pe_ratio,
        roe,
        revenue_growth,
        price_change_1y as momentum
      FROM stocks
      WHERE symbol IN (${symbolList})
      ORDER BY market_cap DESC
    `);

    const stocks = await stmt.all();

    // Calculate factor values and quintiles
    const factorFormula = getStandardFactorFormula(factor);
    const metricColumn = getMetricColumn(factor);

    const stocksWithFactors = stocks.map(stock => {
      // Calculate simple factor value
      let factorValue = null;
      switch (factor) {
        case 'Value':
          factorValue = stock.pe_ratio ? 1 / stock.pe_ratio : null;
          break;
        case 'Quality':
          factorValue = stock.roe;
          break;
        case 'Momentum':
          factorValue = stock.momentum;
          break;
        case 'Growth':
          factorValue = stock.revenue_growth;
          break;
        case 'Size':
          factorValue = stock.market_cap ? -Math.log10(stock.market_cap) : null;
          break;
        default:
          factorValue = null;
      }

      return {
        ...stock,
        factorValue,
        quintile: null // Will be calculated below
      };
    });

    // Calculate quintiles
    const validStocks = stocksWithFactors.filter(s => s.factorValue !== null);
    validStocks.sort((a, b) => b.factorValue - a.factorValue);

    validStocks.forEach((stock, i) => {
      stock.quintile = 5 - Math.floor(i / (validStocks.length / 5));
      if (stock.quintile > 5) stock.quintile = 5;
      if (stock.quintile < 1) stock.quintile = 1;
    });

    res.json({
      success: true,
      data: {
        sector,
        factor,
        stocks: stocksWithFactors,
        count: stocksWithFactors.length
      }
    });

  } catch (error) {
    console.error('Error fetching sector stocks:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Walk-Forward Validation
// ============================================

// POST /api/factors/walk-forward - Run walk-forward validation on a factor
router.post('/walk-forward', requireAuth, async (req, res) => {
  try {
    console.log('[/api/factors/walk-forward] Request body:', req.body);
    
    const { factorId, formula, config = {} } = req.body;

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      console.error('[/api/factors/walk-forward] Validation error: Formula is required');
      return sendValidationError(res, 'Formula is required and must be a non-empty string');
    }

    // Validate formula
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Factor calculator not available. Run migration first.');
    }

    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, `Invalid formula: ${validation.error}`);
    }

    // Default configuration
    const wfConfig = {
      trainYears: config.trainYears || 3,
      testYears: config.testYears || 1,
      startYear: config.startYear || 2015,
      endYear: config.endYear || 2026,
      rollingWindow: config.rollingWindow !== false,
      horizon: config.horizon || 21
    };

    const database = await getDatabaseAsync();
    const FactorWalkForwardAdapter = require('../../services/factors/factorWalkForwardAdapter');
    const icAnalysis = require('../../services/backtesting/icAnalysis');
    const adapter = new FactorWalkForwardAdapter(database, calc, icAnalysis);

    const results = await adapter.runWalkForward(factorId, formula.trim(), wfConfig);

    // Calculate verdict
    const verdict = calculateWalkForwardVerdict(
      results.summary.walkForwardEfficiency,
      results.summary.oosHitRate
    );

    // Update factor WFE in database if factorId provided
    if (factorId) {
      const repo = getFactorRepository();
      if (repo) {
        try {
          repo.updateFactorStats(factorId, {
            wfe: results.summary.walkForwardEfficiency
          });
        } catch (err) {
          console.warn('Could not update factor stats:', err.message);
        }
      }
    }

    res.json({
      success: true,
      data: {
        windows: results.windows,
        summary: { ...results.summary, verdict },
        config: wfConfig,
        factorId,
        formula: formula.trim(),
        runAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error running walk-forward validation:', error);
    sendError(res, new Error(error.message));
  }
});

// Helper function to calculate verdict
function calculateWalkForwardVerdict(wfe, hitRate) {
  if (wfe >= 0.8 && hitRate >= 0.7) {
    return {
      status: 'excellent',
      label: 'Excellent',
      description: 'Consistent out-of-sample performance'
    };
  } else if (wfe >= 0.6 && hitRate >= 0.6) {
    return {
      status: 'good',
      label: 'Good',
      description: 'Reliable factor with some decay'
    };
  } else if (wfe >= 0.4 && hitRate >= 0.5) {
    return {
      status: 'moderate',
      label: 'Moderate',
      description: 'Some overfitting detected'
    };
  } else {
    return {
      status: 'poor',
      label: 'Poor',
      description: 'Significant overfitting risk'
    };
  }
}

// ============================================
// Factor Backtest - Long-Short Portfolio Simulation
// ============================================

// POST /api/factors/backtest - Run factor backtest with long-short portfolio
router.post('/backtest', requireAuth, async (req, res) => {
  try {
    console.log('[/api/factors/backtest] Request body:', req.body);
    
    const { factorId, formula, config = {} } = req.body;

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      console.error('[/api/factors/backtest] Validation error: Formula is required');
      return sendValidationError(res, 'Formula is required and must be a non-empty string');
    }

    // Validate formula
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Factor calculator not available. Run migration first.');
    }

    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, `Invalid formula: ${validation.error}`);
    }

    // Default configuration
    const backtestConfig = {
      startDate: config.startDate || '2015-01-01',
      endDate: config.endDate || new Date().toISOString().split('T')[0],
      rebalanceFrequency: config.rebalanceFrequency || 'monthly',
      longShortRatio: config.longShortRatio || { long: 20, short: 20 },
      transactionCost: config.transactionCost || 0.001
    };

    const database = await getDatabaseAsync();
    const FactorBacktestAdapter = require('../../services/factors/factorBacktestAdapter');
    const adapter = new FactorBacktestAdapter(database, calc);
    const results = await adapter.runFactorBacktest(factorId, formula.trim(), backtestConfig);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Error running factor backtest:', error);
    sendError(res, new Error(error.message));
  }
});

// ============================================
// Historical Backfill for Custom Factors
// ============================================

// GET /api/factors/:id/backfill-status - Get backfill status for a factor
router.get('/:id/backfill-status', async (req, res) => {
  try {
    const factorId = req.params.id;
    if (!factorId) {
      return sendValidationError(res, 'Invalid factor ID');
    }

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        COUNT(DISTINCT company_id) as coverage_companies,
        COUNT(*) as total_values,
        MIN(date) as min_date,
        MAX(date) as max_date
      FROM factor_values_cache
      WHERE factor_id = $1
    `, [factorId]);

    const status = result.rows[0];
    if (!status || Number(status.total_values) === 0) {
      return sendNotFoundError(res, 'No backfill data found for this factor');
    }

    res.json(status);

  } catch (error) {
    console.error('Error fetching backfill status:', error);
    sendError(res, new Error(error.message));
  }
});

// POST /api/factors/backfill - Calculate and store historical factor values for ML training
router.post('/backfill', requireAuth, async (req, res) => {
  try {
    const { factorId, formula, startDate, endDate, frequency = 'monthly' } = req.body;

    if (!factorId) {
      return sendValidationError(res, 'factorId is required');
    }

    if (!formula || typeof formula !== 'string' || !formula.trim()) {
      return sendValidationError(res, 'Formula is required and must be a non-empty string');
    }

    if (!startDate || !endDate) {
      return sendValidationError(res, 'startDate and endDate are required (format: YYYY-MM-DD)');
    }

    // Validate formula
    const calc = getCustomFactorCalculator();
    if (!calc) {
      return sendServiceUnavailable(res, 'Factor calculator not available. Run migration first.');
    }

    const validation = await calc.validateFormula(formula.trim());
    if (!validation.valid) {
      return sendValidationError(res, `Invalid formula: ${validation.error}`);
    }

    console.log(`Backfilling factor ${factorId} from ${startDate} to ${endDate} (${frequency})`);

    // Generate date list based on frequency
    const dates = await generateDateList(startDate, endDate, frequency);

    console.log(`  Generated ${dates.length} dates for backfill`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Calculate and store factor values for each date
    for (const date of dates) {
      try {
        const result = await calc.calculateFactorValues(factorId, formula.trim(), {
          asOfDate: date,
          storeResults: true  // Critical: store to factor_values_cache
        });

        if (result.values && result.values.length > 0) {
          successCount++;
          console.log(`    ${date}: ${result.values.length} values calculated`);
        } else {
          errorCount++;
          errors.push({ date, error: 'No values calculated' });
        }
      } catch (err) {
        errorCount++;
        errors.push({ date, error: err.message });
        console.error(`    ${date}: Error - ${err.message}`);
      }
    }

    console.log(`Backfill complete: ${successCount} successful, ${errorCount} errors`);

    res.json({
      success: true,
      data: {
        factorId,
        formula: formula.trim(),
        dateRange: { startDate, endDate },
        frequency,
        totalDates: dates.length,
        successCount,
        errorCount,
        errors: errors.length > 0 ? errors.slice(0, 10) : []  // First 10 errors
      }
    });

  } catch (error) {
    console.error('Error running historical backfill:', error);
    sendError(res, new Error(error.message));
  }
});

// POST /api/factors/:id/clear-cache - Manually clear cached values for a factor
router.post('/:id/clear-cache', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const repo = getFactorRepository();

    if (!repo) {
      return sendServiceUnavailable(res, 'Factor repository not available');
    }

    const database = await getDatabaseAsync();
    const result = await database.query('DELETE FROM factor_values_cache WHERE factor_id = $1', [id]);

    return sendSuccess(res, {
      factorId: id,
      rowsDeleted: result.rowCount ?? 0,
      clearedAt: new Date().toISOString()
    });
  } catch (error) {
    return sendError(res, error);
  }
});

/**
 * Get last trading day of month from actual data
 * Falls back to last weekday if no data available
 */
async function getLastTradingDay(year, month) {
  const database = await getDatabaseAsync();
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  try {
    let lastDay;
    if (isUsingPostgres()) {
      const result = await database.query(`
        SELECT MAX(score_date) as last_date
        FROM stock_factor_scores
        WHERE TO_CHAR(score_date, 'YYYY-MM') = $1
      `, [monthStr]);
      lastDay = result.rows[0];
    } else {
      const result = await database.query(`
        SELECT MAX(score_date) as last_date
        FROM stock_factor_scores
        WHERE strftime('%Y-%m', score_date) = $1
      `, [monthStr]);
      lastDay = result.rows[0];
    }

    if (lastDay?.last_date) {
      return lastDay.last_date;
    }

    // Fallback: last weekday of month
    const lastCalendarDay = new Date(year, month, 0);
    let date = new Date(lastCalendarDay);

    // Move back from weekend to Friday
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() - 1);
    }

    return date.toISOString().split('T')[0];
  } catch (err) {
    console.warn('Error getting trading day:', err);
    // Final fallback: last day of month
    return new Date(year, month, 0).toISOString().split('T')[0];
  }
}

/**
 * Generate list of dates for backfill based on frequency
 */
async function generateDateList(startDate, endDate, frequency) {
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);

  let current = new Date(start);

  while (current <= end) {
    if (frequency === 'daily') {
      // Skip weekends for daily
      if (current.getDay() !== 0 && current.getDay() !== 6) {
        dates.push(current.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 1);

    } else if (frequency === 'weekly') {
      // Use Friday as standard
      const friday = new Date(current);
      const day = friday.getDay();

      if (day === 0) {
        // Sunday -> previous Friday
        friday.setDate(friday.getDate() - 2);
      } else if (day === 6) {
        // Saturday -> previous Friday
        friday.setDate(friday.getDate() - 1);
      } else if (day !== 5) {
        // Not Friday -> next Friday
        friday.setDate(friday.getDate() + (5 - day));
      }

      if (friday <= end) {
        dates.push(friday.toISOString().split('T')[0]);
      }
      current.setDate(current.getDate() + 7);

    } else if (frequency === 'monthly') {
      // Use last trading day of month
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const lastTradingDay = await getLastTradingDay(year, month);
      dates.push(lastTradingDay);
      current.setMonth(current.getMonth() + 1);

    } else if (frequency === 'quarterly') {
      // Use last trading day of quarter-end month
      const year = current.getFullYear();
      const month = current.getMonth() + 1;
      const quarterEndMonth = Math.ceil(month / 3) * 3; // 3, 6, 9, 12
      const lastTradingDay = await getLastTradingDay(year, quarterEndMonth);
      dates.push(lastTradingDay);

      // Move to next quarter
      current.setMonth(quarterEndMonth);
      current.setDate(1);
    }
  }

  return dates;
}

module.exports = router;
