// src/database-migrations/007-add-update-system-postgres.js
// Update orchestrator tables: update_bundles, update_jobs, update_runs, update_locks, update_queue, update_settings

async function migrate(db) {
  console.log('🐘 Creating update system tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_bundles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      is_automatic INTEGER DEFAULT 1,
      default_timezone TEXT DEFAULT 'America/New_York',
      priority INTEGER DEFAULT 50,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_bundles_name ON update_bundles(name)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_jobs (
      id SERIAL PRIMARY KEY,
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
      last_run_at TIMESTAMP,
      last_run_status TEXT,
      last_run_duration_ms INTEGER,
      last_run_items_processed INTEGER,
      last_run_items_updated INTEGER,
      last_run_items_failed INTEGER,
      last_error TEXT,
      next_run_at TIMESTAMP,
      total_runs INTEGER DEFAULT 0,
      successful_runs INTEGER DEFAULT 0,
      failed_runs INTEGER DEFAULT 0,
      avg_duration_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_jobs_bundle ON update_jobs(bundle_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_jobs_status ON update_jobs(status)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_jobs_next_run ON update_jobs(next_run_at)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_jobs_key ON update_jobs(job_key)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_runs (
      id SERIAL PRIMARY KEY,
      job_id INTEGER REFERENCES update_jobs(id),
      job_key TEXT NOT NULL,
      bundle_name TEXT,
      started_at TIMESTAMP NOT NULL,
      completed_at TIMESTAMP,
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
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_runs_job ON update_runs(job_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_runs_job_key ON update_runs(job_key)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_runs_started ON update_runs(started_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_runs_status ON update_runs(status)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_locks (
      id SERIAL PRIMARY KEY,
      job_key TEXT NOT NULL UNIQUE,
      locked_at TIMESTAMP NOT NULL,
      locked_by TEXT,
      expires_at TIMESTAMP NOT NULL
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_queue (
      id SERIAL PRIMARY KEY,
      job_key TEXT NOT NULL,
      priority INTEGER DEFAULT 50,
      scheduled_for TIMESTAMP DEFAULT NOW(),
      status TEXT DEFAULT 'pending',
      trigger_type TEXT NOT NULL,
      triggered_by TEXT,
      attempt INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      options TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_queue_status ON update_queue(status, scheduled_for)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_queue_job ON update_queue(job_key)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const bundles = [
    ['prices', 'Price Data', 'Stock and ETF price updates', 10, 1],
    ['fundamentals', 'Fundamentals', 'Financial statements and key metrics', 30, 1],
    ['etf', 'ETF Data', 'ETF metadata, holdings, and tier management', 20, 1],
    ['market', 'Market Data', 'Indices, sectors, and economic indicators', 40, 1],
    ['sentiment', 'Sentiment', 'Social media and news sentiment analysis', 50, 1],
    ['knowledge', 'Knowledge Base', 'AI knowledge base from investment sources', 60, 1],
    ['sec', 'SEC Filings', 'SEC EDGAR filing checks and imports', 35, 1],
    ['ipo', 'IPO Tracker', 'IPO pipeline monitoring and company sync', 25, 1],
    ['maintenance', 'Maintenance', 'Data cleanup and health checks', 90, 1],
    ['analytics', 'Analytics', 'Factor analysis, outcomes, investor styles', 45, 1]
  ];
  for (const [name, display_name, description, priority, is_automatic] of bundles) {
    await db.query(
      `INSERT INTO update_bundles (name, display_name, description, priority, is_automatic)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [name, display_name, description, priority, is_automatic]
    );
  }

  const r = await db.query('SELECT id FROM update_bundles WHERE name = $1', ['analytics']);
  const analyticsBundleId = r.rows[0]?.id;
  if (analyticsBundleId) {
    const jobs = [
      [analyticsBundleId, 'analytics.outcomes', 'Outcome Calculation', 'Calculate decision outcomes (return_1y, alpha)', '0 4 * * 0', 1, 2000, 0, 7200],
      [analyticsBundleId, 'analytics.investor_styles', 'Investor Style Classification', 'Re-classify investor styles from decisions', '0 5 * * 0', 1, 100, 500, 3600]
    ];
    for (const row of jobs) {
      await db.query(
        `INSERT INTO update_jobs (bundle_id, job_key, name, description, cron_expression, is_automatic, batch_size, batch_delay_ms, timeout_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (job_key) DO NOTHING`,
        row
      );
    }
  }

  console.log('✅ Update system tables ready.');
}

module.exports = migrate;
