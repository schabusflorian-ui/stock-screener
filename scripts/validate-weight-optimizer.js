#!/usr/bin/env node
// scripts/validate-weight-optimizer.js
// Quick validation of weight optimization module imports and database schema

const path = require('path');
process.chdir(path.join(__dirname, '..'));

console.log('='.repeat(60));
console.log('WEIGHT OPTIMIZATION MODULE VALIDATION');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

// Test 1: Database connection
test('Database connection', () => {
  const { db } = require('../src/database');
  if (!db) throw new Error('Database not initialized');
});

// Test 2: Weight optimization tables exist
test('Weight optimization tables exist', () => {
  const { db } = require('../src/database');

  const tables = ['weight_optimization_runs', 'weight_combination_results',
                  'signal_predictive_power', 'regime_optimal_weights', 'ablation_study_results'];

  for (const table of tables) {
    const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    if (!exists) throw new Error(`Table ${table} not found`);
  }
});

// Test 3: WeightOptimizer module loads
test('WeightOptimizer module loads', () => {
  const { WeightOptimizer, DEFAULT_WEIGHTS } = require('../src/services/backtesting/weightOptimizer');
  if (!WeightOptimizer) throw new Error('WeightOptimizer not exported');
  if (!DEFAULT_WEIGHTS) throw new Error('DEFAULT_WEIGHTS not exported');

  // Verify default weights sum to 1
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.001) throw new Error(`Default weights sum to ${sum}, not 1.0`);
});

// Test 4: SignalPredictivePowerAnalyzer module loads
test('SignalPredictivePowerAnalyzer module loads', () => {
  const { SignalPredictivePowerAnalyzer, SIGNAL_TYPES, REGIMES } = require('../src/services/backtesting/signalPredictivePower');
  if (!SignalPredictivePowerAnalyzer) throw new Error('SignalPredictivePowerAnalyzer not exported');
  if (SIGNAL_TYPES.length !== 6) throw new Error(`Expected 6 signal types, got ${SIGNAL_TYPES.length}`);
});

// Test 5: SignalOptimizer integration methods exist
test('SignalOptimizer integration methods', () => {
  const { SignalOptimizer } = require('../src/services/agent/signalOptimizer');
  const { db } = require('../src/database');

  const optimizer = new SignalOptimizer(db);

  if (typeof optimizer.useOptimizedWeightsFromRun !== 'function') {
    throw new Error('useOptimizedWeightsFromRun method not found');
  }
  if (typeof optimizer.loadRegimeOptimizedWeights !== 'function') {
    throw new Error('loadRegimeOptimizedWeights method not found');
  }
});

// Test 6: HistoricalAgentBacktester supports custom weights
test('HistoricalAgentBacktester supports custom weights', () => {
  const { HistoricalAgentBacktester } = require('../src/services/backtesting/historicalAgentBacktester');
  const { db } = require('../src/database');

  const customWeights = {
    technical: 0.30,
    fundamental: 0.20,
    sentiment: 0.10,
    insider: 0.15,
    valuation: 0.15,
    factor: 0.10
  };

  const backtester = new HistoricalAgentBacktester(db, {
    signalWeights: customWeights
  });

  if (!backtester.config.signalWeights) {
    throw new Error('signalWeights not accepted in config');
  }

  // Verify _getDefaultWeights exists
  if (typeof backtester._getDefaultWeights !== 'function') {
    throw new Error('_getDefaultWeights method not found');
  }
});

// Test 7: Weight grid generation
test('Weight grid generation', () => {
  const { WeightOptimizer } = require('../src/services/backtesting/weightOptimizer');
  const { db } = require('../src/database');

  const optimizer = new WeightOptimizer(db);
  const combinations = optimizer._generateWeightCombinations(0.25, 0, 0.50);

  if (combinations.length === 0) throw new Error('No combinations generated');

  // Verify all combinations sum to 1.0
  for (const combo of combinations) {
    const sum = Object.values(combo).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      throw new Error(`Combination sums to ${sum}, not 1.0`);
    }
  }

  console.log(`   (Generated ${combinations.length} valid combinations with step=0.25)`);
});

// Test 8: API routes can be loaded
test('Backtesting API routes load without error', () => {
  // This will fail if there are syntax errors or missing dependencies
  const router = require('../src/api/routes/backtesting');
  if (!router) throw new Error('Router not returned');
});

console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
