// src/database-migrations/add-investor-performance-cache.js
// Database migration for pre-calculated investor performance data

const db = require('../database').db;

console.log('📊 Running investor performance cache migration...');

// ============================================
// TABLE: Investor Performance Cache
// Pre-computed quarterly returns per investor
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_performance_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,

    -- Quarter identification
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Pre-computed values
    portfolio_return REAL,        -- % return for this quarter
    benchmark_return REAL,        -- S&P 500 return for this quarter
    alpha REAL,                   -- portfolio_return - benchmark_return
    cumulative_return REAL,       -- Running cumulative from first quarter
    cumulative_benchmark REAL,    -- Running cumulative S&P 500
    positions_count INTEGER,      -- Number of positions in portfolio

    -- Metadata
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE,
    UNIQUE(investor_id, start_date)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_perf_cache_investor ON investor_performance_cache(investor_id);
  CREATE INDEX IF NOT EXISTS idx_perf_cache_dates ON investor_performance_cache(investor_id, start_date);
`);

console.log('✅ Created investor_performance_cache table');

// ============================================
// TABLE: Investor Performance Summary
// Summary statistics per investor (avoid recalculating)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_performance_summary (
    investor_id INTEGER PRIMARY KEY,

    period_count INTEGER,
    first_date DATE,
    last_date DATE,

    total_return REAL,
    benchmark_total_return REAL,
    avg_quarterly_return REAL,
    avg_benchmark_return REAL,
    annualized_return REAL,
    annualized_benchmark REAL,
    alpha REAL,

    positive_quarters INTEGER,
    negative_quarters INTEGER,
    best_quarter REAL,
    worst_quarter REAL,

    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE
  );
`);

console.log('✅ Created investor_performance_summary table');

console.log('📊 Investor performance cache migration complete!');
