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

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log('⚠️  Warning: NODE_ENV is not set to "production"');
  }

  // Check required variables
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
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
    process.exit(1);
  }

  // Validate SESSION_SECRET length
  if (process.env.SESSION_SECRET.length < 32) {
    console.error('❌ SESSION_SECRET must be at least 32 characters');
    console.error('   Generate with: openssl rand -hex 32');
    process.exit(1);
  }

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

// Start the application
function startApplication() {
  console.log('');
  console.log('🚀 Starting application server...');
  console.log('');

  const server = spawn('node', ['src/api/server.js'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
    env: process.env
  });

  server.on('error', (error) => {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  });

  server.on('exit', (code, signal) => {
    if (signal) {
      console.log(`Server terminated by signal: ${signal}`);
    } else if (code !== 0) {
      console.error(`Server exited with code: ${code}`);
    }
    process.exit(code || 0);
  });

  // Forward signals to child process
  ['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);
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

  validateEnvironment();
  await runMigrations();
  startApplication();
}

main().catch(error => {
  console.error('❌ Startup failed:', error.message);
  process.exit(1);
});
