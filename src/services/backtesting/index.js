// src/services/backtesting/index.js
// HF-Style Comprehensive Backtesting Framework
// Central exports for all backtesting modules

const walkForwardEngine = require('./walkForwardEngine');
const icAnalysis = require('./icAnalysis');
const varBacktest = require('./varBacktest');
const alphaValidation = require('./alphaValidation');
const stressTest = require('./stressTest');
const regimeAnalysis = require('./regimeAnalysis');
const executionSimulator = require('./executionSimulator');
const capacityAnalysis = require('./capacityAnalysis');

// Historical Agent Backtesting
const { HistoricalDataProvider } = require('./historicalDataProvider');
const { HistoricalAgentBacktester } = require('./historicalAgentBacktester');

module.exports = {
  // Walk-Forward Optimization
  walkForward: {
    run: walkForwardEngine.runWalkForward,
    runCPCV: walkForwardEngine.runCPCV,
    calculateMetrics: walkForwardEngine.calculateMetrics,
    generatePeriods: walkForwardEngine.generatePeriods,
    getResults: walkForwardEngine.getWalkForwardResults,
    listBacktests: walkForwardEngine.listWalkForwardBacktests
  },

  // Information Coefficient Analysis
  ic: {
    calculate: icAnalysis.calculateIC,
    calculateICIR: icAnalysis.calculateICIR,
    analyzeDecay: icAnalysis.analyzeICDecay,
    calculateHitRate: icAnalysis.calculateHitRate,
    getCorrelationMatrix: icAnalysis.getSignalCorrelationMatrix,
    spearmanCorrelation: icAnalysis.spearmanCorrelation,
    getHistory: icAnalysis.getICHistory,
    getSignalTypes: icAnalysis.getSignalTypes
  },

  // VaR Backtesting
  var: {
    run: varBacktest.runVaRBacktest,
    kupiecTest: varBacktest.kupiecTest,
    christoffersenTest: varBacktest.christoffersenTest,
    baselTrafficLight: varBacktest.baselTrafficLight,
    backtestES: varBacktest.backtestExpectedShortfall,
    getHistory: varBacktest.getVaRBacktestHistory,
    getExceptions: varBacktest.getVaRExceptions
  },

  // Alpha Validation / Statistical Testing
  alpha: {
    run: alphaValidation.runAlphaValidation,
    testSignificance: alphaValidation.testAlphaSignificance,
    bootstrap: alphaValidation.bootstrapConfidenceInterval,
    deflatedSharpe: alphaValidation.deflatedSharpeRatio,
    minimumTrackRecord: alphaValidation.minimumTrackRecord,
    multipleTestingCorrection: alphaValidation.correctForMultipleTesting,
    calculateSharpe: alphaValidation.calculateSharpeRatio,
    calculateStats: alphaValidation.calculateStats,
    getHistory: alphaValidation.getAlphaValidationHistory
  },

  // Stress Testing
  stress: {
    runHistorical: stressTest.runHistoricalStress,
    runFactor: stressTest.runFactorStress,
    runReverse: stressTest.reverseStressTest,
    getScenarios: stressTest.getAvailableScenarios,
    getHistory: stressTest.getStressTestHistory,
    SCENARIOS: stressTest.HISTORICAL_SCENARIOS
  },

  // Regime Analysis
  regime: {
    analyze: regimeAnalysis.analyzeByRegime,
    analyzeSignals: regimeAnalysis.analyzeSignalsByRegime,
    getHistory: regimeAnalysis.getRegimePerformanceHistory,
    getCurrent: regimeAnalysis.getCurrentRegime,
    REGIMES: regimeAnalysis.REGIMES
  },

  // Execution Simulation
  execution: {
    simulate: executionSimulator.simulateExecution,
    squareRootImpact: executionSimulator.squareRootImpact,
    linearImpact: executionSimulator.linearImpact,
    estimateSpread: executionSimulator.estimateSpreadCost,
    analyzeCosts: executionSimulator.analyzeExecutionCosts,
    compareStrategies: executionSimulator.compareExecutionStrategies,
    getHistory: executionSimulator.getExecutionHistory,
    MODELS: executionSimulator.IMPACT_MODELS
  },

  // Capacity Analysis
  capacity: {
    estimate: capacityAnalysis.estimateCapacity,
    liquidityAdjustedReturns: capacityAnalysis.calculateLiquidityAdjustedReturns,
    calculateSlippage: capacityAnalysis.calculateSlippageAtAUM,
    getHistory: capacityAnalysis.getCapacityHistory
  },

  // Historical Agent Backtesting (NEW)
  historicalAgent: {
    DataProvider: HistoricalDataProvider,
    Backtester: HistoricalAgentBacktester,
    run: (db, config) => {
      const backtester = new HistoricalAgentBacktester(db, config);
      return backtester.runBacktest();
    }
  }
};
