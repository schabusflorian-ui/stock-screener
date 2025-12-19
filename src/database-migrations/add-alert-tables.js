// src/database-migrations/add-alert-tables.js
// Creates tables for the alert and signal system

const Database = require('better-sqlite3');
const path = require('path');

function migrate(dbPath) {
  const db = new Database(dbPath || path.join(__dirname, '../../data/stocks.db'));

  console.log('\n🔔 Creating Alert System Tables\n');
  console.log('='.repeat(60));

  // Alert State - tracks threshold states for crossing detection
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_state (
      company_id INTEGER PRIMARY KEY,

      -- Price states
      price_near_52w_low INTEGER DEFAULT 0,
      price_near_52w_high INTEGER DEFAULT 0,
      below_sma_200 INTEGER DEFAULT 0,
      rsi_oversold INTEGER DEFAULT 0,
      rsi_overbought INTEGER DEFAULT 0,

      -- Valuation states
      dcf_undervalued_25 INTEGER DEFAULT 0,
      dcf_undervalued_50 INTEGER DEFAULT 0,
      pe_below_average INTEGER DEFAULT 0,
      pe_below_15 INTEGER DEFAULT 0,
      pb_below_1 INTEGER DEFAULT 0,
      fcf_yield_above_10 INTEGER DEFAULT 0,

      -- Fundamental states
      roic_above_15 INTEGER DEFAULT 0,
      roic_above_20 INTEGER DEFAULT 0,
      debt_equity_below_05 INTEGER DEFAULT 0,
      fcf_positive INTEGER DEFAULT 0,
      margin_expanding INTEGER DEFAULT 0,
      margin_contracting INTEGER DEFAULT 0,

      -- Screener membership (JSON array)
      active_screens TEXT DEFAULT '[]',

      -- Composite states
      quality_and_value INTEGER DEFAULT 0,
      fallen_angel INTEGER DEFAULT 0,

      -- Metadata
      last_evaluated_at DATETIME,

      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);
  console.log('  ✓ Created alert_state table');

  // Alerts - all generated alerts (historical record)
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      company_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      alert_code TEXT NOT NULL,

      signal_type TEXT NOT NULL,
      priority INTEGER DEFAULT 3,

      title TEXT NOT NULL,
      description TEXT,
      data TEXT,

      cluster_id INTEGER,
      is_cluster_primary INTEGER DEFAULT 0,

      is_read INTEGER DEFAULT 0,
      is_dismissed INTEGER DEFAULT 0,
      read_at DATETIME,
      dismissed_at DATETIME,

      triggered_by TEXT,
      source_record_id INTEGER,

      triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (cluster_id) REFERENCES alert_clusters(id)
    )
  `);
  console.log('  ✓ Created alerts table');

  // Alert Clusters - bundle related alerts
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      company_id INTEGER,
      cluster_type TEXT NOT NULL,

      title TEXT NOT NULL,
      description TEXT,

      alert_count INTEGER DEFAULT 0,
      signal_type TEXT,
      priority INTEGER DEFAULT 3,

      is_read INTEGER DEFAULT 0,
      is_dismissed INTEGER DEFAULT 0,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);
  console.log('  ✓ Created alert_clusters table');

  // Alert Rules - user-defined custom alerts
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      name TEXT NOT NULL,
      description TEXT,

      scope_type TEXT NOT NULL,
      scope_companies TEXT,
      scope_screener TEXT,

      metric TEXT NOT NULL,
      operator TEXT NOT NULL,
      threshold REAL NOT NULL,

      signal_type TEXT DEFAULT 'watch',
      priority INTEGER DEFAULT 3,

      is_active INTEGER DEFAULT 1,
      last_triggered_at DATETIME,
      trigger_count INTEGER DEFAULT 0,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ Created alert_rules table');

  // Alert Preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      alert_type TEXT NOT NULL,
      alert_code TEXT,

      is_enabled INTEGER DEFAULT 1,
      min_priority INTEGER DEFAULT 1,

      watchlist_only INTEGER DEFAULT 0,
      watchlist_boost INTEGER DEFAULT 1,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(alert_type, alert_code)
    )
  `);
  console.log('  ✓ Created alert_preferences table');

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alert_state_evaluated ON alert_state(last_evaluated_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_company ON alerts(company_id);
    CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(alert_type);
    CREATE INDEX IF NOT EXISTS idx_alerts_signal ON alerts(signal_type);
    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(is_read, triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_priority ON alerts(priority DESC, triggered_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_code ON alerts(alert_code);
  `);
  console.log('  ✓ Created indexes');

  // Insert default preferences
  const insertPref = db.prepare(`
    INSERT OR IGNORE INTO alert_preferences (alert_type, alert_code, is_enabled, min_priority)
    VALUES (?, ?, ?, ?)
  `);

  insertPref.run('valuation', null, 1, 1);
  insertPref.run('fundamental', null, 1, 2);
  insertPref.run('price', null, 1, 3);
  insertPref.run('filing', null, 1, 3);
  insertPref.run('composite', null, 1, 1);
  insertPref.run('custom', null, 1, 1);
  console.log('  ✓ Inserted default preferences');

  // Verify tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE 'alert%'
    ORDER BY name
  `).all();

  console.log('\n📋 Alert tables created:');
  tables.forEach(t => console.log(`   - ${t.name}`));

  db.close();
  console.log('\n✅ Alert system migration complete!\n');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
