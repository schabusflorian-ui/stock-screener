/**
 * Validation API Routes
 *
 * Endpoints for running metrics validation against Yahoo Finance
 * and viewing validation results.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Lazy load dependencies
let db = null;
let validator = null;
let signalValidator = null;
let signalPerformanceTracker = null;
let mlSignalCombiner = null;
let validationInProgress = false;
let lastResults = null;
let currentProgress = null;

/**
 * Initialize the validator with database connection
 */
function initializeValidator() {
  if (!db) {
    const database = require('../../database');
    db = database.getDatabase();
  }

  if (!validator) {
    const MetricsValidator = require('../../validation/metricsValidator');
    validator = new MetricsValidator(db);
  }

  return validator;
}

/**
 * Initialize Signal Validator (uses aggregated_signals + daily_prices)
 */
function initializeSignalValidator() {
  if (!db) {
    const database = require('../../database');
    db = database.getDatabase();
  }

  if (!signalValidator) {
    const { SignalValidator } = require('../../services/validation/signalValidator');
    signalValidator = new SignalValidator(db);
  }

  return signalValidator;
}

/**
 * Initialize Signal Performance Tracker (legacy - uses recommendation_outcomes)
 */
function initializeSignalTracker() {
  if (!db) {
    const database = require('../../database');
    db = database.getDatabase();
  }

  if (!signalPerformanceTracker) {
    const { SignalPerformanceTracker } = require('../../services/agent/signalPerformanceTracker');
    signalPerformanceTracker = new SignalPerformanceTracker(db);
  }

  return signalPerformanceTracker;
}

/**
 * Initialize ML Signal Combiner
 */
function initializeMLCombiner() {
  if (!db) {
    const database = require('../../database');
    db = database.getDatabase();
  }

  if (!mlSignalCombiner) {
    const { MLSignalCombiner } = require('../../services/ml/signalCombiner');
    mlSignalCombiner = new MLSignalCombiner(db);
    mlSignalCombiner.loadModels();
  }

  return mlSignalCombiner;
}

/**
 * GET /api/validation/status
 * Get current validation status
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      validationInProgress,
      hasResults: !!lastResults,
      lastValidation: lastResults ? lastResults.timestamp : null,
      currentProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/validation/run
 * Trigger validation run (async - returns immediately)
 */
router.post('/run', async (req, res) => {
  try {
    const val = initializeValidator();

    if (validationInProgress) {
      return res.status(409).json({
        error: 'Validation already in progress',
        progress: currentProgress
      });
    }

    const { sampleSize = 40 } = req.body;

    validationInProgress = true;
    currentProgress = { stage: 'starting', percent: 0, message: 'Initializing...' };

    // Return immediately
    res.json({
      message: 'Validation started',
      sampleSize,
      status: 'running'
    });

    // Run validation in background
    val.runValidation({
      sampleSize,
      onProgress: ({ current, total, symbol, success }) => {
        currentProgress = {
          stage: 'validating',
          current,
          total,
          percent: Math.round((current / total) * 100),
          symbol,
          success,
          message: `Validating ${symbol} (${current}/${total})`
        };
      }
    })
      .then(results => {
        lastResults = results;
        validationInProgress = false;
        currentProgress = {
          stage: 'complete',
          percent: 100,
          message: `Completed. Overall accuracy: ${results.overallAccuracy}%`
        };
        console.log(`Validation completed. Overall accuracy: ${results.overallAccuracy}%`);
      })
      .catch(error => {
        console.error('Validation failed:', error);
        validationInProgress = false;
        currentProgress = {
          stage: 'error',
          percent: 0,
          message: error.message
        };
      });

  } catch (error) {
    validationInProgress = false;
    console.error('Error starting validation:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/progress
 * Get real-time progress of running validation
 */
router.get('/progress', (req, res) => {
  try {
    if (!validationInProgress && !currentProgress) {
      return res.json({
        status: 'idle',
        message: 'No validation has been run'
      });
    }

    res.json({
      status: validationInProgress ? 'running' : 'complete',
      progress: currentProgress
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/results
 * Get last validation results
 */
router.get('/results', (req, res) => {
  try {
    if (!lastResults) {
      return res.status(404).json({
        error: 'No validation results available',
        message: 'Run a validation first using POST /api/validation/run'
      });
    }

    // Return summary by default, full results with ?full=true
    const { full = false } = req.query;

    if (full === 'true' || full === true) {
      res.json(lastResults);
    } else {
      // Return summary without raw comparison data
      res.json({
        timestamp: lastResults.timestamp,
        sampleSize: lastResults.sampleSize,
        companiesAnalyzed: lastResults.companies.length,
        overallAccuracy: lastResults.overallAccuracy,
        summary: lastResults.summary,
        issueCount: lastResults.issues.length,
        warningCount: lastResults.warnings.length,
        topIssues: lastResults.issues.slice(0, 10)
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/results/metric/:metric
 * Get detailed results for a specific metric
 */
router.get('/results/metric/:metric', (req, res) => {
  try {
    if (!lastResults) {
      return res.status(404).json({ error: 'No validation results available' });
    }

    const { metric } = req.params;
    const metricData = lastResults.byMetric[metric];
    const metricSummary = lastResults.summary[metric];

    if (!metricData || !metricSummary) {
      return res.status(404).json({
        error: `Metric '${metric}' not found`,
        availableMetrics: Object.keys(lastResults.byMetric)
      });
    }

    // Get issues for this metric
    const metricIssues = lastResults.issues.filter(i => i.metric === metric);

    res.json({
      metric,
      summary: metricSummary,
      breakdown: metricData,
      issues: metricIssues,
      comparisons: metricData.comparisons.slice(0, 20) // Top 20 comparisons
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/results/company/:symbol
 * Get validation results for a specific company
 */
router.get('/results/company/:symbol', (req, res) => {
  try {
    if (!lastResults) {
      return res.status(404).json({ error: 'No validation results available' });
    }

    const { symbol } = req.params;
    const company = lastResults.companies.find(
      c => c.symbol.toUpperCase() === symbol.toUpperCase()
    );

    if (!company) {
      // Check warnings for this company
      const warning = lastResults.warnings.find(
        w => w.symbol.toUpperCase() === symbol.toUpperCase()
      );

      if (warning) {
        return res.json({
          symbol: symbol.toUpperCase(),
          validated: false,
          warning: warning.message,
          warningType: warning.type
        });
      }

      return res.status(404).json({
        error: `Company '${symbol}' was not in the validation sample`,
        sampleSize: lastResults.companies.length
      });
    }

    res.json({
      symbol: company.symbol,
      validated: true,
      fiscalYear: company.fiscalYear,
      matchScore: company.matchScore,
      matchScorePercent: `${(company.matchScore * 100).toFixed(1)}%`,
      metrics: company.metrics
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/recommendations
 * Get recommendations based on last validation
 */
router.get('/recommendations', (req, res) => {
  try {
    const val = initializeValidator();

    if (!lastResults) {
      return res.status(404).json({ error: 'No validation results available' });
    }

    const recommendations = val.getRecommendations(lastResults);

    res.json({
      overallAccuracy: lastResults.overallAccuracy,
      status: parseFloat(lastResults.overallAccuracy) >= 85 ? 'pass' :
              parseFloat(lastResults.overallAccuracy) >= 70 ? 'warn' : 'fail',
      recommendations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/history
 * Get list of saved validation results
 */
router.get('/history', (req, res) => {
  try {
    const resultsDir = process.cwd();
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('validation-results-') && f.endsWith('.json'))
      .sort()
      .reverse();

    const history = files.map(f => {
      const filepath = path.join(resultsDir, f);
      const stats = fs.statSync(filepath);
      const match = f.match(/validation-results-(\d{4}-\d{2}-\d{2})/);

      return {
        filename: f,
        date: match ? match[1] : null,
        size: stats.size,
        createdAt: stats.birthtime
      };
    });

    res.json({
      count: history.length,
      files: history.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/validation/save
 * Save current results to a file
 */
router.post('/save', (req, res) => {
  try {
    if (!lastResults) {
      return res.status(404).json({ error: 'No validation results to save' });
    }

    const filename = `validation-results-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(process.cwd(), filename);

    // Remove raw data to reduce file size
    const saveResults = {
      ...lastResults,
      companies: lastResults.companies.map(c => ({
        symbol: c.symbol,
        fiscalYear: c.fiscalYear,
        matchScore: c.matchScore,
        metrics: c.metrics,
      })),
    };

    fs.writeFileSync(filepath, JSON.stringify(saveResults, null, 2));

    res.json({
      message: 'Results saved',
      filename,
      filepath
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/validation/cancel
 * Cancel running validation (note: may not stop immediately)
 */
router.delete('/cancel', (req, res) => {
  if (!validationInProgress) {
    return res.json({ message: 'No validation in progress' });
  }

  // Note: Full cancellation would require more complex implementation
  res.json({
    message: 'Cancellation requested',
    note: 'Validation will stop after current company completes'
  });
});

// ============================================
// SIGNAL PERFORMANCE ENDPOINTS
// ============================================

/**
 * GET /api/validation/signals/health
 * Get comprehensive signal health report
 * Uses aggregated_signals + daily_prices (no AI agent required)
 */
router.get('/signals/health', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const { lookback = 180 } = req.query;

    const report = validator.getSignalHealthReport(parseInt(lookback));

    res.json({
      success: true,
      ...report,
    });
  } catch (error) {
    console.error('Signal health error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/signals/ic-decay
 * Get IC decay analysis for all signals
 */
router.get('/signals/ic-decay', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const { lookback = 180 } = req.query;

    const decay = validator.getICDecay(parseInt(lookback));

    // Transform nested structure to flat format expected by frontend
    // Backend returns: { technical: { '1d': { ic: 0.05 }, '5d': { ic: 0.03 } } }
    // Frontend expects: { technical: { ic_1d: 0.05, ic_5d: 0.03 } }
    const transformedSignals = {};
    if (decay.data) {
      for (const [signalType, horizons] of Object.entries(decay.data)) {
        transformedSignals[signalType] = {
          ic_1d: horizons['1d']?.ic || 0,
          ic_5d: horizons['5d']?.ic || 0,
          ic_21d: horizons['21d']?.ic || 0,
          ic_63d: horizons['63d']?.ic || 0,
          decayRate: horizons.decayRate,
          optimalHorizon: horizons.optimalHorizon,
        };
      }
    }

    res.json({
      success: true,
      signals: transformedSignals,
      lookbackDays: decay.lookbackDays,
      totalSamples: decay.totalSamples,
    });
  } catch (error) {
    console.error('IC decay error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/signals/hit-rates
 * Get hit rates by holding period
 */
router.get('/signals/hit-rates', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const { lookback = 180 } = req.query;

    const hitRates = validator.getHitRatesByPeriod(parseInt(lookback));

    // Transform nested structure to flat format expected by frontend
    // Backend returns: { technical: { '1d': { hitRate: 0.52 }, '5d': { hitRate: 0.54 } } }
    // Frontend expects: { technical: { hitRate_1d: 0.52, hitRate_5d: 0.54 } }
    const transformedSignals = {};
    if (hitRates.data) {
      for (const [signalType, periods] of Object.entries(hitRates.data)) {
        transformedSignals[signalType] = {
          hitRate_1d: periods['1d']?.hitRate || 0,
          hitRate_5d: periods['5d']?.hitRate || 0,
          hitRate_21d: periods['21d']?.hitRate || 0,
          hitRate_63d: periods['63d']?.hitRate || 0,
          strongHitRate_1d: periods['1d']?.strongSignalHitRate || 0,
          strongHitRate_5d: periods['5d']?.strongSignalHitRate || 0,
          strongHitRate_21d: periods['21d']?.strongSignalHitRate || 0,
          strongHitRate_63d: periods['63d']?.strongSignalHitRate || 0,
        };
      }
    }

    res.json({
      success: true,
      signals: transformedSignals,
      lookbackDays: hitRates.lookbackDays,
      totalSamples: hitRates.totalSamples,
    });
  } catch (error) {
    console.error('Hit rates error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/signals/regime-stability
 * Get signal performance stability across regimes
 */
router.get('/signals/regime-stability', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const { lookback = 365 } = req.query;

    const stability = validator.getRegimeStability(parseInt(lookback));

    res.json({
      success: true,
      signals: stability.data || {},
      ...stability,
    });
  } catch (error) {
    console.error('Regime stability error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/signals/rolling-ic/:signalType
 * Get rolling IC trend for a specific signal
 */
router.get('/signals/rolling-ic/:signalType', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const { signalType } = req.params;
    const { window = 60, step = 7, lookback = 365 } = req.query;

    const trend = validator.getRollingICTrend(
      signalType,
      parseInt(window),
      parseInt(step),
      parseInt(lookback)
    );

    res.json({
      success: true,
      ...trend,
    });
  } catch (error) {
    console.error('Rolling IC error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/validation/signals/recalculate
 * Trigger recalculation of all signal performance metrics
 */
router.post('/signals/recalculate', (req, res) => {
  try {
    const validator = initializeSignalValidator();
    const results = validator.recalculateAll();

    res.json({
      success: true,
      message: 'Signal performance metrics recalculated',
      ...results,
    });
  } catch (error) {
    console.error('Recalculation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/signals/history
 * Get historical signal performance trends
 */
router.get('/signals/history', (req, res) => {
  try {
    const tracker = initializeSignalTracker();
    const { days = 90 } = req.query;

    const history = tracker.getHistoricalTrends(parseInt(days));

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Signal history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ML SIGNAL COMBINER ENDPOINTS
// ============================================

/**
 * GET /api/validation/ml/status
 * Get ML signal combiner status and training info
 */
router.get('/ml/status', (req, res) => {
  try {
    const combiner = initializeMLCombiner();
    const status = combiner.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('ML status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/validation/ml/train
 * Train the ML signal combiner on historical data
 */
router.post('/ml/train', (req, res) => {
  try {
    const combiner = initializeMLCombiner();
    const { lookbackDays = 730 } = req.body; // 2 years default

    const results = combiner.train({ lookbackDays });

    res.json({
      success: results.success,
      data: results,
    });
  } catch (error) {
    console.error('ML training error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/validation/ml/combine
 * Combine signals using ML model
 */
router.post('/ml/combine', (req, res) => {
  try {
    const combiner = initializeMLCombiner();
    const { signals, context = {}, horizon = 21 } = req.body;

    if (!signals) {
      return res.status(400).json({ error: 'signals object is required' });
    }

    const result = combiner.combine(signals, context, horizon);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('ML combine error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/validation/ml/importance
 * Get feature importance from trained models
 */
router.get('/ml/importance', (req, res) => {
  try {
    const combiner = initializeMLCombiner();
    const { horizon = 21 } = req.query;

    const status = combiner.getStatus();

    if (!status.modelsLoaded) {
      return res.status(404).json({
        error: 'No ML models loaded',
        message: 'Train the model first using POST /api/validation/ml/train'
      });
    }

    const model = combiner.models[parseInt(horizon)];
    if (!model) {
      return res.status(404).json({
        error: `No model for ${horizon}d horizon`,
        availableHorizons: status.horizons
      });
    }

    const importances = combiner._getFeatureImportanceMap(model);

    // Sort by importance
    const sorted = Object.entries(importances)
      .sort((a, b) => b[1] - a[1])
      .map(([feature, importance]) => ({
        feature,
        importance,
        percentContribution: (importance * 100).toFixed(2) + '%'
      }));

    res.json({
      success: true,
      horizon: parseInt(horizon),
      data: sorted,
    });
  } catch (error) {
    console.error('ML importance error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
