#!/usr/bin/env node
// add-postgres-alert-system.js
// PostgreSQL migration: Full alert system schema (alerts, alert_clusters, user_digest_preferences, watchlist, etc.)
// Extends the minimal alerts table from 000-postgres-base-schema with columns expected by AlertService

async function migrate(db) {
  console.log('🔔 Adding full alert system schema for PostgreSQL...');

  const addColumnIfNotExists = async (table, column, type, defaultVal = null) => {
    const result = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    if (result.rows.length === 0) {
      const defaultClause = defaultVal !== null ? `DEFAULT ${defaultVal}` : '';
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${defaultClause}`);
      console.log(`  ✓ Added ${column} to ${table}`);
    }
  };

  // 1. Extend alerts table with columns from add-alert-tables
  await addColumnIfNotExists('alerts', 'alert_code', 'TEXT', "'unknown'");
  await addColumnIfNotExists('alerts', 'signal_type', 'TEXT', "'neutral'");
  await addColumnIfNotExists('alerts', 'priority', 'INTEGER', '3');
  await addColumnIfNotExists('alerts', 'title', 'TEXT', "''");
  await addColumnIfNotExists('alerts', 'description', 'TEXT');
  await addColumnIfNotExists('alerts', 'data', 'JSONB');
  await addColumnIfNotExists('alerts', 'cluster_id', 'INTEGER');
  await addColumnIfNotExists('alerts', 'is_cluster_primary', 'INTEGER', '0');
  await addColumnIfNotExists('alerts', 'is_read', 'BOOLEAN', 'false');
  await addColumnIfNotExists('alerts', 'is_dismissed', 'BOOLEAN', 'false');
  await addColumnIfNotExists('alerts', 'read_at', 'TIMESTAMP');
  await addColumnIfNotExists('alerts', 'dismissed_at', 'TIMESTAMP');
  await addColumnIfNotExists('alerts', 'triggered_by', 'TEXT');
  await addColumnIfNotExists('alerts', 'source_record_id', 'INTEGER');
  await addColumnIfNotExists('alerts', 'expires_at', 'TIMESTAMP');

  // 2. alert_state (for threshold crossing detection)
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_state (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      price_near_52w_low INTEGER DEFAULT 0,
      price_near_52w_high INTEGER DEFAULT 0,
      below_sma_200 INTEGER DEFAULT 0,
      rsi_oversold INTEGER DEFAULT 0,
      rsi_overbought INTEGER DEFAULT 0,
      dcf_undervalued_25 INTEGER DEFAULT 0,
      dcf_undervalued_50 INTEGER DEFAULT 0,
      pe_below_average INTEGER DEFAULT 0,
      pe_below_15 INTEGER DEFAULT 0,
      pb_below_1 INTEGER DEFAULT 0,
      fcf_yield_above_10 INTEGER DEFAULT 0,
      roic_above_15 INTEGER DEFAULT 0,
      roic_above_20 INTEGER DEFAULT 0,
      debt_equity_below_05 INTEGER DEFAULT 0,
      fcf_positive INTEGER DEFAULT 0,
      margin_expanding INTEGER DEFAULT 0,
      margin_contracting INTEGER DEFAULT 0,
      active_screens TEXT DEFAULT '[]',
      quality_and_value INTEGER DEFAULT 0,
      fallen_angel INTEGER DEFAULT 0,
      last_evaluated_at TIMESTAMP
    )
  `);
  console.log('  ✓ alert_state');

  // 3. alert_clusters (must exist before alerts.cluster_id FK - add FK after)
  await db.query(`
    CREATE TABLE IF NOT EXISTS alert_clusters (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      cluster_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      alert_count INTEGER DEFAULT 0,
      signal_type TEXT,
      priority INTEGER DEFAULT 3,
      is_read BOOLEAN DEFAULT false,
      is_dismissed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_alert_clusters_company ON alert_clusters(company_id)`);
  console.log('  ✓ alert_clusters');

  // 3b. Ensure alert_clusters has PRIMARY KEY (handles table created by partial run without PK).
  // If table already has duplicate id/NULLs, adding PK fails — catch and continue so migration completes.
  let alertClustersHasPk = false;
  const pkCheck = await db.query(`
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'alert_clusters' AND c.contype = 'p'
  `);
  if (pkCheck.rows.length > 0) {
    alertClustersHasPk = true;
  } else {
    try {
      await db.query(`ALTER TABLE alert_clusters ADD PRIMARY KEY (id)`);
      console.log('  ✓ alert_clusters primary key added');
      alertClustersHasPk = true;
    } catch (e) {
      if (/could not create unique index|duplicate key|already exists/i.test(e.message)) {
        console.log('  ⚠ alert_clusters: could not add primary key (duplicate/null id); skipping FK from alerts');
      } else {
        throw e;
      }
    }
  }

  // 4. Add FK for alerts.cluster_id only if alert_clusters has a PK (so FK can reference it)
  if (alertClustersHasPk) {
    try {
      await db.query(`
        ALTER TABLE alerts
        ADD CONSTRAINT fk_alerts_cluster
        FOREIGN KEY (cluster_id) REFERENCES alert_clusters(id) ON DELETE SET NULL
      `);
      console.log('  ✓ fk_alerts_cluster');
    } catch (e) {
      if (!e.message?.includes('already exists')) throw e;
    }
  }

  // 5. user_digest_preferences
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_digest_preferences (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE DEFAULT 'default',
      digest_mode TEXT DEFAULT 'realtime_important',
      daily_digest_time TEXT DEFAULT '07:00',
      weekly_digest_day TEXT DEFAULT 'monday',
      weekly_digest_time TEXT DEFAULT '09:00',
      timezone TEXT DEFAULT 'UTC',
      min_priority_realtime INTEGER DEFAULT 4,
      watchlist_only INTEGER DEFAULT 0,
      portfolio_only INTEGER DEFAULT 0,
      include_ai_summary INTEGER DEFAULT 1,
      max_alerts_in_summary INTEGER DEFAULT 10,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('  ✓ user_digest_preferences');

  // 6. watchlist (for priority boosting)
  await db.query(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, company_id)
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_company ON watchlist(company_id)`);
  console.log('  ✓ watchlist');

  // 7. market_regime_history (for getCurrentRegime)
  await db.query(`
    CREATE TABLE IF NOT EXISTS market_regime_history (
      id SERIAL PRIMARY KEY,
      regime TEXT NOT NULL,
      regime_score REAL,
      vix REAL,
      sp500_change_1w REAL,
      sp500_change_1m REAL,
      breadth_ratio REAL,
      detected_at TIMESTAMP DEFAULT NOW(),
      valid_until TIMESTAMP
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_regime_valid ON market_regime_history(valid_until)`);
  console.log('  ✓ market_regime_history');

  console.log('✅ Alert system schema migration complete');
}

module.exports = migrate;
