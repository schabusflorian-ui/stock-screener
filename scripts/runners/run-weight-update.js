#!/usr/bin/env node
// run-weight-update.js
// CLI for automated weight updates
//
// Usage:
//   node run-weight-update.js                    # Run weight update
//   node run-weight-update.js --status           # Show status
//   node run-weight-update.js --rollback         # Rollback to previous version
//   node run-weight-update.js --promote <ver>    # Manually promote a version
//   node run-weight-update.js --schedule weekly  # Register weekly schedule
//   node run-weight-update.js --start-scheduler  # Start background scheduler

const { db } = require('./src/database');
const { WeightUpdateService } = require('./src/services/mlops/weightUpdateService');
const { RetrainingScheduler, createWeeklyScheduler } = require('./src/services/mlops/retrainingScheduler');
const { ModelRegistry } = require('./src/services/mlops/modelRegistry');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--run';

  console.log('\n' + '='.repeat(70));
  console.log('WEIGHT UPDATE CLI');
  console.log('='.repeat(70));

  try {
    switch (command) {
      case '--status':
      case '-s':
        await showStatus();
        break;

      case '--run':
      case '-r':
        await runUpdate();
        break;

      case '--rollback':
        await rollback(args[1]);
        break;

      case '--promote':
        await promote(args[1], args.includes('--force'));
        break;

      case '--history':
      case '-h':
        await showHistory(parseInt(args[1]) || 10);
        break;

      case '--compare':
        await compareVersions(args[1], args[2]);
        break;

      case '--schedule':
        await registerSchedule(args[1] || 'weekly');
        break;

      case '--start-scheduler':
        await startScheduler();
        break;

      case '--jobs':
        await showJobs();
        break;

      case '--validate':
        await validateVersion(args[1]);
        break;

      case '--help':
      default:
        showHelp();
    }
  } catch (error) {
    console.error('\nError:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function showStatus() {
  console.log('\nFetching status...\n');

  const service = new WeightUpdateService(db);
  const status = service.getStatus();

  console.log('CURRENT PRODUCTION MODEL');
  console.log('-'.repeat(50));
  if (status.hasProduction) {
    console.log(`Version:     ${status.currentVersion}`);
    console.log(`Promoted at: ${status.promotedAt}`);
    console.log('\nCurrent Weights:');
    for (const [signal, weight] of Object.entries(status.currentWeights || {})) {
      console.log(`  ${signal.padEnd(15)}: ${(weight * 100).toFixed(1)}%`);
    }
  } else {
    console.log('No production model deployed');
  }

  console.log('\n\nSTAGED MODELS (awaiting promotion)');
  console.log('-'.repeat(50));
  if (status.stagedVersions.length === 0) {
    console.log('No staged models');
  } else {
    status.stagedVersions.forEach(v => {
      console.log(`\n${v.version}:`);
      console.log(`  Staged at: ${v.stagedAt}`);
      console.log(`  WFE:       ${v.metrics.wfe !== null ? (v.metrics.wfe * 100).toFixed(1) + '%' : 'N/A'}`);
      console.log(`  Alpha:     ${v.metrics.alpha !== null ? v.metrics.alpha.toFixed(2) + '%' : 'N/A'}`);
      console.log(`  Sharpe:    ${v.metrics.sharpe !== null ? v.metrics.sharpe.toFixed(2) : 'N/A'}`);
    });
  }

  console.log('\n\nSTATISTICS');
  console.log('-'.repeat(50));
  console.log(`Total versions: ${status.totalVersions}`);
  console.log(`Staged count:   ${status.stagedCount}`);
  console.log(`Last update:    ${status.lastUpdate || 'Never'}`);

  // Live performance check
  const perfCheck = await service.checkLivePerformance();
  console.log('\n\nLIVE PERFORMANCE CHECK');
  console.log('-'.repeat(50));
  console.log(perfCheck.message);
  if (perfCheck.needsRollback) {
    console.log('** ROLLBACK RECOMMENDED **');
  }
}

async function runUpdate() {
  console.log('\nStarting weight update...\n');

  const service = new WeightUpdateService(db, {
    autoPromote: true,
    minWFE: 0.50,
    maxDeflatedSharpeP: 0.05
  });

  const result = await service.runUpdate();

  if (result.success) {
    console.log('\nUpdate completed successfully!');
    if (result.promoted) {
      console.log(`Version ${result.version} promoted to production`);
      console.log(`Updated ${result.strategiesUpdated.length} strategies`);
    } else {
      console.log(`Version ${result.version} staged for manual review`);
    }
  } else {
    console.log('\nUpdate failed:', result.error);
  }

  process.exit(result.success ? 0 : 1);
}

async function rollback(reason) {
  console.log('\nExecuting rollback...\n');

  const service = new WeightUpdateService(db);
  const result = await service.rollback(reason || 'Manual CLI rollback');

  if (result.success) {
    console.log('Rollback successful!');
    console.log(`Rolled back to: ${result.previousVersion}`);
    console.log(`New version:    ${result.newVersion}`);
  } else {
    console.log('Rollback failed:', result.message);
  }

  process.exit(result.success ? 0 : 1);
}

async function promote(version, force) {
  if (!version) {
    console.log('Error: Version required');
    console.log('Usage: node run-weight-update.js --promote <version>');
    process.exit(1);
  }

  console.log(`\nPromoting version ${version}...${force ? ' (forced)' : ''}\n`);

  const service = new WeightUpdateService(db);
  const result = await service.manualPromote(version, {
    force,
    promotedBy: 'cli',
    reason: 'Manual CLI promotion'
  });

  if (result.success) {
    console.log('Promotion successful!');
    console.log(result.message);
  } else {
    console.log('Promotion failed:', result.message);
    if (result.errors) {
      result.errors.forEach(e => console.log(`  - ${e}`));
    }
    if (result.hint) {
      console.log(`\nHint: ${result.hint}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

async function showHistory(limit) {
  console.log(`\nVersion History (last ${limit}):\n`);

  const registry = new ModelRegistry(db);
  const history = registry.getVersionHistory('signal_weights').slice(0, limit);

  if (history.length === 0) {
    console.log('No version history');
    return;
  }

  history.forEach((v, i) => {
    const statusIcon = v.status === 'production' ? '* ' : '  ';
    console.log(`${statusIcon}${i + 1}. ${v.version}`);
    console.log(`      Status:  ${v.status.toUpperCase()}`);
    console.log(`      Staged:  ${v.stagedAt}`);
    if (v.promotedAt) console.log(`      Promoted: ${v.promotedAt}`);
    console.log(`      WFE:     ${v.walkForwardEfficiency !== null ? (v.walkForwardEfficiency * 100).toFixed(1) + '%' : 'N/A'}`);
    console.log(`      Alpha:   ${v.alpha !== null ? v.alpha.toFixed(2) + '%' : 'N/A'}`);
    console.log(`      Sharpe:  ${v.testSharpe !== null ? v.testSharpe.toFixed(2) : 'N/A'}`);
    console.log('');
  });
}

async function compareVersions(v1, v2) {
  if (!v1 || !v2) {
    console.log('Error: Two versions required');
    console.log('Usage: node run-weight-update.js --compare <version1> <version2>');
    process.exit(1);
  }

  console.log(`\nComparing ${v1} vs ${v2}...\n`);

  const registry = new ModelRegistry(db);
  const comparison = registry.compareModels('signal_weights', v1, 'signal_weights', v2);

  console.log('COMPARISON RESULTS');
  console.log('-'.repeat(50));
  console.log('                   Model A      Model B');
  console.log(`Version:           ${v1.padEnd(12)} ${v2}`);
  console.log(`Sharpe:            ${(comparison.modelA.sharpe?.toFixed(2) || 'N/A').padEnd(12)} ${comparison.modelB.sharpe?.toFixed(2) || 'N/A'}`);
  console.log(`Alpha:             ${(comparison.modelA.alpha?.toFixed(2) || 'N/A').padEnd(12)} ${comparison.modelB.alpha?.toFixed(2) || 'N/A'}`);
  console.log(`WFE:               ${(comparison.modelA.wfe ? (comparison.modelA.wfe * 100).toFixed(1) + '%' : 'N/A').padEnd(12)} ${comparison.modelB.wfe ? (comparison.modelB.wfe * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`Max Drawdown:      ${(comparison.modelA.maxDrawdown ? (comparison.modelA.maxDrawdown * 100).toFixed(1) + '%' : 'N/A').padEnd(12)} ${comparison.modelB.maxDrawdown ? (comparison.modelB.maxDrawdown * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log('');
  console.log(`Winner: ${comparison.winner === 'tie' ? 'TIE' : `Model ${comparison.winner}`} (${(comparison.confidence * 100).toFixed(0)}% confidence)`);
}

async function registerSchedule(schedule) {
  console.log(`\nRegistering ${schedule} schedule...\n`);

  const scheduler = new RetrainingScheduler(db);
  const result = scheduler.registerSchedule(`${schedule}_weights`, 'signal_weights', schedule, {
    autoPromote: true,
    minWFE: 0.50,
    maxDeflatedSharpeP: 0.05
  });

  console.log('Schedule registered!');
  console.log(`Name:     ${result.scheduleName}`);
  console.log(`Cron:     ${result.cron}`);
  console.log(`Next run: ${result.nextRun.toISOString()}`);
}

async function startScheduler() {
  console.log('\nStarting scheduler in foreground...\n');
  console.log('Press Ctrl+C to stop\n');

  const scheduler = createWeeklyScheduler(db);
  scheduler.start();

  // Keep process running
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping scheduler...');
    scheduler.stop();
    process.exit(0);
  });

  // Keep alive
  setInterval(() => {}, 60000);
}

async function showJobs() {
  console.log('\nRecent Jobs:\n');

  const scheduler = new RetrainingScheduler(db);
  const status = scheduler.getStatus();

  if (status.recentJobs.length === 0) {
    console.log('No jobs found');
    return;
  }

  status.recentJobs.forEach((j, i) => {
    const statusIcon = j.success ? '✓' : '✗';
    console.log(`${statusIcon} ${i + 1}. ${j.name} (${j.trigger})`);
    console.log(`      Status:  ${j.status}`);
    console.log(`      Version: ${j.modelVersion || 'N/A'}`);
    console.log(`      Alpha:   ${j.alpha !== null ? j.alpha.toFixed(2) + '%' : 'N/A'}`);
    console.log(`      Elapsed: ${j.elapsed?.toFixed(1) || 'N/A'}s`);
    console.log(`      Created: ${j.createdAt}`);
    console.log('');
  });
}

async function validateVersion(version) {
  if (!version) {
    console.log('Error: Version required');
    console.log('Usage: node run-weight-update.js --validate <version>');
    process.exit(1);
  }

  console.log(`\nValidating version ${version}...\n`);

  const registry = new ModelRegistry(db);
  const result = registry.validateModel('signal_weights', version, {
    minWFE: 0.50,
    maxDeflatedSharpeP: 0.05,
    minTestSharpe: 0.5,
    maxDrawdown: 0.40,
    minAlpha: 0
  });

  console.log('VALIDATION RESULT');
  console.log('-'.repeat(50));
  console.log(`Status: ${result.valid ? 'PASSED' : 'FAILED'}`);
  console.log('');

  if (result.metrics) {
    console.log('Metrics:');
    console.log(`  WFE:              ${result.metrics.wfe !== null ? (result.metrics.wfe * 100).toFixed(1) + '%' : 'N/A'} (min: 50%)`);
    console.log(`  Deflated Sharpe p: ${result.metrics.deflatedSharpeP?.toFixed(4) || 'N/A'} (max: 0.05)`);
    console.log(`  Test Sharpe:       ${result.metrics.testSharpe?.toFixed(2) || 'N/A'} (min: 0.50)`);
    console.log(`  Max Drawdown:      ${result.metrics.maxDrawdown !== null ? (result.metrics.maxDrawdown * 100).toFixed(1) + '%' : 'N/A'} (max: 40%)`);
    console.log(`  Alpha:             ${result.metrics.alpha?.toFixed(2) || 'N/A'}% (min: 0%)`);
  }

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  ✗ ${e}`));
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  process.exit(result.valid ? 0 : 1);
}

function showHelp() {
  console.log(`
Usage: node run-weight-update.js [command] [options]

Commands:
  --run, -r              Run weight update (default)
  --status, -s           Show current status
  --history [n]          Show version history (default: 10)
  --rollback [reason]    Rollback to previous version
  --promote <version>    Manually promote a staged version
    --force              Skip validation checks
  --compare <v1> <v2>    Compare two versions
  --validate <version>   Validate a version against gates
  --schedule <type>      Register a schedule (weekly/monthly/quarterly)
  --start-scheduler      Start the scheduler (foreground)
  --jobs                 Show recent jobs
  --help                 Show this help

Examples:
  # Run a weight update now
  node run-weight-update.js --run

  # Check current status
  node run-weight-update.js --status

  # Rollback if something goes wrong
  node run-weight-update.js --rollback "Performance degradation"

  # Manually promote a staged version
  node run-weight-update.js --promote v20240115_120000

  # Set up weekly automatic updates
  node run-weight-update.js --schedule weekly
  node run-weight-update.js --start-scheduler

Validation Gates (must pass all for auto-promotion):
  - Walk-Forward Efficiency >= 50%
  - Deflated Sharpe p-value < 0.05
  - Test Sharpe >= 0.50
  - Max Drawdown <= 40%
  - Alpha >= 0%
`);
}

main();
