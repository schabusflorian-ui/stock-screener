#!/usr/bin/env node
// scripts/test-weight-optimizer.js
// Quick test of the weight optimization system

const path = require('path');

// Set up module paths
process.chdir(path.join(__dirname, '..'));

const { WeightOptimizer } = require('../src/services/backtesting/weightOptimizer');
const { SignalPredictivePowerAnalyzer } = require('../src/services/backtesting/signalPredictivePower');
const { db } = require('../src/database');

async function testWeightOptimizer() {
  console.log('='.repeat(70));
  console.log('WEIGHT OPTIMIZATION SYSTEM TEST');
  console.log('='.repeat(70));

  const startDate = '2024-01-01';
  const endDate = '2024-06-30'; // Use 6 months for faster testing

  try {
    // Test 1: Signal Predictive Power Analysis
    console.log('\n📊 Test 1: Signal Predictive Power Analysis');
    console.log('-'.repeat(50));

    const analyzer = new SignalPredictivePowerAnalyzer(db);
    const predictivePower = await analyzer.analyzeAllSignals(startDate, endDate);

    if (predictivePower.rankings && predictivePower.rankings.ALL) {
      console.log('\nSignal Rankings:');
      for (const r of predictivePower.rankings.ALL) {
        const ic = r.ic !== null ? r.ic.toFixed(4) : 'N/A';
        const hitRate = r.hitRate !== null ? (r.hitRate * 100).toFixed(1) + '%' : 'N/A';
        console.log(`  ${r.rank}. ${r.signalType.padEnd(12)} IC: ${ic}  Hit Rate: ${hitRate}`);
      }
    }

    // Test 2: Weight Grid Search (quick version)
    console.log('\n\n🎯 Test 2: Weight Optimization (Quick Mode)');
    console.log('-'.repeat(50));

    const optimizer = new WeightOptimizer(db);
    const results = await optimizer.runOptimization({
      runName: 'Test_Run',
      startDate,
      endDate,
      optimizationTarget: 'alpha',
      stepSize: 0.15, // Coarse grid for speed
      fineStepSize: 0.10,
      regimeSpecific: false, // Disable for faster test
      runAblation: true,
      useWalkForward: true,
      verbose: true
    });

    console.log('\n📈 Optimization Results:');
    console.log(`  Run ID: ${results.runId}`);
    console.log(`  Baseline Alpha: ${results.baseline.alpha.toFixed(2)}%`);
    console.log(`  Best Alpha: ${results.bestAlpha.toFixed(2)}%`);
    console.log(`  Improvement: ${results.improvement >= 0 ? '+' : ''}${results.improvement.toFixed(1)}%`);
    console.log(`  Walk-Forward Efficiency: ${results.walkForwardEfficiency ? (results.walkForwardEfficiency * 100).toFixed(0) + '%' : 'N/A'}`);

    console.log('\n🎯 Optimal Weights:');
    for (const [signal, weight] of Object.entries(results.bestWeights)) {
      console.log(`  ${signal.padEnd(12)}: ${(weight * 100).toFixed(0)}%`);
    }

    if (results.ablationResults) {
      console.log('\n📉 Signal Importance (Ablation):');
      for (const r of results.ablationResults.slice(0, 3)) {
        console.log(`  ${r.rank}. ${r.signalType.padEnd(12)}: ${r.degradation >= 0 ? '+' : ''}${r.degradation.toFixed(2)}% alpha impact`);
      }
    }

    // Test 3: Verify stored results
    console.log('\n\n✅ Test 3: Verify Stored Results');
    console.log('-'.repeat(50));

    const storedResults = optimizer.getOptimizationResults(results.runId);
    console.log(`  Stored run found: ${storedResults ? 'Yes' : 'No'}`);
    if (storedResults) {
      console.log(`  Top combinations stored: ${storedResults.topCombinations.length}`);
      console.log(`  Ablation results stored: ${storedResults.ablation.length}`);
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ ALL TESTS COMPLETED SUCCESSFULLY');
    console.log('='.repeat(70));

    return true;

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  testWeightOptimizer()
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { testWeightOptimizer };
