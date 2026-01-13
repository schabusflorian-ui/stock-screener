/**
 * Migration: Enhance XBRL Fundamental Metrics
 *
 * Adds new fields to support enhanced IFRS concept mappings:
 * - Lease liabilities (IFRS 16 post-2019)
 * - Total financial liabilities (alternative debt aggregate)
 * - Other debt (catch-all for non-standard debt)
 * - Diluted shares outstanding (for accurate EPS)
 * - Treasury shares (for calculating net outstanding)
 * - Shares issued (for calculating net outstanding)
 * - Depreciation (separate from D&A)
 * - Amortization (separate from D&A)
 * - Impairment loss (for EBITDA adjustments)
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../data/stocks.db'));

console.log('\n=== XBRL Fundamental Metrics Enhancement Migration ===\n');

try {
  // Add new debt-related fields
  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN lease_liabilities REAL;
  `);
  console.log('✅ Added lease_liabilities column');

  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN total_financial_liabilities REAL;
  `);
  console.log('✅ Added total_financial_liabilities column');

  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN other_debt REAL;
  `);
  console.log('✅ Added other_debt column');

  // Add new share-related fields
  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN diluted_shares_outstanding REAL;
  `);
  console.log('✅ Added diluted_shares_outstanding column');

  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN treasury_shares REAL;
  `);
  console.log('✅ Added treasury_shares column');

  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN shares_issued REAL;
  `);
  console.log('✅ Added shares_issued column');

  // Add separate depreciation and amortization fields
  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN depreciation REAL;
  `);
  console.log('✅ Added depreciation column');

  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN amortization REAL;
  `);
  console.log('✅ Added amortization column');

  // Add impairment loss for EBITDA adjustments
  db.exec(`
    ALTER TABLE xbrl_fundamental_metrics ADD COLUMN impairment_loss REAL;
  `);
  console.log('✅ Added impairment_loss column');

  console.log('\n✅ Migration complete! All columns added successfully.\n');

} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('⚠️  Some columns already exist - migration may have been run previously');
    console.log('Continuing anyway...\n');
  } else {
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
} finally {
  db.close();
}
