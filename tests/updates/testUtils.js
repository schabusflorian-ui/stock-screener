// tests/updates/testUtils.js
// Test utilities for update services testing

const Database = require('better-sqlite3');

// Singleton test database
let testDb = null;

/**
 * Create or get the test database with update system schema
 */
function getTestDatabase() {
  if (!testDb) {
    testDb = new Database(':memory:');
    initializeUpdateSchema(testDb);
  }
  return testDb;
}

/**
 * Reset database between tests
 */
function resetTestDatabase() {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
  return getTestDatabase();
}

/**
 * Initialize update system tables (SQLite version of migration 007)
 */
function initializeUpdateSchema(db) {
  // update_bundles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_bundles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      is_enabled INTEGER DEFAULT 1,
      is_automatic INTEGER DEFAULT 1,
      default_timezone TEXT DEFAULT 'America/New_York',
      priority INTEGER DEFAULT 50,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // update_jobs table
  db.exec(`
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
      last_run_at TEXT,
      last_run_status TEXT,
      last_run_duration_ms INTEGER,
      last_run_items_processed INTEGER,
      last_run_items_updated INTEGER,
      last_run_items_failed INTEGER,
      last_error TEXT,
      next_run_at TEXT,
      total_runs INTEGER DEFAULT 0,
      successful_runs INTEGER DEFAULT 0,
      failed_runs INTEGER DEFAULT 0,
      avg_duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // update_runs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES update_jobs(id),
      job_key TEXT NOT NULL,
      bundle_name TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
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
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // update_locks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_locks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL UNIQUE,
      locked_at TEXT NOT NULL,
      locked_by TEXT,
      expires_at TEXT NOT NULL
    )
  `);

  // update_queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT NOT NULL,
      priority INTEGER DEFAULT 50,
      scheduled_for TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'pending',
      trigger_type TEXT NOT NULL,
      triggered_by TEXT,
      attempt INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      last_error TEXT,
      last_heartbeat TEXT,
      options TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT
    )
  `);

  // update_settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS update_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_update_jobs_bundle ON update_jobs(bundle_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_update_jobs_status ON update_jobs(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_update_jobs_key ON update_jobs(job_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_update_runs_job_key ON update_runs(job_key)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_update_queue_status ON update_queue(status, scheduled_for)');
}

/**
 * Create mock database that mimics async PostgreSQL interface
 */
function createMockDatabase(sqliteDb = null) {
  const db = sqliteDb || getTestDatabase();

  return {
    type: 'mock',
    _sqlite: db,

    // Async query interface matching PostgreSQL
    query: jest.fn(async (sql, params = []) => {
      // Convert PostgreSQL $1, $2 to SQLite ? placeholders
      const sqliteSql = sql.replace(/\$(\d+)/g, '?');

      // Convert booleans to integers for SQLite compatibility
      const sqliteParams = params.map(p => {
        if (p === true) return 1;
        if (p === false) return 0;
        return p;
      });

      try {
        // Determine query type
        const trimmed = sqliteSql.trim().toUpperCase();

        if (trimmed.startsWith('SELECT')) {
          const stmt = db.prepare(sqliteSql);
          const rows = stmt.all(...sqliteParams);
          return { rows, rowCount: rows.length };
        } else if (trimmed.startsWith('INSERT')) {
          const stmt = db.prepare(sqliteSql);
          const info = stmt.run(...sqliteParams);
          // Handle RETURNING clause
          if (sqliteSql.toUpperCase().includes('RETURNING')) {
            // Only return rows if insert actually happened (for ON CONFLICT DO NOTHING)
            if (info.changes > 0) {
              const id = info.lastInsertRowid;
              return { rows: [{ id }], rowCount: info.changes };
            }
            return { rows: [], rowCount: 0 };
          }
          return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
        } else if (trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
          const stmt = db.prepare(sqliteSql);
          const info = stmt.run(...sqliteParams);
          return { rows: [], rowCount: info.changes };
        } else {
          db.exec(sqliteSql);
          return { rows: [], rowCount: 0 };
        }
      } catch (err) {
        // Re-throw with more context
        err.message = `SQL Error: ${err.message}\nQuery: ${sql}\nParams: ${JSON.stringify(params)}`;
        throw err;
      }
    }),

    // Transaction support
    transaction: async (fn) => {
      db.exec('BEGIN');
      try {
        const result = await fn();
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Direct SQLite access for test setup
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
  };
}

/**
 * Create mock cron module
 */
function createMockCron() {
  const scheduledJobs = new Map();

  return {
    schedule: jest.fn((expression, callback, options) => {
      const job = {
        expression,
        callback,
        options,
        stopped: false,
        stop: jest.fn(function() { this.stopped = true; }),
        start: jest.fn(function() { this.stopped = false; }),
      };
      scheduledJobs.set(expression, job);
      return job;
    }),

    validate: jest.fn((expression) => {
      // Basic cron validation
      if (!expression || typeof expression !== 'string') return false;
      const parts = expression.trim().split(/\s+/);
      return parts.length >= 5 && parts.length <= 6;
    }),

    // Test helpers
    _scheduledJobs: scheduledJobs,
    _triggerJob: (expression) => {
      const job = scheduledJobs.get(expression);
      if (job && !job.stopped) {
        job.callback();
      }
    },
    _clear: () => scheduledJobs.clear(),
  };
}

/**
 * Create mock bundle handler
 */
function createMockBundleHandler(overrides = {}) {
  return {
    execute: jest.fn(async (jobKey, db, context) => ({
      itemsTotal: 10,
      itemsProcessed: 10,
      itemsUpdated: 5,
      itemsFailed: 0,
      ...overrides,
    })),
  };
}

/**
 * Create failing mock bundle handler
 */
function createFailingBundleHandler(error = new Error('Bundle execution failed')) {
  return {
    execute: jest.fn(async () => {
      throw error;
    }),
  };
}

/**
 * Create mock Sentry module
 */
function createMockSentry() {
  return {
    isEnabled: jest.fn(() => false),
    captureMessage: jest.fn(),
    captureException: jest.fn(),
  };
}

/**
 * Insert test bundles into database
 */
function insertTestBundles(db) {
  const bundles = [
    ['prices', 'Price Data', 'Stock price updates', 10],
    ['fundamentals', 'Fundamentals', 'Financial data', 30],
    ['sentiment', 'Sentiment', 'Sentiment analysis', 50],
    ['sec', 'SEC Filings', 'SEC imports', 35],
    ['market', 'Market Data', 'Market indices', 40],
    ['maintenance', 'Maintenance', 'Data cleanup', 90],
  ];

  const stmt = db.prepare(`
    INSERT INTO update_bundles (name, display_name, description, priority, is_enabled, is_automatic)
    VALUES (?, ?, ?, ?, 1, 1)
  `);

  const bundleIds = {};
  for (const [name, displayName, description, priority] of bundles) {
    const info = stmt.run(name, displayName, description, priority);
    bundleIds[name] = info.lastInsertRowid;
  }

  return bundleIds;
}

/**
 * Insert test jobs into database
 */
function insertTestJobs(db, bundleIds) {
  const jobs = [
    [bundleIds.prices, 'prices.daily', 'Daily Price Update', '0 18 * * 1-5', 1, 1, null],
    [bundleIds.prices, 'prices.intraday', 'Intraday Update', '*/15 9-16 * * 1-5', 1, 1, null],
    [bundleIds.fundamentals, 'fundamentals.quarterly', 'Quarterly Import', '0 6 * * *', 1, 1, null],
    [bundleIds.sentiment, 'sentiment.reddit', 'Reddit Sentiment', '0 */4 * * *', 1, 1, null],
    [bundleIds.sec, 'sec.filings', 'SEC Filing Check', '0 7 * * *', 1, 1, null],
    [bundleIds.maintenance, 'maintenance.cleanup', 'Data Cleanup', '0 3 * * 0', 1, 1, null],
  ];

  const stmt = db.prepare(`
    INSERT INTO update_jobs (bundle_id, job_key, name, cron_expression, is_enabled, is_automatic, depends_on)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const jobIds = {};
  for (const [bundleId, jobKey, name, cron, enabled, automatic, dependsOn] of jobs) {
    const info = stmt.run(bundleId, jobKey, name, cron, enabled, automatic, dependsOn);
    jobIds[jobKey] = info.lastInsertRowid;
  }

  return jobIds;
}

/**
 * Insert a test job with dependencies
 */
function insertJobWithDependencies(db, bundleId, jobKey, dependsOn) {
  const stmt = db.prepare(`
    INSERT INTO update_jobs (bundle_id, job_key, name, cron_expression, is_enabled, is_automatic, depends_on)
    VALUES (?, ?, ?, '0 12 * * *', 1, 1, ?)
  `);
  const info = stmt.run(bundleId, jobKey, `Job ${jobKey}`, JSON.stringify(dependsOn));
  return info.lastInsertRowid;
}

/**
 * Insert a test run record
 */
function insertTestRun(db, jobKey, status = 'completed', startedAt = null) {
  const now = startedAt || new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO update_runs (job_key, started_at, completed_at, trigger_type, status, items_processed)
    VALUES (?, ?, ?, 'manual', ?, 10)
  `);
  const info = stmt.run(jobKey, now, status === 'completed' ? now : null, status);
  return info.lastInsertRowid;
}

/**
 * Insert a queue entry
 */
function insertQueueEntry(db, jobKey, status = 'pending', options = {}) {
  const stmt = db.prepare(`
    INSERT INTO update_queue (job_key, status, trigger_type, triggered_by, priority, options)
    VALUES (?, ?, 'manual', 'test', 50, ?)
  `);
  const info = stmt.run(jobKey, status, JSON.stringify(options));
  return info.lastInsertRowid;
}

/**
 * Insert a lock record
 */
function insertLock(db, jobKey, instanceId, expiresAt = null) {
  const now = new Date();
  const expires = expiresAt || new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

  const stmt = db.prepare(`
    INSERT INTO update_locks (job_key, locked_at, locked_by, expires_at)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(jobKey, now.toISOString(), instanceId, expires.toISOString());
  return info.lastInsertRowid;
}

/**
 * Create standard test fixtures
 */
function createTestFixtures(db) {
  const bundleIds = insertTestBundles(db);
  const jobIds = insertTestJobs(db, bundleIds);

  return {
    bundleIds,
    jobIds,
    // Helper to get job by key
    getJob: (jobKey) => {
      return db.prepare('SELECT * FROM update_jobs WHERE job_key = ?').get(jobKey);
    },
    // Helper to get bundle by name
    getBundle: (name) => {
      return db.prepare('SELECT * FROM update_bundles WHERE name = ?').get(name);
    },
    // Helper to get recent runs
    getRuns: (jobKey, limit = 10) => {
      return db.prepare('SELECT * FROM update_runs WHERE job_key = ? ORDER BY started_at DESC LIMIT ?')
        .all(jobKey, limit);
    },
    // Helper to get queue entries
    getQueueEntries: (status = 'pending') => {
      return db.prepare('SELECT * FROM update_queue WHERE status = ? ORDER BY priority, scheduled_for')
        .all(status);
    },
    // Helper to get lock
    getLock: (jobKey) => {
      return db.prepare('SELECT * FROM update_locks WHERE job_key = ?').get(jobKey);
    },
  };
}

/**
 * Wait for a specified time (useful for async tests)
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clean up expired locks (utility for tests)
 */
function cleanExpiredLocks(db) {
  const now = new Date().toISOString();
  db.prepare('DELETE FROM update_locks WHERE expires_at < ?').run(now);
}

module.exports = {
  // Database utilities
  getTestDatabase,
  resetTestDatabase,
  initializeUpdateSchema,
  createMockDatabase,

  // Mock factories
  createMockCron,
  createMockBundleHandler,
  createFailingBundleHandler,
  createMockSentry,

  // Fixture creation
  insertTestBundles,
  insertTestJobs,
  insertJobWithDependencies,
  insertTestRun,
  insertQueueEntry,
  insertLock,
  createTestFixtures,

  // Test helpers
  wait,
  cleanExpiredLocks,
};
