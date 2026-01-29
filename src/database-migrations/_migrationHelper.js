/**
 * Migration Helper
 *
 * Provides database access for migration scripts that works with both
 * SQLite (local development) and PostgreSQL (production).
 *
 * Usage in migration files:
 *   const { getDb, runMigration } = require('./_migrationHelper');
 *
 *   runMigration('migration-name', (db) => {
 *     db.exec(`CREATE TABLE IF NOT EXISTS ...`);
 *   });
 */

const path = require('path');

// Default SQLite path (used when DATABASE_URL is not set)
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/stocks.db');

/**
 * Get database instance for migrations
 * Uses the abstraction layer when available, falls back to direct SQLite for compatibility
 */
function getDb(customPath = null) {
  // Try to use the abstraction layer first
  try {
    const { getDatabaseSync, isUsingPostgres } = require('../lib/db');
    const db = getDatabaseSync();

    // In PostgreSQL mode, return the abstracted database
    if (isUsingPostgres()) {
      console.log('[Migration] Using PostgreSQL via abstraction layer');
      return db;
    }

    // In SQLite mode, still use abstraction for consistency
    console.log('[Migration] Using SQLite via abstraction layer');
    return db;
  } catch (e) {
    // Fall back to direct SQLite if abstraction layer fails
    console.log('[Migration] Falling back to direct SQLite:', e.message);
  }

  // Direct SQLite fallback
  const Database = require('better-sqlite3');
  const dbPath = customPath || process.env.DATABASE_PATH || DEFAULT_DB_PATH;
  console.log(`[Migration] Direct SQLite connection: ${dbPath}`);
  return new Database(dbPath);
}

/**
 * Run a migration with proper error handling
 * @param {string} name - Migration name for logging
 * @param {Function} migrationFn - Function that receives db and performs migration
 */
function runMigration(name, migrationFn) {
  console.log(`\n📦 Running migration: ${name}`);
  console.log('-'.repeat(50));

  try {
    const db = getDb();
    migrationFn(db);
    console.log(`✅ Migration ${name} completed successfully\n`);
    return true;
  } catch (error) {
    console.error(`❌ Migration ${name} failed:`, error.message);
    console.error(error.stack);
    return false;
  }
}

/**
 * Check if a table exists
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name to check
 */
function tableExists(db, tableName) {
  try {
    const result = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name=?
    `).get(tableName);
    return !!result;
  } catch (e) {
    // PostgreSQL check
    try {
      const result = db.prepare(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = ?
        )
      `).get(tableName);
      return result && result.exists;
    } catch (e2) {
      return false;
    }
  }
}

/**
 * Check if a column exists in a table
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name
 * @param {string} columnName - Column name to check
 */
function columnExists(db, tableName, columnName) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some(col => col.name === columnName);
  } catch (e) {
    // PostgreSQL check
    try {
      const result = db.prepare(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = ? AND column_name = ?
        )
      `).get(tableName, columnName);
      return result && result.exists;
    } catch (e2) {
      return false;
    }
  }
}

/**
 * Safe add column - only adds if it doesn't exist
 * @param {Object} db - Database instance
 * @param {string} tableName - Table name
 * @param {string} columnName - Column name
 * @param {string} columnDef - Column definition (e.g., "TEXT DEFAULT NULL")
 */
function safeAddColumn(db, tableName, columnName, columnDef) {
  if (!columnExists(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
    console.log(`  Added column: ${tableName}.${columnName}`);
    return true;
  }
  console.log(`  Column exists: ${tableName}.${columnName}`);
  return false;
}

module.exports = {
  getDb,
  runMigration,
  tableExists,
  columnExists,
  safeAddColumn,
  DEFAULT_DB_PATH,
};
