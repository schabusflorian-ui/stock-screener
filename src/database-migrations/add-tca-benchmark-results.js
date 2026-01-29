// src/database-migrations/add-tca-benchmark-results.js
// Migration to add TCA benchmark results persistence for historical trending

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

  try {
    // Check if table already exists
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='tca_benchmark_results'
    `).get();

    if (tableCheck) {
      console.log('tca_benchmark_results table already exists, skipping migration');
      return { success: true, message: 'Already migrated' };
    }

    // Create TCA benchmark results table
    console.log('Creating tca_benchmark_results table...');
    db.exec(`
      CREATE TABLE tca_benchmark_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_date TEXT NOT NULL,
        run_type TEXT DEFAULT 'scheduled',

        -- Overall results
        overall_pass INTEGER NOT NULL,
        pass_rate REAL NOT NULL,
        trade_count INTEGER NOT NULL,
        synthetic_data INTEGER DEFAULT 0,

        -- Implementation Shortfall (bps)
        is_mean REAL,
        is_median REAL,
        is_std REAL,
        is_p95 REAL,
        is_pass INTEGER,
        is_threshold REAL,

        -- VWAP Deviation (bps)
        vwap_mean REAL,
        vwap_median REAL,
        vwap_std REAL,
        vwap_p95 REAL,
        vwap_pass INTEGER,
        vwap_threshold REAL,

        -- Market Impact (bps)
        impact_mean REAL,
        impact_median REAL,
        impact_std REAL,
        impact_p95 REAL,
        impact_pass INTEGER,
        impact_threshold REAL,

        -- Spread Cost (bps)
        spread_mean REAL,
        spread_median REAL,
        spread_std REAL,
        spread_pass INTEGER,
        spread_threshold REAL,

        -- By liquidity tier (JSON)
        by_liquidity_tier TEXT,

        -- Metadata
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for efficient queries
    console.log('Creating indexes...');
    db.exec(`
      CREATE INDEX idx_tca_results_run_date ON tca_benchmark_results(run_date);
      CREATE INDEX idx_tca_results_overall_pass ON tca_benchmark_results(overall_pass);
      CREATE INDEX idx_tca_results_created_at ON tca_benchmark_results(created_at);
    `);

    console.log('Migration completed successfully!');

    return { success: true, message: 'Migration completed' };

  } catch (error) {
    console.error('Migration failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Run migration if called directly
if (require.main === module) {
  const result = migrate();
  process.exit(result.success ? 0 : 1);
}

module.exports = { migrate };
