#!/usr/bin/env node
// tests/stress/index.js
// AI Agents Stress Test - Main Entry Point

const { PERSONAS, EDGE_CASES } = require('./personas');
const { NLQueryRunner } = require('./runners/NLQueryRunner');
const { AnalystChatRunner } = require('./runners/AnalystChatRunner');
const { Reporter } = require('./utils/reporter');

class StressTestRunner {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.personas = options.personas || Object.keys(PERSONAS);
    this.includeEdgeCases = options.includeEdgeCases !== false;
    this.reporter = new Reporter({ verbose: this.verbose });
    this.allResults = {};
  }

  async run() {
    const startTime = Date.now();

    this.reporter.printHeader('AI AGENTS STRESS TEST');
    console.log(`  Running ${this.personas.length} personas`);
    console.log(`  Edge cases: ${this.includeEdgeCases ? 'Yes' : 'No'}`);
    console.log(`  Verbose: ${this.verbose ? 'Yes' : 'No'}`);
    console.log(`  Started: ${new Date().toISOString()}`);

    // Get database for validation
    let db = null;
    try {
      const dbModule = require('../../src/database');
      db = dbModule.getDatabase();
    } catch (error) {
      console.log('    [WARN] Database not available for symbol validation');
    }

    // Initialize runners
    const nlRunner = new NLQueryRunner({ verbose: this.verbose, db });
    const chatRunner = new AnalystChatRunner({ verbose: this.verbose });

    console.log('\n  Initializing services...');
    const nlAvailable = await nlRunner.initialize();
    const chatAvailable = await chatRunner.initialize();
    console.log(`    NL Query Service: ${nlAvailable ? 'Available' : 'Simulated'}`);
    console.log(`    Analyst Chat Service: ${chatAvailable ? 'Available' : 'Simulated'}`);

    // Run tests for each persona
    for (const personaId of this.personas) {
      const persona = PERSONAS[personaId];
      if (!persona) {
        console.log(`  [WARN] Persona not found: ${personaId}`);
        continue;
      }

      nlRunner.reset();
      chatRunner.reset();

      this.reporter.printPersonaStart(persona);

      // Run NL Query tests
      console.log('\n  NL Queries:');
      for (let i = 0; i < persona.nlQueries.length; i++) {
        const queryConfig = persona.nlQueries[i];
        const result = await nlRunner.executeQuery(queryConfig);
        this.reporter.printNLQueryResult(result, i);
      }

      // Run Analyst Chat tests
      console.log('\n  Analyst Chat (' + persona.preferredAnalyst + '):');
      const convResult = await chatRunner.createConversation(persona.preferredAnalyst);

      if (convResult.success) {
        console.log(`    [INFO] Conversation created: ${convResult.conversationId}`);

        for (let i = 0; i < persona.analystQuestions.length; i++) {
          const questionConfig = persona.analystQuestions[i];
          // Pass full questionConfig to enable quality grading and knowledge tests
          const result = await chatRunner.sendMessage(
            convResult.conversationId,
            questionConfig
          );
          this.reporter.printAnalystChatResult(result, i);
        }
      } else {
        console.log(`    [FAIL] Could not create conversation: ${convResult.error}`);
      }

      // Store results
      this.allResults[personaId] = {
        nlQueries: nlRunner.getResults(),
        analystChats: chatRunner.getResults()
      };
    }

    // Run edge cases across a sample persona
    if (this.includeEdgeCases) {
      this.reporter.printHeader('EDGE CASE TESTS');
      nlRunner.reset();

      for (const edgeCase of EDGE_CASES) {
        const result = await nlRunner.executeQuery(edgeCase);
        this.reporter.printNLQueryResult(result, 0);
      }

      this.allResults['_edge_cases'] = {
        nlQueries: nlRunner.getResults(),
        analystChats: []
      };
    }

    // Print summary
    const summary = this.reporter.printSummary(this.allResults);
    summary.totalRuntime = Date.now() - startTime;

    console.log(`\n  Total Runtime: ${(summary.totalRuntime / 1000).toFixed(2)}s`);

    // Save report
    await this.reporter.saveReport(this.allResults, summary);

    this.reporter.printHeader('STRESS TEST COMPLETE');

    return {
      success: summary.totalFailed === 0,
      summary,
      results: this.allResults
    };
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: false,
    personas: null,
    includeEdgeCases: true
  };

  for (const arg of args) {
    if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-edge-cases') {
      options.includeEdgeCases = false;
    } else if (arg.startsWith('--personas=')) {
      options.personas = arg.split('=')[1].split(',');
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
AI Agents Stress Test

Usage: node tests/stress/index.js [options]

Options:
  --verbose, -v         Show detailed output
  --no-edge-cases       Skip edge case tests
  --personas=a,b,c      Run only specific personas
  --help, -h            Show this help

Available Personas:
  ${Object.keys(PERSONAS).join(', ')}

Examples:
  node tests/stress/index.js
  node tests/stress/index.js --verbose
  node tests/stress/index.js --personas=quantTrader,valueInvestor
`);
      process.exit(0);
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  const runner = new StressTestRunner(options);

  try {
    const result = await runner.run();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n[FATAL] Stress test crashed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { StressTestRunner };
