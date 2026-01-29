// src/database-migrations/fix-activity-type-constraint.js
// Migration to fix the activity_type CHECK constraint - adds missing activity types

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('🔧 Fixing activity_type CHECK constraint...');

  database.exec('BEGIN TRANSACTION');

  try {
    // SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
    database.exec(`
      -- Create new table with updated constraint
      CREATE TABLE agent_activity_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id INTEGER NOT NULL,
        portfolio_id INTEGER,
        activity_type TEXT NOT NULL CHECK (activity_type IN (
          'scan_started', 'scan_completed', 'scan_failed', 'scan_skipped',
          'signal_generated', 'signal_approved', 'signal_rejected', 'signal_expired',
          'trade_executed', 'trade_failed', 'execution_queued', 'pending_execution',
          'agent_started', 'agent_paused', 'agent_resumed', 'agent_error', 'agent_created',
          'settings_updated', 'portfolio_attached', 'portfolio_detached'
        )),
        description TEXT,
        details TEXT,
        signal_id INTEGER,
        trade_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (agent_id) REFERENCES trading_agents(id) ON DELETE CASCADE,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL,
        FOREIGN KEY (signal_id) REFERENCES agent_signals(id) ON DELETE SET NULL
      );

      -- Copy data from old table
      INSERT INTO agent_activity_log_new
      SELECT * FROM agent_activity_log;

      -- Drop old table
      DROP TABLE agent_activity_log;

      -- Rename new table
      ALTER TABLE agent_activity_log_new RENAME TO agent_activity_log;

      -- Recreate indexes
      CREATE INDEX idx_agent_activity_agent ON agent_activity_log(agent_id, created_at DESC);
      CREATE INDEX idx_agent_activity_type ON agent_activity_log(activity_type, created_at DESC);
      CREATE INDEX idx_agent_activity_portfolio ON agent_activity_log(portfolio_id, created_at DESC);
    `);

    database.exec('COMMIT');
    console.log('✅ Activity type constraint updated successfully');
    console.log('   Added: scan_skipped, execution_queued, pending_execution, agent_created');
  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Helper to check if migration is needed
function isMigrationNeeded() {
  const database = db.getDatabase();

  // Try inserting a test activity type that should be valid after migration
  // If it fails with CHECK constraint, migration is needed
  try {
    // Check if table exists first
    const tableExists = database.prepare(`
      SELECT COUNT(*) as count FROM sqlite_master
      WHERE type='table' AND name='agent_activity_log'
    `).get();

    if (!tableExists || tableExists.count === 0) {
      return false; // Table doesn't exist, base migration not run yet
    }

    // Check the current constraint by looking at table info
    // We'll just check by trying to get table SQL
    const tableInfo = database.prepare(`
      SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_activity_log'
    `).get();

    // Check if the new activity types are in the constraint
    const sql = tableInfo?.sql || '';
    const hasNewTypes = sql.includes('scan_skipped') &&
                        sql.includes('execution_queued') &&
                        sql.includes('pending_execution') &&
                        sql.includes('agent_created');

    return !hasNewTypes;
  } catch (error) {
    console.error('Error checking migration status:', error.message);
    return true; // Assume migration is needed if we can't check
  }
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Activity type constraint already up to date. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
