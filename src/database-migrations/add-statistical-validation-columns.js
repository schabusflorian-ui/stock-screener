// Migration: Add statistical validation columns to weight optimization tables
// Adds deflated Sharpe, confidence intervals, stress test results, and walk-forward metrics

const { db } = require('../database');

console.log('🔧 Adding statistical validation columns...');

try {
  // Add columns to weight_optimization_runs table
  console.log('  Adding columns to weight_optimization_runs...');

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN deflated_sharpe REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN deflated_sharpe_p_value REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN alpha_ci_lower REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN alpha_ci_upper REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN sharpe_ci_lower REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN sharpe_ci_upper REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN stress_test_results TEXT;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN num_periods_oos INTEGER;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN parameter_stability REAL;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN multiple_testing_method TEXT;
  `);

  db.exec(`
    ALTER TABLE weight_optimization_runs ADD COLUMN num_significant_after_correction INTEGER;
  `);

  console.log('  ✓ Added 11 columns to weight_optimization_runs');

  // Add columns to weight_combination_results table
  console.log('  Adding columns to weight_combination_results...');

  db.exec(`
    ALTER TABLE weight_combination_results ADD COLUMN deflated_sharpe REAL;
  `);

  db.exec(`
    ALTER TABLE weight_combination_results ADD COLUMN deflated_sharpe_p_value REAL;
  `);

  db.exec(`
    ALTER TABLE weight_combination_results ADD COLUMN fdr_adjusted_p_value REAL;
  `);

  db.exec(`
    ALTER TABLE weight_combination_results ADD COLUMN significant_after_correction INTEGER DEFAULT 0;
  `);

  console.log('  ✓ Added 4 columns to weight_combination_results');

  console.log('✅ Migration complete: Statistical validation columns added');

} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('⚠️  Columns already exist - skipping migration');
  } else {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}
