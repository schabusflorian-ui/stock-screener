// src/database-migrations/add-eu-ipo-columns.js
// Migration to add EU/UK IPO tracking support to existing tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting EU/UK IPO columns migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // Add columns to ipo_tracker table
    // ============================================
    console.log('  Adding EU/UK columns to ipo_tracker...');

    // Check which columns already exist
    const existingColumns = database.prepare(`
      PRAGMA table_info(ipo_tracker)
    `).all().map(c => c.name);

    const columnsToAdd = [
      { name: 'region', sql: "ALTER TABLE ipo_tracker ADD COLUMN region TEXT DEFAULT 'US'" },
      { name: 'lei', sql: 'ALTER TABLE ipo_tracker ADD COLUMN lei TEXT' },
      { name: 'isin', sql: 'ALTER TABLE ipo_tracker ADD COLUMN isin TEXT' },
      { name: 'prospectus_id', sql: 'ALTER TABLE ipo_tracker ADD COLUMN prospectus_id TEXT' },
      { name: 'regulator', sql: 'ALTER TABLE ipo_tracker ADD COLUMN regulator TEXT' },
      { name: 'listing_venue', sql: 'ALTER TABLE ipo_tracker ADD COLUMN listing_venue TEXT' },
      { name: 'home_member_state', sql: 'ALTER TABLE ipo_tracker ADD COLUMN home_member_state TEXT' },
      { name: 'prospectus_url', sql: 'ALTER TABLE ipo_tracker ADD COLUMN prospectus_url TEXT' },
      { name: 'approval_date', sql: 'ALTER TABLE ipo_tracker ADD COLUMN approval_date TEXT' },
    ];

    for (const col of columnsToAdd) {
      if (!existingColumns.includes(col.name)) {
        database.exec(col.sql);
        console.log(`    Added column: ${col.name}`);
      } else {
        console.log(`    Column already exists: ${col.name}`);
      }
    }

    // Make CIK nullable for EU/UK IPOs (they use LEI instead)
    // SQLite doesn't support ALTER COLUMN, so we check constraint instead
    console.log('  Note: CIK column remains, but can be NULL for EU/UK IPOs');

    // ============================================
    // Add columns to ipo_check_log table
    // ============================================
    console.log('  Adding columns to ipo_check_log...');

    const checkLogColumns = database.prepare(`
      PRAGMA table_info(ipo_check_log)
    `).all().map(c => c.name);

    const checkLogColumnsToAdd = [
      { name: 'region', sql: "ALTER TABLE ipo_check_log ADD COLUMN region TEXT DEFAULT 'US'" },
      { name: 'data_source', sql: 'ALTER TABLE ipo_check_log ADD COLUMN data_source TEXT' },
    ];

    for (const col of checkLogColumnsToAdd) {
      if (!checkLogColumns.includes(col.name)) {
        database.exec(col.sql);
        console.log(`    Added column: ${col.name}`);
      } else {
        console.log(`    Column already exists: ${col.name}`);
      }
    }

    // ============================================
    // Add columns to ipo_filings table for EU/UK
    // ============================================
    console.log('  Adding columns to ipo_filings...');

    const filingsColumns = database.prepare(`
      PRAGMA table_info(ipo_filings)
    `).all().map(c => c.name);

    const filingsColumnsToAdd = [
      { name: 'document_type', sql: 'ALTER TABLE ipo_filings ADD COLUMN document_type TEXT' },
      { name: 'regulator', sql: 'ALTER TABLE ipo_filings ADD COLUMN regulator TEXT' },
    ];

    for (const col of filingsColumnsToAdd) {
      if (!filingsColumns.includes(col.name)) {
        database.exec(col.sql);
        console.log(`    Added column: ${col.name}`);
      } else {
        console.log(`    Column already exists: ${col.name}`);
      }
    }

    // ============================================
    // Create new indexes for EU/UK queries
    // ============================================
    console.log('  Creating EU/UK indexes...');

    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ipo_region ON ipo_tracker(region);
      CREATE INDEX IF NOT EXISTS idx_ipo_lei ON ipo_tracker(lei);
      CREATE INDEX IF NOT EXISTS idx_ipo_regulator ON ipo_tracker(regulator);
      CREATE INDEX IF NOT EXISTS idx_ipo_region_status ON ipo_tracker(region, status);
      CREATE INDEX IF NOT EXISTS idx_ipo_region_active ON ipo_tracker(region, is_active);
    `);

    // Create unique constraint on LEI per region (for EU/UK)
    // Note: SQLite partial indexes with WHERE clause
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ipo_lei_unique
      ON ipo_tracker(lei) WHERE lei IS NOT NULL AND lei != '';
    `);

    // ============================================
    // Update existing US IPOs with region
    // ============================================
    console.log('  Setting region=US for existing IPOs...');

    const updateResult = database.prepare(`
      UPDATE ipo_tracker SET region = 'US', regulator = 'SEC'
      WHERE region IS NULL OR region = ''
    `).run();

    console.log(`    Updated ${updateResult.changes} existing IPO records`);

    // ============================================
    // Update existing check logs
    // ============================================
    const checkLogUpdate = database.prepare(`
      UPDATE ipo_check_log SET region = 'US', data_source = 'SEC'
      WHERE region IS NULL OR region = ''
    `).run();

    console.log(`    Updated ${checkLogUpdate.changes} check log records`);

    database.exec('COMMIT');

    console.log('EU/UK IPO columns migration completed successfully!');
    console.log('');
    console.log('New columns added to ipo_tracker:');
    console.log('  - region (US, EU, UK)');
    console.log('  - lei (Legal Entity Identifier)');
    console.log('  - isin (International Securities ID)');
    console.log('  - prospectus_id (ESMA/FCA document ID)');
    console.log('  - regulator (SEC, ESMA, FCA)');
    console.log('  - listing_venue (specific exchange)');
    console.log('  - home_member_state (EU country code)');
    console.log('  - prospectus_url (link to prospectus)');
    console.log('  - approval_date (prospectus approval date)');

    // Verify schema
    const schema = database.prepare(`
      PRAGMA table_info(ipo_tracker)
    `).all();

    console.log('');
    console.log(`ipo_tracker now has ${schema.length} columns`);

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  }
}

// Check if migration is needed
function isMigrationNeeded() {
  const database = db.getDatabase();

  // Check if ipo_tracker exists
  const tableExists = database.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='ipo_tracker'
  `).get();

  if (tableExists.count === 0) {
    console.log('ipo_tracker table does not exist. Run add-ipo-tables.js first.');
    return false;
  }

  // Check if region column exists
  const columns = database.prepare(`
    PRAGMA table_info(ipo_tracker)
  `).all();

  const hasRegion = columns.some(c => c.name === 'region');

  return !hasRegion;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('EU/UK IPO columns already exist. Migration skipped.');

    // Show current schema for verification
    const database = db.getDatabase();
    const euColumns = ['region', 'lei', 'isin', 'prospectus_id', 'regulator', 'listing_venue'];
    const columns = database.prepare('PRAGMA table_info(ipo_tracker)').all();

    console.log('');
    console.log('Current EU/UK columns in ipo_tracker:');
    for (const col of columns.filter(c => euColumns.includes(c.name))) {
      console.log(`  - ${col.name} (${col.type})`);
    }
  }
}

module.exports = { runMigration, isMigrationNeeded };
