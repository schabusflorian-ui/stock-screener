// tests/postgresql/batch-test-runner.js
/**
 * Batch test runner for PostgreSQL conversion testing
 * Tests multiple services and generates a comprehensive report
 */

const fs = require('fs');
const path = require('path');

const { TestResults, printTestHeader, colors } = require('./testUtils');

// Service test configurations
const SERVICE_TESTS = {
  core: [
    'test-currency.js',
    'test-screening.js',
    'test-etf.js',
    'test-index.js',
    'test-conversationstore.js',
    'test-updatedetector.js',
    'test-dataqualitymonitor.js'
  ],
  portfolio: [],
  agent: [],
  backtesting: [],
  alerts: [],
  xbrl: [],
  updates: []
};

async function runBatchTests(category = 'all') {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.bright}PostgreSQL Conversion - Batch Test Runner${colors.reset}`);
  console.log(`${'='.repeat(70)}\n`);

  const startTime = Date.now();
  const results = {
    categories: {},
    totalServices: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    services: []
  };

  // Determine which categories to test
  const categoriesToTest = category === 'all'
    ? Object.keys(SERVICE_TESTS)
    : [category];

  for (const cat of categoriesToTest) {
    const testFiles = SERVICE_TESTS[cat];
    if (!testFiles || testFiles.length === 0) {
      console.log(`${colors.yellow}⊘${colors.reset} ${cat}: No tests defined yet\n`);
      continue;
    }

    console.log(`\n${colors.cyan}Testing ${cat.toUpperCase()} services...${colors.reset}\n`);

    results.categories[cat] = {
      services: 0,
      tests: 0,
      passed: 0,
      failed: 0,
      details: []
    };

    for (const testFile of testFiles) {
      const testPath = path.join(__dirname, 'services', testFile);

      if (!fs.existsSync(testPath)) {
        console.log(`  ${colors.red}✗${colors.reset} ${testFile} - File not found`);
        continue;
      }

      try {
        const testModule = require(testPath);
        const testFunctionName = Object.keys(testModule)[0];
        const testFunction = testModule[testFunctionName];

        const summary = await testFunction();

        results.categories[cat].services++;
        results.categories[cat].tests += summary.total;
        results.categories[cat].passed += summary.passed;
        results.categories[cat].failed += summary.failed;

        results.totalServices++;
        results.totalTests += summary.total;
        results.passedTests += summary.passed;
        results.failedTests += summary.failed;

        results.services.push({
          category: cat,
          service: summary.service,
          total: summary.total,
          passed: summary.passed,
          failed: summary.failed,
          success: summary.success,
          duration: summary.duration
        });

      } catch (err) {
        console.error(`  ${colors.red}✗${colors.reset} ${testFile} - Error: ${err.message}`);
        results.categories[cat].failed++;
        results.failedTests++;
      }
    }
  }

  const duration = Date.now() - startTime;

  // Print comprehensive summary
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${colors.bright}BATCH TEST SUMMARY${colors.reset}`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n${colors.bright}Services Tested:${colors.reset} ${results.totalServices}`);
  console.log(`${colors.bright}Total Tests:${colors.reset}     ${results.totalTests}`);
  console.log(`${colors.green}Passed:${colors.reset}          ${results.passedTests}`);
  console.log(`${colors.red}Failed:${colors.reset}          ${results.failedTests}`);
  console.log(`${colors.bright}Pass Rate:${colors.reset}       ${results.totalTests > 0 ? Math.round(results.passedTests / results.totalTests * 100) : 0}%`);
  console.log(`${colors.bright}Duration:${colors.reset}        ${duration}ms`);

  console.log(`\n${colors.bright}By Category:${colors.reset}`);
  for (const [cat, catResults] of Object.entries(results.categories)) {
    const passRate = catResults.tests > 0
      ? Math.round(catResults.passed / catResults.tests * 100)
      : 0;
    console.log(`  ${cat.padEnd(15)} ${catResults.services} services, ${catResults.tests} tests, ${passRate}% pass rate`);
  }

  console.log(`\n${colors.bright}Service Details:${colors.reset}`);
  for (const svc of results.services) {
    const icon = svc.success ? colors.green + '✓' : colors.red + '✗';
    const passRate = Math.round(svc.passed / svc.total * 100);
    console.log(`  ${icon}${colors.reset} ${svc.service.padEnd(25)} ${svc.passed}/${svc.total} (${passRate}%) - ${svc.duration}ms`);
  }

  console.log(`\n${'='.repeat(70)}\n`);

  return results;
}

// Run if executed directly
if (require.main === module) {
  const category = process.argv[2] || 'all';

  runBatchTests(category)
    .then(results => {
      const allPassed = results.failedTests === 0;
      process.exit(allPassed ? 0 : 1);
    })
    .catch(err => {
      console.error('Batch test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runBatchTests };
