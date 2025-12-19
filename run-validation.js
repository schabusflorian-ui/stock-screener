#!/usr/bin/env node
/**
 * Metrics Validation Runner
 *
 * Run: node run-validation.js [options]
 *
 * Options:
 *   --sample=N     Number of companies to sample (default: 40)
 *   --quick        Quick mode with smaller sample (15 companies)
 *   --full         Full validation with 60 companies
 *   --save         Save results to JSON file
 *   --verbose      Show detailed output
 *   --ttm          Use TTM (Trailing Twelve Months) from quarterly data
 *                  instead of annual data (better matches Yahoo Finance)
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  sample: 40,
  save: args.includes('--save'),
  verbose: args.includes('--verbose'),
  useTTM: args.includes('--ttm'),
};

if (args.includes('--quick')) {
  options.sample = 15;
} else if (args.includes('--full')) {
  options.sample = 60;
} else {
  const sampleArg = args.find(a => a.startsWith('--sample='));
  if (sampleArg) {
    options.sample = parseInt(sampleArg.split('=')[1]) || 40;
  }
}

async function run() {
  console.log('\n');
  console.log('='.repeat(60));
  console.log('       INVESTMENT METRICS VALIDATION SYSTEM');
  console.log('='.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  Sample size: ${options.sample} companies`);
  console.log(`  Comparison mode: ${options.useTTM ? 'TTM (quarterly)' : 'Annual'}`);
  console.log(`  Save results: ${options.save ? 'Yes' : 'No'}`);
  console.log(`  Verbose mode: ${options.verbose ? 'Yes' : 'No'}`);

  // Initialize database
  const db = require('./src/database');
  const database = db.getDatabase();

  // Initialize validator
  const MetricsValidator = require('./src/validation/metricsValidator');
  const validator = new MetricsValidator(database);

  console.log('\nStarting validation...\n');

  // Progress display
  let lastSymbol = '';
  const startTime = Date.now();

  try {
    const results = await validator.runValidation({
      sampleSize: options.sample,
      useTTM: options.useTTM,
      onProgress: ({ current, total, symbol, success }) => {
        lastSymbol = symbol;
        const pct = Math.round((current / total) * 100);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        const icon = success ? '\u2713' : '\u2717';

        process.stdout.write(
          `\r   Progress: ${current}/${total} (${pct}%) | ${symbol.padEnd(6)} ${icon} | ${elapsed}s elapsed    `
        );
      }
    });

    console.log('\n');

    // Print the report
    validator.printReport(results);

    // Get recommendations
    const recommendations = validator.getRecommendations(results);
    if (recommendations.length > 0) {
      console.log('\nRECOMMENDATIONS:');
      console.log('-'.repeat(60));
      for (const rec of recommendations) {
        const icon = rec.priority === 'high' ? '\u274C' : '\u26A0\uFE0F';
        console.log(`${icon} [${rec.priority.toUpperCase()}] ${rec.message}`);
      }
      console.log('');
    }

    // Save results if requested
    if (options.save) {
      const filename = `validation-results-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = path.join(process.cwd(), filename);

      // Remove raw data to reduce file size
      const saveResults = {
        ...results,
        companies: results.companies.map(c => ({
          symbol: c.symbol,
          fiscalYear: c.fiscalYear,
          matchScore: c.matchScore,
          metrics: c.metrics,
        })),
      };

      fs.writeFileSync(filepath, JSON.stringify(saveResults, null, 2));
      console.log(`Results saved to: ${filename}\n`);
    }

    // Show timing
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Total time: ${totalTime}s`);
    console.log(`Average per company: ${(totalTime / results.companies.length).toFixed(2)}s\n`);

    // Exit with appropriate code
    const overallAcc = parseFloat(results.overallAccuracy);
    process.exit(overallAcc >= 70 ? 0 : 1);

  } catch (error) {
    console.error('\nValidation failed:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

run();
