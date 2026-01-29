// validate-optimizations.js
// A/B test framework to validate each optimization independently

const Database = require('better-sqlite3');

const db = new Database('./data/stocks.db');

async function runValidationTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 OPTIMIZATION VALIDATION FRAMEWORK');
  console.log('='.repeat(80));
  console.log('\nTesting each optimization INDEPENDENTLY to avoid confounding effects\n');

  // Test configuration
  const testPeriod = {
    startDate: '2024-01-01',
    endDate: '2024-01-31', // 1 month for speed
    initialCapital: 100000
  };

  // Baseline configuration (BEFORE optimizations)
  const baselineConfig = {
    name: 'Baseline (Pre-Optimization)',
    params: {
      min_signal_score: 0.30,
      min_confidence: 0.60,
      stop_loss_pct: 0.10,
      regime_exposure_high_risk: 0.50,
      rebalance_frequency: 'weekly'
    }
  };

  // Test 1: ONLY turnover reduction
  const test1_turnover = {
    name: 'Test 1: Monthly Rebalancing Only',
    params: {
      min_signal_score: 0.30,  // Keep baseline
      min_confidence: 0.60,     // Keep baseline
      stop_loss_pct: 0.10,      // Keep baseline
      regime_exposure_high_risk: 0.50,  // Keep baseline
      rebalance_frequency: 'monthly'  // ONLY CHANGE
    }
  };

  // Test 2: ONLY signal filtering
  const test2_filtering = {
    name: 'Test 2: Signal Filtering Only',
    params: {
      min_signal_score: 0.20,  // CHANGED
      min_confidence: 0.50,     // CHANGED
      stop_loss_pct: 0.10,
      regime_exposure_high_risk: 0.50,
      rebalance_frequency: 'weekly'
    }
  };

  // Test 3: ONLY stop widening
  const test3_stops = {
    name: 'Test 3: Wider Stops Only',
    params: {
      min_signal_score: 0.30,
      min_confidence: 0.60,
      stop_loss_pct: 0.15,      // CHANGED
      regime_exposure_high_risk: 0.50,
      rebalance_frequency: 'weekly'
    }
  };

  // Test 4: ONLY regime suppression
  const test4_regime = {
    name: 'Test 4: Reduced Regime Suppression Only',
    params: {
      min_signal_score: 0.30,
      min_confidence: 0.60,
      stop_loss_pct: 0.10,
      regime_exposure_high_risk: 0.75,  // CHANGED
      rebalance_frequency: 'weekly'
    }
  };

  // Test 5: ALL optimizations combined (current state)
  const test5_all = {
    name: 'Test 5: All Optimizations Combined',
    params: {
      min_signal_score: 0.20,
      min_confidence: 0.50,
      stop_loss_pct: 0.15,
      regime_exposure_high_risk: 0.75,
      rebalance_frequency: 'monthly'
    }
  };

  const tests = [
    baselineConfig,
    test1_turnover,
    test2_filtering,
    test3_stops,
    test4_regime,
    test5_all
  ];

  console.log('📋 Running 6 validation tests...\n');
  console.log('Each test changes ONE parameter vs. baseline (except Test 5)\n');

  const results = [];

  // For this example, just document the framework
  // Actual execution would require strategy creation for each config

  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION TEST PLAN');
  console.log('='.repeat(80));

  for (const test of tests) {
    console.log(`\n${test.name}:`);
    console.log('  Parameters:');
    for (const [key, value] of Object.entries(test.params)) {
      const changed = test !== baselineConfig && test.params[key] !== baselineConfig.params[key];
      const marker = changed ? '  ← CHANGED' : '';
      console.log(`    ${key}: ${value}${marker}`);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('🎯 VALIDATION CRITERIA');
  console.log('='.repeat(80));

  const criteria = [
    {
      metric: 'Alpha vs Baseline',
      keepIf: 'Increase >1%',
      revertIf: 'Decrease >0.5%'
    },
    {
      metric: 'Win Rate',
      keepIf: '>30% or improves',
      revertIf: '<25% or drops >5pts'
    },
    {
      metric: 'Sharpe Ratio',
      keepIf: 'Positive and improving',
      revertIf: 'Negative or worsening'
    },
    {
      metric: 'Max Drawdown',
      keepIf: '<40%',
      revertIf: '>50%'
    },
    {
      metric: 'Turnover',
      keepIf: '<1000%',
      revertIf: '>2000%'
    }
  ];

  console.log('\nFor each optimization to be kept, it must pass ALL criteria:\n');
  for (const c of criteria) {
    console.log(`  ${c.metric}:`);
    console.log(`    ✅ Keep if: ${c.keepIf}`);
    console.log(`    ❌ Revert if: ${c.revertIf}`);
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('💡 EXPECTED OUTCOMES');
  console.log('='.repeat(80));

  console.log('\nTest 1 (Monthly Rebalancing):');
  console.log('  Expected: +2-3% alpha from cost reduction');
  console.log('  Confidence: 95% - this is pure math');
  console.log('  Recommendation: KEEP (no downside)');

  console.log('\nTest 2 (Signal Filtering):');
  console.log('  Expected: +5-8% alpha if edge persists, OR -5-10% if quality dilutes');
  console.log('  Confidence: 50% - HIGH RISK');
  console.log('  Recommendation: VALIDATE CAREFULLY - monitor win rate');

  console.log('\nTest 3 (Wider Stops):');
  console.log('  Expected: +2-3% alpha from fewer false exits');
  console.log('  Confidence: 70% - depends on volatility vs. signal decay');
  console.log('  Recommendation: VALIDATE - check if stopped positions recovered');

  console.log('\nTest 4 (Reduced Regime Suppression):');
  console.log('  Expected: +3-4% alpha in normal times, -10-20% in crashes');
  console.log('  Confidence: 60% - increases tail risk');
  console.log('  Recommendation: VALIDATE - monitor max drawdown closely');

  console.log('\nTest 5 (All Combined):');
  console.log('  Expected: +10-15% if all work, OR WORSE than baseline if conflicts');
  console.log('  Confidence: 40% - too many moving parts');
  console.log('  Recommendation: Only use if each individual test passes');

  console.log('\n\n' + '='.repeat(80));
  console.log('📋 NEXT STEPS');
  console.log('='.repeat(80));

  console.log('\n1. Create 6 strategy configurations (one for each test)');
  console.log('2. Run strategyBenchmark.js on each configuration');
  console.log('3. Compare results to baseline');
  console.log('4. Keep only optimizations that pass validation criteria');
  console.log('5. Document which SME recommendations were correct\n');

  console.log('⚠️  CRITICAL: Do not trust consensus. Trust DATA.\n');

  db.close();
}

runValidationTests().catch(console.error);
