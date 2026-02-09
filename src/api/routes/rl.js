// src/api/routes/rl.js
// API endpoints for Reinforcement Learning portfolio optimization

const express = require('express');
const router = express.Router();
const { PythonMLClient } = require('../../services/ml/pythonMLClient');

// Middleware to get ML client
function getMLClient(req) {
  const db = req.app.get('db');
  return new PythonMLClient(db);
}

/**
 * @route GET /api/rl/status
 * @description Get RL system status
 */
router.get('/status', async (req, res) => {
  try {
    const client = getMLClient(req);
    const models = await client.getAvailableRLModels();

    res.json({
      success: true,
      status: 'ready',
      modelsAvailable: models.length,
      models: models,
      capabilities: [
        'PPO portfolio optimization',
        'Walk-forward validation',
        'Multiple reward functions (Sharpe, Sortino, Calmar)',
        'Transaction cost modeling',
        'Position limit constraints'
      ]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/rl/train
 * @description Train a new RL agent
 * @body {
 *   symbols: string[],
 *   totalTimesteps: number,
 *   config: object
 * }
 */
router.post('/train', async (req, res) => {
  try {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      totalTimesteps = 100000,
      lookbackWindow = 60,
      episodeLength = 252,
      learningRate = 3e-4,
      hiddenSizes = [256, 256],
      rewardType = 'SHARPE',
      walkForward = false,
      nFolds = 5,
    } = req.body;

    // Validate inputs
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'symbols must be a non-empty array'
      });
    }

    if (totalTimesteps < 1000 || totalTimesteps > 10000000) {
      return res.status(400).json({
        success: false,
        error: 'totalTimesteps must be between 1,000 and 10,000,000'
      });
    }

    const validRewardTypes = ['SHARPE', 'SORTINO', 'CALMAR', 'RISK_ADJUSTED_RETURN', 'LOG_RETURN'];
    if (!validRewardTypes.includes(rewardType)) {
      return res.status(400).json({
        success: false,
        error: `rewardType must be one of: ${validRewardTypes.join(', ')}`
      });
    }

    const client = getMLClient(req);

    // Note: Training can take a long time, consider using async job queue
    // For now, set a long timeout and return immediately with job ID
    const jobId = `rl_train_${Date.now()}`;

    // Start training in background (simplified - in production use proper job queue)
    res.json({
      success: true,
      message: 'Training started',
      jobId: jobId,
      config: {
        symbols,
        totalTimesteps,
        lookbackWindow,
        episodeLength,
        learningRate,
        hiddenSizes,
        rewardType,
        walkForward,
        nFolds
      },
      note: 'Training may take several minutes to hours depending on timesteps'
    });

    // Actually start training (fire and forget for now)
    client.trainRLAgent({
      symbols,
      totalTimesteps,
      lookbackWindow,
      episodeLength,
      learningRate,
      hiddenSizes,
      rewardType,
      walkForward,
      nFolds
    }).then(result => {
      console.log(`RL training job ${jobId} completed:`, result.success);
    }).catch(err => {
      console.error(`RL training job ${jobId} failed:`, err.message);
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/rl/train/sync
 * @description Train RL agent synchronously (waits for completion)
 * @body Same as /train
 */
router.post('/train/sync', async (req, res) => {
  try {
    const config = req.body;
    const client = getMLClient(req);

    // Set a long timeout for this request
    req.setTimeout(3600000); // 1 hour

    const result = await client.trainRLAgent(config);

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
 * @route POST /api/rl/predict
 * @description Get portfolio weights from trained RL agent
 * @body {
 *   symbols: string[],
 *   modelPath: string (optional),
 *   deterministic: boolean
 * }
 */
router.post('/predict', async (req, res) => {
  try {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      modelPath = null,
      deterministic = true
    } = req.body;

    const client = getMLClient(req);
    const result = await client.getRLPrediction({
      symbols,
      modelPath,
      deterministic
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/rl/backtest
 * @description Backtest trained RL agent on historical data
 * @body {
 *   symbols: string[],
 *   modelPath: string (optional),
 *   nEpisodes: number,
 *   startDate: string,
 *   endDate: string
 * }
 */
router.post('/backtest', async (req, res) => {
  try {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      modelPath = null,
      nEpisodes = 10,
      startDate = null,
      endDate = null
    } = req.body;

    const client = getMLClient(req);
    const result = await client.backtestRLAgent({
      symbols,
      modelPath,
      nEpisodes,
      startDate,
      endDate
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/rl/models
 * @description List available RL models
 */
router.get('/models', async (req, res) => {
  try {
    const client = getMLClient(req);
    const models = await client.getAvailableRLModels();

    res.json({
      success: true,
      count: models.length,
      models: models
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/rl/models/:name
 * @description Get info about a specific RL model
 */
router.get('/models/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const client = getMLClient(req);

    // Find model path
    const models = await client.getAvailableRLModels();
    const model = models.find(m => m.name === name);

    if (!model) {
      return res.status(404).json({
        success: false,
        error: `Model '${name}' not found`
      });
    }

    const info = await client.getRLAgentInfo(model.path);
    res.json({
      ...info,
      model: model
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/rl/config
 * @description Get default RL configuration
 */
router.get('/config', async (req, res) => {
  res.json({
    success: true,
    config: {
      // Environment defaults
      environment: {
        lookbackWindow: 60,
        episodeLength: 252,
        initialCapital: 1000000,
        maxPositionSize: 0.25,
        minPositionSize: 0.0,
        transactionCostPct: 0.001,
        slippagePct: 0.0005,
        riskFreeRate: 0.02,
        turnoverPenalty: 0.001,
        concentrationPenalty: 0.001,
      },
      // Agent defaults
      agent: {
        hiddenSizes: [256, 256],
        learningRate: 3e-4,
        gamma: 0.99,
        gaeLambda: 0.95,
        clipEpsilon: 0.2,
        nEpochs: 10,
        batchSize: 64,
        nSteps: 2048,
        entropyCoef: 0.01,
        actionStdInit: 0.6,
        actionStdDecay: 0.05,
        actionStdMin: 0.1,
      },
      // Training defaults
      training: {
        totalTimesteps: 100000,
        walkForward: false,
        nFolds: 5,
      },
      // Available reward types
      rewardTypes: [
        { value: 'SHARPE', description: 'Sharpe ratio optimization' },
        { value: 'SORTINO', description: 'Sortino ratio (downside risk only)' },
        { value: 'CALMAR', description: 'Return / Max Drawdown' },
        { value: 'RISK_ADJUSTED_RETURN', description: 'Return with drawdown penalty' },
        { value: 'LOG_RETURN', description: 'Simple log returns' },
      ]
    }
  });
});

/**
 * @route POST /api/rl/compare
 * @description Compare RL agent against benchmarks
 * @body {
 *   symbols: string[],
 *   modelPath: string (optional),
 *   benchmarks: string[] (e.g., ['equal_weight', 'market_cap', 'momentum'])
 * }
 */
router.post('/compare', async (req, res) => {
  try {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      modelPath = null,
      nEpisodes = 10
    } = req.body;

    const client = getMLClient(req);

    // Get RL results
    const rlResult = await client.backtestRLAgent({
      symbols,
      modelPath,
      nEpisodes
    });

    if (!rlResult.success) {
      return res.status(404).json(rlResult);
    }

    // Compare with equal-weight benchmark
    // (In production, would run actual equal-weight backtest)
    const comparison = {
      success: true,
      rl_agent: {
        sharpe: rlResult.mean_sharpe,
        return: rlResult.mean_return,
        max_drawdown: rlResult.mean_max_drawdown,
        volatility: rlResult.mean_volatility,
        sortino: rlResult.mean_sortino,
        calmar: rlResult.mean_calmar,
      },
      benchmarks: {
        equal_weight: {
          sharpe: 0.5,  // Placeholder - would compute actual
          return: 0.08,
          max_drawdown: 0.15,
          volatility: 0.18,
          note: 'Placeholder values - implement actual benchmark'
        }
      },
      outperformance: {
        vs_equal_weight: {
          sharpe_diff: rlResult.mean_sharpe - 0.5,
          return_diff: rlResult.mean_return - 0.08,
        }
      }
    };

    res.json(comparison);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
