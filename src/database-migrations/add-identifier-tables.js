// src/database-migrations/add-identifier-tables.js
// Migration: Add identifier_cache and company_identifiers tables
// Agent 11: Symbol Resolution & Market Mapping

const { db } = require('../database');

function up() {
  console.log('Running migration: add-identifier-tables');

  // ============================================
  // TABLE: identifier_cache
  // Caches resolved identifier lookups (LEI, ISIN, ticker)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS identifier_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier_type TEXT NOT NULL,        -- 'lei', 'isin', 'ticker', 'cusip', 'sedol'
      identifier_value TEXT NOT NULL,       -- The actual identifier value
      resolution_data TEXT NOT NULL,        -- JSON blob with full resolution result
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      UNIQUE(identifier_type, identifier_value)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_identifier_cache_lookup
    ON identifier_cache(identifier_type, identifier_value);

    CREATE INDEX IF NOT EXISTS idx_identifier_cache_expires
    ON identifier_cache(expires_at);
  `);

  console.log('  ✓ Created identifier_cache table');

  // ============================================
  // TABLE: company_identifiers
  // Maps all identifier types to companies table
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_identifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,                   -- FK to companies table (NULL if unlinked)

      -- Primary identifiers
      lei TEXT UNIQUE,                      -- Legal Entity Identifier (20 chars)
      isin TEXT,                            -- International Securities ID (12 chars)
      cusip TEXT,                           -- CUSIP (9 chars, mainly US/CA)
      sedol TEXT,                           -- SEDOL (7 chars, UK/Ireland)
      figi TEXT,                            -- Financial Instrument Global Identifier
      composite_figi TEXT,                  -- Composite FIGI (primary listing)
      cik TEXT,                             -- SEC Central Index Key

      -- Trading identifiers
      ticker TEXT,                          -- Stock ticker symbol
      exchange TEXT,                        -- MIC exchange code (e.g., XLON, XETR)
      yahoo_symbol TEXT,                    -- Yahoo Finance symbol (e.g., BP.L)

      -- Company info from GLEIF/filing
      legal_name TEXT,                      -- Official legal name
      country TEXT,                         -- ISO 3166-1 alpha-2 country code
      jurisdiction TEXT,                    -- Legal jurisdiction

      -- Linking status
      link_status TEXT DEFAULT 'pending',   -- pending, linked, no_match, no_symbol, resolution_failed
      link_method TEXT,                     -- symbol_exact, name_fuzzy, manual, created_new
      link_confidence REAL,                 -- 0-1 confidence score

      -- Timestamps
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      linked_at DATETIME,                   -- When company_id was linked

      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    )
  `);

  // Create comprehensive indexes - each in separate exec to avoid issues
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_company ON company_identifiers(company_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_lei ON company_identifiers(lei)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_isin ON company_identifiers(isin)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_cusip ON company_identifiers(cusip)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_figi ON company_identifiers(figi)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_cik ON company_identifiers(cik)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_ticker ON company_identifiers(ticker, exchange)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_yahoo ON company_identifiers(yahoo_symbol)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_status ON company_identifiers(link_status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_company_identifiers_country ON company_identifiers(country)`);

  console.log('  ✓ Created company_identifiers table');

  // ============================================
  // Add LEI column to companies table if not exists
  // ============================================
  try {
    db.exec(`ALTER TABLE companies ADD COLUMN lei TEXT`);
    console.log('  ✓ Added lei column to companies table');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
    console.log('  - lei column already exists in companies table');
  }

  // Add ISIN column to companies table if not exists
  try {
    db.exec(`ALTER TABLE companies ADD COLUMN isin TEXT`);
    console.log('  ✓ Added isin column to companies table');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
    console.log('  - isin column already exists in companies table');
  }

  // Create indexes on companies table for new columns
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_lei ON companies(lei)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_isin ON companies(isin)`);
    console.log('  ✓ Created indexes on companies.lei and companies.isin');
  } catch (e) {
    console.log('  - Indexes may already exist:', e.message);
  }

  console.log('Migration add-identifier-tables completed successfully!');
}

function down() {
  console.log('Rolling back migration: add-identifier-tables');

  // Drop tables in reverse order
  db.exec(`DROP TABLE IF EXISTS company_identifiers`);
  db.exec(`DROP TABLE IF EXISTS identifier_cache`);

  // Note: We don't remove the columns from companies table
  // as they might be in use. Manual cleanup would be needed.

  console.log('Rollback completed. Note: lei/isin columns in companies table were preserved.');
}

// Run migration if executed directly
if (require.main === module) {
  const action = process.argv[2];

  if (action === 'down') {
    down();
  } else {
    up();
  }
}

module.exports = { up, down };
