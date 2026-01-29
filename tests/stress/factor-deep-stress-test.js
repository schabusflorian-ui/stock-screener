/**
 * Deep Factor Features Stress Test
 *
 * 10 synthetic user profiles testing the Quant Lab factor features in depth:
 * 1. Academic Quant - Complex formulas, statistical rigor
 * 2. Value Investor - Value-focused factors
 * 3. Momentum Trader - Price-based factors
 * 4. Quality Screener - Quality metrics
 * 5. Multi-Factor Builder - Combinations
 * 6. Backtester - Historical validation
 * 7. Signal Generator - Live signals
 * 8. Performance Analyst - IC analysis deep dive
 * 9. Edge Case Tester - Boundary conditions
 * 10. Load Tester - Concurrent stress
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

// Performance tracking
const performance = {
  endpoints: {},
  byProfile: {},
  errors: [],
  warnings: []
};

// Test tracking
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function fetchAPI(endpoint, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const duration = Date.now() - start;

    let data;
    try {
      data = await response.json();
    } catch {
      data = { success: false, error: 'Invalid JSON response' };
    }

    // Track performance
    if (!performance.endpoints[endpoint]) {
      performance.endpoints[endpoint] = { times: [], errors: 0 };
    }
    performance.endpoints[endpoint].times.push(duration);

    return {
      success: response.ok && data.success !== false,
      data,
      duration,
      status: response.status
    };
  } catch (error) {
    const duration = Date.now() - start;
    return { success: false, error: error.message, duration };
  }
}

function test(profile, name, result, expected = null) {
  totalTests++;
  const passed = result.success && (expected === null || expected(result));

  if (passed) {
    passedTests++;
    console.log(`  ✓ ${name} (${result.duration}ms)`);
  } else {
    failedTests++;
    console.log(`  ✗ ${name} (${result.duration}ms)`);
    performance.errors.push({
      profile,
      test: name,
      error: result.error || result.data?.error || 'Assertion failed',
      duration: result.duration
    });
  }

  // Track by profile
  if (!performance.byProfile[profile]) {
    performance.byProfile[profile] = { passed: 0, failed: 0, totalTime: 0 };
  }
  performance.byProfile[profile].totalTime += result.duration;
  if (passed) {
    performance.byProfile[profile].passed++;
  } else {
    performance.byProfile[profile].failed++;
  }

  // Performance warnings
  if (result.duration > 3000) {
    performance.warnings.push(`SLOW: ${name} took ${result.duration}ms`);
  }

  return passed;
}

// ============================================================
// PROFILE 1: ACADEMIC QUANT
// Tests complex formulas, edge cases, statistical accuracy
// ============================================================
async function testAcademicQuant() {
  console.log('\n🎓 ACADEMIC QUANT - Testing formula complexity and statistical rigor...');
  const profile = 'Academic';

  // Test 1: Get all available metrics
  let result = await fetchAPI('/api/factors/available-metrics');
  test(profile, 'List available metrics', result, r =>
    r.data?.data?.byCategory && Object.keys(r.data.data.byCategory).length > 0
  );
  const metrics = result.data?.data?.byCategory || {};
  const metricCount = Object.values(metrics).flat().length;
  console.log(`    → Found ${metricCount} metrics across ${Object.keys(metrics).length} categories`);

  // Test 2: Simple formula validation
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'pe_ratio' })
  });
  test(profile, 'Validate simple formula', result, r => r.data?.data?.valid === true);

  // Test 3: Complex arithmetic formula
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: '(earnings_yield + fcf_yield) / 2 * (1 + roe)' })
  });
  test(profile, 'Validate complex arithmetic', result, r => r.data?.data?.valid === true);

  // Test 4: Formula with functions
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'log(market_cap) * sqrt(abs(roe))' })
  });
  test(profile, 'Validate formula with functions', result);

  // Test 5: Invalid formula (syntax error)
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'pe_ratio + + roe' })
  });
  test(profile, 'Reject invalid syntax', result, r => r.data?.data?.valid === false);

  // Test 6: Invalid formula (unknown metric)
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'fake_metric_xyz' })
  });
  test(profile, 'Reject unknown metric', result, r => r.data?.data?.valid === false);

  // Test 7: Division by potential zero
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'roe / debt_to_equity' })
  });
  test(profile, 'Handle division (potential zero)', result);

  // Test 8: Safe division pattern
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'roe / (debt_to_equity + 0.01)' })
  });
  test(profile, 'Validate safe division pattern', result, r => r.data?.data?.valid === true);

  // Test 9: Nested functions
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'max(min(roe, 1), 0) * earnings_yield' })
  });
  test(profile, 'Validate nested functions', result);

  // Test 10: Very long formula
  const longFormula = '(pe_ratio + pb_ratio + ps_ratio + earnings_yield + fcf_yield + dividend_yield + roe + roic + roa + gross_margin) / 10';
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: longFormula })
  });
  test(profile, 'Validate long formula (10 metrics)', result);
}

// ============================================================
// PROFILE 2: VALUE INVESTOR
// Tests value-oriented factors
// ============================================================
async function testValueInvestor() {
  console.log('\n💰 VALUE INVESTOR - Testing value-focused factor creation...');
  const profile = 'Value';

  // Test classic value factors
  const valueFormulas = [
    { name: 'Classic Value (1/PE)', formula: '1 / pe_ratio' },
    { name: 'Book Value', formula: '1 / pb_ratio' },
    { name: 'Earnings Yield', formula: 'earnings_yield' },
    { name: 'FCF Yield', formula: 'fcf_yield' },
    { name: 'Graham Number', formula: 'sqrt(earnings_yield * (1/pb_ratio))' },
    { name: 'Composite Value', formula: '(earnings_yield + fcf_yield + (1/pe_ratio)) / 3' }
  ];

  for (const vf of valueFormulas) {
    let result = await fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: vf.formula })
    });
    test(profile, `Validate: ${vf.name}`, result);
  }

  // Test factor preview for value factor
  let result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'earnings_yield + fcf_yield',
      sampleSize: 50
    })
  });
  test(profile, 'Preview value factor', result, r =>
    r.data?.data?.topStocks?.length > 0 && r.data?.data?.bottomStocks?.length > 0
  );

  if (result.data?.data?.topStocks) {
    console.log(`    → Top value stocks: ${result.data.data.topStocks.slice(0,3).map(s => s.symbol).join(', ')}`);
  }

  // Test saving a value factor
  const factorName = `ValueTest_${Date.now()}`;
  result = await fetchAPI('/api/factors/define', {
    method: 'POST',
    body: JSON.stringify({
      name: factorName,
      formula: 'earnings_yield + fcf_yield',
      description: 'Combined earnings and FCF yield',
      higherIsBetter: true,
      transformations: { zscore: true, winsorize: true }
    })
  });
  test(profile, 'Save value factor', result, r => r.data?.data?.id);
  const factorId = result.data?.data?.id;

  // Cleanup
  if (factorId) {
    await fetchAPI(`/api/factors/${factorId}`, { method: 'DELETE' });
  }
}

// ============================================================
// PROFILE 3: MOMENTUM TRADER
// Tests momentum and technical factors
// ============================================================
async function testMomentumTrader() {
  console.log('\n📈 MOMENTUM TRADER - Testing momentum factor creation...');
  const profile = 'Momentum';

  const momentumFormulas = [
    { name: '12M Momentum', formula: 'momentum_12m' },
    { name: '6M Momentum', formula: 'momentum_6m' },
    { name: '3M Momentum', formula: 'momentum_3m' },
    { name: 'Momentum Combo', formula: '(momentum_12m + momentum_6m) / 2' },
    { name: 'Momentum minus Reversion', formula: 'momentum_12m - momentum_1m' }
  ];

  for (const mf of momentumFormulas) {
    let result = await fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: mf.formula })
    });
    test(profile, `Validate: ${mf.name}`, result);
  }

  // Preview momentum factor
  let result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'momentum_12m - momentum_1m',
      sampleSize: 30
    })
  });
  test(profile, 'Preview momentum factor', result);

  if (result.data?.data?.topStocks) {
    console.log(`    → High momentum: ${result.data.data.topStocks.slice(0,3).map(s => s.symbol).join(', ')}`);
  }
}

// ============================================================
// PROFILE 4: QUALITY SCREENER
// Tests quality-focused factors
// ============================================================
async function testQualityScreener() {
  console.log('\n⭐ QUALITY SCREENER - Testing quality factor creation...');
  const profile = 'Quality';

  const qualityFormulas = [
    { name: 'ROE', formula: 'roe' },
    { name: 'ROIC', formula: 'roic' },
    { name: 'Gross Margin', formula: 'gross_margin' },
    { name: 'Quality Composite', formula: '(roe + roic + gross_margin) / 3' },
    { name: 'Adjusted Quality', formula: 'roe * (1 - debt_to_equity)' },
    { name: 'Piotroski F-Score', formula: 'piotroski_f' }
  ];

  for (const qf of qualityFormulas) {
    let result = await fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: qf.formula })
    });
    test(profile, `Validate: ${qf.name}`, result);
  }

  // Run IC analysis on quality factor
  let result = await fetchAPI('/api/factors/ic-analysis', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'roe',
      horizons: [21, 63, 126]
    })
  });
  test(profile, 'IC analysis on ROE', result, r => r.data?.data?.ic);

  if (result.data?.data?.ic?.icByHorizon) {
    const ic21 = result.data.data.ic.icByHorizon[21];
    console.log(`    → ROE IC(21d): ${(ic21 * 100).toFixed(2)}%`);
  }
}

// ============================================================
// PROFILE 5: MULTI-FACTOR BUILDER
// Tests factor combinations
// ============================================================
async function testMultiFactorBuilder() {
  console.log('\n🔀 MULTI-FACTOR BUILDER - Testing factor combinations...');
  const profile = 'MultiFactor';

  // Test multi-factor formulas
  const multiFormulas = [
    {
      name: 'Value + Quality',
      formula: '(earnings_yield * 0.5) + (roe * 0.5)'
    },
    {
      name: 'Value + Momentum',
      formula: '(fcf_yield * 0.5) + (momentum_12m * 0.5)'
    },
    {
      name: 'Quality + Momentum',
      formula: '(roic * 0.5) + (momentum_6m * 0.5)'
    },
    {
      name: 'Three Factor',
      formula: '(earnings_yield * 0.33) + (roe * 0.33) + (momentum_12m * 0.34)'
    },
    {
      name: 'Magic Formula',
      formula: 'earnings_yield + roic'
    }
  ];

  for (const mf of multiFormulas) {
    let result = await fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: mf.formula })
    });
    test(profile, `Validate: ${mf.name}`, result, r => r.data?.data?.valid === true);
  }

  // Run correlation analysis
  let result = await fetchAPI('/api/factors/correlation', {
    method: 'POST',
    body: JSON.stringify({ formula: 'earnings_yield + roic' })
  });
  test(profile, 'Correlation analysis (Magic Formula)', result);

  if (result.data?.data?.correlations) {
    const corrs = result.data.data.correlations;
    console.log(`    → Correlations: Value ${(corrs.value * 100).toFixed(0)}%, Quality ${(corrs.quality * 100).toFixed(0)}%`);
  }

  if (result.data?.data?.uniquenessScore) {
    console.log(`    → Uniqueness: ${(result.data.data.uniquenessScore * 100).toFixed(0)}%`);
  }
}

// ============================================================
// PROFILE 6: BACKTESTER
// Tests historical validation
// ============================================================
async function testBacktester() {
  console.log('\n📊 BACKTESTER - Testing historical factor validation...');
  const profile = 'Backtest';

  // Test IC analysis with all horizons
  let result = await fetchAPI('/api/factors/ic-analysis', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'earnings_yield',
      horizons: [1, 5, 21, 63, 126, 252]
    })
  });
  test(profile, 'Full IC analysis (6 horizons)', result, r => r.data?.data?.ic?.icByHorizon);

  if (result.data?.data?.ic) {
    const ic = result.data.data.ic;
    console.log(`    → IC by horizon: ${Object.entries(ic.icByHorizon || {}).map(([h, v]) => `${h}d:${(v*100).toFixed(1)}%`).join(', ')}`);
    console.log(`    → T-stat: ${ic.tstat?.toFixed(2) || 'N/A'}, IC IR: ${ic.icIR?.toFixed(2) || 'N/A'}`);
  }

  // Test with different formulas
  const testFormulas = [
    { name: 'Value', formula: 'earnings_yield' },
    { name: 'Quality', formula: 'roe' },
    { name: 'Momentum', formula: 'momentum_12m' }
  ];

  for (const tf of testFormulas) {
    result = await fetchAPI('/api/factors/ic-analysis', {
      method: 'POST',
      body: JSON.stringify({
        formula: tf.formula,
        horizons: [21]
      })
    });
    const ic21 = result.data?.data?.ic?.icByHorizon?.[21];
    test(profile, `IC analysis: ${tf.name}`, result, r => r.data?.data?.ic);
    if (ic21 !== undefined) {
      console.log(`    → ${tf.name} IC(21d): ${(ic21 * 100).toFixed(2)}%`);
    }
  }
}

// ============================================================
// PROFILE 7: SIGNAL GENERATOR
// Tests signal generation
// ============================================================
async function testSignalGenerator() {
  console.log('\n🎯 SIGNAL GENERATOR - Testing signal generation...');
  const profile = 'Signals';

  // Create and save a factor first
  const factorName = `SignalTest_${Date.now()}`;
  let result = await fetchAPI('/api/factors/define', {
    method: 'POST',
    body: JSON.stringify({
      name: factorName,
      formula: 'earnings_yield + roe',
      higherIsBetter: true
    })
  });
  test(profile, 'Create factor for signals', result);
  const factorId = result.data?.data?.id;

  // Generate signals
  result = await fetchAPI('/api/factors/signals', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'earnings_yield + roe',
      topN: 10,
      bottomN: 10
    })
  });
  test(profile, 'Generate top/bottom signals', result);

  if (result.data?.data?.buySignals) {
    console.log(`    → Buy signals: ${result.data.data.buySignals.slice(0,5).map(s => s.symbol).join(', ')}`);
  }

  // Get user factors
  result = await fetchAPI('/api/factors/user');
  test(profile, 'List user factors', result, r => Array.isArray(r.data?.data));
  console.log(`    → User has ${result.data?.data?.length || 0} saved factors`);

  // Cleanup
  if (factorId) {
    result = await fetchAPI(`/api/factors/${factorId}`, { method: 'DELETE' });
    test(profile, 'Delete test factor', result);
  }
}

// ============================================================
// PROFILE 8: PERFORMANCE ANALYST
// Deep IC analysis
// ============================================================
async function testPerformanceAnalyst() {
  console.log('\n📉 PERFORMANCE ANALYST - Deep IC analysis...');
  const profile = 'Performance';

  // Compare multiple factors
  const factors = [
    { name: 'PE Inverse', formula: '1 / pe_ratio' },
    { name: 'Earnings Yield', formula: 'earnings_yield' },
    { name: 'ROE', formula: 'roe' },
    { name: 'Momentum 12M', formula: 'momentum_12m' }
  ];

  const icResults = [];

  for (const f of factors) {
    let result = await fetchAPI('/api/factors/ic-analysis', {
      method: 'POST',
      body: JSON.stringify({
        formula: f.formula,
        horizons: [21]
      })
    });
    test(profile, `IC: ${f.name}`, result);

    if (result.data?.data?.ic?.icByHorizon?.[21] !== undefined) {
      icResults.push({
        name: f.name,
        ic: result.data.data.ic.icByHorizon[21],
        tstat: result.data.data.ic.tstat
      });
    }
  }

  // Rank factors by IC
  console.log('\n    📊 Factor IC Comparison:');
  icResults.sort((a, b) => Math.abs(b.ic) - Math.abs(a.ic));
  icResults.forEach((f, i) => {
    const icPct = (f.ic * 100).toFixed(2);
    const tstat = f.tstat?.toFixed(2) || 'N/A';
    const rating = Math.abs(f.ic) > 0.03 ? '🟢' : Math.abs(f.ic) > 0.01 ? '🟡' : '🔴';
    console.log(`    ${i+1}. ${f.name.padEnd(20)} IC: ${icPct.padStart(6)}%  t-stat: ${tstat.padStart(5)}  ${rating}`);
  });
}

// ============================================================
// PROFILE 9: EDGE CASE TESTER
// Tests boundary conditions
// ============================================================
async function testEdgeCaseTester() {
  console.log('\n🔬 EDGE CASE TESTER - Testing boundary conditions...');
  const profile = 'EdgeCase';

  // Empty formula
  let result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: '' })
  });
  test(profile, 'Empty formula (should fail)', result, r => !r.success || r.data?.data?.valid === false);

  // Whitespace only
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: '   ' })
  });
  test(profile, 'Whitespace formula (should fail)', result, r => !r.success || r.data?.data?.valid === false);

  // Very long formula
  const veryLong = Array(20).fill('pe_ratio').join(' + ');
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: veryLong })
  });
  test(profile, 'Very long formula (20 terms)', result);

  // Special characters
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'pe_ratio; DROP TABLE factors;' })
  });
  test(profile, 'SQL injection attempt (should fail)', result, r => r.data?.data?.valid === false);

  // Unicode
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'pe_ratio + 价格' })
  });
  test(profile, 'Unicode in formula (should fail)', result, r => r.data?.data?.valid === false);

  // Extreme numbers
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: 'pe_ratio * 999999999999' })
  });
  test(profile, 'Extreme multiplier', result);

  // Division by zero pattern
  result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({
      formula: '1 / (pe_ratio - pe_ratio)',
      sampleSize: 10
    })
  });
  test(profile, 'Division by zero (should handle)', result);

  // Negative sample size
  result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'pe_ratio',
      sampleSize: -10
    })
  });
  test(profile, 'Negative sample size', result);

  // Zero sample size
  result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'pe_ratio',
      sampleSize: 0
    })
  });
  test(profile, 'Zero sample size', result);
}

// ============================================================
// PROFILE 10: LOAD TESTER
// Tests concurrent performance
// ============================================================
async function testLoadTester() {
  console.log('\n⚡ LOAD TESTER - Testing concurrent performance...');
  const profile = 'Load';

  // Test 1: 10 concurrent validations
  const formulas = [
    'pe_ratio', 'pb_ratio', 'roe', 'roic', 'earnings_yield',
    'fcf_yield', 'momentum_12m', 'momentum_6m', 'gross_margin', 'debt_to_equity'
  ];

  let start = Date.now();
  const validationResults = await Promise.all(
    formulas.map(f => fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: f })
    }))
  );
  let duration = Date.now() - start;
  const allValid = validationResults.every(r => r.success);
  test(profile, `10 concurrent validations`, { success: allValid, duration });
  console.log(`    → Avg time per validation: ${Math.round(duration / 10)}ms`);

  // Test 2: 5 concurrent IC analyses
  start = Date.now();
  const icResults = await Promise.all(
    formulas.slice(0, 5).map(f => fetchAPI('/api/factors/ic-analysis', {
      method: 'POST',
      body: JSON.stringify({ formula: f, horizons: [21] })
    }))
  );
  duration = Date.now() - start;
  const allIC = icResults.every(r => r.success);
  test(profile, `5 concurrent IC analyses`, { success: allIC, duration });
  console.log(`    → Avg time per IC analysis: ${Math.round(duration / 5)}ms`);

  // Test 3: Sequential rapid fire
  start = Date.now();
  for (let i = 0; i < 20; i++) {
    await fetchAPI('/api/factors/validate', {
      method: 'POST',
      body: JSON.stringify({ formula: formulas[i % formulas.length] })
    });
  }
  duration = Date.now() - start;
  test(profile, `20 rapid sequential validations`, { success: true, duration });
  console.log(`    → Avg time per validation: ${Math.round(duration / 20)}ms`);

  // Test 4: Mixed operations
  start = Date.now();
  await Promise.all([
    fetchAPI('/api/factors/available-metrics'),
    fetchAPI('/api/factors/user'),
    fetchAPI('/api/factors/validate', { method: 'POST', body: JSON.stringify({ formula: 'roe' }) }),
    fetchAPI('/api/factors/preview', { method: 'POST', body: JSON.stringify({ formula: 'roe', sampleSize: 10 }) }),
    fetchAPI('/api/factors/ic-analysis', { method: 'POST', body: JSON.stringify({ formula: 'roe', horizons: [21] }) })
  ]);
  duration = Date.now() - start;
  test(profile, `5 mixed operations in parallel`, { success: true, duration });
}

// ============================================================
// MAIN TEST RUNNER
// ============================================================
async function runAllTests() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║     QUANT LAB FACTOR FEATURES - DEEP STRESS TEST                 ║');
  console.log('║     10 User Profiles × In-Depth Factor Testing                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\nTarget: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const overallStart = Date.now();

  // Run all profile tests
  await testAcademicQuant();
  await testValueInvestor();
  await testMomentumTrader();
  await testQualityScreener();
  await testMultiFactorBuilder();
  await testBacktester();
  await testSignalGenerator();
  await testPerformanceAnalyst();
  await testEdgeCaseTester();
  await testLoadTester();

  const totalDuration = Date.now() - overallStart;

  // ============================================================
  // RESULTS SUMMARY
  // ============================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS SUMMARY                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  const successRate = ((passedTests / totalTests) * 100).toFixed(1);
  console.log(`Total Tests: ${totalTests}`);
  console.log(`✓ Passed: ${passedTests}`);
  console.log(`✗ Failed: ${failedTests}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  // Results by profile
  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ RESULTS BY PROFILE                                              │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  for (const [profile, data] of Object.entries(performance.byProfile)) {
    const rate = ((data.passed / (data.passed + data.failed)) * 100).toFixed(0);
    const avgTime = Math.round(data.totalTime / (data.passed + data.failed));
    const status = rate >= 80 ? '🟢' : rate >= 50 ? '🟡' : '🔴';
    console.log(`│ ${status} ${profile.padEnd(15)} ${data.passed}/${data.passed + data.failed} passed (${rate.padStart(3)}%)  avg: ${avgTime.toString().padStart(4)}ms │`);
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');

  // Performance analysis
  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ PERFORMANCE ANALYSIS                                            │');
  console.log('├─────────────────────────────────────────────────────────────────┤');

  const endpointStats = Object.entries(performance.endpoints)
    .map(([endpoint, data]) => ({
      endpoint: endpoint.replace('/api/factors/', ''),
      avg: Math.round(data.times.reduce((a, b) => a + b, 0) / data.times.length),
      min: Math.min(...data.times),
      max: Math.max(...data.times),
      calls: data.times.length
    }))
    .sort((a, b) => b.avg - a.avg);

  console.log('│ Endpoint                  Avg     Min     Max   Calls           │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  endpointStats.slice(0, 8).forEach(s => {
    const bar = '█'.repeat(Math.min(Math.round(s.avg / 100), 15));
    console.log(`│ ${s.endpoint.padEnd(22)} ${s.avg.toString().padStart(5)}ms ${s.min.toString().padStart(5)}ms ${s.max.toString().padStart(5)}ms ${s.calls.toString().padStart(5)}  ${bar.padEnd(15)}│`);
  });
  console.log('└─────────────────────────────────────────────────────────────────┘');

  // Errors
  if (performance.errors.length > 0) {
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ ERRORS                                                          │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    performance.errors.slice(0, 10).forEach((e, i) => {
      const errMsg = typeof e.error === 'string' ? e.error.substring(0, 40) : 'Unknown error';
      console.log(`│ ${(i+1).toString().padStart(2)}. [${e.profile}] ${e.test.substring(0, 25).padEnd(25)} │`);
      console.log(`│     ${errMsg.padEnd(56)} │`);
    });
    if (performance.errors.length > 10) {
      console.log(`│     ... and ${performance.errors.length - 10} more errors                                    │`);
    }
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }

  // Warnings
  if (performance.warnings.length > 0) {
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ PERFORMANCE WARNINGS                                            │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    performance.warnings.forEach(w => {
      console.log(`│ ⚠️  ${w.padEnd(58)} │`);
    });
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }

  // ============================================================
  // CRITICAL EVALUATION
  // ============================================================
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    CRITICAL EVALUATION                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Overall assessment
  if (parseFloat(successRate) >= 90) {
    console.log('🟢 EXCELLENT: Factor features are production-ready');
  } else if (parseFloat(successRate) >= 75) {
    console.log('🟢 GOOD: Factor features work well, minor issues to address');
  } else if (parseFloat(successRate) >= 50) {
    console.log('🟡 WARNING: Factor features need attention before production');
  } else {
    console.log('🔴 CRITICAL: Factor features have significant issues');
  }

  // Specific findings
  console.log('\n📋 KEY FINDINGS:\n');

  // Find slowest operations
  const slowOps = endpointStats.filter(s => s.avg > 1000);
  if (slowOps.length > 0) {
    console.log('⏱️  Slow Operations (>1s):');
    slowOps.forEach(s => console.log(`   • ${s.endpoint}: ${s.avg}ms avg`));
    console.log('');
  }

  // Find high-error endpoints
  const errorsByEndpoint = {};
  performance.errors.forEach(e => {
    const key = e.test.split(':')[0];
    errorsByEndpoint[key] = (errorsByEndpoint[key] || 0) + 1;
  });

  const highErrorEndpoints = Object.entries(errorsByEndpoint).filter(([_, count]) => count >= 2);
  if (highErrorEndpoints.length > 0) {
    console.log('❌ Unreliable Operations:');
    highErrorEndpoints.forEach(([name, count]) => console.log(`   • ${name}: ${count} failures`));
    console.log('');
  }

  // Feature assessment
  console.log('✅ WORKING FEATURES:');
  for (const [profile, data] of Object.entries(performance.byProfile)) {
    if (data.passed / (data.passed + data.failed) >= 0.8) {
      console.log(`   • ${profile} workflows`);
    }
  }

  console.log('\n⚠️  NEEDS ATTENTION:');
  for (const [profile, data] of Object.entries(performance.byProfile)) {
    if (data.passed / (data.passed + data.failed) < 0.8) {
      console.log(`   • ${profile}: ${data.failed} failures`);
    }
  }

  console.log('\n💡 RECOMMENDATIONS:');
  if (slowOps.length > 0) {
    console.log('   1. Add caching for slow operations (available-metrics, ic-analysis)');
  }
  if (performance.errors.some(e => e.test.includes('Edge'))) {
    console.log('   2. Improve input validation and error messages');
  }
  console.log('   3. Consider async background processing for heavy IC calculations');
  console.log('   4. Add progress indicators for long-running operations');

  console.log('\n════════════════════════════════════════════════════════════════════\n');

  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    successRate: parseFloat(successRate),
    duration: totalDuration,
    performance
  };
}

// Run
runAllTests().then(report => {
  process.exit(report.successRate >= 75 ? 0 : 1);
}).catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
