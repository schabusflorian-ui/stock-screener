#!/usr/bin/env node
/**
 * Production Start Script
 *
 * This script:
 * 1. Validates required environment variables
 * 2. Runs PostgreSQL migrations
 * 3. Starts the application server
 *
 * Usage: node scripts/start-production.js
 */

const { spawn, execSync } = require('child_process');
const path = require('path');

// Required environment variables for production
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
];

// Blocked environment variables in production
const BLOCKED_ENV_VARS = [
  'ALLOW_DEV_AUTH',
  'FORCE_HTTP1',
];

// Validate environment
function validateEnvironment() {
  console.log('🔍 Validating environment...');
  console.log('   NODE_ENV:', process.env.NODE_ENV);
  console.log('   PORT:', process.env.PORT);

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log('⚠️  Warning: NODE_ENV is not set to "production"');
  }

  // Check required variables
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('');

    // Auto-generate SESSION_SECRET if missing (temporary workaround)
    if (missing.includes('SESSION_SECRET')) {
      const crypto = require('crypto');
      process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      console.warn('⚠️  Auto-generated SESSION_SECRET for this session');
      console.warn('   ⚠️  WARNING: Sessions will not persist across deployments!');
      console.warn('   Set SESSION_SECRET in Railway dashboard: openssl rand -hex 32');
      console.warn('');

      // Remove SESSION_SECRET from missing list
      const missingWithoutSession = missing.filter(v => v !== 'SESSION_SECRET');
      if (missingWithoutSession.length > 0) {
        console.error('Still missing:');
        missingWithoutSession.forEach(v => console.error(`   - ${v}`));
        console.error('');
        console.error('Set these in Railway dashboard:');
        console.error('  DATABASE_URL: Your Railway PostgreSQL connection string');
        process.exit(1);
      }
    } else {
      console.error('Set these in Railway dashboard:');
      console.error('  DATABASE_URL: Your Railway PostgreSQL connection string');
      console.error('  SESSION_SECRET: Generate with: openssl rand -hex 32');
      process.exit(1);
    }
  }

  // Check blocked variables
  const blocked = BLOCKED_ENV_VARS.filter(v => process.env[v]);
  if (blocked.length > 0 && isProduction) {
    console.error('❌ Blocked environment variables detected in production:');
    blocked.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
  }

  // Validate DATABASE_URL is PostgreSQL
  if (!process.env.DATABASE_URL.startsWith('postgres')) {
    console.error('❌ DATABASE_URL must be a PostgreSQL connection string');
    console.error('   Expected: postgres://user:password@host:port/database');
    console.error('   Got:', process.env.DATABASE_URL.substring(0, 15) + '...');
    process.exit(1);
  }

  // Validate SESSION_SECRET length
  if (process.env.SESSION_SECRET.length < 32) {
    console.error('❌ SESSION_SECRET must be at least 32 characters');
    console.error('   Current length:', process.env.SESSION_SECRET.length);
    console.error('   Generate with: openssl rand -hex 32');
    process.exit(1);
  }

  console.log('   DATABASE_URL: ✓ PostgreSQL');
  console.log('   SESSION_SECRET: ✓ Valid');
  console.log('✅ Environment validated');
}

// Run PostgreSQL migrations
async function runMigrations() {
  console.log('');
  console.log('🐘 Running PostgreSQL migrations...');

  try {
    execSync('node src/database-migrations/run-postgres-migrations.js', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log('✅ Migrations completed');
  } catch (error) {
    console.error('❌ Migration failed');
    process.exit(1);
  }
}

// Start the application (API server + Master Scheduler)
function startApplication() {
  console.log('');
  console.log('🚀 Starting application server and update scheduler...');
  console.log('');

  const cwd = path.join(__dirname, '..');
  const env = { ...process.env };
  const startScheduler = process.env.START_SCHEDULER !== 'false';

  let scheduler;
  if (startScheduler) {
    // Start Master Scheduler so updates run on schedule (prices, sentiment, SEC, etc.)
    scheduler = spawn('node', ['src/jobs/masterScheduler.js'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    scheduler.stdout.on('data', (d) => process.stdout.write(d));
    scheduler.stderr.on('data', (d) => process.stderr.write(d));
    scheduler.on('error', (err) => {
      console.error('❌ Scheduler failed to start:', err.message);
    });
    scheduler.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`Scheduler exited with code ${code} (API continues)`);
      }
    });
  } else {
    console.log('   Scheduler disabled (START_SCHEDULER=false)');
  }

  // Start API server (primary process - exit if it dies)
  const server = spawn('node', ['src/api/server.js'], {
    stdio: 'inherit',
    cwd,
    env
  });

  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    if (scheduler) scheduler.kill();
    process.exit(1);
  });

  server.on('exit', (code, signal) => {
    if (scheduler) scheduler.kill(signal || 'SIGTERM');
    if (signal) {
      console.log(`Server terminated by signal: ${signal}`);
    } else if (code !== 0) {
      console.error(`Server exited with code: ${code}`);
    }
    process.exit(code || 0);
  });

  // Forward signals to both children
  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
      if (scheduler) scheduler.kill(signal);
      server.kill(signal);
    });
  });
}

// Main
async function main() {
  console.log('');
  console.log('═'.repeat(60));
  console.log('  Investment Project - Production Startup');
  console.log('═'.repeat(60));
  console.log('');

  try {
    validateEnvironment();
  } catch (error) {
    console.error('❌ Environment validation failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  try {
    await runMigrations();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  startApplication();
}

main().catch(error => {
  console.error('❌ Startup failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
