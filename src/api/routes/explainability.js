// src/api/routes/explainability.js
// API endpoints for ML model explainability using SHAP

const express = require('express');
const router = express.Router();
const { getDatabaseAsync } = require('../../database');
const { PythonMLClient } = require('../../services/ml/pythonMLClient');

// Middleware to get ML client (async)
async function getMLClient(req) {
  const db = await getDatabaseAsync();
  return new PythonMLClient(db);
}

/**
 * @route GET /api/explainability/status
 * @description Get explainability system status and SHAP availability
 */
router.get('/status', async (req, res) => {
  try {
    const client = await getMLClient(req);
    const availability = await client.checkShapAvailability();

    res.json({
      success: true,
      status: availability.ready ? 'ready' : 'not_ready',
      shap: {
        available: availability.shap,
        version: availability.shap_version || null
      },
      xgboost: {
        available: availability.xgboost,
        version: availability.xgboost_version || null
      },
      lightgbm: {
        available: availability.lightgbm,
        version: availability.lightgbm_version || null
      },
      capabilities: availability.ready ? [
        'SHAP value computation',
        'Feature importance analysis',
        'Stock-level prediction explanations',
        'Global vs local explanations',
        'TreeExplainer for XGBoost/LightGBM',
        'DeepExplainer for neural networks'
      ] : ['Install SHAP and tree model library to enable']
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/explainability/explain
 * @description Explain a model prediction using SHAP values
 * @body {
 *   modelType: string ('xgboost', 'lightgbm', 'torch'),
 *   features: number[] (optional - feature values),
 *   featureNames: string[] (optional),
 *   nSamples: number (background samples for SHAP)
 * }
 */
router.post('/explain', async (req, res) => {
  try {
    const {
      modelType = 'xgboost',
      features = null,
      featureNames = null,
      nSamples = 100
    } = req.body;

    // Validate model type
    const validModelTypes = ['xgboost', 'lightgbm', 'torch', 'sklearn'];
    if (!validModelTypes.includes(modelType)) {
      return res.status(400).json({
        success: false,
        error: `modelType must be one of: ${validModelTypes.join(', ')}`
      });
    }

    const client = await getMLClient(req);
    const result = await client.explainPrediction({
      modelType,
      features,
      featureNames,
      nSamples
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/explainability/feature-importance
 * @description Get global feature importance using SHAP
 * @body {
 *   modelType: string,
 *   featureNames: string[],
 *   nSamples: number
 * }
 */
router.post('/feature-importance', async (req, res) => {
  try {
    const {
      modelType = 'xgboost',
      featureNames = null,
      nSamples = 200
    } = req.body;

    const client = await getMLClient(req);
    const result = await client.getShapFeatureImportance({
      modelType,
      featureNames,
      nSamples
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/explainability/summary
 * @description Get comprehensive SHAP summary including interactions
 * @body {
 *   modelType: string,
 *   featureNames: string[],
 *   nSamples: number,
 *   includeInteractions: boolean
 * }
 */
router.post('/summary', async (req, res) => {
  try {
    const {
      modelType = 'xgboost',
      featureNames = null,
      nSamples = 300,
      includeInteractions = true
    } = req.body;

    const client = await getMLClient(req);
    const result = await client.getShapSummary({
      modelType,
      featureNames,
      nSamples,
      includeInteractions
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/explainability/stock/:symbol
 * @description Explain prediction for a specific stock
 * @param symbol - Stock symbol
 * @body {
 *   featureNames: string[],
 *   featureValues: number[]
 * }
 */
router.post('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      featureNames = null,
      featureValues = null
    } = req.body;

    // Validate symbol
    if (!symbol || symbol.length === 0 || symbol.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock symbol'
      });
    }

    const client = await getMLClient(req);
    const result = await client.explainStockPrediction(symbol.toUpperCase(), {
      featureNames,
      featureValues
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/explainability/stock/:symbol
 * @description Get explanation for a stock with default features
 * @param symbol - Stock symbol
 */
router.get('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    // Validate symbol
    if (!symbol || symbol.length === 0 || symbol.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock symbol'
      });
    }

    const client = await getMLClient(req);
    const result = await client.explainStockPrediction(symbol.toUpperCase(), {});

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/explainability/config
 * @description Get default explainability configuration
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      // Default feature names used in models
      defaultFeatures: [
        'momentum_score',
        'value_score',
        'quality_score',
        'volatility_score',
        'rsi_14',
        'macd_signal',
        'sma_20_ratio',
        'pe_ratio_zscore',
        'revenue_growth_yoy',
        'insider_net_shares_90d',
        'short_interest_ratio',
        'earnings_growth_yoy'
      ],
      // Supported model types
      modelTypes: [
        { value: 'xgboost', description: 'XGBoost (TreeExplainer)', recommended: true },
        { value: 'lightgbm', description: 'LightGBM (TreeExplainer)', recommended: true },
        { value: 'torch', description: 'PyTorch neural networks (DeepExplainer)', recommended: false },
        { value: 'sklearn', description: 'Scikit-learn models (KernelExplainer)', recommended: false }
      ],
      // Explanation types
      explanationTypes: [
        { value: 'local', description: 'Individual prediction explanations' },
        { value: 'global', description: 'Overall feature importance' },
        { value: 'interaction', description: 'Feature interaction effects' }
      ],
      // Default parameters
      defaults: {
        nSamples: 100,
        includeInteractions: true,
        aggregation: 'mean_abs'
      }
    }
  });
});

/**
 * @route POST /api/explainability/batch
 * @description Explain predictions for multiple stocks
 * @body {
 *   symbols: string[],
 *   featureNames: string[]
 * }
 */
router.post('/batch', async (req, res) => {
  try {
    const {
      symbols = [],
      featureNames = null
    } = req.body;

    // Validate symbols
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'symbols must be a non-empty array'
      });
    }

    if (symbols.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 symbols per batch request'
      });
    }

    const client = await getMLClient(req);
    const results = [];
    const errors = [];

    // Process each symbol
    for (const symbol of symbols) {
      try {
        const result = await client.explainStockPrediction(symbol.toUpperCase(), {
          featureNames
        });
        if (result.success) {
          results.push({
            symbol: symbol.toUpperCase(),
            ...result
          });
        } else {
          errors.push({
            symbol: symbol.toUpperCase(),
            error: result.error
          });
        }
      } catch (err) {
        errors.push({
          symbol: symbol.toUpperCase(),
          error: err.message
        });
      }
    }

    res.json({
      success: true,
      total: symbols.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/explainability/compare
 * @description Compare feature importance across multiple model types
 * @body {
 *   modelTypes: string[],
 *   featureNames: string[],
 *   nSamples: number
 * }
 */
router.post('/compare', async (req, res) => {
  try {
    const {
      modelTypes = ['xgboost'],
      featureNames = null,
      nSamples = 200
    } = req.body;

    // Validate model types
    const validModelTypes = ['xgboost', 'lightgbm'];
    const invalidTypes = modelTypes.filter(t => !validModelTypes.includes(t));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid model types: ${invalidTypes.join(', ')}. Valid types: ${validModelTypes.join(', ')}`
      });
    }

    const client = await getMLClient(req);
    const comparisons = {};

    for (const modelType of modelTypes) {
      try {
        const result = await client.getShapFeatureImportance({
          modelType,
          featureNames,
          nSamples
        });
        if (result.success) {
          comparisons[modelType] = result;
        } else {
          comparisons[modelType] = { error: result.error };
        }
      } catch (err) {
        comparisons[modelType] = { error: err.message };
      }
    }

    // Calculate agreement/disagreement between models
    const modelKeys = Object.keys(comparisons).filter(k => comparisons[k].feature_importance);
    let agreement = null;

    if (modelKeys.length > 1) {
      const rankings = {};
      modelKeys.forEach(modelType => {
        const importance = comparisons[modelType].feature_importance;
        const sorted = Object.entries(importance)
          .sort((a, b) => b[1] - a[1])
          .map(([name], idx) => ({ name, rank: idx + 1 }));
        sorted.forEach(({ name, rank }) => {
          if (!rankings[name]) rankings[name] = {};
          rankings[name][modelType] = rank;
        });
      });

      // Calculate rank correlation (simplified)
      const features = Object.keys(rankings);
      let totalDiff = 0;
      features.forEach(feature => {
        const ranks = Object.values(rankings[feature]);
        if (ranks.length === modelKeys.length) {
          const maxDiff = Math.max(...ranks) - Math.min(...ranks);
          totalDiff += maxDiff;
        }
      });

      agreement = {
        rank_agreement: 1 - (totalDiff / (features.length * modelKeys.length)),
        rankings
      };
    }

    res.json({
      success: true,
      comparisons,
      agreement,
      modelTypes: modelKeys
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
