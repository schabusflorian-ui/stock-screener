#!/usr/bin/env node
// tests/unified-strategy/runAllTests.js
// Main entry point for running all unified strategy tests

const path = require('path');

// Import test runner and test suites
const TestRunner = require('./testRunner');
const runSignalEngineTests = require('./signalEngineTests');
const runStrategyManagerTests = require('./strategyManagerTests');
const runBacktestEngineTests = require('./backtestEngineTests');
const runApiEndpointTests = require('./apiEndpointTests');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Initialize database connection for tests
 * Uses lib/db for async-compatible wrapper (StrategyManager etc. need .query())
 */
async function initializeDatabase() {
  try {
    const { getDatabaseAsync } = require('../../src/lib/db');
    const db = await getDatabaseAsync();
    console.log(`${colors.green}✓${colors.reset} Database connected (async wrapper)`);
    return db;
  } catch (e) {
    console.log(`${colors.yellow}⚠${colors.reset} Could not connect to database: ${e.message}`);
    console.log('  Some tests will be skipped or use mocks');
    return null;
  }
}

/**
 * Run all test suites
 */
async function runAllTests(options = {}) {
  const startTime = Date.now();

  console.log('\n' + '='.repeat(70));
  console.log(`${colors.bright}${colors.cyan}  UNIFIED STRATEGY SYSTEM - TEST SUITE${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  console.log(`${colors.blue}Test Configuration:${colors.reset}`);
  console.log(`  • Verbose: ${options.verbose || false}`);
  console.log(`  • Skip API: ${options.skipApi || false}`);
  console.log(`  • Filter: ${options.filter || 'all'}`);
  console.log('');

  // Initialize
  const db = await initializeDatabase();
  const testRunner = new TestRunner({ verbose: options.verbose });

  // Track results per suite
  const suiteResults = [];

  // Run test suites based on filter
  const suitesToRun = [
    { name: 'Signal Engine', fn: runSignalEngineTests, filter: 'signals' },
    { name: 'Strategy Manager', fn: runStrategyManagerTests, filter: 'strategy' },
    { name: 'Backtest Engine', fn: runBacktestEngineTests, filter: 'backtest' },
    { name: 'API Endpoints', fn: runApiEndpointTests, filter: 'api', skip: options.skipApi }
  ];

  for (const suite of suitesToRun) {
    // Check if suite should be skipped
    if (suite.skip) {
      console.log(`\n${colors.yellow}⊘${colors.reset} Skipping: ${suite.name}`);
      continue;
    }

    // Check filter
    if (options.filter && options.filter !== 'all' && options.filter !== suite.filter) {
      continue;
    }

    console.log('\n' + '-'.repeat(70));
    console.log(`${colors.bright}${colors.magenta}  ${suite.name} Tests${colors.reset}`);
    console.log('-'.repeat(70));

    const suiteStart = Date.now();

    try {
      await suite.fn(testRunner, db);
      suiteResults.push({
        name: suite.name,
        success: true,
        duration: Date.now() - suiteStart
      });
    } catch (error) {
      console.log(`\n${colors.red}✗ Suite Error: ${error.message}${colors.reset}`);
      if (options.verbose) {
        console.log(error.stack);
      }
      suiteResults.push({
        name: suite.name,
        success: false,
        error: error.message,
        duration: Date.now() - suiteStart
      });
    }
  }

  // Print final summary
  const totalDuration = Date.now() - startTime;
  const results = testRunner.getResults();

  console.log('\n' + '='.repeat(70));
  console.log(`${colors.bright}${colors.cyan}  TEST RESULTS SUMMARY${colors.reset}`);
  console.log('='.repeat(70) + '\n');

  // Suite summary
  console.log(`${colors.bright}Suite Results:${colors.reset}`);
  for (const suite of suiteResults) {
    const status = suite.success
      ? `${colors.green}✓ PASS${colors.reset}`
      : `${colors.red}✗ FAIL${colors.reset}`;
    console.log(`  ${status} ${suite.name} (${suite.duration}ms)`);
    if (suite.error) {
      console.log(`       ${colors.red}Error: ${suite.error}${colors.reset}`);
    }
  }

  console.log('');

  // Test counts
  const passRate = results.total > 0
    ? ((results.passed / results.total) * 100).toFixed(1)
    : 0;

  console.log(`${colors.bright}Test Results:${colors.reset}`);
  console.log(`  Total Tests:  ${results.total}`);
  console.log(`  ${colors.green}Passed:       ${results.passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed:       ${results.failed}${colors.reset}`);
  console.log(`  ${colors.yellow}Skipped:      ${results.skipped}${colors.reset}`);
  console.log(`  Pass Rate:    ${passRate}%`);
  console.log(`  Duration:     ${totalDuration}ms`);

  // Failed tests detail
  if (results.failures.length > 0) {
    console.log(`\n${colors.bright}${colors.red}Failed Tests:${colors.reset}`);
    for (const failure of results.failures) {
      console.log(`  ${colors.red}✗${colors.reset} ${failure.suite} > ${failure.test}`);
      console.log(`    ${colors.yellow}${failure.message}${colors.reset}`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');

  // Cleanup
  if (db) {
    try {
      db.close();
    } catch (e) {
      // Ignore close errors
    }
  }

  // Exit with appropriate code
  const success = results.failed === 0;
  return success;
}

/**
 * Generate HTML test report
 */
function generateHtmlReport(results, outputPath) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Unified Strategy Test Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }
    h1 { color: #1a1a1a; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .pass { color: #22c55e; }
    .fail { color: #ef4444; }
    .skip { color: #f59e0b; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e5e5; }
    th { background: #f5f5f5; font-weight: 600; }
    .failure-detail { background: #fef2f2; padding: 15px; margin: 10px 0; border-radius: 4px; border-left: 4px solid #ef4444; }
  </style>
</head>
<body>
  <h1>Unified Strategy System - Test Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="summary">
    <h2>Summary</h2>
    <p><strong>Total Tests:</strong> ${results.total}</p>
    <p class="pass"><strong>Passed:</strong> ${results.passed}</p>
    <p class="fail"><strong>Failed:</strong> ${results.failed}</p>
    <p class="skip"><strong>Skipped:</strong> ${results.skipped}</p>
    <p><strong>Pass Rate:</strong> ${((results.passed / results.total) * 100).toFixed(1)}%</p>
  </div>

  ${results.failures.length > 0 ? `
  <h2>Failed Tests</h2>
  ${results.failures.map(f => `
    <div class="failure-detail">
      <strong>${f.suite} > ${f.test}</strong>
      <p>${f.message}</p>
    </div>
  `).join('')}
  ` : ''}

  <h2>All Tests</h2>
  <table>
    <thead>
      <tr>
        <th>Suite</th>
        <th>Test</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${results.tests ? results.tests.map(t => `
        <tr>
          <td>${t.suite}</td>
          <td>${t.name}</td>
          <td class="${t.passed ? 'pass' : 'fail'}">${t.passed ? '✓ PASS' : '✗ FAIL'}</td>
        </tr>
      `).join('') : '<tr><td colspan="3">No detailed test data available</td></tr>'}
    </tbody>
  </table>
</body>
</html>
  `;

  const fs = require('fs');
  fs.writeFileSync(outputPath, html);
  console.log(`HTML report generated: ${outputPath}`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--skip-api') {
      options.skipApi = true;
    } else if (arg === '--filter' || arg === '-f') {
      options.filter = args[++i];
    } else if (arg === '--html-report') {
      options.htmlReport = args[++i] || 'test-report.html';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Unified Strategy Test Runner

Usage: node runAllTests.js [options]

Options:
  -v, --verbose      Show detailed test output
  --skip-api         Skip API endpoint tests
  -f, --filter       Run only specific suite (signals, strategy, backtest, api)
  --html-report      Generate HTML report (optional path)
  -h, --help         Show this help message

Examples:
  node runAllTests.js                    Run all tests
  node runAllTests.js -v                 Run with verbose output
  node runAllTests.js -f signals         Run only signal tests
  node runAllTests.js --skip-api         Skip API tests
  node runAllTests.js --html-report      Generate HTML report
`);
      process.exit(0);
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();

  runAllTests(options)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner error:', error);
      process.exit(1);
    });
}

module.exports = { runAllTests, generateHtmlReport };
