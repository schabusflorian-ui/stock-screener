const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
/**
 * Database migration: Add unified notifications system
 *
 * Creates:
 * - notifications: Unified notification storage for all alert types
 * - notification_clusters: Groups related notifications
 * - user_notification_preferences: User-specific notification settings
 * - notification_delivery_log: Tracks delivery attempts and status
 *
 * Run: node src/database-migrations/add-unified-notifications.js
 */

function migrate(dbPath) {
  const db = getDb();

  console.log('\n🔔 Creating Unified Notification System Tables\n');
  console.log('='.repeat(60));

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // ============================================
  // NOTIFICATIONS TABLE (Unified)
  // ============================================
  console.log('\nCreating notifications table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      -- User association (null for system-wide)
      user_id TEXT,

      -- Classification
      type TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('company', 'portfolio', 'watchlist', 'sentiment', 'ai', 'system', 'correlation')),
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
      priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),

      -- Content
      title TEXT NOT NULL,
      body TEXT,
      data TEXT,  -- JSON blob for type-specific metadata

      -- Actions (JSON array)
      actions TEXT,

      -- Related entities (JSON array)
      related_entities TEXT,

      -- Delivery channels (JSON array of channel names)
      channels TEXT DEFAULT '["in_app"]',

      -- User interaction status
      status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'actioned', 'dismissed', 'snoozed')),
      read_at DATETIME,
      actioned_at DATETIME,
      dismissed_at DATETIME,
      snoozed_until DATETIME,

      -- Grouping
      group_key TEXT,
      cluster_id INTEGER,
      batched_with TEXT,  -- JSON array of notification IDs

      -- Source tracking (for migration/debugging)
      source_type TEXT,  -- 'company_alert', 'portfolio_alert', 'watchlist_alert', 'new'
      source_id INTEGER,  -- Original alert ID if migrated

      -- Lifecycle
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      deleted_at DATETIME,

      FOREIGN KEY (cluster_id) REFERENCES notification_clusters(id)
    )
  `);
  console.log('  ✓ notifications table created');

  // ============================================
  // NOTIFICATION CLUSTERS TABLE
  // ============================================
  console.log('\nCreating notification_clusters table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      user_id TEXT,

      -- Cluster info
      cluster_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,

      -- Aggregates
      notification_count INTEGER DEFAULT 0,
      highest_priority INTEGER DEFAULT 3,

      -- Related entities
      related_companies TEXT,  -- JSON array of symbols
      related_portfolios TEXT,  -- JSON array of portfolio IDs

      -- Status
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'expired')),

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ notification_clusters table created');

  // ============================================
  // USER NOTIFICATION PREFERENCES TABLE
  // ============================================
  console.log('\nCreating user_notification_preferences table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      user_id TEXT NOT NULL UNIQUE,

      -- Global settings
      enabled INTEGER DEFAULT 1,
      muted_until DATETIME,
      quiet_hours_start TEXT,  -- e.g., "22:00"
      quiet_hours_end TEXT,    -- e.g., "08:00"

      -- Channel preferences (JSON)
      channel_preferences TEXT DEFAULT '{"in_app":{"enabled":true},"email":{"enabled":false,"min_priority":3},"push":{"enabled":false,"min_priority":2}}',

      -- Category preferences (JSON)
      category_preferences TEXT DEFAULT '{"company":{"enabled":true,"min_priority":1},"portfolio":{"enabled":true,"min_priority":1},"watchlist":{"enabled":true,"min_priority":1},"sentiment":{"enabled":true,"min_priority":2},"ai":{"enabled":true,"min_priority":2},"system":{"enabled":true,"min_priority":1},"correlation":{"enabled":true,"min_priority":1}}',

      -- Digest settings
      digest_enabled INTEGER DEFAULT 0,
      digest_frequency TEXT DEFAULT 'daily' CHECK (digest_frequency IN ('daily', 'weekly')),
      digest_time TEXT DEFAULT '09:00',
      digest_day_of_week INTEGER,  -- 0 = Sunday, for weekly digests

      -- Advanced filters
      watchlist_only INTEGER DEFAULT 0,
      portfolio_only INTEGER DEFAULT 0,

      -- Custom rules (JSON array)
      custom_rules TEXT DEFAULT '[]',

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('  ✓ user_notification_preferences table created');

  // ============================================
  // NOTIFICATION DELIVERY LOG TABLE
  // ============================================
  console.log('\nCreating notification_delivery_log table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_delivery_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      notification_id INTEGER NOT NULL,
      channel TEXT NOT NULL,

      -- Delivery status
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),

      -- Attempt tracking
      attempt_count INTEGER DEFAULT 1,
      first_attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered_at DATETIME,

      -- Error tracking
      error_message TEXT,
      error_code TEXT,

      -- External reference (e.g., SendGrid message ID)
      external_id TEXT,

      -- Response data (JSON)
      response_data TEXT,

      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
    )
  `);
  console.log('  ✓ notification_delivery_log table created');

  // ============================================
  // NOTIFICATION INTERACTIONS TABLE (for analytics)
  // ============================================
  console.log('\nCreating notification_interactions table...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      notification_id INTEGER NOT NULL,
      user_id TEXT,

      -- Interaction type
      interaction_type TEXT NOT NULL CHECK (interaction_type IN ('view', 'click', 'action', 'dismiss', 'snooze', 'feedback')),

      -- Details
      action_id TEXT,  -- Which action button was clicked
      feedback_value TEXT,  -- 'helpful', 'not_helpful', etc.

      -- Context
      source TEXT,  -- 'header_dropdown', 'alerts_page', 'notification_center', 'email'

      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
    )
  `);
  console.log('  ✓ notification_interactions table created');

  // ============================================
  // INDEXES
  // ============================================
  console.log('\nCreating indexes...');

  // Notifications indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);
    CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, status) WHERE status = 'unread';
    CREATE INDEX IF NOT EXISTS idx_notifications_cluster ON notifications(cluster_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_key);
    CREATE INDEX IF NOT EXISTS idx_notifications_source ON notifications(source_type, source_id);
  `);
  console.log('  ✓ notifications indexes created');

  // Delivery log indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_delivery_notification ON notification_delivery_log(notification_id);
    CREATE INDEX IF NOT EXISTS idx_delivery_status ON notification_delivery_log(status);
    CREATE INDEX IF NOT EXISTS idx_delivery_pending ON notification_delivery_log(status, channel) WHERE status = 'pending';
  `);
  console.log('  ✓ delivery log indexes created');

  // Interactions indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_interactions_notification ON notification_interactions(notification_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_user ON notification_interactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_interactions_type ON notification_interactions(interaction_type);
  `);
  console.log('  ✓ interactions indexes created');

  // ============================================
  // INSERT DEFAULT PREFERENCES (for existing users)
  // ============================================
  console.log('\nInserting default preferences...');

  // Create a default user preferences entry that can be used as template
  const defaultPrefs = db.prepare(`
    INSERT OR IGNORE INTO user_notification_preferences (user_id)
    VALUES ('default')
  `);
  defaultPrefs.run();
  console.log('  ✓ Default preferences template created');

  // ============================================
  // MIGRATE EXISTING ALERTS (optional, run separately)
  // ============================================
  console.log('\n📋 Migration helpers created');
  console.log('   Run migrateExistingAlerts() to migrate existing alerts');

  // Verify tables
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE 'notification%'
    ORDER BY name
  `).all();

  console.log('\n📋 Notification tables created:');
  tables.forEach(t => console.log(`   - ${t.name}`));
  console.log('\n✅ Unified notification system migration complete!\n');
}

/**
 * Migrate existing alerts to unified notifications table
 */
function migrateExistingAlerts(dbPath) {
  const db = getDb();

  console.log('\n🔄 Migrating existing alerts to unified notifications...\n');

  // Migrate company alerts
  console.log('Migrating company alerts...');
  const companyAlerts = db.prepare(`
    SELECT
      a.*,
      c.symbol,
      c.name as company_name
    FROM alerts a
    LEFT JOIN companies c ON a.company_id = c.id
    WHERE a.id NOT IN (SELECT source_id FROM notifications WHERE source_type = 'company_alert')
  `).all();

  const insertNotification = db.prepare(`
    INSERT INTO notifications (
      type, category, severity, priority,
      title, body, data, related_entities,
      status, read_at, dismissed_at,
      source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let companyMigrated = 0;
  for (const alert of companyAlerts) {
    const severity = alert.signal_type === 'warning' ? 'warning' :
                     alert.priority >= 4 ? 'warning' : 'info';

    const status = alert.is_dismissed ? 'dismissed' :
                   alert.is_read ? 'read' : 'unread';

    const relatedEntities = JSON.stringify([
      { type: 'company', id: alert.company_id, label: alert.symbol }
    ]);

    insertNotification.run(
      `company_${alert.alert_type}_${alert.alert_code}`,
      'company',
      severity,
      alert.priority,
      alert.title,
      alert.description,
      alert.data,
      relatedEntities,
      status,
      alert.read_at,
      alert.dismissed_at,
      'company_alert',
      alert.id,
      alert.triggered_at || alert.created_at
    );
    companyMigrated++;
  }
  console.log(`  ✓ Migrated ${companyMigrated} company alerts`);

  // Migrate portfolio alerts
  console.log('Migrating portfolio alerts...');
  const portfolioAlerts = db.prepare(`
    SELECT
      pa.*,
      p.name as portfolio_name
    FROM portfolio_alerts pa
    LEFT JOIN portfolios p ON pa.portfolio_id = p.id
    WHERE pa.id NOT IN (SELECT source_id FROM notifications WHERE source_type = 'portfolio_alert')
  `).all();

  let portfolioMigrated = 0;
  for (const alert of portfolioAlerts) {
    const severity = alert.severity || 'info';
    const status = alert.is_dismissed ? 'dismissed' :
                   alert.is_read ? 'read' : 'unread';

    const relatedEntities = JSON.stringify([
      { type: 'portfolio', id: alert.portfolio_id, label: alert.portfolio_name }
    ]);

    const priority = severity === 'critical' ? 5 :
                     severity === 'warning' ? 4 : 3;

    insertNotification.run(
      `portfolio_${alert.alert_type}`,
      'portfolio',
      severity,
      priority,
      `Portfolio Alert: ${alert.alert_type.replace(/_/g, ' ')}`,
      alert.message,
      alert.data,
      relatedEntities,
      status,
      alert.read_at,
      null,
      'portfolio_alert',
      alert.id,
      alert.created_at
    );
    portfolioMigrated++;
  }
  console.log(`  ✓ Migrated ${portfolioMigrated} portfolio alerts`);
  console.log(`\n✅ Migration complete! Total: ${companyMigrated + portfolioMigrated} notifications\n`);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--migrate-alerts')) {
    migrateExistingAlerts();
  } else {
    migrate();

    if (args.includes('--with-migration')) {
      migrateExistingAlerts();
    }
  }
}

module.exports = { migrate, migrateExistingAlerts };
