// run-weight-optimization.js
// Run the full weight optimization benchmark
// This finds optimal signal weights through grid search and validation

const { db } = require('./src/database');
const { WeightOptimizer } = require('./src/services/backtesting/weightOptimizer');

async function main() {
  console.log('🚀 Starting Weight Optimization Benchmark\n');

  const optimizer = new WeightOptimizer(db);

  // Configuration - CONSERVATIVE INSTITUTIONAL SETTINGS
  // Multi-year period including crisis (COVID 2020, rate shock 2022)
  const config = {
    runName: `WeightOpt_Conservative_${new Date().toISOString().split('T')[0]}`,
    startDate: '2020-01-01',     // Include COVID crash
    endDate: '2024-12-31',       // Full 5-year period
    optimizationTarget: 'alpha', // Maximize alpha vs SPY

    // Grid search parameters - COARSER to reduce overfitting
    stepSize: 0.15,        // Coarser grid: 15% steps (reduces combinations)
    fineStepSize: 0.10,    // Fine grid: 10% steps (less granular)
    minWeight: 0.05,       // Minimum 5% per signal (no zeros)
    maxWeight: 0.40,       // Max 40% per signal (more diversified)

    // Analysis options
    regimeSpecific: true,  // Find optimal weights per market regime
    runAblation: true,     // Test signal importance by removal
    useWalkForward: true,  // Validate against overfitting

    // Statistical validation - INSTITUTIONAL RIGOR
    applyStatisticalCorrections: true,
    multipleTestingMethod: 'fdr_bh',  // Benjamini-Hochberg FDR
    minSignificanceLevel: 0.05,
    minTrackRecordMonths: 36,         // 3 years minimum

    // Walk-forward settings - PROPER VALIDATION
    walkForwardPeriods: 5,           // 5 rolling windows
    walkForwardPurgeGaps: 5,         // 5-day purge gap
    minWalkForwardEfficiency: 0.30,  // Require 30% WFE minimum
    earlyStopWFE: true,              // Stop if WFE too low

    // Stress testing
    runStressTests: true,
    stressScenarios: ['COVID_2020', 'RATE_SHOCK_2022'],
    maxDrawdownThreshold: 0.40,      // 40% max acceptable drawdown

    // Search space control - LIMIT COMBINATIONS
    maxCombinations: 300,            // Reduce multiple testing burden

    verbose: true
  };

  try {
    const results = await optimizer.runOptimization(config);

    // Print detailed results
    console.log('\n\n' + '='.repeat(80));
    console.log('📋 DETAILED RESULTS');
    console.log('='.repeat(80));

    console.log('\n🔢 Run ID:', results.runId);
    console.log('Save this ID to load these weights in production:\n');
    console.log('  const signalOptimizer = new SignalOptimizer(db);');
    console.log(`  signalOptimizer.useOptimizedWeightsFromRun(${results.runId});`);

    console.log('\n\n📊 Top 5 Weight Combinations:');
    console.log('-'.repeat(80));
    results.topCombinations.slice(0, 5).forEach((combo, i) => {
      console.log(`\n${i + 1}. Alpha: ${combo.alpha.toFixed(2)}% | Sharpe: ${combo.sharpe.toFixed(2)}`);
      console.log('   Weights:');
      for (const [signal, weight] of Object.entries(combo.weights)) {
        console.log(`     ${signal.padEnd(12)}: ${(weight * 100).toFixed(1)}%`);
      }
    });

    if (results.ablationResults && results.ablationResults.length > 0) {
      console.log('\n\n🔬 Ablation Study - Signal Importance Ranking:');
      console.log('-'.repeat(80));
      console.log('(Shows alpha degradation when each signal is removed)\n');
      results.ablationResults.forEach(r => {
        const impact = r.degradation >= 0 ? 'negative' : 'positive';
        const symbol = r.degradation >= 0 ? '↓' : '↑';
        console.log(`${r.rank}. ${r.signalType.padEnd(12)}: ${symbol} ${Math.abs(r.degradation).toFixed(2)}% (${impact} impact)`);
      });
    }

    if (results.regimeOptimalWeights && Object.keys(results.regimeOptimalWeights).length > 0) {
      console.log('\n\n📈 Regime-Specific Optimal Weights:');
      console.log('-'.repeat(80));
      for (const [regime, data] of Object.entries(results.regimeOptimalWeights)) {
        console.log(`\n${regime}:`);
        console.log(`  Alpha: ${data.alpha.toFixed(2)}% | Sharpe: ${data.sharpe.toFixed(2)}`);
        console.log('  Weights:');
        for (const [signal, weight] of Object.entries(data.weights)) {
          console.log(`    ${signal.padEnd(12)}: ${(weight * 100).toFixed(1)}%`);
        }
      }
    }

    console.log('\n\n✅ Validation:');
    console.log('-'.repeat(80));
    if (results.walkForwardEfficiency !== null) {
      const status = results.walkForwardEfficiency >= 0.5 ? '✅ ROBUST' : '⚠️ OVERFIT RISK';
      const statusDesc = results.walkForwardEfficiency >= 0.5
        ? 'Weights perform well on out-of-sample data'
        : 'Weights may be overfit to training data';
      console.log(`Walk-Forward Efficiency: ${(results.walkForwardEfficiency * 100).toFixed(1)}% ${status}`);
      console.log(`Status: ${statusDesc}`);
    }

    console.log('\n\n💡 Recommendations:');
    console.log('-'.repeat(80));
    const improvement = results.improvement;
    if (improvement > 10) {
      console.log('✅ Significant improvement detected!');
      console.log('   Consider deploying these optimized weights to production.');
    } else if (improvement > 0) {
      console.log('✅ Modest improvement detected.');
      console.log('   Review regime-specific weights for potential selective deployment.');
    } else {
      console.log('⚠️ Optimized weights did not improve over baseline.');
      console.log('   This may indicate that default weights are already well-calibrated,');
      console.log('   or that the optimization period lacks sufficient signal.');
    }

    if (results.walkForwardEfficiency !== null && results.walkForwardEfficiency < 0.5) {
      console.log('\n⚠️ Low walk-forward efficiency suggests potential overfitting.');
      console.log('   Consider:');
      console.log('   - Using broader step sizes (less granular optimization)');
      console.log('   - Increasing minimum weight constraints');
      console.log('   - Testing on a longer time period');
    }

    console.log('\n\n📁 Database Storage:');
    console.log('-'.repeat(80));
    console.log('Results are saved in the following tables:');
    console.log('  • weight_optimization_runs - Run metadata and best weights');
    console.log('  • weight_combination_results - All tested combinations');
    console.log('  • ablation_study_results - Signal importance analysis');
    console.log('  • regime_optimal_weights - Regime-specific weights');

    console.log('\n\n🎯 Next Steps:');
    console.log('-'.repeat(80));
    console.log('1. Review the results above');
    console.log('2. If satisfied, load optimized weights in production:');
    console.log(`   signalOptimizer.useOptimizedWeightsFromRun(${results.runId})`);
    console.log('3. Monitor live performance vs baseline');
    console.log('4. Re-run optimization quarterly or after regime shifts');

    console.log('\n' + '='.repeat(80));
    console.log(`✅ Optimization completed in ${results.elapsed.toFixed(1)}s`);
    console.log('='.repeat(80) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Optimization failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
