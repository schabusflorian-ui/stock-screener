// src/database-migrations/add-cost-tracking.js
/**
 * Database Migration: Add API Cost Tracking Tables
 *
 * Adds tables to track API usage and enforce budgets:
 * - api_usage_log: Individual API call records
 * - api_usage_daily: Daily aggregates by provider/job
 * - api_budgets: Budget configuration
 */

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Starting API Cost Tracking migration...');

  try {
    // =============================================
    // 1. API Usage Log Table
    // =============================================
    console.log('Creating api_usage_log table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS api_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        endpoint TEXT,
        job_key TEXT,
        cost_usd REAL DEFAULT 0,
        tokens INTEGER DEFAULT 0,
        cached INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ api_usage_log table created');

    // Index for fast lookups by provider and date
    console.log('Creating index on api_usage_log...');
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_api_usage_log_provider_date
      ON api_usage_log(provider, created_at);
    `);
    console.log('✓ Index created');

    // =============================================
    // 2. API Usage Daily Aggregates Table
    // =============================================
    console.log('Creating api_usage_daily table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS api_usage_daily (
        provider TEXT NOT NULL,
        date DATE NOT NULL,
        job_key TEXT,
        total_requests INTEGER DEFAULT 0,
        total_cost_usd REAL DEFAULT 0,
        cache_hits INTEGER DEFAULT 0,
        PRIMARY KEY (provider, date, job_key)
      );
    `);
    console.log('✓ api_usage_daily table created');

    // =============================================
    // 3. API Budgets Table
    // =============================================
    console.log('Creating api_budgets table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS api_budgets (
        provider TEXT PRIMARY KEY,
        daily_budget_usd REAL,
        monthly_budget_usd REAL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ api_budgets table created');

    // =============================================
    // 4. Insert Default Budget Configuration
    // =============================================
    console.log('Setting default budget configuration...');

    // Check if budgets already exist
    const existingBudgets = database.prepare(
      'SELECT COUNT(*) as count FROM api_budgets'
    ).get();

    if (existingBudgets.count === 0) {
      database.exec(`
        INSERT INTO api_budgets (provider, daily_budget_usd, monthly_budget_usd) VALUES
          ('alpha_vantage', NULL, NULL),  -- Free tier, no budget
          ('claude', 10.00, 50.00),        -- $10/day, $50/month
          ('sec', NULL, NULL),             -- Free API
          ('fred', NULL, NULL);            -- Free API
      `);
      console.log('✓ Default budgets configured');
    } else {
      console.log('✓ Budgets already exist, skipping default inserts');
    }

    console.log('API Cost Tracking migration completed successfully!');
    return true;

  } catch (error) {
    console.error('API Cost Tracking migration failed:', error);
    throw error;
  }
}

function rollback() {
  const database = db.getDatabase();

  console.log('Rolling back API Cost Tracking migration...');

  try {
    database.exec(`DROP TABLE IF EXISTS api_usage_log;`);
    database.exec(`DROP TABLE IF EXISTS api_usage_daily;`);
    database.exec(`DROP TABLE IF EXISTS api_budgets;`);

    console.log('API Cost Tracking migration rolled back successfully!');
    return true;

  } catch (error) {
    console.error('Rollback failed:', error);
    throw error;
  }
}

// If run directly, execute the migration
if (require.main === module) {
  try {
    migrate();
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

module.exports = { migrate, rollback };
