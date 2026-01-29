#!/usr/bin/env node
/**
 * PostgreSQL Migration Runner
 *
 * Runs all database migrations using the abstraction layer.
 * Works with both SQLite (local) and PostgreSQL (production).
 *
 * Usage:
 *   node scripts/run-migrations.js              # Run all pending migrations
 *   node scripts/run-migrations.js --dry-run    # Show what would be run
 *   node scripts/run-migrations.js --status     # Show migration status
 */

const fs = require('fs');
const path = require('path');
const { getDatabaseSync, getDatabaseType, isUsingPostgres } = require('../src/lib/db');

const MIGRATIONS_DIR = path.join(__dirname, '../src/database-migrations');

// Migration tracking table
const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY ${isUsingPostgres() ? '' : 'AUTOINCREMENT'},
  name TEXT NOT NULL UNIQUE,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success INTEGER DEFAULT 1,
  error_message TEXT
)
`;

async function getExecutedMigrations(db) {
  try {
    // Ensure migrations table exists
    db.exec(MIGRATIONS_TABLE);

    const rows = db.prepare('SELECT name FROM schema_migrations WHERE success = 1').all();
    return new Set(rows.map(r => r.name));
  } catch (e) {
    console.error('Error getting migrations:', e.message);
    return new Set();
  }
}

function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .sort();
  return files;
}

function recordMigration(db, name, success, errorMessage = null) {
  try {
    const stmt = db.prepare(`
      INSERT INTO schema_migrations (name, success, error_message, executed_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(name) DO UPDATE SET success = ?, error_message = ?, executed_at = datetime('now')
    `);
    stmt.run(name, success ? 1 : 0, errorMessage, success ? 1 : 0, errorMessage);
  } catch (e) {
    console.error(`Error recording migration ${name}:`, e.message);
  }
}

async function runMigration(db, migrationPath, migrationName, dryRun = false) {
  console.log(`  📄 ${migrationName}...`);

  if (dryRun) {
    console.log(`     [DRY RUN] Would execute`);
    return { success: true, skipped: false };
  }

  try {
    // Load and run the migration
    const migration = require(migrationPath);

    if (typeof migration === 'function') {
      // Migration is a function
      await migration(db);
    } else if (migration.up) {
      // Migration has up/down pattern
      await migration.up(db);
    } else if (migration.run) {
      // Migration has run function
      await migration.run(db);
    } else {
      // Migration runs on require (side effects)
      // Already executed by requiring
    }

    recordMigration(db, migrationName, true);
    console.log(`     ✅ Success`);
    return { success: true, skipped: false };
  } catch (e) {
    recordMigration(db, migrationName, false, e.message);
    console.log(`     ❌ Error: ${e.message}`);
    return { success: false, skipped: false, error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const statusOnly = args.includes('--status');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              DATABASE MIGRATION RUNNER                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Get database
  const dbType = getDatabaseType();
  console.log(`📊 Database: ${dbType.toUpperCase()}`);
  console.log(`   Using PostgreSQL: ${isUsingPostgres()}`);

  if (dryRun) {
    console.log(`   Mode: DRY RUN (no changes will be made)\n`);
  }

  const db = getDatabaseSync();

  // Get migration files and status
  const migrationFiles = getMigrationFiles();
  const executedMigrations = await getExecutedMigrations(db);

  console.log(`\n📁 Found ${migrationFiles.length} migration files`);
  console.log(`   Already executed: ${executedMigrations.size}`);

  // Calculate pending
  const pendingMigrations = migrationFiles.filter(f => !executedMigrations.has(f));
  console.log(`   Pending: ${pendingMigrations.length}\n`);

  if (statusOnly) {
    console.log('Migration Status:');
    console.log('-'.repeat(60));
    migrationFiles.forEach(f => {
      const status = executedMigrations.has(f) ? '✅' : '⏳';
      console.log(`  ${status} ${f}`);
    });
    return;
  }

  if (pendingMigrations.length === 0) {
    console.log('✅ All migrations are up to date!\n');
    return;
  }

  console.log('Running migrations:');
  console.log('-'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const migration of pendingMigrations) {
    const migrationPath = path.join(MIGRATIONS_DIR, migration);
    const result = await runMigration(db, migrationPath, migration, dryRun);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
      // Don't stop on error - continue with other migrations
      console.log(`     ⚠️  Continuing with remaining migrations...`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed:     ${failCount}`);
  console.log(`  Skipped:    ${pendingMigrations.length - successCount - failCount}`);
  console.log('='.repeat(60));

  if (failCount === 0) {
    console.log('\n✅ All migrations completed successfully!\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some migrations failed. Review errors above.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
