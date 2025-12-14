// src/database-migrations/add-bulk-import-tables.js
const db = require('../database');

/**
 * Database Migration: Add Bulk Import Tables and Columns
 *
 * Adds necessary schema changes for SEC bulk import:
 * - tag_mappings table for XBRL tag normalization
 * - CIK column to companies table
 * - Additional columns to financial_line_items
 * - Performance indexes
 */

function runMigration() {
  console.log('\n📦 DATABASE MIGRATION: Bulk Import Schema\n');
  console.log('='.repeat(60));

  const database = db.getDatabase();

  try {
    // Start transaction for all migrations
    database.exec('BEGIN TRANSACTION');

    // ========================================
    // 1. Add CIK columns to companies table
    // ========================================
    console.log('\n1️⃣  Adding CIK columns to companies table...');

    const companiesColumns = database.prepare("PRAGMA table_info(companies)").all();
    const companiesColumnNames = companiesColumns.map(col => col.name);

    if (!companiesColumnNames.includes('cik')) {
      database.exec(`ALTER TABLE companies ADD COLUMN cik TEXT`);
      console.log('   ✓ Added cik column');
    } else {
      console.log('   ✓ cik column already exists');
    }

    if (!companiesColumnNames.includes('sic_code')) {
      database.exec(`ALTER TABLE companies ADD COLUMN sic_code TEXT`);
      console.log('   ✓ Added sic_code column');
    } else {
      console.log('   ✓ sic_code column already exists');
    }

    if (!companiesColumnNames.includes('sic_description')) {
      database.exec(`ALTER TABLE companies ADD COLUMN sic_description TEXT`);
      console.log('   ✓ Added sic_description column');
    } else {
      console.log('   ✓ sic_description column already exists');
    }

    // ========================================
    // 2. Create financial_line_items table if not exists
    // ========================================
    console.log('\n2️⃣  Creating financial_line_items table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS financial_line_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        concept TEXT NOT NULL,
        original_concept TEXT,
        fiscal_date_ending DATE NOT NULL,
        fiscal_period TEXT NOT NULL,
        fiscal_year INTEGER,
        value REAL,
        unit TEXT,
        statement_type TEXT,
        adsh TEXT,
        qtrs INTEGER,
        filed_date DATE,
        form_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        UNIQUE(company_id, concept, fiscal_date_ending, fiscal_period)
      )
    `);
    console.log('   ✓ Table created/verified');

    // ========================================
    // 3. Add columns to financial_line_items (if missing)
    // ========================================
    console.log('\n3️⃣  Checking financial_line_items columns...');

    const lineItemsColumns = database.prepare("PRAGMA table_info(financial_line_items)").all();
    const lineItemsColumnNames = lineItemsColumns.map(col => col.name);

    if (!lineItemsColumnNames.includes('original_concept')) {
      database.exec(`ALTER TABLE financial_line_items ADD COLUMN original_concept TEXT`);
      console.log('   ✓ Added original_concept column');
    } else {
      console.log('   ✓ original_concept column already exists');
    }

    if (!lineItemsColumnNames.includes('adsh')) {
      database.exec(`ALTER TABLE financial_line_items ADD COLUMN adsh TEXT`);
      console.log('   ✓ Added adsh column (accession number)');
    } else {
      console.log('   ✓ adsh column already exists');
    }

    if (!lineItemsColumnNames.includes('qtrs')) {
      database.exec(`ALTER TABLE financial_line_items ADD COLUMN qtrs INTEGER`);
      console.log('   ✓ Added qtrs column (period indicator)');
    } else {
      console.log('   ✓ qtrs column already exists');
    }

    if (!lineItemsColumnNames.includes('filed_date')) {
      database.exec(`ALTER TABLE financial_line_items ADD COLUMN filed_date DATE`);
      console.log('   ✓ Added filed_date column');
    } else {
      console.log('   ✓ filed_date column already exists');
    }

    if (!lineItemsColumnNames.includes('form_type')) {
      database.exec(`ALTER TABLE financial_line_items ADD COLUMN form_type TEXT`);
      console.log('   ✓ Added form_type column (10-K, 10-Q)');
    } else {
      console.log('   ✓ form_type column already exists');
    }

    // ========================================
    // 4. Create tag_mappings table
    // ========================================
    console.log('\n4️⃣  Creating tag_mappings table...');

    database.exec(`
      CREATE TABLE IF NOT EXISTS tag_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_tag TEXT NOT NULL,
        canonical_tag TEXT NOT NULL,
        statement_type TEXT,
        description TEXT,
        priority INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(original_tag)
      )
    `);
    console.log('   ✓ Created tag_mappings table');

    // ========================================
    // 5. Create performance indexes
    // ========================================
    console.log('\n5️⃣  Creating performance indexes...');

    const indexes = [
      {
        name: 'idx_companies_cik',
        table: 'companies',
        sql: 'CREATE INDEX IF NOT EXISTS idx_companies_cik ON companies(cik)'
      },
      {
        name: 'idx_fli_company_concept',
        table: 'financial_line_items',
        sql: 'CREATE INDEX IF NOT EXISTS idx_fli_company_concept ON financial_line_items(company_id, concept)'
      },
      {
        name: 'idx_fli_period',
        table: 'financial_line_items',
        sql: 'CREATE INDEX IF NOT EXISTS idx_fli_period ON financial_line_items(fiscal_date_ending, fiscal_period)'
      },
      {
        name: 'idx_fli_adsh',
        table: 'financial_line_items',
        sql: 'CREATE INDEX IF NOT EXISTS idx_fli_adsh ON financial_line_items(adsh)'
      },
      {
        name: 'idx_tag_mappings_original',
        table: 'tag_mappings',
        sql: 'CREATE INDEX IF NOT EXISTS idx_tag_mappings_original ON tag_mappings(original_tag)'
      },
      {
        name: 'idx_tag_mappings_canonical',
        table: 'tag_mappings',
        sql: 'CREATE INDEX IF NOT EXISTS idx_tag_mappings_canonical ON tag_mappings(canonical_tag)'
      }
    ];

    for (const index of indexes) {
      database.exec(index.sql);
      console.log(`   ✓ Created index: ${index.name}`);
    }

    // Commit transaction
    database.exec('COMMIT');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!\n');

    // Show summary
    console.log('📊 Summary:');
    console.log('   • companies table: +3 columns (cik, sic_code, sic_description)');
    console.log('   • financial_line_items table: created with all required columns');
    console.log('   • tag_mappings table: created');
    console.log(`   • Performance indexes: ${indexes.length} created`);
    console.log('\n✨ Database ready for SEC bulk import!\n');

  } catch (error) {
    // Rollback on error
    database.exec('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
