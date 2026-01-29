/**
 * Database migration: Add portfolio alerts tables
 *
 * Creates:
 * - portfolio_alert_settings: Per-portfolio alert configuration
 * - portfolio_alerts: Alert history and notifications
 *
 * Run: node src/database-migrations/add-portfolio-alerts.js
 */

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Adding portfolio alerts tables...\n');

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create portfolio_alert_settings table
console.log('Creating portfolio_alert_settings table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_alert_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    threshold REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    UNIQUE(portfolio_id, alert_type)
  )
`);
console.log('  ✓ portfolio_alert_settings table created');

// Create portfolio_alerts table
console.log('Creating portfolio_alerts table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    message TEXT,
    data TEXT,
    is_read INTEGER DEFAULT 0,
    is_dismissed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
  )
`);
console.log('  ✓ portfolio_alerts table created');

// Create indexes for efficient querying
console.log('\nCreating indexes...');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alert_settings_portfolio
  ON portfolio_alert_settings(portfolio_id)
`);
console.log('  ✓ idx_alert_settings_portfolio');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alerts_portfolio
  ON portfolio_alerts(portfolio_id)
`);
console.log('  ✓ idx_alerts_portfolio');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alerts_type
  ON portfolio_alerts(alert_type)
`);
console.log('  ✓ idx_alerts_type');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alerts_unread
  ON portfolio_alerts(portfolio_id, is_read) WHERE is_read = 0
`);
console.log('  ✓ idx_alerts_unread');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_alerts_created
  ON portfolio_alerts(created_at DESC)
`);
console.log('  ✓ idx_alerts_created');

// Verify tables
console.log('\nVerifying tables...');

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name IN ('portfolio_alert_settings', 'portfolio_alerts')
`).all();

console.log(`  Found ${tables.length} alert tables:`);
tables.forEach(t => console.log(`    - ${t.name}`));

// Show schema
console.log('\nTable schemas:');

const settingsSchema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE name = 'portfolio_alert_settings'
`).get();
console.log('\nportfolio_alert_settings:');
console.log(settingsSchema.sql);

const alertsSchema = db.prepare(`
  SELECT sql FROM sqlite_master WHERE name = 'portfolio_alerts'
`).get();
console.log('\nportfolio_alerts:');
console.log(alertsSchema.sql);

console.log('\n✅ Portfolio alerts migration complete!\n');
