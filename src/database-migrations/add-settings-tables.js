// src/database-migrations/add-settings-tables.js
// Database migration for Settings & Support Hub

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Starting settings tables migration...');

// Helper to check if column exists

// Helper to check if table exists

// ============================================
// TABLE 1: System Settings (Key-Value Store)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('Created system_settings table');

// ============================================
// TABLE 2: Update Schedules
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS update_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Identity
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,

    -- Schedule
    is_enabled INTEGER DEFAULT 1,
    frequency TEXT NOT NULL,
    cron_expression TEXT,
    timezone TEXT DEFAULT 'America/New_York',

    -- Status
    status TEXT DEFAULT 'idle',
    last_run_at DATETIME,
    last_success_at DATETIME,
    last_error TEXT,
    next_run_at DATETIME,

    -- Stats
    items_processed INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    average_duration_seconds INTEGER,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('Created update_schedules table');

// ============================================
// TABLE 3: Settings Update History (separate from existing update_history)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS settings_update_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    schedule_name TEXT NOT NULL,

    started_at DATETIME NOT NULL,
    completed_at DATETIME,

    status TEXT NOT NULL,
    items_processed INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,

    duration_seconds INTEGER,
    error_summary TEXT,
    error_details TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES update_schedules(id)
  )
`);
console.log('Created settings_update_history table');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_settings_update_history_schedule ON settings_update_history(schedule_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_settings_update_history_date ON settings_update_history(created_at DESC);
`);

// ============================================
// TABLE 4: API Integrations
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS api_integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,

    -- Connection
    is_enabled INTEGER DEFAULT 0,
    api_key TEXT,
    base_url TEXT,

    -- Usage Tracking
    calls_today INTEGER DEFAULT 0,
    calls_this_month INTEGER DEFAULT 0,
    daily_limit INTEGER,
    monthly_limit INTEGER,
    last_call_at DATETIME,
    last_reset_at DATETIME,

    -- Health
    status TEXT DEFAULT 'unknown',
    last_error TEXT,
    last_health_check DATETIME,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('Created api_integrations table');

// ============================================
// TABLE 5: User Preferences
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,

    -- Display
    theme TEXT DEFAULT 'system',
    currency TEXT DEFAULT 'USD',
    locale TEXT DEFAULT 'en-US',
    date_format TEXT DEFAULT 'MMM D, YYYY',
    number_format TEXT DEFAULT 'compact',

    -- Defaults
    default_benchmark TEXT DEFAULT 'SPY',
    default_time_horizon INTEGER DEFAULT 10,
    default_simulation_runs INTEGER DEFAULT 1000,

    -- Notifications
    email_alerts INTEGER DEFAULT 0,
    alert_on_update_failure INTEGER DEFAULT 1,
    alert_on_stale_data INTEGER DEFAULT 1,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('Created user_preferences table');

// Add new preference columns if they don't exist
const newPrefColumns = [
  ['show_percentages', 'INTEGER DEFAULT 1'],
  ['compact_numbers', 'INTEGER DEFAULT 1'],
  ['auto_refresh_interval', 'INTEGER DEFAULT 0'],
  ['notifications_enabled', 'INTEGER DEFAULT 0'],
];

for (const [colName, colDef] of newPrefColumns) {
  if (!columnExists(db, 'user_preferences', colName)) {
    db.exec(`ALTER TABLE user_preferences ADD COLUMN ${colName} ${colDef}`);
    console.log(`Added column ${colName} to user_preferences`);
  }
}

// ============================================
// TABLE 6: Diagnostic Logs
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS diagnostic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    level TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    details TEXT,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
console.log('Created diagnostic_logs table');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_diagnostic_logs_date ON diagnostic_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_logs_level ON diagnostic_logs(level, created_at DESC);
`);

// ============================================
// SEED DATA
// ============================================

// Seed update schedules
const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM update_schedules').get();
if (scheduleCount.count === 0) {
  const insertSchedule = db.prepare(`
    INSERT INTO update_schedules (name, display_name, description, frequency, cron_expression)
    VALUES (?, ?, ?, ?, ?)
  `);

  const schedules = [
    ['stock_prices', 'Stock Prices', 'Daily closing prices for all tracked stocks', 'daily', '0 18 * * 1-5'],
    ['stock_fundamentals', 'Stock Fundamentals', 'Financial statements and key metrics from SEC filings', 'weekly', '0 6 * * 6'],
    ['calculated_metrics', 'Calculated Metrics', 'ROIC, FCF yield, and other derived metrics', 'weekly', '0 7 * * 6'],
    ['news_sentiment', 'News & Sentiment', 'News articles and sentiment scores', 'daily', '0 */4 * * *'],
    ['insider_transactions', 'Insider Transactions', 'SEC insider trading filings', 'daily', '0 7 * * 1-5'],
    ['analyst_estimates', 'Analyst Estimates', 'Price targets and recommendations', 'weekly', '0 8 * * 1'],
    ['reddit_sentiment', 'Reddit Sentiment', 'Reddit post analysis and ticker mentions', 'hourly', '0 * * * *'],
    ['stocktwits_sentiment', 'StockTwits Sentiment', 'StockTwits message analysis', 'hourly', '30 * * * *'],
    ['index_constituents', 'Index Constituents', 'S&P 500, Nasdaq 100, and other index memberships', 'monthly', '0 6 1 * *'],
    ['dividend_data', 'Dividend Data', 'Dividend history and upcoming payments', 'weekly', '0 9 * * 1'],
  ];

  for (const [name, displayName, description, frequency, cron] of schedules) {
    insertSchedule.run(name, displayName, description, frequency, cron);
  }
  console.log('Seeded update schedules');
}

// Seed API integrations
const integrationCount = db.prepare('SELECT COUNT(*) as count FROM api_integrations').get();
if (integrationCount.count === 0) {
  const insertIntegration = db.prepare(`
    INSERT INTO api_integrations (name, display_name, daily_limit, monthly_limit, base_url)
    VALUES (?, ?, ?, ?, ?)
  `);

  const integrations = [
    ['alpha_vantage', 'Alpha Vantage', 25, 500, 'https://www.alphavantage.co'],
    ['fmp', 'Financial Modeling Prep', 250, null, 'https://financialmodelingprep.com'],
    ['polygon', 'Polygon.io', 1000, null, 'https://api.polygon.io'],
    ['yfinance', 'Yahoo Finance', null, null, null],
    ['sec_edgar', 'SEC EDGAR', null, null, 'https://www.sec.gov'],
    ['reddit', 'Reddit API', 100, null, 'https://oauth.reddit.com'],
    ['stocktwits', 'StockTwits', 200, null, 'https://api.stocktwits.com'],
    ['google_news', 'Google News RSS', null, null, 'https://news.google.com'],
  ];

  for (const [name, displayName, dailyLimit, monthlyLimit, baseUrl] of integrations) {
    insertIntegration.run(name, displayName, dailyLimit, monthlyLimit, baseUrl);
  }
  console.log('Seeded API integrations');
}

// Seed default user preferences
const prefsCount = db.prepare('SELECT COUNT(*) as count FROM user_preferences').get();
if (prefsCount.count === 0) {
  db.prepare('INSERT INTO user_preferences (user_id) VALUES (\'default\')').run();
  console.log('Seeded default user preferences');
}
console.log('Settings tables migration completed successfully!');
