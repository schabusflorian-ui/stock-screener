// Migration: Create overfitting_diagnostics table
// Stores results from overfitting detection analysis

const { db } = require('../database');

console.log('🔧 Creating overfitting_diagnostics table...');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS overfitting_diagnostics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES weight_optimization_runs(id),
      diagnostic_type TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
      metric_name TEXT NOT NULL,
      metric_value REAL,
      threshold_value REAL,
      passed INTEGER DEFAULT 0 CHECK(passed IN (0, 1)),
      description TEXT,
      recommendation TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('  ✓ Table created: overfitting_diagnostics');

  // Create indices for efficient querying
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_overfit_diag_run
    ON overfitting_diagnostics(run_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_overfit_diag_severity
    ON overfitting_diagnostics(severity);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_overfit_diag_type
    ON overfitting_diagnostics(diagnostic_type);
  `);

  console.log('  ✓ Indices created');

  console.log('✅ Migration complete: overfitting_diagnostics table ready');

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  throw error;
}
