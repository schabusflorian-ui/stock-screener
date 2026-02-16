#!/usr/bin/env node
/**
 * Update services validation script for staging/production.
 * Use after deploying to cloud to confirm scheduler and update behaviour.
 *
 * Usage:
 *   node scripts/validate-update-services.js              # Checklist + optional HTTP checks
 *   node scripts/validate-update-services.js --status     # Always run scheduler status
 *   BASE_URL=https://your-app.up.railway.app node scripts/validate-update-services.js
 *
 * With BASE_URL or APP_URL set, the script will:
 *   - GET <base>/health (expect 200)
 *   - GET <base>/api/capital/update-status (expect 200, report lastUpdate)
 * Run against Railway: set BASE_URL to your Railway app URL (e.g. from dashboard).
 *
 * See docs/UPDATE_SERVICES_RUNBOOK.md for full runbook.
 */

const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');

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

function fetch(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch {
          resolve({ statusCode: res.statusCode, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function checkHealth(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/health`;
  const result = await fetch(url);
  if (result.statusCode !== 200) {
    throw new Error(`GET ${url} returned ${result.statusCode}`);
  }
  return result;
}

async function checkCapitalUpdateStatus(baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/capital/update-status`;
  const result = await fetch(url);
  if (result.statusCode !== 200) {
    throw new Error(`GET ${url} returned ${result.statusCode}`);
  }
  return result;
}

async function main() {
  console.log('');
  console.log('Update services validation (staging/production)');
  console.log('See docs/UPDATE_SERVICES_RUNBOOK.md for full runbook.');
  console.log('');

  const baseUrl = process.env.BASE_URL || process.env.APP_URL;
  const runStatus = process.argv.includes('--status');

  // Optional: HTTP checks when BASE_URL/APP_URL is set (e.g. Railway app URL)
  if (baseUrl) {
    console.log(`Base URL: ${baseUrl}`);
    console.log('');
    try {
      const health = await checkHealth(baseUrl);
      console.log('  GET /health: 200 OK');
      const capital = await checkCapitalUpdateStatus(baseUrl);
      console.log('  GET /api/capital/update-status: 200 OK');
      if (capital.data && (capital.data.lastUpdate != null || capital.data.totalRecords != null)) {
        console.log(`    lastUpdate: ${capital.data.lastUpdate ?? 'N/A'}`);
        console.log(`    totalRecords: ${capital.data.totalRecords ?? 'N/A'}`);
      }
      console.log('');
    } catch (e) {
      console.error('  HTTP check failed:', e.message);
      console.log('');
    }
  } else {
    console.log('Tip: Set BASE_URL or APP_URL to your app URL (e.g. Railway) to run health + capital update-status checks.');
    console.log('');
  }

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
    console.log('  2. Env: DATABASE_URL, REDIS_URL (optional), API keys (see runbook). Do NOT set START_SCHEDULER=false unless scheduler runs elsewhere.');
    console.log('  3. Legacy /api/updates: in Postgres deployment these return 503 (expected).');
    console.log('');
    console.log('Run scheduler status:');
    console.log('  node scripts/validate-update-services.js --status');
    console.log('  # or: node src/jobs/masterScheduler.js --status');
    console.log('');
    console.log('Run against Railway (health + capital status):');
    console.log('  BASE_URL=https://your-app.up.railway.app node scripts/validate-update-services.js --status');
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
