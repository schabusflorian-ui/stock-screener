// tests/postgresql/testRunner.js
/**
 * Main test runner for PostgreSQL conversion validation
 * Systematically tests all 103 converted services
 */

const fs = require('fs');
const path = require('path');
const { colors } = require('./testUtils');

// Import test suites
const { runCurrencyServiceTests } = require('./services/test-currency');
const { runScreeningServiceTests } = require('./services/test-screening');

// Test suite registry
const TEST_SUITES = {
  // Core Services (9 services)
  'CurrencyService': { fn: runCurrencyServiceTests, priority: 1, status: '✅' },
  'ScreeningService': { fn: runScreeningServiceTests, priority: 1, status: '❌' },
  // TODO: Add more as we create them
  // 'ETFService': { fn: runETFServiceTests, priority: 1, status: '⏳' },
  // 'StockImporter': { fn: runStockImporterTests, priority: 2, status: '⏳' },
  // 'SectorAnalysis': { fn: runSectorAnalysisTests, priority: 2, status: '⏳' },

  // Portfolio Services (21 services)
  // 'PortfolioIndex': { fn: runPortfolioIndexTests, priority: 1, status: '⏳' },
  // 'HoldingsEngine': { fn: runHoldingsEngineTests, priority: 1, status: '⏳' },
  // ... etc

  // Agent Services (13 services)
  // 'TradingAgent': { fn: runTradingAgentTests, priority: 1, status: '⏳' },
  // 'AgentService': { fn: runAgentServiceTests, priority: 1, status: '⏳' },
  // ... etc

  // Backtesting Services (20 services)
  // ... etc

  // Alert Services (11 services)
  // ... etc

  // XBRL Services (6 services)
  // ... etc

  // Update Services (11 services)
  // ... etc
};

class TestRunner {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || process.env.DEBUG === 'true',
      stopOnError: options.stopOnError || false,
      priority: options.priority || null, // Only run tests with this priority
      filter: options.filter || null, // Regex to filter test names
      ...options
    };

    this.results = [];
    this.startTime = Date.now();
  }

  /**
   * Run all registered test suites
   */
  async runAll() {
    this.printHeader();

    const suites = Object.entries(TEST_SUITES)
      .filter(([name, suite]) => {
        if (this.options.priority && suite.priority !== this.options.priority) {
          return false;
        }
        if (this.options.filter) {
          const regex = new RegExp(this.options.filter, 'i');
          return regex.test(name);
        }
        return true;
      })
      .sort((a, b) => (a[1].priority || 999) - (b[1].priority || 999));

    console.log(`Running ${suites.length} test suites...\n`);

    for (const [name, suite] of suites) {
      try {
        console.log(`${colors.cyan}[${ suites.indexOf([name, suite]) + 1}/${suites.length}]${colors.reset} ${name}...`);
        const result = await suite.fn();
        this.results.push({ name, ...result });

        if (!result.success && this.options.stopOnError) {
          console.log(`\n${colors.red}Stopping due to test failure${colors.reset}\n`);
          break;
        }
      } catch (error) {
        console.error(`${colors.red}✗ ${name} test suite crashed:${colors.reset}`, error.message);
        this.results.push({
          name,
          success: false,
          error: error.message,
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0
        });

        if (this.options.stopOnError) {
          break;
        }
      }
    }

    this.printSummary();
    this.saveResults();

    return this.results;
  }

  /**
   * Print test runner header
   */
  printHeader() {
    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}PostgreSQL Conversion Test Suite${colors.reset}`);
    console.log(`${colors.bright}Testing 103 Converted Services${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`Start Time: ${new Date().toLocaleString()}`);
    if (this.options.priority) {
      console.log(`Filter: Priority ${this.options.priority} only`);
    }
    if (this.options.filter) {
      console.log(`Filter: /${this.options.filter}/i`);
    }
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Print overall summary
   */
  printSummary() {
    const duration = Date.now() - this.startTime;
    const totalTests = this.results.reduce((sum, r) => sum + r.total, 0);
    const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
    const totalSkipped = this.results.reduce((sum, r) => sum + r.skipped, 0);
    const successfulSuites = this.results.filter(r => r.success).length;

    console.log('\n' + '='.repeat(80));
    console.log(`${colors.bright}Overall Test Summary${colors.reset}`);
    console.log('='.repeat(80));
    console.log(`Test Suites:  ${this.results.length} total`);
    console.log(`  ${colors.green}Passed:     ${successfulSuites}${colors.reset}`);
    console.log(`  ${colors.red}Failed:     ${this.results.length - successfulSuites}${colors.reset}`);
    console.log(``);
    console.log(`Individual Tests: ${totalTests} total`);
    console.log(`  ${colors.green}Passed:     ${totalPassed}${colors.reset}`);
    console.log(`  ${colors.red}Failed:     ${totalFailed}${colors.reset}`);
    console.log(`  ${colors.yellow}Skipped:    ${totalSkipped}${colors.reset}`);
    console.log(``);
    console.log(`Duration:     ${(duration / 1000).toFixed(2)}s`);
    console.log('='.repeat(80));

    // Show failed suites
    const failedSuites = this.results.filter(r => !r.success);
    if (failedSuites.length > 0) {
      console.log(`\n${colors.red}Failed Test Suites:${colors.reset}`);
      failedSuites.forEach(suite => {
        console.log(`  ${colors.red}✗${colors.reset} ${suite.name} (${suite.failed} failures)`);
      });
    }

    // Show success rate
    const successRate = this.results.length > 0
      ? ((successfulSuites / this.results.length) * 100).toFixed(1)
      : 0;

    console.log(`\nSuccess Rate: ${successRate}% (${successfulSuites}/${this.results.length} suites)`);

    if (successRate === 100) {
      console.log(`\n${colors.green}✓ All tests passed!${colors.reset}\n`);
    } else {
      console.log(`\n${colors.red}✗ Some tests failed. See bugTracker.md for details.${colors.reset}\n`);
    }
  }

  /**
   * Save test results to file
   */
  saveResults() {
    const outputPath = path.join(__dirname, 'test-results.json');
    const output = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.startTime,
      options: this.options,
      results: this.results,
      summary: {
        totalSuites: this.results.length,
        passedSuites: this.results.filter(r => r.success).length,
        failedSuites: this.results.filter(r => !r.success).length,
        totalTests: this.results.reduce((sum, r) => sum + r.total, 0),
        passedTests: this.results.reduce((sum, r) => sum + r.passed, 0),
        failedTests: this.results.reduce((sum, r) => sum + r.failed, 0),
        skippedTests: this.results.reduce((sum, r) => sum + r.skipped, 0)
      }
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    stopOnError: args.includes('--stop-on-error') || args.includes('-s'),
    priority: null,
    filter: null
  };

  // Parse priority filter
  const priorityArg = args.find(arg => arg.startsWith('--priority='));
  if (priorityArg) {
    options.priority = parseInt(priorityArg.split('=')[1]);
  }

  // Parse name filter
  const filterArg = args.find(arg => arg.startsWith('--filter='));
  if (filterArg) {
    options.filter = filterArg.split('=')[1];
  }

  const runner = new TestRunner(options);
  const results = await runner.runAll();

  const hasFailures = results.some(r => !r.success);
  process.exit(hasFailures ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { TestRunner, TEST_SUITES };
