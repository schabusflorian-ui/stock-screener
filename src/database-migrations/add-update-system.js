// Database migration: Add centralized update system tables
// Run: node src/database-migrations/add-update-system.js

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Starting Update System migration...');

  // ============================================
  // 1. Update Bundles (Groups of related updates)
  // ============================================
  console.log('Creating update_bundles table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      is_automatic INTEGER DEFAULT 1,
      default_timezone TEXT DEFAULT 'America/New_York',
      priority INTEGER DEFAULT 50,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_update_bundles_name ON update_bundles(name);
  `);

  // ============================================
  // 2. Update Jobs (Individual tasks within bundles)
  // ============================================
  console.log('Creating update_jobs table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bundle_id INTEGER REFERENCES update_bundles(id),
      job_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      cron_expression TEXT,
      timezone TEXT DEFAULT 'America/New_York',
      is_enabled INTEGER DEFAULT 1,
      is_automatic INTEGER DEFAULT 1,
      depends_on TEXT,
      timeout_seconds INTEGER DEFAULT 3600,
      max_retries INTEGER DEFAULT 3,
      retry_delay_seconds INTEGER DEFAULT 300,
      batch_size INTEGER DEFAULT 100,
      batch_delay_ms INTEGER DEFAULT 500,
      status TEXT DEFAULT 'idle',
      is_running INTEGER DEFAULT 0,
      current_progress INTEGER DEFAULT 0,
      current_step TEXT,
      last_run_at DATETIME,
      last_run_status TEXT,
      last_run_duration_ms INTEGER,
      last_run_items_processed INTEGER,
      last_run_items_updated INTEGER,
      last_run_items_failed INTEGER,
      last_error TEXT,
      next_run_at DATETIME,
      total_runs INTEGER DEFAULT 0,
      successful_runs INTEGER DEFAULT 0,
      failed_runs INTEGER DEFAULT 0,
      avg_duration_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_update_jobs_bundle ON update_jobs(bundle_id);
    CREATE INDEX IF NOT EXISTS idx_update_jobs_status ON update_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_update_jobs_next_run ON update_jobs(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_update_jobs_key ON update_jobs(job_key);
  `);

  // ============================================
  // 3. Update Runs (Execution history)
  // ============================================
  console.log('Creating update_runs table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES update_jobs(id),
      job_key TEXT NOT NULL,
      bundle_name TEXT,
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      duration_ms INTEGER,
      trigger_type TEXT NOT NULL,
      triggered_by TEXT,
      status TEXT NOT NULL,
      items_total INTEGER DEFAULT 0,
      items_processed INTEGER DEFAULT 0,
      items_updated INTEGER DEFAULT 0,
      items_skipped INTEGER DEFAULT 0,
      items_failed INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      current_step TEXT,
      error_message TEXT,
      error_stack TEXT,
      failed_items TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_update_runs_job ON update_runs(job_id);
    CREATE INDEX IF NOT EXISTS idx_update_runs_job_key ON update_runs(job_key);
    CREATE INDEX IF NOT EXISTS idx_update_runs_started ON update_runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_update_runs_status ON update_runs(status);
  `);

  // ============================================
  // 4. Update Locks (Prevent concurrent runs)
  // ============================================
  console.log('Creating update_locks table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL UNIQUE,
      locked_at DATETIME NOT NULL,
      locked_by TEXT,
      expires_at DATETIME NOT NULL
    );
  `);

  // ============================================
  // 5. Update Queue (For manual triggers and retries)
  // ============================================
  console.log('Creating update_queue table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL,
      priority INTEGER DEFAULT 50,
      scheduled_for DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'pending',
      trigger_type TEXT NOT NULL,
      triggered_by TEXT,
      attempt INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      options TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_update_queue_status ON update_queue(status, scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_update_queue_job ON update_queue(job_key);
  `);

  // ============================================
  // 6. Update Settings (Global configuration)
  // ============================================
  console.log('Creating update_settings table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS update_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ============================================
  // SEED: Update Bundles
  // ============================================
  console.log('Seeding update bundles...');

  const insertBundle = database.prepare(`
    INSERT OR IGNORE INTO update_bundles (name, display_name, description, priority, is_automatic)
    VALUES (?, ?, ?, ?, ?)
  `);

  const bundles = [
    ['prices', 'Price Data', 'Stock and ETF price updates', 10, 1],
    ['fundamentals', 'Fundamentals', 'Financial statements and key metrics', 30, 1],
    ['etf', 'ETF Data', 'ETF metadata, holdings, and tier management', 20, 1],
    ['market', 'Market Data', 'Indices, sectors, and economic indicators', 40, 1],
    ['sentiment', 'Sentiment', 'Social media and news sentiment analysis', 50, 1],
    ['knowledge', 'Knowledge Base', 'AI knowledge base from investment sources', 60, 1],
    ['sec', 'SEC Filings', 'SEC EDGAR filing checks and imports', 35, 1],
    ['maintenance', 'Maintenance', 'Data cleanup and health checks', 90, 1]
  ];

  for (const bundle of bundles) {
    insertBundle.run(...bundle);
  }

  // ============================================
  // SEED: Update Jobs
  // ============================================
  console.log('Seeding update jobs...');

  const getBundleId = database.prepare('SELECT id FROM update_bundles WHERE name = ?');

  const insertJob = database.prepare(`
    INSERT OR IGNORE INTO update_jobs (
      bundle_id, job_key, name, description, cron_expression,
      is_automatic, batch_size, batch_delay_ms, timeout_seconds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const jobs = [
    // PRICES BUNDLE
    ['prices', 'prices.daily', 'Daily Price Update', 'Update end-of-day prices for all tracked stocks and ETFs', '0 18 * * 1-5', 1, 50, 500, 3600],
    ['prices', 'prices.backfill', 'Price Backfill', 'Backfill prices for stale companies', '0 12 * * 0,6', 1, 50, 500, 3600],
    ['prices', 'prices.intraday', 'Intraday Price Update', 'Update prices during market hours (manual)', '*/15 9-16 * * 1-5', 0, 100, 200, 900],
    ['prices', 'prices.index', 'Index Price Update', 'Update major market index prices', '0 18 * * 1-5', 1, 20, 1000, 1800],

    // FUNDAMENTALS BUNDLE
    ['fundamentals', 'fundamentals.quarterly', 'Quarterly Financials', 'Update income statement, balance sheet, cash flow', '0 6 1 1,4,7,10 *', 1, 20, 2000, 7200],
    ['fundamentals', 'fundamentals.metrics', 'Key Metrics Update', 'Update P/E, P/B, dividend yield, and other key ratios', '0 7 * * 6', 1, 50, 500, 3600],
    ['fundamentals', 'fundamentals.earnings', 'Earnings Calendar Sync', 'Sync upcoming earnings dates and estimates', '0 8 * * 0', 1, 100, 300, 1800],
    ['fundamentals', 'fundamentals.dividends', 'Dividend Update', 'Update dividend history and upcoming ex-dates', '0 9 * * 6', 1, 50, 500, 1800],

    // ETF BUNDLE
    ['etf', 'etf.tier1', 'Tier 1 ETF Update', 'Daily update of curated essential ETFs', '0 6 30 * * 1-5', 1, 30, 500, 1800],
    ['etf', 'etf.tier2', 'Tier 2 ETF Update', 'Weekly update of indexed ETFs', '0 8 * * 6', 1, 100, 300, 3600],
    ['etf', 'etf.holdings', 'ETF Holdings Import', 'Quarterly import of holdings from SEC N-PORT filings', '0 9 1 3,6,9,12 *', 1, 10, 2000, 7200],
    ['etf', 'etf.promotion', 'Tier 3 Promotion Check', 'Promote frequently-accessed Tier 3 ETFs to Tier 2', '0 7 * * 0', 1, 1000, 0, 1800],

    // MARKET BUNDLE
    ['market', 'market.indices', 'Market Indices Update', 'Update S&P 500, NASDAQ, Dow Jones, Russell indices', '0 18 * * 1-5', 1, 20, 1000, 1800],
    ['market', 'market.sectors', 'Sector Performance Update', 'Update sector ETF performance and rotation metrics', '0 19 * * 1-5', 1, 20, 500, 1800],
    ['market', 'market.economic', 'Economic Indicators', 'Update Fed rates, inflation, GDP, unemployment', '0 10 1 * *', 1, 10, 2000, 3600],

    // SENTIMENT BUNDLE
    ['sentiment', 'sentiment.reddit', 'Reddit Sentiment', 'Scan Reddit for stock mentions and sentiment', '0 */4 * * *', 1, 50, 1000, 3600],
    ['sentiment', 'sentiment.stocktwits', 'StockTwits Sentiment', 'Update StockTwits sentiment data', '0 */6 * * *', 1, 50, 500, 1800],
    ['sentiment', 'sentiment.trending', 'Trending Tickers', 'Update trending ticker analysis', '0 */4 * * *', 1, 100, 200, 1800],

    // KNOWLEDGE BUNDLE
    ['knowledge', 'knowledge.incremental', 'Knowledge Base (Incremental)', 'Daily refresh of investment knowledge sources', '0 6 * * 1-6', 1, 10, 5000, 7200],
    ['knowledge', 'knowledge.full', 'Knowledge Base (Full)', 'Full weekly rebuild of knowledge base', '0 3 * * 0', 1, 10, 5000, 14400],

    // SEC BUNDLE
    ['sec', 'sec.filings', 'SEC Filing Check', 'Check for new SEC filings', '0 19 * * 1-5', 1, 50, 1000, 3600],
    ['sec', 'sec.13f', '13F Investor Update', 'Update famous investor 13F holdings', '0 8 15 2,5,8,11 *', 1, 20, 2000, 7200],

    // MAINTENANCE BUNDLE
    ['maintenance', 'maintenance.health_check', 'Data Health Check', 'Calculate data health metrics and identify issues', '0 5 * * *', 1, 1000, 0, 1800],
    ['maintenance', 'maintenance.cleanup', 'Old Data Cleanup', 'Remove expired logs, old job history, orphaned records', '0 3 * * 0', 1, 1000, 0, 3600],
    ['maintenance', 'maintenance.stale_check', 'Stale Data Alert', 'Check for and alert on stale data', '0 6 * * 1-5', 1, 500, 0, 900]
  ];

  for (const job of jobs) {
    const bundleId = getBundleId.get(job[0])?.id;
    if (bundleId) {
      insertJob.run(bundleId, job[1], job[2], job[3], job[4], job[5], job[6], job[7], job[8]);
    }
  }

  // ============================================
  // SEED: Default Settings
  // ============================================
  console.log('Seeding default settings...');

  const insertSetting = database.prepare(`
    INSERT OR IGNORE INTO update_settings (key, value, description)
    VALUES (?, ?, ?)
  `);

  const settings = [
    ['global_automatic_updates', 'true', 'Enable/disable all automatic updates globally'],
    ['update_timezone', 'America/New_York', 'Default timezone for all scheduled updates'],
    ['max_concurrent_jobs', '2', 'Maximum number of jobs that can run simultaneously'],
    ['queue_poll_interval_ms', '5000', 'How often to check the queue for pending jobs'],
    ['default_retry_delay_seconds', '300', 'Default delay before retrying a failed job'],
    ['default_max_retries', '3', 'Default maximum retry attempts for failed jobs'],
    ['notification_email', '', 'Email address for update failure notifications'],
    ['slack_webhook', '', 'Slack webhook URL for update notifications']
  ];

  for (const setting of settings) {
    insertSetting.run(...setting);
  }

  // Set job dependencies
  console.log('Setting job dependencies...');

  const updateDependency = database.prepare(`
    UPDATE update_jobs SET depends_on = ? WHERE job_key = ?
  `);

  updateDependency.run(JSON.stringify(['prices.daily']), 'market.sectors');
  updateDependency.run(JSON.stringify(['prices.daily']), 'market.indices');

  console.log('Update System migration completed!');
}

// Run migration
try {
  migrate();
  console.log('Migration successful!');
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
