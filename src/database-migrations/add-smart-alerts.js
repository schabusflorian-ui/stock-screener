// src/database-migrations/add-smart-alerts.js
// Adds tables and columns for smart alert system improvements:
// - Per-symbol cooldown tracking
// - User engagement scoring
// - Digest queue for batched notifications
// - Actionability scoring

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

function migrate() {
  const db = getDb();

  console.log('\n🧠 Creating Smart Alert System Tables\n');
  console.log('='.repeat(60));

  // ==========================================
  // 1. Extend alert_state for cooldown tracking
  // ==========================================

  // Add cooldown tracking columns to alert_state
  safeAddColumn(db, 'alert_state', 'last_alert_at', 'DATETIME');
  safeAddColumn(db, 'alert_state', 'alert_count_7d', 'INTEGER DEFAULT 0');
  safeAddColumn(db, 'alert_state', 'alert_count_30d', 'INTEGER DEFAULT 0');
  console.log('  ✓ Extended alert_state with cooldown tracking columns');

  // ==========================================
  // 2. Per-alert-code cooldown tracking
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_cooldowns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      alert_code TEXT NOT NULL,
      last_triggered_at DATETIME NOT NULL,
      trigger_count_7d INTEGER DEFAULT 1,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(company_id, alert_code)
    )
  `);
  console.log('  ✓ Created alert_cooldowns table');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alert_cooldowns_lookup
    ON alert_cooldowns(company_id, alert_code, last_triggered_at);
  `);

  // ==========================================
  // 3. User engagement tracking (for learning)
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_alert_engagement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      alert_type TEXT NOT NULL,
      alert_code TEXT,

      -- Engagement metrics (rolling 90-day window)
      total_shown INTEGER DEFAULT 0,
      total_clicked INTEGER DEFAULT 0,
      total_actioned INTEGER DEFAULT 0,
      total_dismissed INTEGER DEFAULT 0,
      total_snoozed INTEGER DEFAULT 0,

      -- Calculated scores
      engagement_score REAL,
      click_rate REAL,
      dismiss_rate REAL,
      action_rate REAL,

      -- Priority adjustment based on engagement
      priority_adjustment INTEGER DEFAULT 0,

      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(user_id, alert_type, alert_code)
    )
  `);
  console.log('  ✓ Created user_alert_engagement table');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_engagement_lookup
    ON user_alert_engagement(user_id, alert_code);
  `);

  // ==========================================
  // 4. User trading profile (for personalization)
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_trading_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE DEFAULT 'default',

      -- Detected trading style
      style_primary TEXT,  -- 'value', 'momentum', 'income', 'mixed'
      style_scores TEXT,   -- JSON: { value: 0.7, momentum: 0.2, income: 0.1 }

      -- Personalized threshold adjustments
      threshold_adjustments TEXT,  -- JSON with per-alert-code adjustments

      -- Detection confidence
      confidence REAL,
      sample_size INTEGER DEFAULT 0,

      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ Created user_trading_profile table');

  // ==========================================
  // 5. Digest queue for batched notifications
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS digest_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',

      -- Reference to the alert/notification
      alert_id INTEGER,
      notification_id INTEGER,

      -- Alert metadata for digest rendering
      company_id INTEGER,
      symbol TEXT,
      alert_code TEXT,
      alert_type TEXT,
      signal_type TEXT,
      priority INTEGER,
      title TEXT,
      description TEXT,
      data TEXT,

      -- Digest status
      digest_type TEXT DEFAULT 'daily',  -- 'daily', 'weekly', 'immediate'
      scheduled_for DATETIME,
      sent INTEGER DEFAULT 0,
      sent_at DATETIME,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (alert_id) REFERENCES alerts(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);
  console.log('  ✓ Created digest_queue table');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_digest_queue_pending
    ON digest_queue(user_id, sent, scheduled_for);

    CREATE INDEX IF NOT EXISTS idx_digest_queue_user
    ON digest_queue(user_id, created_at DESC);
  `);

  // ==========================================
  // 6. Extend alerts table for smart features
  // ==========================================

  // Actionability score
  safeAddColumn(db, 'alerts', 'actionability_score', 'REAL');

  // Action suggestions (JSON array)
  safeAddColumn(db, 'alerts', 'action_suggestions', 'TEXT');

  // Market context at time of alert
  safeAddColumn(db, 'alerts', 'market_context', 'TEXT');

  // Whether this was an idiosyncratic move vs market-wide
  safeAddColumn(db, 'alerts', 'is_idiosyncratic', 'INTEGER');

  // Portfolio relevance score (based on position size)
  safeAddColumn(db, 'alerts', 'portfolio_relevance', 'REAL');

  // Engagement-adjusted priority
  safeAddColumn(db, 'alerts', 'adjusted_priority', 'INTEGER');

  console.log('  ✓ Extended alerts table with smart alert columns');

  // ==========================================
  // 7. Extend notifications table
  // ==========================================

  if (tableExists(db, 'notifications')) {
    safeAddColumn(db, 'notifications', 'actionability_score', 'REAL');
    safeAddColumn(db, 'notifications', 'action_suggestions', 'TEXT');
    safeAddColumn(db, 'notifications', 'digest_mode', 'TEXT');
    safeAddColumn(db, 'notifications', 'market_regime', 'TEXT');
    console.log('  ✓ Extended notifications table with smart columns');
  }

  // ==========================================
  // 8. User digest preferences
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_digest_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE DEFAULT 'default',

      -- Digest mode
      digest_mode TEXT DEFAULT 'realtime_important',
      -- Options: 'realtime_critical', 'realtime_important', 'daily_digest', 'weekly_digest'

      -- Timing preferences
      daily_digest_time TEXT DEFAULT '07:00',  -- HH:MM in user's timezone
      weekly_digest_day TEXT DEFAULT 'monday', -- Day of week
      weekly_digest_time TEXT DEFAULT '09:00',
      timezone TEXT DEFAULT 'UTC',

      -- Filtering
      min_priority_realtime INTEGER DEFAULT 4,  -- P4+ get real-time, rest batched
      watchlist_only INTEGER DEFAULT 0,
      portfolio_only INTEGER DEFAULT 0,

      -- AI summary preferences
      include_ai_summary INTEGER DEFAULT 1,
      max_alerts_in_summary INTEGER DEFAULT 10,

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ Created user_digest_preferences table');

  // ==========================================
  // 9. Market regime history (for context)
  // ==========================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_regime_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      regime TEXT NOT NULL,  -- 'BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS'
      regime_score REAL,

      -- Context metrics
      vix REAL,
      sp500_change_1w REAL,
      sp500_change_1m REAL,
      breadth_ratio REAL,  -- % of stocks above 200 SMA

      -- Timestamps
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      valid_until DATETIME
    )
  `);
  console.log('  ✓ Created market_regime_history table');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_regime_history_date
    ON market_regime_history(detected_at DESC);
  `);

  // ==========================================
  // 10. Insert default digest preferences
  // ==========================================

  const existingPref = db.prepare(`
    SELECT id FROM user_digest_preferences WHERE user_id = 'default'
  `).get();

  if (!existingPref) {
    db.prepare(`
      INSERT INTO user_digest_preferences (
        user_id, digest_mode, min_priority_realtime, watchlist_only
      ) VALUES ('default', 'realtime_important', 4, 1)
    `).run();
    console.log('  ✓ Inserted default digest preferences (watchlist-only, P4+ realtime)');
  }

  // ==========================================
  // Verification
  // ==========================================

  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    AND (name LIKE 'alert%' OR name LIKE 'user_%' OR name LIKE 'digest_%' OR name LIKE 'market_%')
    ORDER BY name
  `).all();

  console.log('\n📋 Smart alert tables:');
  tables.forEach(t => console.log(`   - ${t.name}`));

  // Check new columns
  const alertColumns = db.prepare(`PRAGMA table_info(alerts)`).all();
  const newColumns = alertColumns.filter(c =>
    ['actionability_score', 'action_suggestions', 'market_context', 'is_idiosyncratic', 'portfolio_relevance', 'adjusted_priority'].includes(c.name)
  );
  console.log(`\n📊 New alert columns: ${newColumns.map(c => c.name).join(', ')}`);

  console.log('\n✅ Smart alert system migration complete!\n');
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
