#!/usr/bin/env node
/**
 * AI Trading Agent Comprehensive Stress Test Framework
 *
 * Tests 10 synthetic users with diverse trading profiles across 30 simulated
 * trading days with varying market conditions.
 *
 * Usage:
 *   node tests/agent-stress-test/index.js [options]
 *
 * Options:
 *   --verbose, -v          Show detailed output
 *   --days=N               Simulation days (default: 30)
 *   --skip-edge-cases      Skip edge case tests
 *   --skip-load-test       Skip load/concurrency tests
 *   --users=a,b,c          Test specific users only
 *   --help, -h             Show help
 */

const path = require('path');

// Config
const { SYNTHETIC_USERS } = require('./config/syntheticUsers');
const { MARKET_SCENARIOS, SCENARIO_SEQUENCE, EDGE_CASES, UI_VALIDATION_TESTS, STRESS_TEST_CONFIG } = require('./config/scenarios');

// Runners
const { AgentLifecycleRunner } = require('./runners/AgentLifecycleRunner');
const { TradingSimulationRunner } = require('./runners/TradingSimulationRunner');
const { EdgeCaseRunner } = require('./runners/EdgeCaseRunner');

// Utils
const { IssueCollector } = require('./utils/issueCollector');
const { MetricsCollector } = require('./utils/metricsCollector');
const { ReportGenerator } = require('./utils/reportGenerator');

class AgentStressTestFramework {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.simulationDays = options.simulationDays || STRESS_TEST_CONFIG.defaultSimulationDays;
    this.users = options.users || Object.keys(SYNTHETIC_USERS);
    this.skipEdgeCases = options.skipEdgeCases || false;
    this.skipLoadTest = options.skipLoadTest || false;

    this.db = null;
    this.issueCollector = new IssueCollector();
    this.metricsCollector = new MetricsCollector();

    this.createdAgents = new Map();  // userId -> agentId
    this.createdPortfolios = new Map();  // userId -> portfolioId
    this.paperAccounts = new Map();  // portfolioId -> accountId
  }

  async initialize() {
    console.log('Initializing Agent Stress Test Framework...');

    // Load database
    try {
      const dbPath = path.resolve(__dirname, '../../src/database');
      const dbModule = require(dbPath);
      this.db = dbModule.getDatabase ? dbModule.getDatabase() : dbModule;
      console.log('  Database connected');
    } catch (error) {
      // Try alternative paths
      try {
        const Database = require('better-sqlite3');
        const dbFile = path.resolve(__dirname, '../../data/stocks.db');
        this.db = new Database(dbFile);
        console.log('  Database connected (direct)');
      } catch (e) {
        throw new Error(`Failed to connect to database: ${error.message}`);
      }
    }

    // Initialize runners
    this.lifecycleRunner = new AgentLifecycleRunner(this.db, {
      verbose: this.verbose,
      issueCollector: this.issueCollector,
      metricsCollector: this.metricsCollector
    });

    this.simulationRunner = new TradingSimulationRunner(this.db, {
      verbose: this.verbose,
      issueCollector: this.issueCollector,
      metricsCollector: this.metricsCollector,
      simulationDays: this.simulationDays
    });

    this.edgeCaseRunner = new EdgeCaseRunner(this.db, {
      verbose: this.verbose,
      issueCollector: this.issueCollector
    });

    this.reportGenerator = new ReportGenerator({
      outputDir: path.resolve(__dirname, './results')
    });

    this.metricsCollector.start();
    console.log('  Framework initialized\n');
  }

  async run() {
    const startTime = Date.now();

    this.printHeader('AI TRADING AGENT STRESS TEST FRAMEWORK');
    console.log(`  Synthetic Users: ${this.users.length}`);
    console.log(`  Simulation Days: ${this.simulationDays}`);
    console.log(`  Edge Cases: ${this.skipEdgeCases ? 'Skipped' : 'Enabled'}`);
    console.log(`  Load Test: ${this.skipLoadTest ? 'Skipped' : 'Enabled'}`);
    console.log(`  Started: ${new Date().toISOString()}\n`);

    try {
      // PHASE 1: Create all users, portfolios, and agents
      this.printHeader('PHASE 1: USER & AGENT SETUP');
      await this.setupAllUsers();

      // PHASE 2: Run 30-day trading simulation
      this.printHeader('PHASE 2: 30-DAY TRADING SIMULATION');
      await this.runTradingSimulation();

      // PHASE 3: Edge case testing
      if (!this.skipEdgeCases) {
        this.printHeader('PHASE 3: EDGE CASE TESTING');
        await this.runEdgeCases();
      }

      // PHASE 4: Load testing (simplified)
      if (!this.skipLoadTest) {
        this.printHeader('PHASE 4: LOAD & CONCURRENCY TESTING');
        await this.runLoadTests();
      }

      // PHASE 5: Cleanup and report
      this.printHeader('PHASE 5: FINAL REPORT');
      const report = await this.generateReport(startTime);

      return {
        success: this.issueCollector.getCriticalCount() === 0,
        issues: this.issueCollector.getAllIssues(),
        metrics: this.metricsCollector.getSummary(),
        report
      };

    } catch (error) {
      this.issueCollector.addIssue({
        severity: 'CRITICAL',
        category: 'FRAMEWORK',
        message: `Framework crashed: ${error.message}`,
        stack: error.stack
      });
      console.error('\n[CRITICAL] Framework error:', error.message);

      return {
        success: false,
        issues: this.issueCollector.getAllIssues(),
        metrics: this.metricsCollector.getSummary()
      };
    }
  }

  async setupAllUsers() {
    console.log(`\n  Setting up ${this.users.length} synthetic users...\n`);

    for (const userId of this.users) {
      const userConfig = SYNTHETIC_USERS[userId];
      if (!userConfig) {
        console.log(`  [WARN] User config not found: ${userId}`);
        continue;
      }

      console.log(`  Creating user: ${userConfig.name} (${userId})`);

      try {
        // Step 1: Create portfolio
        const portfolio = await this.lifecycleRunner.createPortfolio(userConfig.portfolio);
        this.createdPortfolios.set(userId, portfolio.portfolioId);
        console.log(`    [OK] Portfolio created: ${portfolio.portfolioId}`);

        // Step 2: Create paper trading account
        const paperAccount = await this.lifecycleRunner.createPaperAccount(
          portfolio.portfolioId,
          userConfig.portfolio.initialCash
        );
        this.paperAccounts.set(portfolio.portfolioId, paperAccount.id);
        console.log(`    [OK] Paper account created: ${paperAccount.id}`);

        // Step 3: Create agent with user's config
        const agent = await this.lifecycleRunner.createAgent(
          userConfig.agent,
          portfolio.portfolioId
        );
        this.createdAgents.set(userId, agent.id);
        console.log(`    [OK] Agent created: ${agent.id} (${userConfig.agent.name})`);

        // Step 4: Start agent
        await this.lifecycleRunner.startAgent(agent.id);
        console.log(`    [OK] Agent started`);

        this.metricsCollector.recordSetup(userId, {
          portfolioId: portfolio.portfolioId,
          agentId: agent.id,
          paperAccountId: paperAccount.id
        });

      } catch (error) {
        this.issueCollector.addIssue({
          severity: 'HIGH',
          category: 'SETUP',
          userId,
          message: `Failed to setup user: ${error.message}`,
          error: error.message
        });
        console.log(`    [FAIL] Setup failed: ${error.message}`);
      }
    }

    console.log(`\n  Setup complete: ${this.createdAgents.size}/${this.users.length} users ready`);
  }

  async runTradingSimulation() {
    console.log(`\n  Running ${this.simulationDays}-day trading simulation...\n`);

    let currentDay = 1;
    let currentScenarioIndex = 0;
    let daysInCurrentScenario = 0;

    while (currentDay <= this.simulationDays) {
      // Get current scenario
      let currentScenario = SCENARIO_SEQUENCE[currentScenarioIndex];

      // Check if we need to move to next scenario
      if (daysInCurrentScenario >= currentScenario.duration) {
        currentScenarioIndex = (currentScenarioIndex + 1) % SCENARIO_SEQUENCE.length;
        currentScenario = SCENARIO_SEQUENCE[currentScenarioIndex];
        daysInCurrentScenario = 0;
      }

      const scenarioLabel = currentScenario.id.toUpperCase().replace('_', ' ');
      console.log(`  Day ${currentDay}/${this.simulationDays} - ${scenarioLabel} (VIX: ${currentScenario.vix})`);

      let daySignals = 0;
      let dayTrades = 0;
      let dayErrors = 0;

      // For each user, run their agent for this day
      for (const userId of this.users) {
        const agentId = this.createdAgents.get(userId);
        const portfolioId = this.createdPortfolios.get(userId);
        const paperAccountId = this.paperAccounts.get(portfolioId);

        if (!agentId) continue;

        try {
          const scanResult = await this.simulationRunner.runAgentDay(
            agentId,
            portfolioId,
            paperAccountId,
            currentScenario,
            currentDay
          );

          this.metricsCollector.recordDay(userId, currentDay, scanResult);

          daySignals += scanResult.signalsGenerated || 0;
          dayTrades += scanResult.tradesExecuted || 0;
          dayErrors += scanResult.errors?.length || 0;

          if (this.verbose && scanResult.signalsGenerated > 0) {
            console.log(`    ${userId}: signals=${scanResult.signalsGenerated}, trades=${scanResult.tradesExecuted}`);
          }

        } catch (error) {
          dayErrors++;
          this.issueCollector.addIssue({
            severity: 'MEDIUM',
            category: 'SIMULATION',
            userId,
            day: currentDay,
            scenario: currentScenario.id,
            message: `Day ${currentDay} failed: ${error.message}`
          });
        }
      }

      // Take daily snapshots for all paper accounts
      await this.simulationRunner.takeAllSnapshots(
        Array.from(this.paperAccounts.values())
      );

      // Log daily summary
      if (!this.verbose) {
        console.log(`    Signals: ${daySignals} | Trades: ${dayTrades} | Errors: ${dayErrors}`);
      }

      currentDay++;
      daysInCurrentScenario++;

      // Brief pause between days
      await this.sleep(50);
    }

    console.log('\n  Simulation complete');
  }

  async runEdgeCases() {
    console.log('\n  Running edge case tests...\n');

    let passed = 0;
    let failed = 0;

    // Test each edge case
    for (const [caseId, edgeCase] of Object.entries(EDGE_CASES)) {
      if (this.verbose) {
        console.log(`  Testing: ${edgeCase.description}`);
      }

      try {
        const result = await this.edgeCaseRunner.runEdgeCase(
          edgeCase,
          this.createdAgents,
          this.createdPortfolios
        );

        if (result.passed) {
          passed++;
          if (this.verbose) console.log(`    [PASS] Handled correctly`);
        } else {
          failed++;
          if (this.verbose) console.log(`    [FAIL] ${result.error}`);
          this.issueCollector.addIssue({
            severity: result.severity || 'MEDIUM',
            category: 'EDGE_CASE',
            caseId,
            message: result.error || edgeCase.description
          });
        }
      } catch (error) {
        failed++;
        if (this.verbose) console.log(`    [ERROR] ${error.message}`);
        this.issueCollector.addIssue({
          severity: 'HIGH',
          category: 'EDGE_CASE',
          caseId,
          message: `Edge case threw exception: ${error.message}`
        });
      }
    }

    // Test UI validation questions
    console.log('\n  Testing UI validation scenarios...');
    let uiPassed = 0;
    let uiFailed = 0;

    for (const question of UI_VALIDATION_TESTS) {
      try {
        const result = await this.edgeCaseRunner.testUIValidation(question);
        if (result.passed) {
          uiPassed++;
        } else {
          uiFailed++;
          this.issueCollector.addIssue({
            severity: 'LOW',
            category: 'UI_VALIDATION',
            message: result.error || question.description
          });
        }
      } catch (e) {
        uiFailed++;
      }
    }

    console.log(`\n  Edge cases: ${passed} passed, ${failed} failed`);
    console.log(`  UI validation: ${uiPassed} passed, ${uiFailed} failed`);
  }

  async runLoadTests() {
    console.log('\n  Running load and concurrency tests...\n');

    // Test 1: Concurrent agent scans
    console.log('  Test: Concurrent agent scans...');
    const agentIds = Array.from(this.createdAgents.values()).slice(0, 5);

    if (agentIds.length > 0) {
      const startTime = Date.now();
      let successful = 0;

      const promises = agentIds.map(id =>
        this.lifecycleRunner.runScan(id)
          .then(() => { successful++; })
          .catch(() => {})
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`    Result: ${successful}/${agentIds.length} succeeded in ${duration}ms`);

      if (successful < agentIds.length * 0.8) {
        this.issueCollector.addIssue({
          severity: 'MEDIUM',
          category: 'PERFORMANCE',
          message: `Concurrent scan success rate low: ${successful}/${agentIds.length}`
        });
      }
    } else {
      console.log('    Skipped (no agents created)');
    }

    // Test 2: Memory usage check
    console.log('  Test: Memory usage...');
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    console.log(`    Heap used: ${heapUsedMB}MB`);

    if (heapUsedMB > STRESS_TEST_CONFIG.warningMemoryMB) {
      this.issueCollector.addIssue({
        severity: heapUsedMB > STRESS_TEST_CONFIG.maxMemoryMB ? 'HIGH' : 'MEDIUM',
        category: 'PERFORMANCE',
        message: `High memory usage: ${heapUsedMB}MB`
      });
    }
  }

  async generateReport(startTime) {
    const totalTime = Date.now() - startTime;

    // Collect all data
    const metrics = this.metricsCollector.getSummary();
    const issues = this.issueCollector.getAllIssues();

    // Generate report
    const report = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalRuntime: `${(totalTime / 1000).toFixed(2)}s`,
        simulationDays: this.simulationDays,
        usersCreated: this.createdAgents.size
      },
      summary: {
        totalIssues: issues.length,
        criticalIssues: this.issueCollector.getCriticalCount(),
        highIssues: this.issueCollector.getByPriority('HIGH').length,
        mediumIssues: this.issueCollector.getByPriority('MEDIUM').length,
        lowIssues: this.issueCollector.getByPriority('LOW').length
      },
      crossSectionalCoverage: this.calculateCrossSection(),
      temporalCoverage: this.calculateTemporalCoverage(),
      metrics,
      issues: this.categorizeIssues(issues),
      recommendations: ReportGenerator.generateRecommendations(issues)
    };

    // Print summary
    this.printReportSummary(report);

    // Save to file
    try {
      await this.reportGenerator.save(report);
    } catch (e) {
      console.log(`  [WARN] Could not save report: ${e.message}`);
    }

    return report;
  }

  calculateCrossSection() {
    const coverage = {};
    for (const userId of Object.keys(SYNTHETIC_USERS)) {
      const user = SYNTHETIC_USERS[userId];
      coverage[userId] = {
        name: user.name,
        description: user.description,
        riskTolerance: user.expectedBehavior.riskTolerance,
        signalFrequency: user.expectedBehavior.signalFrequency,
        tested: this.createdAgents.has(userId)
      };
    }
    return coverage;
  }

  calculateTemporalCoverage() {
    const scenarios = Object.keys(MARKET_SCENARIOS);
    const covered = new Set(this.metricsCollector.getCoveredScenarios());
    return {
      totalScenarios: scenarios.length,
      coveredScenarios: covered.size,
      coverage: `${((covered.size / scenarios.length) * 100).toFixed(0)}%`,
      details: scenarios.map(s => ({
        scenario: s,
        covered: covered.has(MARKET_SCENARIOS[s].id)
      }))
    };
  }

  categorizeIssues(issues) {
    const categories = {
      CRITICAL: [],
      BUG: [],
      EDGE_CASE: [],
      PERFORMANCE: [],
      UI: []
    };

    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') {
        categories.CRITICAL.push(issue);
      } else if (issue.category === 'EDGE_CASE') {
        categories.EDGE_CASE.push(issue);
      } else if (issue.category === 'UI_VALIDATION') {
        categories.UI.push(issue);
      } else if (issue.category === 'PERFORMANCE') {
        categories.PERFORMANCE.push(issue);
      } else {
        categories.BUG.push(issue);
      }
    }

    return categories;
  }

  printReportSummary(report) {
    console.log('\n' + '='.repeat(70));
    console.log('STRESS TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`\n  Runtime: ${report.metadata.totalRuntime}`);
    console.log(`  Users Tested: ${report.metadata.usersCreated}`);
    console.log(`  Days Simulated: ${report.metadata.simulationDays}`);
    console.log(`\n  ISSUES FOUND:`);
    console.log(`    Critical: ${report.summary.criticalIssues}`);
    console.log(`    High: ${report.summary.highIssues}`);
    console.log(`    Medium: ${report.summary.mediumIssues}`);
    console.log(`    Low: ${report.summary.lowIssues}`);
    console.log(`\n  COVERAGE:`);

    const testedUsers = Object.values(report.crossSectionalCoverage).filter(u => u.tested).length;
    console.log(`    Cross-sectional: ${testedUsers}/10 user types`);
    console.log(`    Temporal: ${report.temporalCoverage.coverage}`);

    if (report.recommendations && report.recommendations.length > 0) {
      console.log(`\n  RECOMMENDATIONS:`);
      for (const rec of report.recommendations.slice(0, 5)) {
        console.log(`    [${rec.priority}] ${rec.area}: ${rec.recommendation.substring(0, 80)}...`);
      }
    }

    const status = report.summary.criticalIssues === 0 ? 'PASSED' : 'FAILED';
    console.log(`\n  OVERALL STATUS: ${status}`);
    console.log('\n' + '='.repeat(70));
  }

  printHeader(text) {
    console.log('\n' + '='.repeat(70));
    console.log(text);
    console.log('='.repeat(70));
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    simulationDays: 30,
    skipEdgeCases: args.includes('--skip-edge-cases'),
    skipLoadTest: args.includes('--skip-load-test'),
    users: null
  };

  // Parse --days=N
  const daysArg = args.find(a => a.startsWith('--days='));
  if (daysArg) {
    options.simulationDays = parseInt(daysArg.split('=')[1], 10) || 30;
  }

  // Parse --users=a,b,c
  const usersArg = args.find(a => a.startsWith('--users='));
  if (usersArg) {
    options.users = usersArg.split('=')[1].split(',');
  }

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
AI Trading Agent Stress Test Framework

Usage: node tests/agent-stress-test/index.js [options]

Options:
  --verbose, -v          Show detailed output
  --days=N               Simulation days (default: 30)
  --skip-edge-cases      Skip edge case tests
  --skip-load-test       Skip load/concurrency tests
  --users=a,b,c          Test specific users only
  --help, -h             Show this help

Available Users:
  ${Object.keys(SYNTHETIC_USERS).join(', ')}

Examples:
  node tests/agent-stress-test/index.js
  node tests/agent-stress-test/index.js --days=10 --verbose
  node tests/agent-stress-test/index.js --users=quant_trader,buffett_style
`);
    process.exit(0);
  }

  // Run framework
  const framework = new AgentStressTestFramework(options);

  try {
    await framework.initialize();
    const result = await framework.run();

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n[FATAL]', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { AgentStressTestFramework };

// Run if called directly
if (require.main === module) {
  main();
}
