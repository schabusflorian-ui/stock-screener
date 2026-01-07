// src/api/routes/simulate.js
// API Routes for Portfolio Analytics and Simulation (Agent 2)

const express = require('express');
const router = express.Router();
const {
  metricsEngine,
  backtestEngine,
  monteCarloEngine,
  positionSizing,
  stressTestEngine,
  STRESS_SCENARIOS,
  advancedAnalytics,
  whatIfAnalysis,
  rebalanceCalculator
} = require('../../services/portfolio');
const advancedKelly = require('../../services/portfolio/advancedKelly');
const alphaAnalytics = require('../../services/portfolio/alphaAnalytics');

// ============================================
// Performance Metrics Routes
// ============================================

/**
 * GET /api/simulate/portfolios/:id/performance
 * Get performance metrics for a portfolio
 */
router.get('/portfolios/:id/performance', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const metrics = metricsEngine.getPerformanceMetrics(portfolioId, period);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/quick-metrics
 * Get quick dashboard metrics
 */
router.get('/portfolios/:id/quick-metrics', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const metrics = metricsEngine.getQuickMetrics(portfolioId);

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error getting quick metrics:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/allocation
 * Get allocation breakdown for a portfolio
 */
router.get('/portfolios/:id/allocation', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const allocation = metricsEngine.getAllocation(portfolioId);

    res.json({
      success: true,
      data: allocation
    });
  } catch (error) {
    console.error('Error getting allocation:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/risk
 * Get risk metrics for a portfolio (alias for performance with risk focus)
 */
router.get('/portfolios/:id/risk', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const metrics = metricsEngine.getPerformanceMetrics(portfolioId, period);

    // Extract risk-focused metrics
    const riskMetrics = {
      portfolioId,
      period,
      volatility: metrics.volatility,
      sharpeRatio: metrics.sharpeRatio,
      sortinoRatio: metrics.sortinoRatio,
      maxDrawdown: metrics.maxDrawdown,
      maxDrawdownStart: metrics.maxDrawdownStart,
      maxDrawdownEnd: metrics.maxDrawdownEnd,
      calmarRatio: metrics.calmarRatio,
      beta: metrics.benchmark?.beta,
      trackingError: metrics.benchmark?.trackingError
    };

    res.json({
      success: true,
      data: riskMetrics
    });
  } catch (error) {
    console.error('Error getting risk metrics:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Snapshot Routes
// ============================================

/**
 * POST /api/simulate/snapshots/create
 * Create a snapshot for a specific portfolio
 */
router.post('/snapshots/create', (req, res) => {
  try {
    const { portfolioId, date } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required'
      });
    }

    const result = metricsEngine.createDailySnapshot(portfolioId, date);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/snapshots/create-all
 * Create snapshots for all active portfolios
 */
router.post('/snapshots/create-all', (req, res) => {
  try {
    const { date } = req.body;
    const result = metricsEngine.createAllDailySnapshots(date);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error creating snapshots:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Backtest Routes
// ============================================

/**
 * POST /api/simulate/backtest
 * Run a new backtest
 */
router.post('/backtest', async (req, res) => {
  try {
    const config = req.body;

    // Validate required fields
    if (!config.allocations || config.allocations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'allocations array is required'
      });
    }

    if (!config.startDate || !config.endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    const result = await backtestEngine.runBacktest(config);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running backtest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/backtest/:id
 * Get a saved backtest
 */
router.get('/backtest/:id', (req, res) => {
  try {
    const backtestId = parseInt(req.params.id);
    const backtest = backtestEngine.getBacktest(backtestId);

    res.json({
      success: true,
      data: backtest
    });
  } catch (error) {
    console.error('Error getting backtest:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/backtests
 * List recent backtests
 */
router.get('/backtests', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const backtests = backtestEngine.listBacktests(parseInt(limit));

    res.json({
      success: true,
      data: backtests
    });
  } catch (error) {
    console.error('Error listing backtests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/simulate/backtest/:id
 * Delete a backtest
 */
router.delete('/backtest/:id', (req, res) => {
  try {
    const backtestId = parseInt(req.params.id);
    const result = backtestEngine.deleteBacktest(backtestId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error deleting backtest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Monte Carlo Routes
// ============================================

/**
 * POST /api/simulate/monte-carlo
 * Run a Monte Carlo simulation
 */
router.post('/monte-carlo', async (req, res) => {
  try {
    const config = req.body;

    // Validate required fields
    if (!config.portfolioId && !config.allocations) {
      return res.status(400).json({
        success: false,
        error: 'Either portfolioId or allocations is required'
      });
    }

    const result = await monteCarloEngine.runSimulation(config);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running Monte Carlo simulation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/monte-carlo/:id
 * Get a saved Monte Carlo simulation
 */
router.get('/monte-carlo/:id', (req, res) => {
  try {
    const simulationId = parseInt(req.params.id);
    const simulation = monteCarloEngine.getSimulation(simulationId);

    res.json({
      success: true,
      data: simulation
    });
  } catch (error) {
    console.error('Error getting Monte Carlo simulation:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/monte-carlo
 * List recent Monte Carlo simulations
 */
router.get('/monte-carlo', (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const simulations = monteCarloEngine.listSimulations(parseInt(limit));

    res.json({
      success: true,
      data: simulations
    });
  } catch (error) {
    console.error('Error listing Monte Carlo simulations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/simulate/monte-carlo/:id
 * Delete a Monte Carlo simulation
 */
router.delete('/monte-carlo/:id', (req, res) => {
  try {
    const simulationId = parseInt(req.params.id);
    const result = monteCarloEngine.deleteSimulation(simulationId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error deleting Monte Carlo simulation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Position Sizing Routes
// ============================================

/**
 * POST /api/simulate/position-size
 * Calculate position size
 */
router.post('/position-size', (req, res) => {
  try {
    const { method = 'fixed_risk', ...params } = req.body;

    if (!params.portfolioValue) {
      return res.status(400).json({
        success: false,
        error: 'portfolioValue is required'
      });
    }

    const result = positionSizing.calculate(method, params);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error calculating position size:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/risk-reward
 * Analyze risk/reward for a trade
 */
router.post('/risk-reward', (req, res) => {
  try {
    const params = req.body;

    if (!params.entryPrice || !params.stopLossPrice || !params.takeProfitPrice) {
      return res.status(400).json({
        success: false,
        error: 'entryPrice, stopLossPrice, and takeProfitPrice are required'
      });
    }

    const result = positionSizing.analyzeRiskReward(params);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error analyzing risk/reward:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/optimal-positions
 * Calculate optimal number of positions
 */
router.post('/optimal-positions', (req, res) => {
  try {
    const params = req.body;

    if (!params.portfolioValue) {
      return res.status(400).json({
        success: false,
        error: 'portfolioValue is required'
      });
    }

    const result = positionSizing.calculateOptimalPositions(params);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error calculating optimal positions:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Comparison
// ============================================

/**
 * POST /api/simulate/compare
 * Compare multiple portfolios or strategies
 */
router.post('/compare', (req, res) => {
  try {
    const { portfolioIds, startDate, endDate, period = '1y' } = req.body;

    if (!portfolioIds || portfolioIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'portfolioIds array is required'
      });
    }

    const results = portfolioIds.map(id => {
      try {
        return {
          portfolioId: id,
          metrics: metricsEngine.getPerformanceMetrics(id, period),
          success: true
        };
      } catch (error) {
        return {
          portfolioId: id,
          success: false,
          error: error.message
        };
      }
    });

    res.json({
      success: true,
      data: {
        period,
        portfolios: results
      }
    });
  } catch (error) {
    console.error('Error comparing portfolios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Available Methods Info
// ============================================

/**
 * GET /api/simulate/methods
 * Get available simulation methods and parameters
 */
router.get('/methods', (req, res) => {
  res.json({
    success: true,
    data: {
      positionSizing: {
        methods: [
          {
            name: 'fixed_risk',
            description: 'Risk a fixed percentage per trade',
            requiredParams: ['portfolioValue', 'entryPrice', 'stopLossPrice'],
            optionalParams: ['maxRiskPct (default: 2)']
          },
          {
            name: 'kelly',
            description: 'Kelly Criterion for optimal sizing',
            requiredParams: ['portfolioValue', 'winRate', 'avgWin', 'avgLoss'],
            optionalParams: ['kellyFraction (default: 0.5)', 'entryPrice', 'maxPositionPct']
          },
          {
            name: 'equal_weight',
            description: 'Equal weight across positions',
            requiredParams: ['portfolioValue', 'numberOfPositions'],
            optionalParams: ['entryPrice', 'cashReserve']
          },
          {
            name: 'volatility_based',
            description: 'Size inversely proportional to volatility',
            requiredParams: ['portfolioValue', 'symbol'],
            optionalParams: ['targetVolatility', 'lookbackDays', 'entryPrice']
          },
          {
            name: 'percent_of_portfolio',
            description: 'Simple percentage of portfolio',
            requiredParams: ['portfolioValue', 'targetPct'],
            optionalParams: ['entryPrice']
          }
        ]
      },
      backtest: {
        requiredParams: ['allocations', 'startDate', 'endDate'],
        optionalParams: [
          'name',
          'initialValue (default: 100000)',
          'benchmarkIndexId (default: 1 = S&P 500)',
          'rebalanceFrequency (daily/weekly/monthly/quarterly/annually/never)',
          'reinvestDividends (default: true)'
        ]
      },
      monteCarlo: {
        requiredParams: ['portfolioId OR allocations'],
        optionalParams: [
          'name',
          'simulationCount (default: 10000)',
          'timeHorizonYears (default: 30)',
          'returnModel (historical/parametric/forecasted)',
          'initialValue (default: 500000)',
          'annualContribution',
          'annualWithdrawal',
          'inflationRate (default: 0.025)',
          'expectedReturn (for forecasted model)',
          'expectedVolatility (for forecasted model)',
          'lookbackYears (default: 10)'
        ]
      },
      performanceMetrics: {
        periods: ['1m', '3m', '6m', '1y', '3y', '5y', 'ytd', 'all']
      }
    }
  });
});

// ============================================
// Stress Testing Routes
// ============================================

/**
 * POST /api/simulate/stress-test
 * Run a stress test on a portfolio
 */
router.post('/stress-test', async (req, res) => {
  try {
    const { portfolioId, scenarioId, customScenario } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required'
      });
    }

    const result = await stressTestEngine.runStressTest(portfolioId, scenarioId, customScenario);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running stress test:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/stress-test/all
 * Run all stress test scenarios on a portfolio
 */
router.post('/stress-test/all', async (req, res) => {
  try {
    const { portfolioId } = req.body;

    if (!portfolioId) {
      return res.status(400).json({
        success: false,
        error: 'portfolioId is required'
      });
    }

    const result = await stressTestEngine.runAllScenarios(portfolioId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running all stress tests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/stress-test/scenarios
 * Get available stress test scenarios
 */
router.get('/stress-test/scenarios', (req, res) => {
  res.json({
    success: true,
    data: stressTestEngine.getAvailableScenarios()
  });
});

// ============================================
// Correlation & Diversification Routes
// ============================================

/**
 * GET /api/simulate/portfolios/:id/correlation
 * Get correlation matrix for portfolio positions
 */
router.get('/portfolios/:id/correlation', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const result = advancedAnalytics.getCorrelationMatrix(portfolioId, period);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting correlation matrix:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/diversification
 * Get diversification score and analysis
 */
router.get('/portfolios/:id/diversification', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);

    const result = advancedAnalytics.getDiversificationScore(portfolioId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting diversification score:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/factors
 * Get factor exposure analysis
 */
router.get('/portfolios/:id/factors', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);

    const result = advancedAnalytics.getFactorExposure(portfolioId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting factor exposure:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/covariance
 * Get covariance matrix and portfolio variance decomposition
 */
router.get('/portfolios/:id/covariance', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const result = advancedAnalytics.getCovarianceMatrix(portfolioId, period);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting covariance matrix:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/risk-contribution
 * Get marginal risk contribution for each position
 */
router.get('/portfolios/:id/risk-contribution', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const result = advancedAnalytics.getMarginalRiskContribution(portfolioId, period);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting risk contribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/rolling-correlation
 * Get rolling correlation over time
 */
router.get('/portfolios/:id/rolling-correlation', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y', window = 60 } = req.query;

    const result = advancedAnalytics.getRollingCorrelation(
      portfolioId,
      period,
      parseInt(window)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting rolling correlation:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/clusters
 * Get cluster analysis for hidden concentration risks
 */
router.get('/portfolios/:id/clusters', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { period = '1y' } = req.query;

    const result = advancedAnalytics.getClusterAnalysis(portfolioId, period);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting cluster analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// What-If Analysis Routes
// ============================================

/**
 * POST /api/simulate/portfolios/:id/what-if
 * Simulate portfolio changes without executing
 */
router.post('/portfolios/:id/what-if', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        error: 'changes array is required'
      });
    }

    const result = whatIfAnalysis.simulateChange(portfolioId, changes);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running what-if analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/portfolios/:id/what-if/weights
 * Simulate weight changes
 */
router.post('/portfolios/:id/what-if/weights', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { targetWeights } = req.body;

    if (!targetWeights || !Array.isArray(targetWeights)) {
      return res.status(400).json({
        success: false,
        error: 'targetWeights array is required'
      });
    }

    const result = whatIfAnalysis.simulateWeightChange(portfolioId, targetWeights);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error simulating weight change:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/simulate/portfolios/:id/what-if/compare
 * Compare multiple scenarios
 */
router.post('/portfolios/:id/what-if/compare', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { scenarios } = req.body;

    if (!scenarios || !Array.isArray(scenarios)) {
      return res.status(400).json({
        success: false,
        error: 'scenarios array is required'
      });
    }

    const result = whatIfAnalysis.compareScenarios(portfolioId, scenarios);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error comparing scenarios:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Rebalancing Routes
// ============================================

/**
 * POST /api/simulate/portfolios/:id/rebalance-calc
 * Calculate trades needed to reach target allocation
 */
router.post('/portfolios/:id/rebalance-calc', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { targetAllocation, options = {} } = req.body;

    if (!targetAllocation || !Array.isArray(targetAllocation)) {
      return res.status(400).json({
        success: false,
        error: 'targetAllocation array is required'
      });
    }

    const result = rebalanceCalculator.calculateRebalanceTrades(portfolioId, targetAllocation, options);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error calculating rebalance trades:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/rebalance-check
 * Check if rebalancing is needed (drift detection)
 */
router.get('/portfolios/:id/rebalance-check', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { threshold = 5 } = req.query;

    const result = rebalanceCalculator.checkRebalanceNeeded(portfolioId, parseFloat(threshold));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error checking rebalance need:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/rebalance-templates
 * Get available rebalancing templates
 */
router.get('/rebalance-templates', (req, res) => {
  const templates = rebalanceCalculator.getRebalanceTemplates();
  res.json({
    success: true,
    data: templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description
    }))
  });
});

/**
 * POST /api/simulate/portfolios/:id/apply-template
 * Apply a rebalancing template
 */
router.post('/portfolios/:id/apply-template', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { templateId } = req.body;

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: 'templateId is required'
      });
    }

    const result = rebalanceCalculator.applyTemplate(portfolioId, templateId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error applying template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Income Projection Routes
// ============================================

/**
 * GET /api/simulate/portfolios/:id/income-projection
 * Project dividend income
 */
router.get('/portfolios/:id/income-projection', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const { years = 5, growthRate = 0.05 } = req.query;

    const result = advancedAnalytics.projectDividendIncome(
      portfolioId,
      parseInt(years),
      parseFloat(growthRate)
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error projecting dividend income:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Advanced Kelly Criterion Routes
// ============================================

/**
 * GET /api/simulate/portfolios/:id/kelly/backtest
 * Historical Kelly backtest with actual returns
 */
router.get('/portfolios/:id/kelly/backtest', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '3y',
      rebalanceFrequency = 'monthly',
      initialCapital = 100000
    } = req.query;

    const result = advancedKelly.historicalKellyBacktest(portfolioId, {
      period,
      rebalanceFrequency,
      initialCapital: parseFloat(initialCapital)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error running Kelly backtest:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/kelly/optimize
 * Find optimal Kelly weights maximizing geometric growth
 */
router.get('/portfolios/:id/kelly/optimize', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '3y',
      maxWeight = 0.40,
      minWeight = 0.02,
      leverageAllowed = false
    } = req.query;

    const result = advancedKelly.optimizeKellyWeights(portfolioId, {
      period,
      maxWeight: parseFloat(maxWeight),
      minWeight: parseFloat(minWeight),
      leverageAllowed: leverageAllowed === 'true'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error optimizing Kelly weights:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/kelly/regime
 * Get regime-aware Kelly sizing
 */
router.get('/portfolios/:id/kelly/regime', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '5y',
      regimeWindow = 60
    } = req.query;

    const result = advancedKelly.regimeAwareKelly(portfolioId, {
      period,
      regimeWindow: parseInt(regimeWindow)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting regime-aware Kelly:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/kelly/drawdown
 * Kelly drawdown analysis at various fractions
 */
router.get('/portfolios/:id/kelly/drawdown', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '5y',
      initialCapital = 100000
    } = req.query;

    const result = advancedKelly.kellyDrawdownAnalysis(portfolioId, {
      period,
      initialCapital: parseFloat(initialCapital)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error analyzing Kelly drawdowns:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/kelly/compare
 * Compare Kelly vs other sizing strategies
 */
router.get('/portfolios/:id/kelly/compare', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '5y',
      initialCapital = 100000,
      rebalanceFrequency = 'monthly'
    } = req.query;

    const result = advancedKelly.compareKellyStrategies(portfolioId, {
      period,
      initialCapital: parseFloat(initialCapital),
      rebalanceFrequency
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error comparing Kelly strategies:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/kelly/options
 * Get available Kelly configuration options and defaults
 */
router.get('/kelly/options', (req, res) => {
  try {
    const options = advancedKelly.getOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Error getting Kelly options:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/kelly/analyze/:symbol
 * Analyze Kelly sizing for a single holding
 */
router.get('/kelly/analyze/:symbol', (req, res) => {
  try {
    const { symbol } = req.params;
    const {
      portfolioId,
      period = '3y',
      riskFreeRate = 0.05,
      benchmarkSymbol = 'SPY',
      kellyFractions
    } = req.query;

    const result = advancedKelly.analyzeSingleHolding({
      symbol,
      portfolioId: portfolioId ? parseInt(portfolioId) : null,
      period,
      riskFreeRate: parseFloat(riskFreeRate),
      benchmarkSymbol,
      kellyFractions: kellyFractions ? JSON.parse(kellyFractions) : undefined
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error analyzing single holding Kelly:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/kelly/taleb-risk
 * Get Taleb/Spitznagel risk analysis
 */
router.get('/portfolios/:id/kelly/taleb-risk', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '5y',
      initialCapital = 100000,
      riskFreeRate = 0.05
    } = req.query;

    const result = advancedKelly.getTalebRiskAnalysis(portfolioId, {
      period,
      initialCapital: parseFloat(initialCapital),
      riskFreeRate: parseFloat(riskFreeRate)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting Taleb risk analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Alpha Analytics Routes
// ============================================

/**
 * GET /api/simulate/portfolios/:id/alpha
 * Comprehensive alpha analysis including Jensen's, multi-factor, rolling, attribution
 */
router.get('/portfolios/:id/alpha', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY'
    } = req.query;

    const result = alphaAnalytics.getComprehensiveAlpha(portfolioId, {
      period,
      benchmarkSymbol
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting alpha analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/alpha/jensens
 * Jensen's Alpha (CAPM-based) with statistical significance
 */
router.get('/portfolios/:id/alpha/jensens', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY'
    } = req.query;

    const result = alphaAnalytics.getJensensAlpha(portfolioId, {
      period,
      benchmarkSymbol
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting Jensens alpha:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/alpha/multi-factor
 * Multi-factor alpha (Fama-French style)
 */
router.get('/portfolios/:id/alpha/multi-factor', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY'
    } = req.query;

    const result = alphaAnalytics.getMultiFactorAlpha(portfolioId, {
      period,
      benchmarkSymbol
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting multi-factor alpha:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/alpha/rolling
 * Rolling alpha over time for consistency analysis
 */
router.get('/portfolios/:id/alpha/rolling', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY',
      windowDays = 60
    } = req.query;

    const result = alphaAnalytics.getRollingAlpha(portfolioId, {
      period,
      benchmarkSymbol,
      windowDays: parseInt(windowDays)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting rolling alpha:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/alpha/attribution
 * Alpha attribution by position (which positions contribute to alpha)
 */
router.get('/portfolios/:id/alpha/attribution', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY'
    } = req.query;

    const result = alphaAnalytics.getAlphaAttribution(portfolioId, {
      period,
      benchmarkSymbol
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting alpha attribution:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/simulate/portfolios/:id/alpha/skill
 * Skill vs luck analysis (is alpha statistically significant?)
 */
router.get('/portfolios/:id/alpha/skill', (req, res) => {
  try {
    const portfolioId = parseInt(req.params.id);
    const {
      period = '1y',
      benchmarkSymbol = 'SPY'
    } = req.query;

    const result = alphaAnalytics.getSkillAnalysis(portfolioId, {
      period,
      benchmarkSymbol
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting skill analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
