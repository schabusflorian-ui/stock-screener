// src/api/routes/backtesting.js
// API routes for HF-style comprehensive backtesting framework

const express = require('express');
const router = express.Router();
const backtesting = require('../../services/backtesting');

// ============================================
// Walk-Forward Analysis Endpoints
// ============================================

/**
 * POST /api/backtesting/walk-forward
 * Run walk-forward optimization analysis
 */
router.post('/walk-forward', async (req, res) => {
  try {
    const {
      portfolioId,
      strategyName,
      startDate,
      endDate,
      mode = 'rolling',
      windowSize = 252,
      stepSize = 63,
      isRatio = 0.7
    } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.walkForward.run({
      portfolioId,
      strategyName,
      startDate,
      endDate,
      mode,
      windowSize,
      stepSize,
      isRatio
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Walk-forward error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/cpcv
 * Run Combinatorial Purged Cross-Validation
 */
router.post('/cpcv', async (req, res) => {
  try {
    const { portfolioId, startDate, endDate, nSplits = 5, nTestGroups = 2, purgeGap = 5 } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.walkForward.runCPCV({
      portfolioId,
      startDate,
      endDate,
      nSplits,
      nTestGroups,
      purgeGap
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('CPCV error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/walk-forward/:portfolioId
 * List walk-forward backtests for a portfolio
 */
router.get('/walk-forward/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const results = backtesting.walkForward.listBacktests(parseInt(portfolioId), parseInt(limit));

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Get walk-forward history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// IC Analysis Endpoints
// ============================================

/**
 * POST /api/backtesting/ic-analysis
 * Analyze signal Information Coefficient
 */
router.post('/ic-analysis', async (req, res) => {
  try {
    const {
      signalType,
      startDate,
      endDate,
      horizons = [1, 5, 10, 21, 63],
      regime = 'ALL'
    } = req.body;

    if (!signalType) {
      return res.status(400).json({ success: false, error: 'signalType is required' });
    }

    const result = await backtesting.ic.analyzeDecay({
      signalType,
      startDate,
      endDate,
      horizons,
      regime
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('IC analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/ic-history/:signalType
 * Get IC history for a signal type
 */
router.get('/ic-history/:signalType', (req, res) => {
  try {
    const { signalType } = req.params;
    const { days = 90 } = req.query;

    const history = backtesting.ic.getHistory(signalType, parseInt(days));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get IC history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/ic-correlation
 * Get signal correlation matrix
 */
router.post('/ic-correlation', async (req, res) => {
  try {
    const { signalTypes, startDate, endDate } = req.body;

    if (!signalTypes || !Array.isArray(signalTypes)) {
      return res.status(400).json({ success: false, error: 'signalTypes array is required' });
    }

    const result = await backtesting.ic.getCorrelationMatrix(signalTypes, startDate, endDate);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('IC correlation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/signal-types
 * Get all signal types with IC data
 */
router.get('/signal-types', (req, res) => {
  try {
    const types = backtesting.ic.getSignalTypes();
    res.json({ success: true, data: types });
  } catch (error) {
    console.error('Get signal types error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// VaR Backtesting Endpoints
// ============================================

/**
 * POST /api/backtesting/var-backtest
 * Run VaR model validation
 */
router.post('/var-backtest', async (req, res) => {
  try {
    const {
      portfolioId,
      startDate,
      endDate,
      confidenceLevel = 0.99,
      method = 'historical'
    } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.var.run({
      portfolioId,
      startDate,
      endDate,
      confidenceLevel,
      method
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('VaR backtest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/var-history/:portfolioId
 * Get VaR backtest history
 */
router.get('/var-history/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const history = backtesting.var.getHistory(parseInt(portfolioId), parseInt(limit));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get VaR history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/var-exceptions/:portfolioId
 * Get VaR exceptions
 */
router.get('/var-exceptions/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { days = 90 } = req.query;

    const exceptions = backtesting.var.getExceptions(parseInt(portfolioId), parseInt(days));

    res.json({ success: true, data: exceptions });
  } catch (error) {
    console.error('Get VaR exceptions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Alpha Validation Endpoints
// ============================================

/**
 * POST /api/backtesting/alpha-validation
 * Run statistical alpha validation
 */
router.post('/alpha-validation', async (req, res) => {
  try {
    const {
      portfolioId,
      benchmark = 'SPY',
      startDate,
      endDate,
      nBootstrap = 10000,
      nTrials = 1
    } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.alpha.run({
      portfolioId,
      benchmark,
      startDate,
      endDate,
      nBootstrap,
      nTrials
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Alpha validation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/alpha-history/:portfolioId
 * Get alpha validation history
 */
router.get('/alpha-history/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const history = backtesting.alpha.getHistory(parseInt(portfolioId), parseInt(limit));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get alpha history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/deflated-sharpe
 * Calculate Deflated Sharpe Ratio
 */
router.post('/deflated-sharpe', (req, res) => {
  try {
    const { sharpe, nTrials, skew = 0, kurtosis = 3, nObservations } = req.body;

    if (sharpe === undefined || nTrials === undefined || nObservations === undefined) {
      return res.status(400).json({
        success: false,
        error: 'sharpe, nTrials, and nObservations are required'
      });
    }

    const result = backtesting.alpha.deflatedSharpe(sharpe, nTrials, skew, kurtosis, nObservations);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Deflated Sharpe error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/minimum-track-record
 * Calculate minimum track record length
 */
router.post('/minimum-track-record', (req, res) => {
  try {
    const { sharpe, targetProb = 0.95, skew = 0, kurtosis = 3 } = req.body;

    if (sharpe === undefined) {
      return res.status(400).json({ success: false, error: 'sharpe is required' });
    }

    const result = backtesting.alpha.minimumTrackRecord(sharpe, targetProb, skew, kurtosis);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Minimum track record error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Stress Testing Endpoints
// ============================================

/**
 * POST /api/backtesting/stress-test
 * Run stress test scenario
 */
router.post('/stress-test', async (req, res) => {
  try {
    const { portfolioId, scenarioName, customScenario } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    if (!scenarioName && !customScenario) {
      return res.status(400).json({
        success: false,
        error: 'scenarioName or customScenario is required'
      });
    }

    const result = await backtesting.stress.runHistorical({
      portfolioId,
      scenarioName,
      customScenario
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Stress test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/factor-stress
 * Run factor stress test
 */
router.post('/factor-stress', async (req, res) => {
  try {
    const { portfolioId, factorShocks } = req.body;

    if (!portfolioId || !factorShocks) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId and factorShocks are required'
      });
    }

    const result = await backtesting.stress.runFactor({ portfolioId, factorShocks });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Factor stress error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/reverse-stress
 * Run reverse stress test
 */
router.post('/reverse-stress', async (req, res) => {
  try {
    const { portfolioId, targetLoss } = req.body;

    if (!portfolioId || targetLoss === undefined) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId and targetLoss are required'
      });
    }

    const result = await backtesting.stress.runReverse({ portfolioId, targetLoss });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Reverse stress error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/stress-scenarios
 * Get available stress scenarios
 */
router.get('/stress-scenarios', (req, res) => {
  try {
    const scenarios = backtesting.stress.getScenarios();
    res.json({ success: true, data: scenarios });
  } catch (error) {
    console.error('Get scenarios error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/stress-history/:portfolioId
 * Get stress test history
 */
router.get('/stress-history/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const history = backtesting.stress.getHistory(parseInt(portfolioId), parseInt(limit));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get stress history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Regime Analysis Endpoints
// ============================================

/**
 * GET /api/backtesting/regime-analysis/:portfolioId
 * Get regime-conditional performance analysis
 */
router.get('/regime-analysis/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { startDate, endDate } = req.query;

    const result = await backtesting.regime.analyze({
      portfolioId: parseInt(portfolioId),
      startDate,
      endDate
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Regime analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/signal-regime-analysis
 * Analyze signal performance by regime
 */
router.post('/signal-regime-analysis', async (req, res) => {
  try {
    const { signalTypes, startDate, endDate } = req.body;

    const result = await backtesting.regime.analyzeSignals({
      signalTypes: signalTypes || ['technical', 'fundamental', 'sentiment', 'insider'],
      startDate,
      endDate
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Signal regime analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/current-regime
 * Get current market regime
 */
router.get('/current-regime', (req, res) => {
  try {
    const regime = backtesting.regime.getCurrent();
    res.json({ success: true, data: regime });
  } catch (error) {
    console.error('Get current regime error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Execution Analysis Endpoints
// ============================================

/**
 * POST /api/backtesting/execution-simulate
 * Simulate order execution
 */
router.post('/execution-simulate', (req, res) => {
  try {
    const { order, marketData, model = 'square_root' } = req.body;

    if (!order || !marketData) {
      return res.status(400).json({
        success: false,
        error: 'order and marketData are required'
      });
    }

    const result = backtesting.execution.simulate(order, marketData, model);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Execution simulate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/execution-analysis
 * Analyze execution costs for trades
 */
router.post('/execution-analysis', async (req, res) => {
  try {
    const { portfolioId, backtestId, trades } = req.body;

    if (!trades || !Array.isArray(trades)) {
      return res.status(400).json({ success: false, error: 'trades array is required' });
    }

    const result = await backtesting.execution.analyzeCosts({
      portfolioId,
      backtestId,
      trades
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Execution analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/execution-compare
 * Compare execution strategies
 */
router.post('/execution-compare', (req, res) => {
  try {
    const { order, marketData, tradingHours = 6.5 } = req.body;

    if (!order || !marketData) {
      return res.status(400).json({
        success: false,
        error: 'order and marketData are required'
      });
    }

    const result = backtesting.execution.compareStrategies(order, marketData, tradingHours);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Execution compare error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Capacity Analysis Endpoints
// ============================================

/**
 * POST /api/backtesting/capacity
 * Estimate strategy capacity
 */
router.post('/capacity', async (req, res) => {
  try {
    const { portfolioId, targetSlippageBps = 25, turnover, returnTarget } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.capacity.estimate({
      portfolioId,
      targetSlippageBps,
      turnover,
      returnTarget
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Capacity estimate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/liquidity-adjusted-returns
 * Calculate liquidity-adjusted returns at different AUM levels
 */
router.post('/liquidity-adjusted-returns', async (req, res) => {
  try {
    const { portfolioId, grossReturn, aumLevels } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    const result = await backtesting.capacity.liquidityAdjustedReturns({
      portfolioId,
      grossReturn,
      aumLevels
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Liquidity-adjusted returns error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/capacity-history/:portfolioId
 * Get capacity analysis history
 */
router.get('/capacity-history/:portfolioId', (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { limit = 10 } = req.query;

    const history = backtesting.capacity.getHistory(parseInt(portfolioId), parseInt(limit));

    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get capacity history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Comprehensive Report Endpoint
// ============================================

/**
 * POST /api/backtesting/comprehensive-report
 * Run all backtesting analyses for a portfolio
 */
router.post('/comprehensive-report', async (req, res) => {
  try {
    const { portfolioId, startDate, endDate } = req.body;

    if (!portfolioId) {
      return res.status(400).json({ success: false, error: 'portfolioId is required' });
    }

    // Run all analyses in parallel
    const [
      walkForward,
      alphaValidation,
      regimeAnalysis,
      capacityAnalysis
    ] = await Promise.all([
      backtesting.walkForward.run({ portfolioId, startDate, endDate }).catch(e => ({ error: e.message })),
      backtesting.alpha.run({ portfolioId, startDate, endDate }).catch(e => ({ error: e.message })),
      backtesting.regime.analyze({ portfolioId, startDate, endDate }).catch(e => ({ error: e.message })),
      backtesting.capacity.estimate({ portfolioId }).catch(e => ({ error: e.message }))
    ]);

    // Get current regime
    const currentRegime = backtesting.regime.getCurrent();

    // Get available stress scenarios
    const stressScenarios = backtesting.stress.getScenarios();

    res.json({
      success: true,
      data: {
        portfolioId,
        period: { startDate, endDate },
        currentRegime,
        walkForward,
        alphaValidation,
        regimeAnalysis,
        capacityAnalysis,
        availableStressScenarios: stressScenarios.length
      }
    });
  } catch (error) {
    console.error('Comprehensive report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Weight Optimization Endpoints
// ============================================

const { WeightOptimizer, DEFAULT_WEIGHTS } = require('../../services/backtesting/weightOptimizer');
const { SignalPredictivePowerAnalyzer } = require('../../services/backtesting/signalPredictivePower');

/**
 * POST /api/backtesting/weight-optimization/run
 * Start a weight optimization run
 */
router.post('/weight-optimization/run', async (req, res) => {
  try {
    const {
      runName,
      startDate,
      endDate,
      optimizationTarget = 'alpha',
      stepSize = 0.10,
      regimeSpecific = true,
      runAblation = true,
      useWalkForward = true
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const optimizer = new WeightOptimizer(db);
    const results = await optimizer.runOptimization({
      runName,
      startDate,
      endDate,
      optimizationTarget,
      stepSize,
      regimeSpecific,
      runAblation,
      useWalkForward,
      verbose: true
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Weight optimization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/weight-optimization/results/:runId
 * Get results of a weight optimization run
 */
router.get('/weight-optimization/results/:runId', (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    const optimizer = new WeightOptimizer(db);
    const results = optimizer.getOptimizationResults(runId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Optimization run not found'
      });
    }

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Get optimization results error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/weight-optimization/runs
 * List all optimization runs
 */
router.get('/weight-optimization/runs', (req, res) => {
  try {
    const runs = db.prepare(`
      SELECT id, run_name, run_type, start_date, end_date,
             optimization_target, total_combinations_tested,
             best_alpha, best_sharpe, improvement_pct,
             walk_forward_efficiency, status, created_at, completed_at
      FROM weight_optimization_runs
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    res.json({
      success: true,
      data: runs
    });
  } catch (error) {
    console.error('List optimization runs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/weight-optimization/best-weights
 * Get current best weights (optionally by regime)
 */
router.get('/weight-optimization/best-weights', (req, res) => {
  try {
    const { regime } = req.query;
    const optimizer = new WeightOptimizer(db);

    if (regime) {
      // Get regime-specific weights
      const regimeWeights = db.prepare(`
        SELECT * FROM regime_optimal_weights
        WHERE regime = ? AND is_active = 1
        ORDER BY valid_from DESC
        LIMIT 1
      `).get(regime);

      if (regimeWeights) {
        return res.json({
          success: true,
          data: {
            regime,
            weights: {
              technical: regimeWeights.technical_weight,
              fundamental: regimeWeights.fundamental_weight,
              sentiment: regimeWeights.sentiment_weight,
              insider: regimeWeights.insider_weight,
              valuation: regimeWeights.valuation_weight,
              factor: regimeWeights.factor_weight
            },
            alpha: regimeWeights.alpha,
            sharpe: regimeWeights.sharpe_ratio
          }
        });
      }
    }

    // Get overall best weights from most recent completed run
    const bestRun = db.prepare(`
      SELECT best_weights, best_alpha, best_sharpe
      FROM weight_optimization_runs
      WHERE status = 'completed' AND best_weights IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `).get();

    if (bestRun) {
      return res.json({
        success: true,
        data: {
          regime: regime || 'ALL',
          weights: JSON.parse(bestRun.best_weights),
          alpha: bestRun.best_alpha,
          sharpe: bestRun.best_sharpe
        }
      });
    }

    // Return defaults if no optimization has been run
    res.json({
      success: true,
      data: {
        regime: 'ALL',
        weights: DEFAULT_WEIGHTS,
        alpha: null,
        sharpe: null,
        note: 'No optimization run found, returning default weights'
      }
    });
  } catch (error) {
    console.error('Get best weights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/signal-predictive-power/analyze
 * Analyze predictive power of all signals
 */
router.post('/signal-predictive-power/analyze', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const analyzer = new SignalPredictivePowerAnalyzer(db);
    const results = await analyzer.analyzeAllSignals(startDate, endDate);

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Signal predictive power analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/signal-predictive-power/ranking
 * Get signals ranked by predictive power
 */
router.get('/signal-predictive-power/ranking', (req, res) => {
  try {
    const { regime = 'ALL', horizon = 21 } = req.query;

    const rankings = db.prepare(`
      SELECT signal_type, ic, ic_ir, hit_rate, composite_score,
             decay_half_life, sample_size, calculated_at
      FROM signal_predictive_power
      WHERE regime = ? AND horizon_days = ?
      ORDER BY composite_score DESC
    `).all(regime, parseInt(horizon));

    // Add ranks
    rankings.forEach((r, i) => r.rank = i + 1);

    res.json({
      success: true,
      data: {
        regime,
        horizon: parseInt(horizon),
        rankings
      }
    });
  } catch (error) {
    console.error('Get signal ranking error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/backtesting/ablation-study
 * Run ablation study (remove each signal one at a time)
 */
router.post('/ablation-study', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const optimizer = new WeightOptimizer(db);
    const results = await optimizer.runOptimization({
      runName: `Ablation_${new Date().toISOString().split('T')[0]}`,
      startDate,
      endDate,
      stepSize: 1.0, // No grid search, just ablation
      regimeSpecific: false,
      runAblation: true,
      useWalkForward: false,
      verbose: true
    });

    res.json({
      success: true,
      data: {
        baseline: results.baseline,
        ablationResults: results.ablationResults
      }
    });
  } catch (error) {
    console.error('Ablation study error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/backtesting/weight-optimization/regime-weights
 * Get optimal weights for all regimes
 */
router.get('/weight-optimization/regime-weights', (req, res) => {
  try {
    const optimizer = new WeightOptimizer(db);
    const regimeWeights = optimizer.getActiveRegimeWeights();

    const formatted = {};
    for (const rw of regimeWeights) {
      formatted[rw.regime] = {
        weights: {
          technical: rw.technical_weight,
          fundamental: rw.fundamental_weight,
          sentiment: rw.sentiment_weight,
          insider: rw.insider_weight,
          valuation: rw.valuation_weight,
          factor: rw.factor_weight
        },
        alpha: rw.alpha,
        sharpe: rw.sharpe_ratio,
        walkForwardEfficiency: rw.walk_forward_efficiency
      };
    }

    res.json({
      success: true,
      data: formatted
    });
  } catch (error) {
    console.error('Get regime weights error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
