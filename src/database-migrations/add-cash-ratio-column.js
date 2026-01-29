/**
 * Migration: Add cash_ratio column to calculated_metrics
 *
 * Cash Ratio = Cash and Cash Equivalents / Current Liabilities
 * - Measures ability to pay short-term obligations using only cash
 * - More conservative than current ratio or quick ratio
 * - Typical range: 0.2 to 2.0
 */

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

console.log('Adding cash_ratio column to calculated_metrics...');

// Check if column already exists
const columns = db.prepare("PRAGMA table_info(calculated_metrics)").all();
const hasCashRatio = columns.some(col => col.name === 'cash_ratio');

if (hasCashRatio) {
  console.log('cash_ratio column already exists, skipping migration');
  process.exit(0);
}

// Add the column
db.exec(`
  ALTER TABLE calculated_metrics ADD COLUMN cash_ratio REAL;
`);

console.log('Successfully added cash_ratio column');

// Create index for performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_calculated_metrics_cash_ratio
  ON calculated_metrics(company_id, cash_ratio)
  WHERE cash_ratio IS NOT NULL;
`);

console.log('Migration complete');
