/**
 * Synthetic User Stress Test
 *
 * Simulates 10 different user profiles testing various platform functionalities:
 * 1. Quant Researcher - Factor creation, IC analysis, backtesting
 * 2. Value Investor - Screening, DCF, fundamental analysis
 * 3. Momentum Trader - Technical signals, price charts
 * 4. Portfolio Manager - Portfolio analytics, rebalancing
 * 5. Beginner Investor - Onboarding, basic features
 * 6. Insider Tracker - Congressional/insider trading signals
 * 7. Sentiment Analyst - Social sentiment, news analysis
 * 8. ML Engineer - MLOps, model training
 * 9. Risk Manager - Stress tests, Monte Carlo
 * 10. Power User - Rapid multi-feature usage
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

// Test result accumulator
const results = {
  passed: 0,
  failed: 0,
  errors: [],
  timings: {},
  byProfile: {}
};

// Utility functions
async function fetchAPI(endpoint, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const duration = Date.now() - start;
    const data = await response.json();
    return { success: response.ok, data, duration, status: response.status };
  } catch (error) {
    return { success: false, error: error.message, duration: Date.now() - start };
  }
}

function logTest(profile, testName, result, duration) {
  const status = result.success ? '✓' : '✗';
  console.log(`  ${status} [${profile}] ${testName} (${duration}ms)`);

  if (!results.byProfile[profile]) {
    results.byProfile[profile] = { passed: 0, failed: 0, tests: [] };
  }

  if (result.success) {
    results.passed++;
    results.byProfile[profile].passed++;
  } else {
    results.failed++;
    results.byProfile[profile].failed++;
    results.errors.push({ profile, testName, error: result.error || result.data?.error });
  }

  results.byProfile[profile].tests.push({ testName, success: result.success, duration });

  if (!results.timings[testName]) {
    results.timings[testName] = [];
  }
  results.timings[testName].push(duration);
}

// ============================================================
// USER PROFILE 1: QUANT RESEARCHER
// Tests: Factor creation, IC analysis, correlations, backtesting
// ============================================================
async function testQuantResearcher() {
  console.log('\n📊 QUANT RESEARCHER - Testing factor research workflow...');
  const profile = 'Quant';

  // Test 1: Get available metrics
  let result = await fetchAPI('/api/factors/available-metrics');
  logTest(profile, 'Get available metrics', result, result.duration);

  // Test 2: Validate a formula
  result = await fetchAPI('/api/factors/validate', {
    method: 'POST',
    body: JSON.stringify({ formula: '(fcf_yield * roe) / (debt_to_equity + 0.1)' })
  });
  logTest(profile, 'Validate formula', result, result.duration);

  // Test 3: Preview factor values
  result = await fetchAPI('/api/factors/preview', {
    method: 'POST',
    body: JSON.stringify({ formula: 'earnings_yield + roic', sampleSize: 20 })
  });
  logTest(profile, 'Preview factor values', result, result.duration);

  // Test 4: Define a custom factor
  result = await fetchAPI('/api/factors/define', {
    method: 'POST',
    body: JSON.stringify({
      name: `StressTest_Quality_${Date.now()}`,
      formula: 'roe * (1 - debt_to_equity)',
      description: 'Stress test factor',
      higherIsBetter: true,
      transformations: { zscore: true, winsorize: true }
    })
  });
  logTest(profile, 'Define custom factor', result, result.duration);
  const savedFactorId = result.data?.data?.id;

  // Test 5: Run IC analysis
  result = await fetchAPI('/api/factors/ic-analysis', {
    method: 'POST',
    body: JSON.stringify({
      formula: 'roe * (1 - debt_to_equity)',
      horizons: [1, 5, 21, 63]
    })
  });
  logTest(profile, 'IC analysis', result, result.duration);

  // Test 6: Run correlation analysis
  result = await fetchAPI('/api/factors/correlation', {
    method: 'POST',
    body: JSON.stringify({ formula: 'fcf_yield' })
  });
  logTest(profile, 'Correlation analysis', result, result.duration);

  // Test 7: Get user factors
  result = await fetchAPI('/api/factors/user');
  logTest(profile, 'Get user factors', result, result.duration);

  // Test 8: Run factor backtest
  result = await fetchAPI('/api/backtesting/factor-combination', {
    method: 'POST',
    body: JSON.stringify({
      weights: { value: 0.3, quality: 0.3, momentum: 0.2, growth: 0.2 },
      startDate: '2020-01-01',
      endDate: '2024-01-01',
      rebalanceFrequency: 'quarterly'
    })
  });
  logTest(profile, 'Factor combination backtest', result, result.duration);

  // Cleanup - delete test factor
  if (savedFactorId) {
    await fetchAPI(`/api/factors/${savedFactorId}`, { method: 'DELETE' });
  }
}

// ============================================================
// USER PROFILE 2: VALUE INVESTOR
// Tests: Screening, DCF, fundamental analysis
// ============================================================
async function testValueInvestor() {
  console.log('\n💰 VALUE INVESTOR - Testing fundamental analysis...');
  const profile = 'Value';

  // Test 1: Run Buffett screen
  let result = await fetchAPI('/api/screening/screen', {
    method: 'POST',
    body: JSON.stringify({
      preset: 'buffett',
      limit: 50
    })
  });
  logTest(profile, 'Buffett screen', result, result.duration);

  // Test 2: Run magic formula screen
  result = await fetchAPI('/api/screening/screen', {
    method: 'POST',
    body: JSON.stringify({
      preset: 'magic',
      limit: 30
    })
  });
  logTest(profile, 'Magic formula screen', result, result.duration);

  // Test 3: Get company fundamentals
  result = await fetchAPI('/api/companies/AAPL');
  logTest(profile, 'Get company fundamentals (AAPL)', result, result.duration);

  // Test 4: Get company metrics
  result = await fetchAPI('/api/companies/MSFT/metrics');
  logTest(profile, 'Get company metrics (MSFT)', result, result.duration);

  // Test 5: Run DCF valuation
  result = await fetchAPI('/api/dcf/AAPL');
  logTest(profile, 'DCF valuation (AAPL)', result, result.duration);

  // Test 6: Get balance sheet breakdown
  result = await fetchAPI('/api/companies/GOOGL/financials/balance-sheet');
  logTest(profile, 'Balance sheet (GOOGL)', result, result.duration);

  // Test 7: Get cash flow
  result = await fetchAPI('/api/companies/AMZN/financials/cash-flow');
  logTest(profile, 'Cash flow (AMZN)', result, result.duration);

  // Test 8: Get sector analysis
  result = await fetchAPI('/api/sectors/Technology');
  logTest(profile, 'Sector analysis', result, result.duration);
}

// ============================================================
// USER PROFILE 3: MOMENTUM TRADER
// Tests: Price data, technical signals, charts
// ============================================================
async function testMomentumTrader() {
  console.log('\n📈 MOMENTUM TRADER - Testing technical analysis...');
  const profile = 'Momentum';

  // Test 1: Get price history
  let result = await fetchAPI('/api/prices/TSLA/history?period=1y');
  logTest(profile, 'Price history (TSLA)', result, result.duration);

  // Test 2: Get technical signals
  result = await fetchAPI('/api/signals/technical/NVDA');
  logTest(profile, 'Technical signals (NVDA)', result, result.duration);

  // Test 3: Get momentum screen
  result = await fetchAPI('/api/screening/screen', {
    method: 'POST',
    body: JSON.stringify({
      preset: 'momentum',
      limit: 30
    })
  });
  logTest(profile, 'Momentum screen', result, result.duration);

  // Test 4: Get trending stocks
  result = await fetchAPI('/api/trends/trending');
  logTest(profile, 'Trending stocks', result, result.duration);

  // Test 5: Get market indicators
  result = await fetchAPI('/api/macro/indicators');
  logTest(profile, 'Market indicators', result, result.duration);

  // Test 6: Get index prices
  result = await fetchAPI('/api/indices/SPY/prices?period=6m');
  logTest(profile, 'Index prices (SPY)', result, result.duration);

  // Test 7: Multiple stock prices (batch)
  result = await fetchAPI('/api/prices/batch', {
    method: 'POST',
    body: JSON.stringify({ symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'] })
  });
  logTest(profile, 'Batch prices', result, result.duration);
}

// ============================================================
// USER PROFILE 4: PORTFOLIO MANAGER
// Tests: Portfolio analytics, rebalancing, risk metrics
// ============================================================
async function testPortfolioManager() {
  console.log('\n📁 PORTFOLIO MANAGER - Testing portfolio analytics...');
  const profile = 'Portfolio';

  // Test 1: Get portfolios list
  let result = await fetchAPI('/api/portfolios');
  logTest(profile, 'Get portfolios', result, result.duration);

  // Test 2: Create test portfolio
  result = await fetchAPI('/api/portfolios', {
    method: 'POST',
    body: JSON.stringify({
      name: `StressTest_Portfolio_${Date.now()}`,
      holdings: [
        { symbol: 'AAPL', shares: 100, costBasis: 150 },
        { symbol: 'MSFT', shares: 50, costBasis: 300 },
        { symbol: 'GOOGL', shares: 30, costBasis: 140 }
      ]
    })
  });
  logTest(profile, 'Create portfolio', result, result.duration);
  const portfolioId = result.data?.data?.id;

  // Test 3: Get portfolio analytics
  if (portfolioId) {
    result = await fetchAPI(`/api/portfolios/${portfolioId}/analytics`);
    logTest(profile, 'Portfolio analytics', result, result.duration);

    // Test 4: Get correlation matrix
    result = await fetchAPI(`/api/portfolios/${portfolioId}/correlations`);
    logTest(profile, 'Correlation matrix', result, result.duration);

    // Test 5: Get rebalance suggestions
    result = await fetchAPI(`/api/portfolios/${portfolioId}/rebalance`);
    logTest(profile, 'Rebalance suggestions', result, result.duration);

    // Test 6: Run Monte Carlo
    result = await fetchAPI(`/api/portfolios/${portfolioId}/monte-carlo`, {
      method: 'POST',
      body: JSON.stringify({ simulations: 100, horizon: 252 })
    });
    logTest(profile, 'Monte Carlo simulation', result, result.duration);

    // Test 7: Get factor exposure
    result = await fetchAPI(`/api/portfolios/${portfolioId}/factor-exposure`);
    logTest(profile, 'Factor exposure', result, result.duration);

    // Cleanup
    await fetchAPI(`/api/portfolios/${portfolioId}`, { method: 'DELETE' });
  }

  // Test 8: Position sizing
  result = await fetchAPI('/api/portfolios/position-sizing', {
    method: 'POST',
    body: JSON.stringify({
      symbol: 'AAPL',
      portfolioValue: 100000,
      riskPerTrade: 0.02
    })
  });
  logTest(profile, 'Position sizing', result, result.duration);
}

// ============================================================
// USER PROFILE 5: BEGINNER INVESTOR
// Tests: Basic endpoints, simple queries
// ============================================================
async function testBeginnerInvestor() {
  console.log('\n🌱 BEGINNER INVESTOR - Testing basic features...');
  const profile = 'Beginner';

  // Test 1: Health check
  let result = await fetchAPI('/api/health');
  logTest(profile, 'Health check', result, result.duration);

  // Test 2: Search stocks
  result = await fetchAPI('/api/companies/search?q=apple');
  logTest(profile, 'Search stocks', result, result.duration);

  // Test 3: Get stock quote
  result = await fetchAPI('/api/prices/AAPL/quote');
  logTest(profile, 'Get quote (AAPL)', result, result.duration);

  // Test 4: Get watchlist
  result = await fetchAPI('/api/watchlist');
  logTest(profile, 'Get watchlist', result, result.duration);

  // Test 5: Get earnings calendar
  result = await fetchAPI('/api/earnings/calendar');
  logTest(profile, 'Earnings calendar', result, result.duration);

  // Test 6: Get news
  result = await fetchAPI('/api/companies/AAPL/news');
  logTest(profile, 'Get news (AAPL)', result, result.duration);

  // Test 7: Simple NL query
  result = await fetchAPI('/api/nl/query', {
    method: 'POST',
    body: JSON.stringify({ query: 'What is Apple stock price?' })
  });
  logTest(profile, 'NL query', result, result.duration);

  // Test 8: Get help/FAQ
  result = await fetchAPI('/api/settings/preferences');
  logTest(profile, 'Get preferences', result, result.duration);
}

// ============================================================
// USER PROFILE 6: INSIDER TRACKER
// Tests: Congressional trades, insider filings
// ============================================================
async function testInsiderTracker() {
  console.log('\n🏛️ INSIDER TRACKER - Testing insider/congressional data...');
  const profile = 'Insider';

  // Test 1: Get congressional trades
  let result = await fetchAPI('/api/congressional/trades');
  logTest(profile, 'Congressional trades', result, result.duration);

  // Test 2: Get congressional by politician
  result = await fetchAPI('/api/congressional/politicians');
  logTest(profile, 'Politicians list', result, result.duration);

  // Test 3: Get insider transactions
  result = await fetchAPI('/api/insiders/transactions?limit=50');
  logTest(profile, 'Insider transactions', result, result.duration);

  // Test 4: Get insider clusters
  result = await fetchAPI('/api/insiders/clusters');
  logTest(profile, 'Insider clusters', result, result.duration);

  // Test 5: Get insider signals for stock
  result = await fetchAPI('/api/signals/insider/AAPL');
  logTest(profile, 'Insider signals (AAPL)', result, result.duration);

  // Test 6: Congressional screen
  result = await fetchAPI('/api/screening/screen', {
    method: 'POST',
    body: JSON.stringify({
      filters: [{ field: 'congressional_signal', operator: '>', value: 0 }],
      limit: 30
    })
  });
  logTest(profile, 'Congressional screen', result, result.duration);
}

// ============================================================
// USER PROFILE 7: SENTIMENT ANALYST
// Tests: Social sentiment, news sentiment
// ============================================================
async function testSentimentAnalyst() {
  console.log('\n💭 SENTIMENT ANALYST - Testing sentiment data...');
  const profile = 'Sentiment';

  // Test 1: Get sentiment overview
  let result = await fetchAPI('/api/sentiment/overview');
  logTest(profile, 'Sentiment overview', result, result.duration);

  // Test 2: Get Reddit sentiment
  result = await fetchAPI('/api/sentiment/reddit?limit=20');
  logTest(profile, 'Reddit sentiment', result, result.duration);

  // Test 3: Get StockTwits sentiment
  result = await fetchAPI('/api/sentiment/stocktwits/TSLA');
  logTest(profile, 'StockTwits (TSLA)', result, result.duration);

  // Test 4: Get trending sentiment
  result = await fetchAPI('/api/sentiment/trending');
  logTest(profile, 'Trending sentiment', result, result.duration);

  // Test 5: Get news sentiment for stock
  result = await fetchAPI('/api/sentiment/news/NVDA');
  logTest(profile, 'News sentiment (NVDA)', result, result.duration);

  // Test 6: Get analyst estimates
  result = await fetchAPI('/api/companies/AAPL/analyst-estimates');
  logTest(profile, 'Analyst estimates', result, result.duration);
}

// ============================================================
// USER PROFILE 8: ML ENGINEER
// Tests: MLOps, model training, predictions
// ============================================================
async function testMLEngineer() {
  console.log('\n🤖 ML ENGINEER - Testing MLOps functionality...');
  const profile = 'ML';

  // Test 1: Get model registry
  let result = await fetchAPI('/api/ml/models');
  logTest(profile, 'Model registry', result, result.duration);

  // Test 2: Get model health
  result = await fetchAPI('/api/ml/health');
  logTest(profile, 'Model health', result, result.duration);

  // Test 3: Get predictions
  result = await fetchAPI('/api/ml/predictions?symbols=AAPL,MSFT,GOOGL');
  logTest(profile, 'Get predictions', result, result.duration);

  // Test 4: Get feature importance
  result = await fetchAPI('/api/ml/feature-importance');
  logTest(profile, 'Feature importance', result, result.duration);

  // Test 5: Get drift detection
  result = await fetchAPI('/api/ml/drift');
  logTest(profile, 'Drift detection', result, result.duration);

  // Test 6: Get training history
  result = await fetchAPI('/api/ml/training-history');
  logTest(profile, 'Training history', result, result.duration);
}

// ============================================================
// USER PROFILE 9: RISK MANAGER
// Tests: Stress tests, VaR, risk metrics
// ============================================================
async function testRiskManager() {
  console.log('\n⚠️ RISK MANAGER - Testing risk analytics...');
  const profile = 'Risk';

  // Test 1: Get VIX data
  let result = await fetchAPI('/api/macro/vix');
  logTest(profile, 'VIX data', result, result.duration);

  // Test 2: Get yield curve
  result = await fetchAPI('/api/macro/yield-curve');
  logTest(profile, 'Yield curve', result, result.duration);

  // Test 3: Run stress test scenario
  result = await fetchAPI('/api/portfolios/stress-test', {
    method: 'POST',
    body: JSON.stringify({
      holdings: [
        { symbol: 'AAPL', weight: 0.3 },
        { symbol: 'MSFT', weight: 0.3 },
        { symbol: 'GOOGL', weight: 0.4 }
      ],
      scenario: 'market_crash_2008'
    })
  });
  logTest(profile, 'Stress test', result, result.duration);

  // Test 4: Get volatility data
  result = await fetchAPI('/api/prices/AAPL/volatility');
  logTest(profile, 'Volatility (AAPL)', result, result.duration);

  // Test 5: Get beta calculations
  result = await fetchAPI('/api/companies/TSLA/beta');
  logTest(profile, 'Beta (TSLA)', result, result.duration);

  // Test 6: Get drawdown analysis
  result = await fetchAPI('/api/prices/SPY/drawdown?period=5y');
  logTest(profile, 'Drawdown analysis', result, result.duration);
}

// ============================================================
// USER PROFILE 10: POWER USER
// Tests: Rapid concurrent requests, edge cases
// ============================================================
async function testPowerUser() {
  console.log('\n⚡ POWER USER - Testing concurrent load...');
  const profile = 'Power';

  // Test 1: Concurrent stock lookups
  const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'JPM', 'V', 'WMT'];
  const start = Date.now();
  const concurrentResults = await Promise.all(
    symbols.map(s => fetchAPI(`/api/companies/${s}`))
  );
  const concurrentDuration = Date.now() - start;
  const allSucceeded = concurrentResults.every(r => r.success);
  logTest(profile, `10 concurrent company lookups`, { success: allSucceeded, duration: concurrentDuration }, concurrentDuration);

  // Test 2: Concurrent price fetches
  const priceStart = Date.now();
  const priceResults = await Promise.all(
    symbols.slice(0, 5).map(s => fetchAPI(`/api/prices/${s}/quote`))
  );
  const priceDuration = Date.now() - priceStart;
  logTest(profile, '5 concurrent price fetches', { success: priceResults.every(r => r.success), duration: priceDuration }, priceDuration);

  // Test 3: Rapid sequential requests
  const sequentialStart = Date.now();
  for (let i = 0; i < 5; i++) {
    await fetchAPI('/api/health');
  }
  const sequentialDuration = Date.now() - sequentialStart;
  logTest(profile, '5 rapid sequential health checks', { success: true, duration: sequentialDuration }, sequentialDuration);

  // Test 4: Large screening request
  let result = await fetchAPI('/api/screening/screen', {
    method: 'POST',
    body: JSON.stringify({
      filters: [
        { field: 'pe_ratio', operator: '<', value: 20 },
        { field: 'roe', operator: '>', value: 0.15 },
        { field: 'market_cap', operator: '>', value: 1000000000 }
      ],
      limit: 100
    })
  });
  logTest(profile, 'Large complex screen', result, result.duration);

  // Test 5: Edge case - empty query
  result = await fetchAPI('/api/companies/search?q=');
  logTest(profile, 'Empty search query', result, result.duration);

  // Test 6: Edge case - invalid symbol
  result = await fetchAPI('/api/companies/INVALID_SYMBOL_12345');
  logTest(profile, 'Invalid symbol handling', { success: !result.success || result.status === 404, duration: result.duration }, result.duration);

  // Test 7: Edge case - special characters
  result = await fetchAPI('/api/companies/search?q=test%20%26%20special');
  logTest(profile, 'Special characters in search', result, result.duration);
}

// ============================================================
// MAIN TEST RUNNER
// ============================================================
async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('      SYNTHETIC USER STRESS TEST - 10 USER PROFILES');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  const overallStart = Date.now();

  // Run all user profile tests
  await testQuantResearcher();
  await testValueInvestor();
  await testMomentumTrader();
  await testPortfolioManager();
  await testBeginnerInvestor();
  await testInsiderTracker();
  await testSentimentAnalyst();
  await testMLEngineer();
  await testRiskManager();
  await testPowerUser();

  const totalDuration = Date.now() - overallStart;

  // Generate report
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`✓ Passed: ${results.passed}`);
  console.log(`✗ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);

  console.log('\n--- RESULTS BY PROFILE ---\n');
  for (const [profile, data] of Object.entries(results.byProfile)) {
    const rate = ((data.passed / (data.passed + data.failed)) * 100).toFixed(0);
    const avgTime = Math.round(data.tests.reduce((sum, t) => sum + t.duration, 0) / data.tests.length);
    console.log(`${profile}: ${data.passed}/${data.passed + data.failed} passed (${rate}%) - avg ${avgTime}ms`);
  }

  console.log('\n--- SLOWEST ENDPOINTS ---\n');
  const avgTimings = Object.entries(results.timings)
    .map(([name, times]) => ({
      name,
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      max: Math.max(...times)
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10);

  avgTimings.forEach((t, i) => {
    const bar = '█'.repeat(Math.min(Math.round(t.avg / 100), 20));
    console.log(`${(i + 1).toString().padStart(2)}. ${t.name.padEnd(35)} ${t.avg}ms avg, ${t.max}ms max ${bar}`);
  });

  if (results.errors.length > 0) {
    console.log('\n--- ERRORS ---\n');
    results.errors.forEach((e, i) => {
      console.log(`${i + 1}. [${e.profile}] ${e.testName}: ${e.error}`);
    });
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    CRITICAL ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Critical analysis
  const criticalIssues = [];
  const warnings = [];
  const recommendations = [];

  // Check for high failure rates
  for (const [profile, data] of Object.entries(results.byProfile)) {
    const failRate = data.failed / (data.passed + data.failed);
    if (failRate > 0.5) {
      criticalIssues.push(`HIGH FAILURE RATE: ${profile} profile has ${(failRate * 100).toFixed(0)}% failure rate`);
    } else if (failRate > 0.2) {
      warnings.push(`${profile} profile has ${(failRate * 100).toFixed(0)}% failure rate`);
    }
  }

  // Check for slow endpoints
  avgTimings.forEach(t => {
    if (t.avg > 5000) {
      criticalIssues.push(`SLOW ENDPOINT: ${t.name} averages ${t.avg}ms (>5s)`);
    } else if (t.avg > 2000) {
      warnings.push(`Slow endpoint: ${t.name} averages ${t.avg}ms`);
    }
  });

  // Check overall health
  const overallSuccessRate = results.passed / (results.passed + results.failed);
  if (overallSuccessRate < 0.7) {
    criticalIssues.push(`OVERALL SUCCESS RATE: Only ${(overallSuccessRate * 100).toFixed(0)}% of tests passed`);
  }

  // Add recommendations based on findings
  if (results.errors.some(e => e.error?.includes('fetch'))) {
    recommendations.push('Some endpoints may not be implemented or have routing issues');
  }
  if (avgTimings.some(t => t.avg > 2000)) {
    recommendations.push('Consider adding caching for slow endpoints');
  }
  if (results.byProfile['ML']?.failed > results.byProfile['ML']?.passed) {
    recommendations.push('ML/MLOps endpoints need attention - many failures');
  }

  if (criticalIssues.length > 0) {
    console.log('🔴 CRITICAL ISSUES:');
    criticalIssues.forEach(i => console.log(`   • ${i}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:');
    warnings.forEach(w => console.log(`   • ${w}`));
    console.log('');
  }

  if (recommendations.length > 0) {
    console.log('💡 RECOMMENDATIONS:');
    recommendations.forEach(r => console.log(`   • ${r}`));
    console.log('');
  }

  if (criticalIssues.length === 0 && warnings.length === 0) {
    console.log('🟢 ALL SYSTEMS NOMINAL - No critical issues detected\n');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');

  // Return results for programmatic use
  return {
    summary: {
      total: results.passed + results.failed,
      passed: results.passed,
      failed: results.failed,
      successRate: overallSuccessRate,
      duration: totalDuration
    },
    byProfile: results.byProfile,
    errors: results.errors,
    criticalIssues,
    warnings,
    recommendations
  };
}

// Run tests
runAllTests().then(report => {
  process.exit(report.summary.successRate >= 0.7 ? 0 : 1);
}).catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
