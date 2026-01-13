// Migration: Create walk_forward_periods table
// Tracks performance of each walk-forward validation window

const { db } = require('../database');

console.log('🔧 Creating walk_forward_periods table...');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS walk_forward_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES weight_optimization_runs(id),
      period_index INTEGER NOT NULL,
      train_start_date TEXT NOT NULL,
      train_end_date TEXT NOT NULL,
      test_start_date TEXT NOT NULL,
      test_end_date TEXT NOT NULL,
      purge_days INTEGER DEFAULT 5,
      train_sharpe REAL,
      test_sharpe REAL,
      train_alpha REAL,
      test_alpha REAL,
      efficiency REAL,
      optimal_weights TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(run_id, period_index)
    );
  `);

  console.log('  ✓ Table created: walk_forward_periods');

  // Create indices for better query performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wf_periods_run
    ON walk_forward_periods(run_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wf_periods_efficiency
    ON walk_forward_periods(efficiency);
  `);

  console.log('  ✓ Indices created');

  console.log('✅ Migration complete: walk_forward_periods table ready');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  throw error;
}
