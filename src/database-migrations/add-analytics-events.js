/**
 * Database migration: Analytics Events Table
 *
 * Creates tables for tracking user analytics events with privacy-respecting design.
 * Events are stored with session-based identity by default, user_id only if opted in.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

// Helper to check if table exists
function tableExists(tableName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name=?
  `).get(tableName);
  return !!result;
}

// Helper to check if column exists
function columnExists(tableName, columnName) {
  const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return tableInfo.some(col => col.name === columnName);
}

// Helper to check if index exists
function indexExists(indexName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='index' AND name=?
  `).get(indexName);
  return !!result;
}

console.log('Creating analytics_events table...');

// Create analytics_events table
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identity (anonymous by default)
    session_id TEXT NOT NULL,
    user_id TEXT,

    -- Event details
    event_name TEXT NOT NULL,
    event_category TEXT NOT NULL,
    properties TEXT DEFAULT '{}',

    -- Context
    page TEXT,
    referrer TEXT,
    device TEXT,
    browser TEXT,

    -- Timing
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_duration_seconds INTEGER,

    -- Foreign key to users (optional)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

// Create indexes for efficient querying
if (!indexExists('idx_analytics_events_session')) {
  db.exec('CREATE INDEX idx_analytics_events_session ON analytics_events(session_id)');
}

if (!indexExists('idx_analytics_events_user')) {
  db.exec('CREATE INDEX idx_analytics_events_user ON analytics_events(user_id)');
}

if (!indexExists('idx_analytics_events_name')) {
  db.exec('CREATE INDEX idx_analytics_events_name ON analytics_events(event_name)');
}

if (!indexExists('idx_analytics_events_category')) {
  db.exec('CREATE INDEX idx_analytics_events_category ON analytics_events(event_category)');
}

if (!indexExists('idx_analytics_events_created')) {
  db.exec('CREATE INDEX idx_analytics_events_created ON analytics_events(created_at)');
}

if (!indexExists('idx_analytics_events_page')) {
  db.exec('CREATE INDEX idx_analytics_events_page ON analytics_events(page)');
}

console.log('Creating analytics_sessions table...');

// Create analytics_sessions table for session tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    user_id TEXT,

    -- Session info
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_seconds INTEGER,

    -- Device/Browser info
    device TEXT,
    browser TEXT,
    os TEXT,
    screen_width INTEGER,
    screen_height INTEGER,

    -- Entry point
    landing_page TEXT,
    referrer TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,

    -- Session stats (updated periodically)
    page_views INTEGER DEFAULT 0,
    events_count INTEGER DEFAULT 0,

    -- Foreign key
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

if (!indexExists('idx_analytics_sessions_user')) {
  db.exec('CREATE INDEX idx_analytics_sessions_user ON analytics_sessions(user_id)');
}

if (!indexExists('idx_analytics_sessions_started')) {
  db.exec('CREATE INDEX idx_analytics_sessions_started ON analytics_sessions(started_at)');
}

console.log('Creating analytics_daily_aggregates table...');

// Create daily aggregates table for efficient dashboard queries
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_daily_aggregates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,

    -- Core metrics
    unique_sessions INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    total_events INTEGER DEFAULT 0,
    total_page_views INTEGER DEFAULT 0,

    -- Engagement
    avg_session_duration_seconds REAL DEFAULT 0,
    bounce_rate REAL DEFAULT 0,

    -- Feature usage (JSON object with feature -> count)
    feature_usage TEXT DEFAULT '{}',

    -- Event categories (JSON object with category -> count)
    event_categories TEXT DEFAULT '{}',

    -- Top pages (JSON array)
    top_pages TEXT DEFAULT '[]',

    -- Devices breakdown (JSON object)
    device_breakdown TEXT DEFAULT '{}',

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date)
  )
`);

if (!indexExists('idx_analytics_daily_date')) {
  db.exec('CREATE INDEX idx_analytics_daily_date ON analytics_daily_aggregates(date)');
}

console.log('Creating analytics_feature_usage table...');

// Create feature usage tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_feature_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Feature identification
    feature_name TEXT NOT NULL,
    feature_category TEXT,

    -- Usage stats
    date TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    unique_users INTEGER DEFAULT 0,
    unique_sessions INTEGER DEFAULT 0,

    -- Completion tracking
    started_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    abandoned_count INTEGER DEFAULT 0,

    -- Performance
    avg_duration_ms REAL DEFAULT 0,
    error_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(feature_name, date)
  )
`);

if (!indexExists('idx_feature_usage_name_date')) {
  db.exec('CREATE INDEX idx_feature_usage_name_date ON analytics_feature_usage(feature_name, date)');
}

if (!indexExists('idx_feature_usage_date')) {
  db.exec('CREATE INDEX idx_feature_usage_date ON analytics_feature_usage(date)');
}

console.log('Creating analytics_funnels table...');

// Create funnel tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_funnels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Funnel definition
    funnel_name TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    step_name TEXT NOT NULL,

    -- Stats per date
    date TEXT NOT NULL,
    entered_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    dropped_count INTEGER DEFAULT 0,

    -- Timing
    avg_time_to_complete_seconds REAL,

    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(funnel_name, step_number, date)
  )
`);

if (!indexExists('idx_funnels_name_date')) {
  db.exec('CREATE INDEX idx_funnels_name_date ON analytics_funnels(funnel_name, date)');
}

// Add analytics_opted_in column to user_preferences if not exists
if (tableExists('user_preferences')) {
  if (!columnExists('user_preferences', 'analytics_opted_in')) {
    console.log('Adding analytics_opted_in to user_preferences...');
    db.exec('ALTER TABLE user_preferences ADD COLUMN analytics_opted_in INTEGER DEFAULT 1');
  }

  if (!columnExists('user_preferences', 'feedback_prompts_enabled')) {
    console.log('Adding feedback_prompts_enabled to user_preferences...');
    db.exec('ALTER TABLE user_preferences ADD COLUMN feedback_prompts_enabled INTEGER DEFAULT 1');
  }

  if (!columnExists('user_preferences', 'last_feedback_prompt_at')) {
    console.log('Adding last_feedback_prompt_at to user_preferences...');
    db.exec('ALTER TABLE user_preferences ADD COLUMN last_feedback_prompt_at DATETIME');
  }

  if (!columnExists('user_preferences', 'feedback_prompt_cooldown_days')) {
    console.log('Adding feedback_prompt_cooldown_days to user_preferences...');
    db.exec('ALTER TABLE user_preferences ADD COLUMN feedback_prompt_cooldown_days INTEGER DEFAULT 7');
  }
}

db.close();
console.log('Analytics events migration completed successfully!');