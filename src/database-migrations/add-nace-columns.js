/**
 * Add NACE Classification Columns
 *
 * Adds NACE (Nomenclature of Economic Activities) code fields to companies table
 * for proper sector/industry classification of EU/UK companies.
 *
 * NACE is the EU standard for business activity classification, analogous to
 * NAICS (US) or SIC codes. This migration enables us to extract NACE from XBRL
 * filings and map to GICS sectors for consistency with US data.
 */

const { getDb } = require('./_migrationHelper');

const db = getDb();

console.log('\n=== Adding NACE Classification Columns ===\n');

try {
  // Start transaction
  db.exec('BEGIN TRANSACTION');

  // Add NACE code column (4-digit code like "6419")
  console.log('Adding nace_code column...');
  db.exec(`
    ALTER TABLE companies
    ADD COLUMN nace_code TEXT
  `);

  // Add NACE description (e.g., "Other monetary intermediation")
  console.log('Adding nace_description column...');
  db.exec(`
    ALTER TABLE companies
    ADD COLUMN nace_description TEXT
  `);

  // Add NACE section (1-letter code like "K" for Financial activities)
  console.log('Adding nace_section column...');
  db.exec(`
    ALTER TABLE companies
    ADD COLUMN nace_section TEXT
  `);

  // Create index on NACE code for fast lookups
  console.log('Creating index on nace_code...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_companies_nace ON companies(nace_code)
  `);

  // Create index on NACE section for sector-level queries
  console.log('Creating index on nace_section...');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_companies_nace_section ON companies(nace_section)
  `);

  // Commit transaction
  db.exec('COMMIT');

  console.log('\n✅ Successfully added NACE classification columns');
  console.log('   - nace_code (TEXT): 4-digit NACE Rev 2 code');
  console.log('   - nace_description (TEXT): Human-readable description');
  console.log('   - nace_section (TEXT): Top-level section letter');
  console.log('   - Indexes created for fast lookups');
  console.log('');

} catch (error) {
  // Rollback on error
  db.exec('ROLLBACK');

  // Check if columns already exist
  if (error.message.includes('duplicate column name')) {
    console.log('⚠️  NACE columns already exist - skipping migration');
    console.log('');
  } else {
    console.error('❌ Error adding NACE columns:', error.message);
    throw error;
  }
} finally {
}
