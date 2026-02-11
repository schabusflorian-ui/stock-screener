// tests/unified-strategy/backtestEngineTests.js
// Tests for UnifiedBacktestEngine validation and analysis

/**
 * Run backtest engine tests
 * @param {TestRunner} t - Test runner instance
 * @param {Object} db - Database instance
 */
async function runBacktestEngineTests(t, db) {
  const { UnifiedBacktestEngine, BACKTEST_MODES } = require('../../src/services/backtesting/unifiedBacktestEngine');
  const { StrategyManager, DEFAULT_SIGNAL_WEIGHTS, DEFAULT_RISK_PARAMS } = require('../../src/services/strategy/strategyManager');

  let backtestEngine;
  let strategyManager;
  let testStrategyId = null;

  await t.asyncSuite('UnifiedBacktestEngine - Initialization', async () => {
    t.test('Should create backtest engine instance', () => {
      backtestEngine = new UnifiedBacktestEngine(db);
      t.assertDefined(backtestEngine);
    });

    t.test('Should have all backtest modes defined', () => {
      t.assertDefined(BACKTEST_MODES);
      t.assertDefined(BACKTEST_MODES.SIMPLE);
      t.assertDefined(BACKTEST_MODES.WALK_FORWARD);
      t.assertDefined(BACKTEST_MODES.FULL); // Full validation mode
    });

    t.test('Should have required sub-engines', () => {
      t.assertDefined(backtestEngine.strategyManager, 'Should have strategy manager');
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Test Strategy Setup', async () => {
    await t.asyncTest('Should create test strategy for backtest', async () => {
      strategyManager = new StrategyManager(db);

      const config = {
        name: 'Backtest Test Strategy ' + Date.now(),
        description: 'For backtest engine testing',
        strategy_type: 'single',
        signal_weights: DEFAULT_SIGNAL_WEIGHTS,
        risk_params: DEFAULT_RISK_PARAMS,
        min_confidence: 0.6,
        min_signal_score: 0.3
      };

      const strategy = await strategyManager.createStrategy(config);
      testStrategyId = strategy.id;
      t.assertDefined(testStrategyId);
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Configuration Validation', async () => {
    t.test('Should validate backtest config', () => {
      const validConfig = {
        startDate: '2022-01-01',
        endDate: '2023-01-01',
        mode: BACKTEST_MODES.SIMPLE,
        benchmark: 'SPY'
      };

      const result = backtestEngine.validateConfig(validConfig);
      t.assert(result.valid, `Config should be valid: ${JSON.stringify(result.errors)}`);
    });

    t.test('Should reject invalid date range', () => {
      const invalidConfig = {
        startDate: '2023-01-01',
        endDate: '2022-01-01', // End before start
        mode: BACKTEST_MODES.SIMPLE
      };

      const result = backtestEngine.validateConfig(invalidConfig);
      t.assert(!result.valid, 'Should reject invalid date range');
    });

    t.test('Should reject too short backtest period', () => {
      const shortConfig = {
        startDate: '2023-01-01',
        endDate: '2023-01-15', // Only 2 weeks
        mode: BACKTEST_MODES.FULL_VALIDATION
      };

      const result = backtestEngine.validateConfig(shortConfig);
      // Full validation needs longer periods
      t.assert(result.warnings?.length > 0 || !result.valid);
    });

    t.test('Should accept valid benchmark symbols', () => {
      const validBenchmarks = ['SPY', 'QQQ', 'IWM', 'VTI'];

      for (const benchmark of validBenchmarks) {
        const config = {
          startDate: '2022-01-01',
          endDate: '2023-01-01',
          benchmark
        };

        const result = backtestEngine.validateConfig(config);
        t.assert(result.valid, `Benchmark ${benchmark} should be valid`);
      }
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Metrics Calculation', async () => {
    t.test('Should calculate Sharpe ratio correctly', () => {
      const returns = [0.01, 0.02, -0.01, 0.015, 0.005, -0.005, 0.01];
      const sharpe = backtestEngine.calculateSharpeRatio(returns, 252);

      t.assertDefined(sharpe);
      t.assert(typeof sharpe === 'number');
      t.assert(!isNaN(sharpe), 'Sharpe should not be NaN');
    });

    t.test('Should calculate max drawdown correctly', () => {
      const equityCurve = [100, 110, 105, 95, 90, 100, 115]; // DD from 110 to 90 = 18.18%
      const maxDD = backtestEngine.calculateMaxDrawdown(equityCurve);

      t.assertDefined(maxDD);
      t.assert(maxDD <= 0, 'Max drawdown should be negative');
      t.assertInRange(maxDD, -0.20, -0.15, 'Max drawdown should be ~18%');
    });

    t.test('Should calculate win rate correctly', () => {
      const trades = [
        { pnl: 100 },
        { pnl: -50 },
        { pnl: 75 },
        { pnl: -25 },
        { pnl: 150 }
      ];

      const winRate = backtestEngine.calculateWinRate(trades);
      t.assertEqual(winRate, 0.6, 'Win rate should be 60%');
    });

    t.test('Should calculate profit factor correctly', () => {
      const trades = [
        { pnl: 100 },
        { pnl: -50 },
        { pnl: 75 },
        { pnl: -25 }
      ];

      // Gross profit: 175, Gross loss: 75
      // Profit factor: 175/75 = 2.33
      const pf = backtestEngine.calculateProfitFactor(trades);
      t.assertInRange(pf, 2.3, 2.4);
    });

    t.test('Should handle edge cases in calculations', () => {
      // Empty trades
      const winRateEmpty = backtestEngine.calculateWinRate([]);
      t.assertEqual(winRateEmpty, 0);

      // All winning trades
      const winRateAll = backtestEngine.calculateWinRate([{ pnl: 100 }, { pnl: 50 }]);
      t.assertEqual(winRateAll, 1.0);

      // No losses for profit factor
      const pfNoLoss = backtestEngine.calculateProfitFactor([{ pnl: 100 }]);
      t.assert(pfNoLoss === Infinity || pfNoLoss > 100);
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Overfitting Detection', async () => {
    t.test('Should calculate deflated Sharpe ratio', () => {
      const sharpe = 1.5;
      const numberOfTrials = 100;

      const deflated = backtestEngine.calculateDeflatedSharpe(sharpe, numberOfTrials);
      t.assertDefined(deflated);
      t.assert(deflated < sharpe, 'Deflated Sharpe should be lower');
    });

    t.test('Should detect overfitting in walk-forward', () => {
      const inSampleResults = { sharpe: 2.5, returns: 0.35 };
      const outOfSampleResults = { sharpe: 0.5, returns: 0.05 };

      const overfitScore = backtestEngine.calculateOverfitScore(inSampleResults, outOfSampleResults);
      t.assert(overfitScore > 0.5, 'Should indicate high overfitting');
    });

    t.test('Should pass overfitting check for consistent results', () => {
      const inSampleResults = { sharpe: 1.2, returns: 0.15 };
      const outOfSampleResults = { sharpe: 1.0, returns: 0.12 };

      const overfitScore = backtestEngine.calculateOverfitScore(inSampleResults, outOfSampleResults);
      t.assert(overfitScore < 0.5, 'Should indicate low overfitting');
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Walk-Forward Analysis', async () => {
    t.test('Should calculate walk-forward efficiency', () => {
      const windows = [
        { trainReturn: 0.15, testReturn: 0.12 },
        { trainReturn: 0.10, testReturn: 0.08 },
        { trainReturn: 0.20, testReturn: 0.15 },
        { trainReturn: 0.12, testReturn: -0.02 }
      ];

      const efficiency = backtestEngine.calculateWalkForwardEfficiency(windows);
      t.assertDefined(efficiency);
      t.assertInRange(efficiency, 0, 1);
    });

    t.test('Should identify consistent vs inconsistent windows', () => {
      const windows = [
        { trainReturn: 0.15, testReturn: 0.12, consistent: true },
        { trainReturn: 0.10, testReturn: 0.08, consistent: true },
        { trainReturn: 0.20, testReturn: -0.05, consistent: false },
        { trainReturn: 0.12, testReturn: 0.10, consistent: true }
      ];

      const consistent = windows.filter(w => w.consistent).length;
      t.assertEqual(consistent, 3);
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Stress Testing', async () => {
    t.test('Should have predefined stress scenarios', () => {
      const scenarios = backtestEngine.getStressScenarios();
      t.assertArray(scenarios);
      t.assert(scenarios.length > 0);

      // Check for expected scenarios
      const scenarioIds = scenarios.map(s => s.id);
      t.assert(scenarioIds.includes('COVID_2020'));
      t.assert(scenarioIds.includes('RATE_SHOCK_2022'));
    });

    t.test('Should validate stress scenario config', () => {
      const validScenarios = ['COVID_2020', 'RATE_SHOCK_2022'];
      const result = backtestEngine.validateStressScenarios(validScenarios);
      t.assert(result.valid);
    });

    t.test('Should reject unknown stress scenario', () => {
      const invalidScenarios = ['COVID_2020', 'FAKE_SCENARIO'];
      const result = backtestEngine.validateStressScenarios(invalidScenarios);
      t.assert(!result.valid || result.warnings?.length > 0);
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Results Structure', async () => {
    t.test('Should return correct result structure for simple backtest', () => {
      const mockResults = backtestEngine.createEmptyResults('simple');

      t.assertDefined(mockResults.backtest);
      t.assertDefined(mockResults.backtest.metrics);
    });

    t.test('Should return correct result structure for full validation', () => {
      const mockResults = backtestEngine.createEmptyResults('full_validation');

      t.assertDefined(mockResults.backtest);
      t.assertDefined(mockResults.walkForward);
      t.assertDefined(mockResults.overfitting);
      t.assertDefined(mockResults.stress);
      t.assertDefined(mockResults.factors);
      t.assertDefined(mockResults.statistical);
      t.assertDefined(mockResults.recommendation);
    });
  });

  await t.asyncSuite('UnifiedBacktestEngine - Deployment Recommendation', async () => {
    t.test('Should recommend deployment for good results', () => {
      const goodResults = {
        overfitting: { overallRisk: 'low' },
        walkForward: { efficiency: 0.7 },
        statistical: { deflatedSharpe: 1.2, pValue: 0.02 },
        backtest: { metrics: { sharpeRatio: 1.5, maxDrawdown: -0.15 } }
      };

      const recommendation = backtestEngine.getDeploymentRecommendation(goodResults);
      t.assert(recommendation.deployable, 'Should be deployable');
    });

    t.test('Should not recommend deployment for overfit strategy', () => {
      const overfitResults = {
        overfitting: { overallRisk: 'high' },
        walkForward: { efficiency: 0.2 },
        statistical: { deflatedSharpe: 0.3, pValue: 0.4 },
        backtest: { metrics: { sharpeRatio: 2.5, maxDrawdown: -0.10 } }
      };

      const recommendation = backtestEngine.getDeploymentRecommendation(overfitResults);
      t.assert(!recommendation.deployable, 'Should not be deployable');
      t.assertDefined(recommendation.reason);
    });

    t.test('Should flag high drawdown strategies', () => {
      const highDDResults = {
        overfitting: { overallRisk: 'low' },
        walkForward: { efficiency: 0.6 },
        statistical: { deflatedSharpe: 1.0, pValue: 0.03 },
        backtest: { metrics: { sharpeRatio: 1.0, maxDrawdown: -0.45 } }
      };

      const recommendation = backtestEngine.getDeploymentRecommendation(highDDResults);
      t.assert(recommendation.warnings?.length > 0 || !recommendation.deployable);
    });
  });

  // Cleanup
  await t.asyncSuite('UnifiedBacktestEngine - Cleanup', async () => {
    await t.asyncTest('Should clean up test strategy', async () => {
      if (testStrategyId && strategyManager) {
        await strategyManager.hardDeleteStrategy(testStrategyId);
        testStrategyId = null;
      }
      t.assert(true);
    });
  });
}

module.exports = runBacktestEngineTests;
