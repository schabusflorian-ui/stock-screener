/**
 * Database Migration: Add Update Tracking Tables
 *
 * This migration adds tables for tracking quarterly updates and data freshness.
 * It does NOT modify existing tables - only adds new ones.
 *
 * Run this migration once to set up update tracking functionality.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../..', 'data', 'stocks.db');

/**
 * Run the migration to add update tracking tables
 */
function runMigration(dbPath = DB_PATH) {
  console.log('Starting update tracking migration...');
  console.log(`Database path: ${dbPath}`);

  const db = new Database(dbPath);

  try {
    // Enable foreign keys
    db.pragma('foreign_keys = ON');

    // Start transaction
    db.exec('BEGIN TRANSACTION');

    // 1. Create update_history table
    console.log('Creating update_history table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS update_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update_type TEXT NOT NULL,
        quarter TEXT,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        status TEXT DEFAULT 'running',
        companies_checked INTEGER DEFAULT 0,
        companies_updated INTEGER DEFAULT 0,
        records_added INTEGER DEFAULT 0,
        records_updated INTEGER DEFAULT 0,
        records_skipped INTEGER DEFAULT 0,
        error_message TEXT,
        details TEXT
      )
    `);

    // Create index for quick status lookups
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_update_history_status
      ON update_history(status)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_update_history_quarter
      ON update_history(quarter)
    `);

    // 2. Create company_data_freshness table
    console.log('Creating company_data_freshness table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS company_data_freshness (
        company_id INTEGER PRIMARY KEY,
        cik TEXT NOT NULL,
        symbol TEXT,
        latest_filing_date TEXT,
        latest_10k_date TEXT,
        latest_10q_date TEXT,
        latest_10k_period TEXT,
        latest_10q_period TEXT,
        last_checked_at DATETIME,
        last_updated_at DATETIME,
        needs_update INTEGER DEFAULT 0,
        pending_filings TEXT,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for efficient queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_freshness_needs_update
      ON company_data_freshness(needs_update)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_freshness_cik
      ON company_data_freshness(cik)
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_freshness_symbol
      ON company_data_freshness(symbol)
    `);

    // Commit transaction
    db.exec('COMMIT');

    console.log('Migration completed successfully!');

    // Verify tables were created
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('update_history', 'company_data_freshness')
    `).all();

    console.log(`Created tables: ${tables.map(t => t.name).join(', ')}`);

    return { success: true, tables: tables.map(t => t.name) };

  } catch (error) {
    console.error('Migration failed:', error.message);
    db.exec('ROLLBACK');
    throw error;

  } finally {
    db.close();
  }
}

/**
 * Rollback the migration (drop added tables)
 */
function rollbackMigration(dbPath = DB_PATH) {
  console.log('Rolling back update tracking migration...');

  const db = new Database(dbPath);

  try {
    db.exec('BEGIN TRANSACTION');

    // Drop indexes first
    db.exec('DROP INDEX IF EXISTS idx_update_history_status');
    db.exec('DROP INDEX IF EXISTS idx_update_history_quarter');
    db.exec('DROP INDEX IF EXISTS idx_freshness_needs_update');
    db.exec('DROP INDEX IF EXISTS idx_freshness_cik');
    db.exec('DROP INDEX IF EXISTS idx_freshness_symbol');

    // Drop tables
    db.exec('DROP TABLE IF EXISTS company_data_freshness');
    db.exec('DROP TABLE IF EXISTS update_history');

    db.exec('COMMIT');

    console.log('Rollback completed successfully!');
    return { success: true };

  } catch (error) {
    console.error('Rollback failed:', error.message);
    db.exec('ROLLBACK');
    throw error;

  } finally {
    db.close();
  }
}

/**
 * Check if migration has already been run
 */
function checkMigrationStatus(dbPath = DB_PATH) {
  const db = new Database(dbPath);

  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name IN ('update_history', 'company_data_freshness')
    `).all();

    const hasUpdateHistory = tables.some(t => t.name === 'update_history');
    const hasFreshness = tables.some(t => t.name === 'company_data_freshness');

    return {
      migrated: hasUpdateHistory && hasFreshness,
      hasUpdateHistory,
      hasFreshness
    };

  } finally {
    db.close();
  }
}

// Run migration if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--rollback')) {
    rollbackMigration();
  } else if (args.includes('--check')) {
    const status = checkMigrationStatus();
    console.log('Migration status:', status);
  } else {
    // Check if already migrated
    const status = checkMigrationStatus();
    if (status.migrated) {
      console.log('Migration already applied. Use --rollback to undo.');
    } else {
      runMigration();
    }
  }
}

module.exports = {
  runMigration,
  rollbackMigration,
  checkMigrationStatus
};
