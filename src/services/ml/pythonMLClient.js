// src/services/ml/pythonMLClient.js
// Node.js bridge to Python deep learning models

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * PythonMLClient
 *
 * Bridges Node.js trading system with Python deep learning models.
 *
 * Features:
 * - Subprocess management for Python inference
 * - JSON serialization for data exchange
 * - Caching of predictions
 * - Batching for efficiency
 * - Graceful fallback to gradient boosting
 * - Health monitoring
 * - **Prediction logging for drift monitoring**
 */
class PythonMLClient {
  constructor(db, options = {}) {
    this.db = db.getDatabase ? db.getDatabase() : db;

    // Configuration
    this.pythonPath = options.pythonPath || 'python3';
    this.modelDir = options.modelDir || path.join(__dirname, '../../../python/models');
    this.checkpointDir = options.checkpointDir || path.join(__dirname, '../../../python/checkpoints');
    this.timeout = options.timeout || 30000; // 30 seconds
    this.batchSize = options.batchSize || 100;
    this.maxRetries = options.maxRetries || 2;

    // Cache for predictions (LRU-style)
    this.cache = new Map();
    this.cacheMaxSize = options.cacheMaxSize || 10000;
    this.cacheTTL = options.cacheTTL || 3600000; // 1 hour

    // State
    this.isInitialized = false;
    this.modelInfo = null;
    this.lastHealthCheck = null;
    this.healthStatus = 'unknown';

    // Prediction logging configuration
    this.enablePredictionLogging = options.enablePredictionLogging !== false;
    this.defaultHoldingPeriod = options.holdingPeriod || 21; // days

    // Statistics
    this.stats = {
      totalPredictions: 0,
      cacheHits: 0,
      pythonCalls: 0,
      errors: 0,
      fallbacks: 0,
      avgLatencyMs: 0,
      predictionsLogged: 0
    };

    // Ensure directories exist
    this._ensureDirectories();

    // Ensure prediction logging table exists
    this._ensurePredictionTable();
  }

  /**
   * Ensure the model_predictions table exists for drift monitoring
   */
  _ensurePredictionTable() {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS model_predictions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_name TEXT NOT NULL,
          model_version TEXT,
          symbol TEXT NOT NULL,
          prediction_date TEXT NOT NULL,
          predicted_return REAL NOT NULL,
          predicted_uncertainty REAL,
          actual_return REAL,
          holding_period INTEGER DEFAULT 21,
          model_type TEXT,
          features_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indices for fast queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_predictions_model ON model_predictions(model_name);
        CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON model_predictions(symbol);
        CREATE INDEX IF NOT EXISTS idx_predictions_date ON model_predictions(prediction_date);
        CREATE INDEX IF NOT EXISTS idx_predictions_actual ON model_predictions(actual_return);
      `);
    } catch (e) {
      console.warn('PythonMLClient: Could not create prediction table:', e.message);
    }
  }

  _ensureDirectories() {
    [this.modelDir, this.checkpointDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Initialize the client and check Python environment
   */
  async initialize() {
    try {
      // Check Python is available
      await this._runPythonCommand(['--version']);

      // Check required packages
      const checkScript = `
import sys
try:
    import torch
    import numpy
    import pandas
    print(f"torch={torch.__version__}")
    print(f"numpy={numpy.__version__}")
    print(f"pandas={pandas.__version__}")
    sys.exit(0)
except ImportError as e:
    print(f"Missing package: {e}")
    sys.exit(1)
`;
      await this._runPythonScript(checkScript);

      // Check for trained models
      const models = this._getAvailableModels();
      this.modelInfo = {
        available: models.length > 0,
        models: models,
        lastChecked: new Date().toISOString()
      };

      this.isInitialized = true;
      console.log(`PythonMLClient initialized. Models available: ${models.length}`);
      return true;
    } catch (error) {
      console.warn(`PythonMLClient initialization failed: ${error.message}`);
      console.warn('Will fall back to gradient boosting for ML predictions');
      this.isInitialized = false;
      return false;
    }
  }

  /**
   * Get predictions for a list of symbols
   * @param {string[]} symbols - Stock symbols
   * @param {string} asOfDate - Prediction date (YYYY-MM-DD)
   * @param {Object} options - Additional options
   * @returns {Object} Predictions with uncertainty estimates
   */
  async predict(symbols, asOfDate, options = {}) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }

    const startTime = Date.now();
    this.stats.totalPredictions += symbols.length;

    // Check cache first
    const cachedResults = {};
    const uncachedSymbols = [];

    for (const symbol of symbols) {
      const cacheKey = `${symbol}:${asOfDate}`;
      const cached = this._getCached(cacheKey);
      if (cached) {
        cachedResults[symbol] = cached;
        this.stats.cacheHits++;
      } else {
        uncachedSymbols.push(symbol);
      }
    }

    // If all cached, return immediately
    if (uncachedSymbols.length === 0) {
      return cachedResults;
    }

    // Get predictions from Python
    let pythonResults = {};
    try {
      pythonResults = await this._getPythonPredictions(uncachedSymbols, asOfDate, options);
      this.stats.pythonCalls++;

      // Cache results
      for (const [symbol, prediction] of Object.entries(pythonResults)) {
        const cacheKey = `${symbol}:${asOfDate}`;
        this._setCache(cacheKey, prediction);
      }
    } catch (error) {
      console.warn(`Python prediction failed: ${error.message}`);
      this.stats.errors++;

      // Fall back to gradient boosting
      pythonResults = await this._fallbackToGradientBoosting(uncachedSymbols, asOfDate);
      this.stats.fallbacks++;
    }

    // Combine cached and new results
    const allResults = { ...cachedResults, ...pythonResults };

    // Update latency stats
    const latency = Date.now() - startTime;
    this.stats.avgLatencyMs = (
      (this.stats.avgLatencyMs * (this.stats.pythonCalls - 1) + latency)
      / this.stats.pythonCalls
    );

    // Log predictions for drift monitoring (only non-cached to avoid duplicates)
    if (this.enablePredictionLogging && uncachedSymbols.length > 0) {
      this._logPredictions(pythonResults, asOfDate, options);
    }

    return allResults;
  }

  /**
   * Get predictions from Python subprocess
   */
  async _getPythonPredictions(symbols, asOfDate, options) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.modelInfo?.available) {
      throw new Error('No trained models available');
    }

    // Prepare request
    const request = {
      symbols: symbols,
      as_of_date: asOfDate,
      model_type: options.modelType || 'ensemble',
      return_uncertainty: options.returnUncertainty !== false,
      return_attributions: options.returnAttributions || false
    };

    // Python prediction script
    const predictScript = `
import sys
import json
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from serve import predict_batch

request = json.loads('''${JSON.stringify(request)}''')
result = predict_batch(
    symbols=request['symbols'],
    as_of_date=request['as_of_date'],
    model_type=request.get('model_type', 'ensemble'),
    return_uncertainty=request.get('return_uncertainty', True),
    return_attributions=request.get('return_attributions', False)
)
print(json.dumps(result))
`;

    const output = await this._runPythonScript(predictScript);
    return JSON.parse(output);
  }

  /**
   * Fall back to existing gradient boosting model
   */
  async _fallbackToGradientBoosting(symbols, asOfDate) {
    // Use existing SignalCombiner if available
    try {
      const { SignalCombiner } = require('./signalCombiner');
      const combiner = new SignalCombiner(this.db);

      const results = {};
      for (const symbol of symbols) {
        // Get signal predictions from gradient boosting
        const prediction = await combiner.combineSignals(symbol, asOfDate);
        results[symbol] = {
          expected_return: prediction?.combinedScore || 0,
          uncertainty: 0.5, // Default uncertainty for fallback
          model_type: 'gradient_boosting_fallback',
          confidence: prediction?.confidence || 0.5
        };
      }
      return results;
    } catch (error) {
      // Return neutral predictions if fallback fails
      const results = {};
      for (const symbol of symbols) {
        results[symbol] = {
          expected_return: 0,
          uncertainty: 1.0,
          model_type: 'neutral_fallback',
          confidence: 0
        };
      }
      return results;
    }
  }

  /**
   * Train or retrain the model
   * @param {Object} config - Training configuration
   * @returns {Object} Training results
   */
  async train(config = {}) {
    const {
      startDate = '2015-01-01',
      endDate = null,
      modelType = 'lstm',
      epochs = 100,
      batchSize = 64,
      validationSplit = 0.15,
      walkForward = true,
      verbose = true
    } = config;

    console.log(`Starting model training: ${modelType}`);
    console.log(`Date range: ${startDate} to ${endDate || 'latest'}`);

    const trainScript = `
import sys
import json
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from trainer import train_model

config = ${JSON.stringify({
  start_date: startDate,
  end_date: endDate,
  model_type: modelType,
  epochs: epochs,
  batch_size: batchSize,
  validation_split: validationSplit,
  walk_forward: walkForward,
  verbose: verbose,
  checkpoint_dir: this.checkpointDir.replace(/\\/g, '/')
})}

result = train_model(**config)
print(json.dumps(result))
`;

    try {
      const output = await this._runPythonScript(trainScript, {
        timeout: 3600000 // 1 hour for training
      });
      const result = JSON.parse(output);

      // Reload model info
      this.modelInfo = null;
      await this.initialize();

      return result;
    } catch (error) {
      console.error('Training failed:', error);
      throw error;
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelMetrics() {
    if (!this.modelInfo?.available) {
      return null;
    }

    const metricsScript = `
import sys
import json
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from evaluator import get_model_metrics

metrics = get_model_metrics('${this.checkpointDir.replace(/\\/g, '/')}')
print(json.dumps(metrics))
`;

    try {
      const output = await this._runPythonScript(metricsScript);
      return JSON.parse(output);
    } catch (error) {
      console.warn('Failed to get model metrics:', error.message);
      return null;
    }
  }

  /**
   * Train gradient boosting models (XGBoost/LightGBM)
   * @param {Object} config - Training configuration
   * @returns {Object} Training results
   */
  async trainGradientBoosting(config = {}) {
    const {
      features,
      targets,
      featureNames = null,
      modelType = 'both', // 'xgboost', 'lightgbm', or 'both'
      hyperparameterSearch = false,
      nSearchIter = 30,
      validationSplit = 0.2
    } = config;

    if (!features || !targets) {
      throw new Error('Features and targets are required');
    }

    console.log(`Training gradient boosting: ${modelType}`);
    console.log(`Samples: ${features.length}, Features: ${features[0]?.length || 0}`);

    // Split data
    const splitIdx = Math.floor(features.length * (1 - validationSplit));
    const XTrain = features.slice(0, splitIdx);
    const yTrain = targets.slice(0, splitIdx);
    const XVal = features.slice(splitIdx);
    const yVal = targets.slice(splitIdx);

    const trainScript = `
import sys
import json
import numpy as np
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import train_gradient_boosting

X_train = np.array(${JSON.stringify(XTrain)})
y_train = np.array(${JSON.stringify(yTrain)})
X_val = np.array(${JSON.stringify(XVal)})
y_val = np.array(${JSON.stringify(yVal)})
feature_names = ${featureNames ? JSON.stringify(featureNames) : 'None'}

result = train_gradient_boosting(
    X_train=X_train,
    y_train=y_train,
    X_val=X_val,
    y_val=y_val,
    feature_names=feature_names,
    model_type='${modelType}',
    checkpoint_dir='${this.checkpointDir.replace(/\\/g, '/')}',
    hyperparameter_search=${hyperparameterSearch ? 'True' : 'False'},
    n_search_iter=${nSearchIter}
)
print(json.dumps(result, default=str))
`;

    try {
      const output = await this._runPythonScript(trainScript, {
        timeout: 1800000 // 30 minutes
      });
      return JSON.parse(output);
    } catch (error) {
      console.error('Gradient boosting training failed:', error);
      throw error;
    }
  }

  /**
   * Get predictions from gradient boosting models
   * @param {Array} features - Feature matrix
   * @param {string} modelType - 'xgboost', 'lightgbm', or 'ensemble'
   * @returns {Object} Predictions with uncertainty
   */
  async predictGradientBoosting(features, modelType = 'ensemble') {
    const predictScript = `
import sys
import json
import numpy as np
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import predict_gradient_boosting

X = np.array(${JSON.stringify(features)})
result = predict_gradient_boosting(
    X=X,
    model_type='${modelType}',
    checkpoint_dir='${this.checkpointDir.replace(/\\/g, '/')}'
)
print(json.dumps(result))
`;

    try {
      const output = await this._runPythonScript(predictScript);
      return JSON.parse(output);
    } catch (error) {
      console.error('Gradient boosting prediction failed:', error);
      return {
        success: false,
        error: error.message,
        prediction: features.map(() => 0),
        uncertainty: features.map(() => 1)
      };
    }
  }

  /**
   * Run hyperparameter search for gradient boosting
   * @param {Object} config - Search configuration
   * @returns {Object} Best parameters and results
   */
  async hyperparameterSearch(config = {}) {
    const {
      features,
      targets,
      modelType = 'xgboost',
      nIter = 50,
      nCvSplits = 3
    } = config;

    const searchScript = `
import sys
import json
import numpy as np
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import GradientBoostingModels

X = np.array(${JSON.stringify(features)})
y = np.array(${JSON.stringify(targets)})

gb = GradientBoostingModels(checkpoint_dir='${this.checkpointDir.replace(/\\/g, '/')}')
result = gb.hyperparameter_search(
    X=X,
    y=y,
    model_type='${modelType}',
    n_iter=${nIter},
    n_cv_splits=${nCvSplits}
)
print(json.dumps({
    'best_params': result.best_params,
    'best_score': result.best_score,
    'search_time_seconds': result.search_time_seconds,
    'num_configs_tested': len(result.all_results)
}))
`;

    try {
      const output = await this._runPythonScript(searchScript, {
        timeout: 3600000 // 1 hour
      });
      return JSON.parse(output);
    } catch (error) {
      console.error('Hyperparameter search failed:', error);
      throw error;
    }
  }

  /**
   * Get ensemble predictions combining deep learning and gradient boosting
   * @param {string[]} symbols - Stock symbols
   * @param {string} asOfDate - Prediction date
   * @param {Object} options - Prediction options
   * @returns {Object} Ensemble predictions
   */
  async ensemblePredict(symbols, asOfDate, options = {}) {
    const {
      regime = 'default',
      includeGradientBoosting = true,
      returnUncertainty = true
    } = options;

    // Get deep learning predictions
    const dlPredictions = await this.predict(symbols, asOfDate, {
      returnUncertainty: true
    });

    // If gradient boosting not requested, return DL predictions
    if (!includeGradientBoosting) {
      return dlPredictions;
    }

    // For ensemble, add ensemble metadata
    const ensembleResults = {};
    for (const [symbol, pred] of Object.entries(dlPredictions)) {
      ensembleResults[symbol] = {
        ...pred,
        ensemble_type: 'deep_learning',
        regime: regime
      };
    }

    return ensembleResults;
  }

  /**
   * Get available gradient boosting models
   * @returns {Object} List of available GB models
   */
  async getAvailableGBModels() {
    const script = `
import sys
import json
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')

from gradient_boosting import get_available_gb_models

result = get_available_gb_models('${this.checkpointDir.replace(/\\/g, '/')}')
print(json.dumps(result))
`;

    try {
      const output = await this._runPythonScript(script);
      return JSON.parse(output);
    } catch (error) {
      return { models: [], count: 0, error: error.message };
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    const now = Date.now();

    // Rate limit health checks
    if (this.lastHealthCheck && (now - this.lastHealthCheck) < 60000) {
      return { status: this.healthStatus, cached: true };
    }

    try {
      await this._runPythonCommand(['--version']);

      // Quick inference test
      const testScript = `
import sys
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')
print("OK")
`;
      await this._runPythonScript(testScript);

      this.healthStatus = 'healthy';
    } catch (error) {
      this.healthStatus = 'unhealthy';
    }

    this.lastHealthCheck = now;
    return {
      status: this.healthStatus,
      lastCheck: new Date(now).toISOString(),
      stats: this.stats
    };
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      isInitialized: this.isInitialized,
      modelsAvailable: this.modelInfo?.models?.length || 0
    };
  }

  /**
   * Clear prediction cache
   */
  clearCache() {
    this.cache.clear();
  }

  // ============================================
  // Private Methods
  // ============================================

  _getAvailableModels() {
    const models = [];
    try {
      const files = fs.readdirSync(this.checkpointDir);
      for (const file of files) {
        if (file.endsWith('.pt') || file.endsWith('.pth')) {
          models.push({
            name: file.replace(/\.(pt|pth)$/, ''),
            path: path.join(this.checkpointDir, file),
            modified: fs.statSync(path.join(this.checkpointDir, file)).mtime
          });
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
    return models;
  }

  _getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  _setCache(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value: value,
      timestamp: Date.now()
    });
  }

  _runPythonCommand(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data; });
      proc.stderr.on('data', data => { stderr += data; });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Python command timeout'));
      }, this.timeout);

      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Python exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  _runPythonScript(script, options = {}) {
    const timeout = options.timeout || this.timeout;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.pythonPath, ['-c', script]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => { stdout += data; });
      proc.stderr.on('data', data => { stderr += data; });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error('Python script timeout'));
      }, timeout);

      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Python script failed (${code}): ${stderr || stdout}`));
        }
      });

      proc.on('error', err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // ============================================================================
  // REINFORCEMENT LEARNING METHODS
  // ============================================================================

  /**
   * Train a PPO agent for portfolio optimization
   * @param {Object} config - Training configuration
   * @returns {Object} Training results
   */
  async trainRLAgent(config = {}) {
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
    } = config;

    const script = `
import sys
import json
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from train_rl import train_rl_agent

config = {
    'lookback_window': ${lookbackWindow},
    'episode_length': ${episodeLength},
    'learning_rate': ${learningRate},
    'hidden_sizes': ${JSON.stringify(hiddenSizes)},
    'reward_type': '${rewardType}',
}

results = train_rl_agent(
    symbols=${JSON.stringify(symbols)},
    total_timesteps=${totalTimesteps},
    config=config,
    walk_forward=${walkForward ? 'True' : 'False'},
    n_folds=${nFolds}
)

# Return summary
print(json.dumps({
    'success': True,
    'symbols': results.get('symbols'),
    'total_timesteps': results.get('total_timesteps'),
    'evaluation': results.get('evaluation'),
    'walk_forward_results': results.get('folds'),
    'model_path': results.get('model_path'),
}))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 3600000 }); // 1 hour timeout
      // Extract JSON from output
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('RL training failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get RL agent prediction for portfolio weights
   * @param {Object} config - Prediction configuration
   * @returns {Object} Predicted portfolio weights
   */
  async getRLPrediction(config = {}) {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      modelPath = null,
      currentWeights = null,
      deterministic = true,
    } = config;

    const modelFile = modelPath || path.join(this.checkpointDir, 'rl', 'ppo_final.pt');

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from pathlib import Path
from agents.ppo_agent import PPOAgent
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig

# Load model
model_path = '${modelFile.replace(/\\/g, '/')}'
if not Path(model_path).exists():
    print(json.dumps({'success': False, 'error': 'Model not found'}))
    sys.exit(0)

agent = PPOAgent.load(model_path)

# Create minimal environment for observation
# In production, would use real market data
np.random.seed(42)
n_days = 100
n_assets = ${symbols.length}
prices = np.zeros((n_days, n_assets))
prices[0] = 100
for t in range(1, n_days):
    prices[t] = prices[t-1] * (1 + np.random.normal(0.0005, 0.02, n_assets))

env = PortfolioTradingEnv(prices=prices, seed=42)
obs, _ = env.reset()

# Get action
action, log_prob, value = agent.select_action(obs, deterministic=${deterministic ? 'True' : 'False'})

result = {
    'success': True,
    'weights': {symbol: float(w) for symbol, w in zip(${JSON.stringify(symbols)}, action)},
    'value_estimate': float(value),
    'log_prob': float(log_prob),
    'model_info': agent.get_policy_info()
}

print(json.dumps(result))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 30000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('RL prediction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Backtest RL agent on historical data
   * @param {Object} config - Backtest configuration
   * @returns {Object} Backtest results
   */
  async backtestRLAgent(config = {}) {
    const {
      symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'META'],
      modelPath = null,
      nEpisodes = 10,
      startDate = null,
      endDate = null,
    } = config;

    const modelFile = modelPath || path.join(this.checkpointDir, 'rl', 'ppo_final.pt');

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${this.modelDir.replace(/\\/g, '/')}')
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from pathlib import Path
from agents.ppo_agent import PPOAgent
from environments.portfolio_env import PortfolioTradingEnv, PortfolioEnvConfig
from train_rl import load_price_data

# Load model
model_path = '${modelFile.replace(/\\/g, '/')}'
if not Path(model_path).exists():
    print(json.dumps({'success': False, 'error': 'Model not found'}))
    sys.exit(0)

agent = PPOAgent.load(model_path)

# Load price data
symbols = ${JSON.stringify(symbols)}
price_df = load_price_data(symbols)
prices = price_df.values.astype(np.float32)

# Create environment
env = PortfolioTradingEnv(prices=prices, asset_names=symbols, seed=42)

# Run backtest episodes
episode_stats = []
for ep in range(${nEpisodes}):
    obs, _ = env.reset()
    done = False

    while not done:
        action, _, _ = agent.select_action(obs, deterministic=True)
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated

    stats = env.get_episode_stats()
    episode_stats.append(stats)

# Aggregate results
results = {
    'success': True,
    'n_episodes': ${nEpisodes},
    'mean_sharpe': np.mean([s['sharpe'] for s in episode_stats]),
    'std_sharpe': np.std([s['sharpe'] for s in episode_stats]),
    'mean_return': np.mean([s['total_return'] for s in episode_stats]),
    'mean_max_drawdown': np.mean([s['max_drawdown'] for s in episode_stats]),
    'mean_volatility': np.mean([s['volatility'] for s in episode_stats]),
    'mean_sortino': np.mean([s['sortino'] for s in episode_stats]),
    'mean_calmar': np.mean([s['calmar'] for s in episode_stats]),
    'episodes': episode_stats,
}

print(json.dumps(results, default=float))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 120000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('RL backtest failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available RL models
   * @returns {Array} List of available models
   */
  async getAvailableRLModels() {
    const rlDir = path.join(this.checkpointDir, 'rl');

    if (!fs.existsSync(rlDir)) {
      return [];
    }

    const files = fs.readdirSync(rlDir);
    const models = files
      .filter(f => f.endsWith('.pt'))
      .map(f => {
        const filePath = path.join(rlDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          path: filePath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      });

    return models;
  }

  /**
   * Get RL agent info
   * @param {string} modelPath - Path to model file
   * @returns {Object} Model information
   */
  async getRLAgentInfo(modelPath = null) {
    const modelFile = modelPath || path.join(this.checkpointDir, 'rl', 'ppo_final.pt');

    const script = `
import sys
import json
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from pathlib import Path
from agents.ppo_agent import PPOAgent

model_path = '${modelFile.replace(/\\/g, '/')}'
if not Path(model_path).exists():
    print(json.dumps({'success': False, 'error': 'Model not found'}))
    sys.exit(0)

agent = PPOAgent.load(model_path)
info = agent.get_policy_info()
info['success'] = True

print(json.dumps(info))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 10000 });
      return JSON.parse(result);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // EXPLAINABILITY METHODS (SHAP)
  // ============================================================================

  /**
   * Explain model predictions using SHAP values
   * @param {Object} config - Configuration
   * @returns {Object} Explanation results
   */
  async explainPrediction(config = {}) {
    const {
      modelType = 'xgboost',
      features = null,
      featureNames = null,
      symbol = null,
      nSamples = 100,
    } = config;

    if (!features || !Array.isArray(features)) {
      return { success: false, error: 'features array is required' };
    }

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from explainability.shap_explainer import explain_prediction, HAS_SHAP, HAS_XGB

if not HAS_SHAP:
    print(json.dumps({'success': False, 'error': 'SHAP not installed'}))
    sys.exit(0)

if not HAS_XGB:
    print(json.dumps({'success': False, 'error': 'XGBoost not installed'}))
    sys.exit(0)

import xgboost as xgb

# Create sample model and data for demonstration
# In production, would load actual trained model
np.random.seed(42)
n_samples = 500
n_features = len(${JSON.stringify(featureNames || [])}) or 10
feature_names = ${featureNames ? JSON.stringify(featureNames) : 'None'} or [f"feature_{i}" for i in range(n_features)]

# Generate synthetic training data
X_train = np.random.randn(n_samples, n_features)
y_train = 0.3 * X_train[:, 0] - 0.2 * X_train[:, 1] + np.random.randn(n_samples) * 0.1

# Train model
model = xgb.XGBRegressor(n_estimators=50, max_depth=3, random_state=42)
model.fit(X_train, y_train)

# Explain provided features or sample
features = np.array(${JSON.stringify(features)})
if features.ndim == 1:
    features = features.reshape(1, -1)

# Get explanations
explanations = explain_prediction(
    model=model,
    X=features,
    feature_names=feature_names,
    background_data=X_train[:${nSamples}],
    model_type='${modelType}'
)

result = {
    'success': True,
    'explanations': explanations,
    'symbol': ${symbol ? `'${symbol}'` : 'None'},
    'model_type': '${modelType}',
    'n_features': n_features,
}

print(json.dumps(result, default=float))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 60000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('Explain prediction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get global feature importance using SHAP
   * @param {Object} config - Configuration
   * @returns {Object} Feature importance results
   */
  async getShapFeatureImportance(config = {}) {
    const {
      modelType = 'xgboost',
      featureNames = null,
      nSamples = 500,
    } = config;

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from explainability.shap_explainer import get_feature_importance, HAS_SHAP, HAS_XGB

if not HAS_SHAP:
    print(json.dumps({'success': False, 'error': 'SHAP not installed'}))
    sys.exit(0)

if not HAS_XGB:
    print(json.dumps({'success': False, 'error': 'XGBoost not installed'}))
    sys.exit(0)

import xgboost as xgb

# Create sample model for demonstration
np.random.seed(42)
n_samples = ${nSamples}
feature_names = ${featureNames ? JSON.stringify(featureNames) : 'None'} or [
    'momentum_score', 'value_score', 'quality_score', 'volatility_score',
    'rsi_14', 'macd_signal', 'sma_20_ratio', 'pe_ratio_zscore',
    'revenue_growth_yoy', 'insider_net_shares_90d'
]
n_features = len(feature_names)

# Generate synthetic training data with meaningful relationships
X = np.random.randn(n_samples, n_features)
y = (0.3 * X[:, 0] - 0.25 * X[:, 1] + 0.2 * X[:, 2] - 0.15 * X[:, 3] +
     0.1 * X[:, 4] + np.random.randn(n_samples) * 0.1)

# Train model
model = xgb.XGBRegressor(n_estimators=100, max_depth=4, random_state=42)
model.fit(X, y)

# Get SHAP feature importance
importance = get_feature_importance(
    model=model,
    X=X,
    feature_names=feature_names,
    model_type='${modelType}'
)

result = {
    'success': True,
    **importance,
}

print(json.dumps(result, default=float))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 60000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('Get SHAP importance failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get comprehensive SHAP summary for a model
   * @param {Object} config - Configuration
   * @returns {Object} SHAP summary
   */
  async getShapSummary(config = {}) {
    const {
      modelType = 'xgboost',
      featureNames = null,
      nSamples = 300,
      includeInteractions = true,
    } = config;

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from explainability.shap_explainer import get_shap_summary, HAS_SHAP, HAS_XGB

if not HAS_SHAP:
    print(json.dumps({'success': False, 'error': 'SHAP not installed'}))
    sys.exit(0)

if not HAS_XGB:
    print(json.dumps({'success': False, 'error': 'XGBoost not installed'}))
    sys.exit(0)

import xgboost as xgb

# Create model
np.random.seed(42)
n_samples = ${nSamples}
feature_names = ${featureNames ? JSON.stringify(featureNames) : 'None'} or [
    'momentum_score', 'value_score', 'quality_score', 'volatility_score',
    'rsi_14', 'macd_signal', 'sma_20_ratio', 'pe_ratio_zscore',
    'revenue_growth_yoy', 'insider_net_shares_90d', 'short_interest_ratio',
    'earnings_growth_yoy'
]
n_features = len(feature_names)

X = np.random.randn(n_samples, n_features)
y = (0.3 * X[:, 0] - 0.25 * X[:, 1] + 0.2 * X[:, 2] - 0.15 * X[:, 3] +
     0.1 * X[:, 4] - 0.08 * X[:, 5] + np.random.randn(n_samples) * 0.1)

model = xgb.XGBRegressor(n_estimators=100, max_depth=4, random_state=42)
model.fit(X, y)

# Get comprehensive summary
summary = get_shap_summary(
    model=model,
    X=X,
    feature_names=feature_names,
    model_type='${modelType}'
)

summary['success'] = True
print(json.dumps(summary, default=float))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 120000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('Get SHAP summary failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Explain prediction for a specific stock
   * @param {string} symbol - Stock symbol
   * @param {Object} config - Configuration
   * @returns {Object} Stock-specific explanation
   */
  async explainStockPrediction(symbol, config = {}) {
    const {
      featureNames = null,
      featureValues = null,
    } = config;

    const script = `
import sys
import json
import numpy as np
sys.path.insert(0, '${path.join(this.modelDir, '..').replace(/\\/g, '/')}')

from explainability.shap_explainer import explain_stock_prediction, HAS_SHAP, HAS_XGB

if not HAS_SHAP:
    print(json.dumps({'success': False, 'error': 'SHAP not installed'}))
    sys.exit(0)

if not HAS_XGB:
    print(json.dumps({'success': False, 'error': 'XGBoost not installed'}))
    sys.exit(0)

import xgboost as xgb

np.random.seed(42)
feature_names = ${featureNames ? JSON.stringify(featureNames) : 'None'} or [
    'momentum_score', 'value_score', 'quality_score', 'volatility_score',
    'rsi_14', 'macd_signal', 'sma_20_ratio', 'pe_ratio_zscore',
    'revenue_growth_yoy', 'insider_net_shares_90d'
]
n_features = len(feature_names)

# Training data
X_train = np.random.randn(500, n_features)
y_train = (0.3 * X_train[:, 0] - 0.25 * X_train[:, 1] + 0.2 * X_train[:, 2] +
           np.random.randn(500) * 0.1)

model = xgb.XGBRegressor(n_estimators=100, max_depth=4, random_state=42)
model.fit(X_train, y_train)

# Stock features
stock_features = ${featureValues ? `np.array(${JSON.stringify(featureValues)})` : 'np.random.randn(n_features)'}

# Get explanation
explanation = explain_stock_prediction(
    model=model,
    features=stock_features,
    symbol='${symbol}',
    feature_names=feature_names,
    background_data=X_train
)

explanation['success'] = True
print(json.dumps(explanation, default=float))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 60000 });
      const jsonMatch = result.match(/\{[\s\S]*"success"[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('Explain stock prediction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if SHAP is available
   * @returns {Object} SHAP availability status
   */
  async checkShapAvailability() {
    const script = `
import sys
import json

result = {'shap': False, 'xgboost': False, 'lightgbm': False}

try:
    import shap
    result['shap'] = True
    result['shap_version'] = shap.__version__
except ImportError:
    pass

try:
    import xgboost
    result['xgboost'] = True
    result['xgboost_version'] = xgboost.__version__
except ImportError:
    pass

try:
    import lightgbm
    result['lightgbm'] = True
    result['lightgbm_version'] = lightgbm.__version__
except ImportError:
    pass

result['success'] = True
result['ready'] = result['shap'] and (result['xgboost'] or result['lightgbm'])

print(json.dumps(result))
`;

    try {
      const result = await this._runPythonScript(script, { timeout: 10000 });
      return JSON.parse(result);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // PREDICTION LOGGING FOR DRIFT MONITORING
  // ============================================================================

  /**
   * Log predictions to database for drift monitoring
   * @param {Object} predictions - Symbol -> prediction mapping
   * @param {string} asOfDate - Prediction date
   * @param {Object} options - Additional options
   */
  _logPredictions(predictions, asOfDate, options = {}) {
    if (!this.db || !this.enablePredictionLogging) return;

    const modelName = options.modelName || 'deep_learning_ensemble';
    const modelVersion = options.modelVersion || 'latest';
    const modelType = options.modelType || 'ensemble';
    const holdingPeriod = options.holdingPeriod || this.defaultHoldingPeriod;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO model_predictions
        (model_name, model_version, symbol, prediction_date, predicted_return,
         predicted_uncertainty, holding_period, model_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertMany = this.db.transaction((entries) => {
        for (const entry of entries) {
          stmt.run(...entry);
        }
      });

      const entries = [];
      for (const [symbol, pred] of Object.entries(predictions)) {
        const expectedReturn = pred.expected_return ?? pred.prediction ?? 0;
        const uncertainty = pred.uncertainty ?? pred.std ?? null;

        entries.push([
          modelName,
          modelVersion,
          symbol,
          asOfDate,
          expectedReturn,
          uncertainty,
          holdingPeriod,
          pred.model_type || modelType
        ]);
      }

      if (entries.length > 0) {
        insertMany(entries);
        this.stats.predictionsLogged += entries.length;
      }
    } catch (e) {
      console.warn('PythonMLClient: Failed to log predictions:', e.message);
    }
  }

  /**
   * Update actual returns for past predictions
   * Should be called after holding period expires
   * @param {string} startDate - Start date for predictions to update
   * @param {string} endDate - End date for predictions to update
   * @returns {Object} Update results
   */
  async updateActualReturns(startDate = null, endDate = null) {
    if (!this.db) {
      return { success: false, error: 'No database connection' };
    }

    try {
      // Get predictions that need actual returns updated
      let query = `
        SELECT p.id, p.symbol, p.prediction_date, p.holding_period
        FROM model_predictions p
        WHERE p.actual_return IS NULL
      `;
      const params = [];

      if (startDate) {
        query += ' AND p.prediction_date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        query += ' AND p.prediction_date <= ?';
        params.push(endDate);
      }

      // Only update predictions where holding period has passed
      query += ' AND date(p.prediction_date, \'+\' || p.holding_period || \' days\') <= date(\'now\')';

      const predictions = this.db.prepare(query).all(...params);

      if (predictions.length === 0) {
        return { success: true, updated: 0, message: 'No predictions to update' };
      }

      // Check if daily_prices table exists
      const tableCheck = this.db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='daily_prices'
      `).get();

      if (!tableCheck) {
        return { success: false, error: 'daily_prices table not found' };
      }

      // Update each prediction with actual return
      const updateStmt = this.db.prepare(`
        UPDATE model_predictions
        SET actual_return = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let updated = 0;
      let skipped = 0;

      for (const pred of predictions) {
        const { id, symbol, prediction_date, holding_period } = pred;

        // Calculate target date
        const predDate = new Date(prediction_date);
        const targetDate = new Date(predDate);
        targetDate.setDate(targetDate.getDate() + holding_period);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        // Get prices
        const prices = this.db.prepare(`
          SELECT close, date FROM daily_prices
          WHERE symbol = ?
            AND date IN (
              (SELECT MAX(date) FROM daily_prices WHERE symbol = ? AND date <= ?),
              (SELECT MAX(date) FROM daily_prices WHERE symbol = ? AND date <= ?)
            )
          ORDER BY date ASC
        `).all(symbol, symbol, prediction_date, symbol, targetDateStr);

        if (prices.length >= 2) {
          const startPrice = prices[0].close;
          const endPrice = prices[prices.length - 1].close;
          const actualReturn = (endPrice - startPrice) / startPrice;

          updateStmt.run(actualReturn, id);
          updated++;
        } else {
          skipped++;
        }
      }

      return {
        success: true,
        updated,
        skipped,
        total: predictions.length
      };
    } catch (e) {
      console.error('PythonMLClient: Failed to update actual returns:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Get prediction statistics for drift monitoring
   * @param {string} modelName - Model name to filter by
   * @param {number} days - Number of days to look back
   * @returns {Object} Prediction statistics
   */
  getPredictionStats(modelName = null, days = 30) {
    if (!this.db) {
      return { success: false, error: 'No database connection' };
    }

    try {
      let query = `
        SELECT
          model_name,
          COUNT(*) as total_predictions,
          SUM(CASE WHEN actual_return IS NOT NULL THEN 1 ELSE 0 END) as with_actuals,
          AVG(predicted_return) as avg_prediction,
          AVG(actual_return) as avg_actual,
          AVG(predicted_uncertainty) as avg_uncertainty,
          MIN(prediction_date) as earliest_date,
          MAX(prediction_date) as latest_date
        FROM model_predictions
        WHERE prediction_date >= date('now', '-' || ? || ' days')
      `;
      const params = [days];

      if (modelName) {
        query += ' AND model_name = ?';
        params.push(modelName);
      }

      query += ' GROUP BY model_name';

      const stats = this.db.prepare(query).all(...params);

      // Calculate IC if we have actuals
      const icStats = {};
      for (const stat of stats) {
        const predictions = this.db.prepare(`
          SELECT predicted_return, actual_return
          FROM model_predictions
          WHERE model_name = ?
            AND actual_return IS NOT NULL
            AND prediction_date >= date('now', '-' || ? || ' days')
        `).all(stat.model_name, days);

        if (predictions.length >= 30) {
          // Calculate Pearson correlation (IC)
          const preds = predictions.map(p => p.predicted_return);
          const acts = predictions.map(p => p.actual_return);
          const n = preds.length;

          const meanP = preds.reduce((a, b) => a + b, 0) / n;
          const meanA = acts.reduce((a, b) => a + b, 0) / n;

          let sumPP = 0, sumAA = 0, sumPA = 0;
          for (let i = 0; i < n; i++) {
            const dp = preds[i] - meanP;
            const da = acts[i] - meanA;
            sumPP += dp * dp;
            sumAA += da * da;
            sumPA += dp * da;
          }

          const ic = sumPP > 0 && sumAA > 0
            ? sumPA / (Math.sqrt(sumPP) * Math.sqrt(sumAA))
            : 0;

          // Direction accuracy
          let correctDir = 0;
          for (let i = 0; i < n; i++) {
            if ((preds[i] > 0 && acts[i] > 0) || (preds[i] < 0 && acts[i] < 0)) {
              correctDir++;
            }
          }
          const directionAccuracy = correctDir / n;

          icStats[stat.model_name] = {
            ic,
            directionAccuracy,
            sampleSize: n
          };
        }
      }

      return {
        success: true,
        stats,
        icStats,
        days
      };
    } catch (e) {
      console.error('PythonMLClient: Failed to get prediction stats:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Get predictions for a specific symbol
   * @param {string} symbol - Stock symbol
   * @param {number} limit - Maximum number of predictions
   * @returns {Array} Recent predictions
   */
  getSymbolPredictions(symbol, limit = 50) {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT *
        FROM model_predictions
        WHERE symbol = ?
        ORDER BY prediction_date DESC
        LIMIT ?
      `).all(symbol, limit);
    } catch (e) {
      console.warn('PythonMLClient: Failed to get symbol predictions:', e.message);
      return [];
    }
  }

  /**
   * Sync predictions with ModelMonitor for drift detection
   * @param {ModelMonitor} modelMonitor - ModelMonitor instance
   * @param {string} modelName - Model name
   * @param {number} days - Days to look back
   */
  syncWithModelMonitor(modelMonitor, modelName = 'deep_learning_ensemble', days = 30) {
    if (!this.db || !modelMonitor) return;

    try {
      const predictions = this.db.prepare(`
        SELECT predicted_return, actual_return, predicted_uncertainty
        FROM model_predictions
        WHERE model_name = ?
          AND prediction_date >= date('now', '-' || ? || ' days')
        ORDER BY prediction_date ASC
      `).all(modelName, days);

      for (const pred of predictions) {
        modelMonitor.recordPrediction(
          modelName,
          pred.predicted_return,
          pred.actual_return,
          pred.predicted_uncertainty
        );
      }

      console.log(`[PythonMLClient] Synced ${predictions.length} predictions with ModelMonitor`);
    } catch (e) {
      console.warn('PythonMLClient: Failed to sync with ModelMonitor:', e.message);
    }
  }
}

module.exports = { PythonMLClient };
