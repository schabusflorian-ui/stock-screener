#!/usr/bin/env node
/**
 * Update services validation script for staging/production.
 * Use after deploying to cloud to confirm scheduler and update behaviour.
 *
 * Usage:
 *   node scripts/validate-update-services.js           # Print checklist and run status
 *   node scripts/validate-update-services.js --status # Same, always run scheduler status
 *
 * See docs/UPDATE_SERVICES_RUNBOOK.md for full runbook.
 */

const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

function runSchedulerStatus() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/jobs/masterScheduler.js', '--status'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`scheduler --status exited ${code}: ${err || out}`));
      } else {
        resolve(out);
      }
    });
    child.on('error', reject);
  });
}

async function main() {
  console.log('');
  console.log('Update services validation (staging/production)');
  console.log('See docs/UPDATE_SERVICES_RUNBOOK.md for full runbook.');
  console.log('');

  const runStatus = process.argv.includes('--status');

  if (runStatus) {
    try {
      const output = await runSchedulerStatus();
      console.log(output);
    } catch (e) {
      console.error('Scheduler status failed:', e.message);
      console.log('');
      console.log('You can still run status directly: node src/jobs/masterScheduler.js --status');
      console.log('If the scheduler is not running as a separate service, start it with:');
      console.log('  node src/jobs/masterScheduler.js');
      process.exit(1);
    }
  } else {
    console.log('Checklist:');
    console.log('  1. Scheduler: started automatically by npm run start:production (API + scheduler).');
    console.log('  2. Env: DATABASE_URL, REDIS_URL (optional), API keys (see DEPLOYMENT_GUIDE)');
    console.log('  3. Legacy /api/updates: in Postgres deployment these return 503 (expected).');
    console.log('');
    console.log('Run scheduler status:');
    console.log('  node scripts/validate-update-services.js --status');
    console.log('  # or: node src/jobs/masterScheduler.js --status');
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
