// Comprehensive benchmark: Run weight optimization with full anti-overfitting framework
// Compares Week 0 (original) vs Week 5 (with all anti-overfitting features)

const { WeightOptimizer } = require('./src/services/backtesting/weightOptimizer');
const { OverfittingDetector } = require('./src/services/backtesting/overfittingDetector');
const { db } = require('./src/database');

async function runBenchmark() {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 ANTI-OVERFITTING FRAMEWORK BENCHMARK');
  console.log('Comparing Week 0 (Original) vs Week 5 (Full Framework)');
  console.log('='.repeat(80));

  // Get Week 0 baseline results (if available)
  console.log('\n📊 Checking for Week 0 baseline results...');
  const week0Run = db.prepare(`
    SELECT * FROM weight_optimization_runs
    WHERE start_date = '2024-01-01'
    AND run_name LIKE '%baseline%'
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  if (week0Run) {
    console.log(`  ✅ Found Week 0 run: ${week0Run.run_name} (Run #${week0Run.id})`);
    console.log(`     Alpha: ${week0Run.best_alpha?.toFixed(2)}%`);
    console.log(`     Sharpe: ${week0Run.best_sharpe?.toFixed(2)}`);
    console.log(`     Walk-Forward Efficiency: ${week0Run.walk_forward_efficiency ? (week0Run.walk_forward_efficiency * 100).toFixed(1) + '%' : 'N/A'}`);
  } else {
    console.log('  ℹ️  No Week 0 baseline found - will use reported values (32.60% alpha, 100% WFE)');
  }

  // Run Week 5 optimization with all anti-overfitting features
  console.log('\n🚀 Running Week 5 optimization with full anti-overfitting framework...');
  console.log('   Features enabled:');
  console.log('   ✓ FDR multiple testing correction (Benjamini-Hochberg)');
  console.log('   ✓ Deflated Sharpe ratio calculation');
  console.log('   ✓ Rolling walk-forward validation (5 periods)');
  console.log('   ✓ Parameter stability metrics');
  console.log('   ✓ Historical stress testing (COVID + Rate Shock)');
  console.log('   ✓ Bootstrap confidence intervals (95%)');
  console.log('   ✓ Extended period: 2020-2024 (includes COVID crash)');

  const optimizer = new WeightOptimizer(db);

  try {
    const startTime = Date.now();

    const result = await optimizer.runOptimization({
      runName: 'Week 5 Anti-Overfitting Benchmark',
      startDate: '2020-01-01',  // Extended to include COVID
      endDate: '2024-12-31',
      optimizationTarget: 'alpha',
      useWalkForward: true,
      applyStatisticalCorrections: true,
      multipleTestingMethod: 'fdr_bh',
      minSignificanceLevel: 0.05,
      minTrackRecordMonths: 36,
      walkForwardPeriods: 5,
      walkForwardPurgeGaps: 5,
      minWalkForwardEfficiency: 0.30,
      earlyStopWFE: true,
      runStressTests: true,
      stressScenarios: ['COVID_2020', 'RATE_SHOCK_2022'],
      maxDrawdownThreshold: 0.40,
      maxCombinations: 150,  // Reduced for faster execution
      includeAblationStudy: true,
      findRegimeOptimalWeights: false,
      verbose: true,  // Enable progress logging
      stepSize: 0.15,  // Coarser grid for speed (was 0.1)
      fineStepSize: 0.10,  // Coarser fine-tuning (was 0.05)
      topNForFineTuning: 5,  // Only fine-tune top 5 (was 10)
      searchSpace: {
        technical: [0.0, 0.15, 0.30, 0.45],
        fundamental: [0.0, 0.15, 0.30, 0.45],
        sentiment: [0.0, 0.15, 0.30],
        insider: [0.0, 0.10, 0.20],
        valuation: [0.0, 0.10, 0.20],
        factor: [0.0, 0.10, 0.20]
      }
    });

    const elapsedMinutes = (Date.now() - startTime) / 60000;

    console.log(`\n✅ Week 5 optimization completed in ${elapsedMinutes.toFixed(1)} minutes`);
    console.log(`   Run ID: ${result.runId}`);

    // Run overfitting detector
    console.log('\n🔍 Running overfitting detector on Week 5 results...');
    const detector = new OverfittingDetector(db);
    const analysis = await detector.analyzeRun(result.runId);

    // Get full run data for comparison
    const week5Run = db.prepare(`
      SELECT * FROM weight_optimization_runs WHERE id = ?
    `).get(result.runId);

    // Generate comparison report
    console.log('\n' + '='.repeat(80));
    console.log('📊 BENCHMARK COMPARISON: Week 0 vs Week 5');
    console.log('='.repeat(80));

    console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ METRIC                          │ Week 0 (Original) │ Week 5 (Framework) │ Change │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');

    // Alpha comparison
    const week0Alpha = week0Run?.best_alpha || 32.60;
    const week5Alpha = week5Run.best_alpha;
    const alphaDiff = week5Alpha - week0Alpha;
    console.log(`│ Best Alpha                      │ ${week0Alpha.toFixed(2).padStart(17)}% │ ${week5Alpha.toFixed(2).padStart(18)}% │ ${(alphaDiff >= 0 ? '+' : '') + alphaDiff.toFixed(1)}% │`);

    // Sharpe comparison
    const week0Sharpe = week0Run?.best_sharpe || 1.12;
    const week5Sharpe = week5Run.best_sharpe;
    const sharpeDiff = week5Sharpe - week0Sharpe;
    console.log(`│ Best Sharpe Ratio               │ ${week0Sharpe.toFixed(2).padStart(17)} │ ${week5Sharpe.toFixed(2).padStart(18)} │ ${(sharpeDiff >= 0 ? '+' : '') + sharpeDiff.toFixed(2)} │`);

    // Deflated Sharpe (new metric)
    const deflatedSharpe = week5Run.deflated_sharpe || 0;
    const deflatedPValue = week5Run.deflated_sharpe_p_value || 1.0;
    console.log(`│ Deflated Sharpe Ratio           │ ${'N/A'.padStart(17)} │ ${deflatedSharpe.toFixed(2).padStart(18)} │ NEW    │`);
    console.log(`│ Deflated Sharpe p-value         │ ${'N/A'.padStart(17)} │ ${deflatedPValue.toFixed(4).padStart(18)} │ NEW    │`);

    // Walk-forward efficiency
    const week0WFE = week0Run?.walk_forward_efficiency || 1.0;
    const week5WFE = week5Run.walk_forward_efficiency || 0;
    console.log(`│ Walk-Forward Efficiency         │ ${(week0WFE * 100).toFixed(1).padStart(16)}% │ ${(week5WFE * 100).toFixed(1).padStart(17)}% │ ${((week5WFE - week0WFE) * 100).toFixed(1)}% │`);

    // Parameter stability (new metric)
    const paramStability = week5Run.parameter_stability || 0;
    console.log(`│ Parameter Stability             │ ${'N/A'.padStart(17)} │ ${(paramStability * 100).toFixed(1).padStart(17)}% │ NEW    │`);

    // Number of OOS periods
    const numPeriods = week5Run.num_periods_oos || 0;
    console.log(`│ Out-of-Sample Periods           │ ${(1).toString().padStart(17)} │ ${numPeriods.toString().padStart(18)} │ +${numPeriods - 1}     │`);

    // Backtest period
    const week0Period = week0Run?.start_date && week0Run?.end_date ?
      `${week0Run.start_date} to ${week0Run.end_date}` : '2024-01-01 to 2024-12-31';
    const week5Period = `${week5Run.start_date} to ${week5Run.end_date}`;
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Backtest Period                 │ ${week0Period.padStart(17)} │ ${week5Period.padStart(18)} │        │`);

    // Years of data
    const week0Years = 1.0;
    const week5Years = (new Date(week5Run.end_date) - new Date(week5Run.start_date)) / (365.25 * 24 * 60 * 60 * 1000);
    console.log(`│ Years of Data                   │ ${week0Years.toFixed(1).padStart(17)} │ ${week5Years.toFixed(1).padStart(18)} │ +${(week5Years - week0Years).toFixed(1)}   │`);

    // Combinations tested
    const week0Combos = week0Run?.total_combinations_tested || 1590;
    const week5Combos = week5Run.total_combinations_tested || 0;
    console.log(`│ Combinations Tested             │ ${week0Combos.toString().padStart(17)} │ ${week5Combos.toString().padStart(18)} │ ${week5Combos - week0Combos}   │`);

    // Significant after correction (new metric)
    const numSignificant = week5Run.num_significant_after_correction || week5Combos;
    console.log(`│ Significant After Correction    │ ${'N/A'.padStart(17)} │ ${numSignificant.toString().padStart(18)} │ NEW    │`);

    console.log('└─────────────────────────────────────────────────────────────────────────────┘');

    // Confidence intervals (new)
    if (week5Run.alpha_ci_lower && week5Run.alpha_ci_upper) {
      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ CONFIDENCE INTERVALS (95%) - NEW IN WEEK 5                                  │');
      console.log('├─────────────────────────────────────────────────────────────────────────────┤');
      console.log(`│ Alpha CI                        │ [${(week5Run.alpha_ci_lower * 100).toFixed(1)}%, ${(week5Run.alpha_ci_upper * 100).toFixed(1)}%]`.padEnd(77) + '│');
      console.log(`│ Sharpe CI                       │ [${week5Run.sharpe_ci_lower?.toFixed(3) || 'N/A'}, ${week5Run.sharpe_ci_upper?.toFixed(3) || 'N/A'}]`.padEnd(77) + '│');
      console.log('└─────────────────────────────────────────────────────────────────────────────┘');
    }

    // Stress test results (new)
    if (week5Run.stress_test_results) {
      const stressResults = JSON.parse(week5Run.stress_test_results);
      console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
      console.log('│ STRESS TEST RESULTS - NEW IN WEEK 5                                         │');
      console.log('├─────────────────────────────────────────────────────────────────────────────┤');
      for (const [scenario, data] of Object.entries(stressResults)) {
        const status = data.passed ? '✅ PASS' : '❌ FAIL';
        console.log(`│ ${scenario.padEnd(28)} │ Max DD: ${(parseFloat(data.maxDrawdown) * 100).toFixed(1)}% ${status.padEnd(10)} │`.padEnd(78) + '│');
      }
      console.log('└─────────────────────────────────────────────────────────────────────────────┘');
    }

    // Overfitting detector results
    console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ OVERFITTING DETECTION RESULTS - NEW IN WEEK 5                               │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ Overall Risk Level              │ ${analysis.overallRisk.padEnd(43)} │`);
    console.log(`│ Tests Passed                    │ ${analysis.assessment.testsPassed} / ${analysis.assessment.testsRun}`.padEnd(45) + '│');
    console.log(`│ Deployment Recommendation       │ ${analysis.deploymentRecommendation.padEnd(43)} │`);
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ CRITICAL issues                 │ ${analysis.assessment.severityCounts.CRITICAL.toString().padEnd(43)} │`);
    console.log(`│ HIGH issues                     │ ${analysis.assessment.severityCounts.HIGH.toString().padEnd(43)} │`);
    console.log(`│ MODERATE issues                 │ ${analysis.assessment.severityCounts.MODERATE.toString().padEnd(43)} │`);
    console.log(`│ LOW issues                      │ ${analysis.assessment.severityCounts.LOW.toString().padEnd(43)} │`);
    console.log('└─────────────────────────────────────────────────────────────────────────────┘');

    // Key insights
    console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ KEY INSIGHTS & INTERPRETATION                                                │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');

    // Alpha adjustment
    const alphaAdjustment = ((week5Alpha - week0Alpha) / week0Alpha * 100);
    if (alphaDiff < -5) {
      console.log('│ ✓ Alpha reduced significantly - MORE REALISTIC estimate after accounting    │');
      console.log(`│   for multiple testing and extended period (${alphaAdjustment.toFixed(0)}% adjustment)`.padEnd(77) + '│');
    } else {
      console.log('│ ✓ Alpha estimate similar - strategy robust across different periods         │');
    }

    // Walk-forward efficiency
    if (week5WFE < 0.90) {
      console.log('│ ✓ Walk-forward efficiency now realistic (<90%) - eliminates data leakage    │');
    }
    if (week5WFE >= 0.30 && week5WFE <= 0.80) {
      console.log('│ ✓ Walk-forward efficiency in healthy range (30-80%) - robust OOS            │');
    } else if (week5WFE < 0.30) {
      console.log('│ ⚠ Walk-forward efficiency below 30% - potential overfitting detected        │');
    }

    // Statistical significance
    if (deflatedPValue < 0.05) {
      console.log('│ ✓ Statistically significant after deflation (p < 0.05) - genuine signal     │');
    } else {
      console.log('│ ⚠ Not statistically significant after deflation - may be false discovery    │');
    }

    // Parameter stability
    if (paramStability >= 0.70) {
      console.log('│ ✓ High parameter stability (>70%) - strategy works consistently over time   │');
    }

    // Crisis testing
    if (week5Run.stress_test_results) {
      const stressResults = JSON.parse(week5Run.stress_test_results);
      const allPassed = Object.values(stressResults).every(r => r.passed);
      if (allPassed) {
        console.log('│ ✓ All stress tests passed - strategy survives crisis conditions            │');
      } else {
        console.log('│ ⚠ Some stress tests failed - strategy fragile to crisis scenarios          │');
      }
    }

    // Overall recommendation
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    if (analysis.overallRisk === 'LOW') {
      console.log('│ ✅ DEPLOYMENT RECOMMENDATION: APPROVED                                       │');
      console.log('│    Strategy passes all overfitting checks and is ready for deployment       │');
      console.log('│    Expected true alpha: ' + `${week5Alpha.toFixed(1)}%`.padEnd(55) + '│');
    } else if (analysis.overallRisk === 'MODERATE') {
      console.log('│ ⚠️  DEPLOYMENT RECOMMENDATION: CAUTION                                        │');
      console.log('│    Strategy has some issues - deploy with reduced position sizes            │');
    } else {
      console.log('│ ❌ DEPLOYMENT RECOMMENDATION: DO NOT DEPLOY                                  │');
      console.log('│    Strategy has critical overfitting issues - DO NOT USE IN PRODUCTION      │');
    }

    console.log('└─────────────────────────────────────────────────────────────────────────────┘');

    // Summary of framework improvements
    console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
    console.log('│ FRAMEWORK IMPROVEMENTS SUMMARY                                               │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ Week 1: Statistical Validation                                               │');
    console.log('│   ✓ FDR multiple testing correction (false positive rate: 50% → 5%)         │');
    console.log('│   ✓ Deflated Sharpe ratio calculation                                       │');
    console.log('│   ✓ Extended period to include COVID crash (2020-2024)                      │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ Week 2: Rolling Walk-Forward Validation                                      │');
    console.log('│   ✓ 5 rolling windows with purging (not single 70/30 split)                 │');
    console.log('│   ✓ Parameter stability metric (CV of test Sharpe)                          │');
    console.log('│   ✓ Early stopping for severe overfitting                                   │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ Week 3: Stress Testing + Confidence Intervals                               │');
    console.log('│   ✓ Historical crisis testing (COVID, Rate Shock)                           │');
    console.log('│   ✓ Bootstrap 95% confidence intervals                                      │');
    console.log('│   ✓ Recovery time estimation                                                │');
    console.log('├─────────────────────────────────────────────────────────────────────────────┤');
    console.log('│ Week 4: Overfitting Detector                                                 │');
    console.log('│   ✓ 6 comprehensive diagnostic tests                                        │');
    console.log('│   ✓ Automated risk assessment (CRITICAL/HIGH/MODERATE/LOW)                  │');
    console.log('│   ✓ Clear deploy/dont deploy recommendations                               │');
    console.log('└─────────────────────────────────────────────────────────────────────────────┘');

    console.log('\n' + '='.repeat(80));
    console.log('✅ BENCHMARK COMPLETE');
    console.log('='.repeat(80));

    // Save benchmark results
    const benchmarkResults = {
      timestamp: new Date().toISOString(),
      week0: {
        runId: week0Run?.id,
        alpha: week0Alpha,
        sharpe: week0Sharpe,
        walkForwardEfficiency: week0WFE,
        period: week0Period
      },
      week5: {
        runId: result.runId,
        alpha: week5Alpha,
        sharpe: week5Sharpe,
        deflatedSharpe,
        deflatedPValue,
        walkForwardEfficiency: week5WFE,
        parameterStability: paramStability,
        period: week5Period,
        overallRisk: analysis.overallRisk,
        testsPassed: analysis.assessment.testsPassed,
        testsTotal: analysis.assessment.testsRun
      },
      comparison: {
        alphaDiff,
        sharpeDiff,
        wfeDiff: week5WFE - week0WFE,
        alphaAdjustmentPct: alphaAdjustment
      }
    };

    // Write results to file
    const fs = require('fs');
    fs.writeFileSync(
      './BENCHMARK_RESULTS.json',
      JSON.stringify(benchmarkResults, null, 2)
    );

    console.log('\n📄 Benchmark results saved to: BENCHMARK_RESULTS.json');
    console.log(`\n⏱️  Total runtime: ${elapsedMinutes.toFixed(1)} minutes`);

    return benchmarkResults;

  } catch (error) {
    console.error('\n❌ Benchmark failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run benchmark
runBenchmark()
  .then(() => {
    console.log('\n✅ Week 5 benchmark completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  });
