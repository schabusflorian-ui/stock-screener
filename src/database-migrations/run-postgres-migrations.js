#!/usr/bin/env node
// src/database-migrations/run-postgres-migrations.js
// PostgreSQL migration runner
//
// Usage:
//   DATABASE_URL=postgres://... node src/database-migrations/run-postgres-migrations.js
//   Or: npm run db:migrate:postgres
//
// Load .env from project root so DATABASE_URL is available when run from any cwd
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../../.env');
require('dotenv').config({ path: envPath });
// Fallback: parse .env for DATABASE_URL if dotenv didn't load it (e.g. export KEY=value format)
if (!process.env.DATABASE_URL && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const m = content.match(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/m);
  if (m) process.env.DATABASE_URL = m[1].trim();
}
if (process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_URL;
}

const { getDatabase, isUsingPostgres } = require('../lib/db');

// List of PostgreSQL migrations in order
// Add new migrations here as they are created
const POSTGRES_MIGRATIONS = [
  '000-postgres-base-schema.js',
  '001-add-all-missing-tables.js',
  '002-add-historical-intelligence-tables.js',
  '003-add-quant-lab-factor-tables.js',
  '004-add-notes-tables-postgres.js',
  '005-add-market-indices-tables.js',
  '006-backfill-historical-company-ids.js',
  '007-add-update-system-postgres.js',
  '008-add-subscription-tables-postgres.js',
  '009-add-agent-extras-postgres.js',
  '010-add-market-indicator-history-postgres.js',
  '011-add-queue-resilience-postgres.js',
  '012-add-company-data-freshness-postgres.js',
  '013-add-company-fiscal-config-postgres.js',
  '014-add-portfolio-positions-postgres.js',
  '015-add-recommendation-outcomes-postgres.js',
  '016-add-agent-recommendations-postgres.js',
  '017-add-index-prices-postgres.js',
  '018-add-trading-regime-tables-postgres.js',
  '019-backfill-analyst-conversations-analyst-id-postgres.js',
  '020-add-trading-signals-tables-postgres.js',
  'add-postgres-alert-system.js',
  'add-dividend-metrics.js',
  'add-price-metrics.js',
  'add-help-tables.js',
];

async function runMigrations() {
  if (!isUsingPostgres()) {
    console.log('⚠️  DATABASE_URL not set or not PostgreSQL');
    console.log('   Set DATABASE_URL=postgres://user:pass@host:port/db to run PostgreSQL migrations');
    console.log('');
    console.log('   For SQLite, the schema is created automatically by src/database.js');
    process.exit(0);
  }

  console.log('🐘 PostgreSQL Migration Runner');
  console.log('================================');
  console.log('');

  console.log('📊 PostgreSQL database connected');
  const db = await getDatabase();

  // Ensure migrations table exists (match existing schema from data migration)
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      batch BIGINT NOT NULL DEFAULT 1,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Get already applied migrations
  const result = await db.query('SELECT name FROM schema_migrations');
  const appliedMigrations = new Set(result.rows.map(r => r.name));

  console.log(`Found ${appliedMigrations.size} already applied migrations`);
  console.log('');

  let migrationsRun = 0;

  for (const migrationFile of POSTGRES_MIGRATIONS) {
    const migrationName = migrationFile.replace('.js', '');

    if (appliedMigrations.has(migrationName)) {
      console.log(`⏭️  Skipping ${migrationName} (already applied)`);
      continue;
    }

    console.log(`▶️  Running ${migrationName}...`);

    try {
      const migrationPath = path.join(__dirname, migrationFile);

      if (!fs.existsSync(migrationPath)) {
        console.error(`   ❌ Migration file not found: ${migrationPath}`);
        continue;
      }

      // Run the migration
      const migration = require(migrationPath);

      // Support: default function, .run(db), or .up(db) (e.g. 005-add-market-indices-tables)
      if (typeof migration === 'function') {
        await migration(db);
      } else if (typeof migration.up === 'function') {
        await migration.up(db);
      } else if (typeof migration.run === 'function') {
        await migration.run(db);
      }
      // Otherwise, migration ran on require

      // Record the migration (use WHERE NOT EXISTS - schema_migrations may lack UNIQUE on name)
      await db.query(
        `INSERT INTO schema_migrations (name, batch)
         SELECT $1, $2
         WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`,
        [migrationName, 1]
      );

      console.log(`   ✅ ${migrationName} completed`);
      migrationsRun++;
    } catch (err) {
      console.error(`   ❌ ${migrationName} failed:`, err.message);
      console.error('');
      console.error('Migration aborted. Fix the error and run again.');
      process.exit(1);
    }
  }

  console.log('');
  console.log('================================');
  console.log(`✅ Migrations complete: ${migrationsRun} new, ${appliedMigrations.size} previously applied`);
  console.log('');

  // List tables to verify schema
  const tablesResult = await db.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  const tables = tablesResult.rows.map(r => r.table_name);
  console.log(`📋 Tables in database (${tables.length} total):`);
  console.log(tables.join(', '));
  console.log('');

  if (db.close) {
    await db.close();
  }
}

// Run migrations
runMigrations().catch(err => {
  console.error('❌ Migration runner failed:', err.message);
  process.exit(1);
});
