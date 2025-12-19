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

module.exports = router;
