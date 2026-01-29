// src/database-migrations/add-ipo-tables.js
// Migration to add IPO tracking tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('🚀 Starting IPO tables migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // TABLE 1: IPO Tracker (main pipeline)
    // ============================================
    console.log('  Creating ipo_tracker table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS ipo_tracker (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Company identification
        cik TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        ticker_proposed TEXT,
        ticker_final TEXT,

        -- Filing dates
        initial_s1_date TEXT NOT NULL,
        latest_amendment_date TEXT,
        amendment_count INTEGER DEFAULT 0,
        effective_date TEXT,
        pricing_date TEXT,
        trading_date TEXT,
        withdrawn_date TEXT,

        -- Exchange info
        exchange_proposed TEXT,
        exchange_final TEXT,

        -- Deal terms
        price_range_low REAL,
        price_range_high REAL,
        final_price REAL,
        shares_offered INTEGER,
        deal_size REAL,
        overallotment_shares INTEGER,

        -- Company info (from S-1)
        industry TEXT,
        sector TEXT,
        business_description TEXT,
        headquarters_state TEXT,
        headquarters_country TEXT,
        employee_count INTEGER,
        founded_year INTEGER,
        website TEXT,

        -- Pre-IPO financials (latest fiscal year from S-1)
        revenue_latest REAL,
        revenue_prior_year REAL,
        net_income_latest REAL,
        net_income_prior_year REAL,
        total_assets REAL,
        total_liabilities REAL,
        stockholders_equity REAL,
        cash_and_equivalents REAL,
        fiscal_year_end_month INTEGER,

        -- Underwriters
        lead_underwriters TEXT,
        all_underwriters TEXT,

        -- Status
        status TEXT DEFAULT 'S1_FILED',
        is_active INTEGER DEFAULT 1,

        -- Metadata
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_checked_at DATETIME,

        -- Link to main company after IPO
        company_id INTEGER,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // TABLE 2: IPO Filings (all related SEC filings)
    // ============================================
    console.log('  Creating ipo_filings table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS ipo_filings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipo_id INTEGER NOT NULL,

        form_type TEXT NOT NULL,
        accession_number TEXT UNIQUE NOT NULL,
        filing_date TEXT NOT NULL,
        filing_url TEXT,

        -- Data extracted from this specific filing
        price_range_low REAL,
        price_range_high REAL,
        final_price REAL,
        shares_offered INTEGER,

        -- For tracking amendments
        is_amendment INTEGER DEFAULT 0,
        amendment_number INTEGER,

        -- Raw data storage
        raw_data TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ipo_id) REFERENCES ipo_tracker(id) ON DELETE CASCADE
      );
    `);

    // ============================================
    // TABLE 3: IPO Watchlist (user tracking)
    // ============================================
    console.log('  Creating ipo_watchlist table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS ipo_watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipo_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        notify_on_update INTEGER DEFAULT 1,
        FOREIGN KEY (ipo_id) REFERENCES ipo_tracker(id) ON DELETE CASCADE,
        UNIQUE(ipo_id)
      );
    `);

    // ============================================
    // TABLE 4: IPO Check Log (audit trail)
    // ============================================
    console.log('  Creating ipo_check_log table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS ipo_check_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_type TEXT NOT NULL,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        new_filings_found INTEGER DEFAULT 0,
        updates_found INTEGER DEFAULT 0,
        error_message TEXT,
        duration_ms INTEGER
      );
    `);

    // ============================================
    // INDEXES for performance
    // ============================================
    console.log('  Creating indexes...');

    // IPO Tracker indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ipo_status ON ipo_tracker(status);
      CREATE INDEX IF NOT EXISTS idx_ipo_active ON ipo_tracker(is_active);
      CREATE INDEX IF NOT EXISTS idx_ipo_cik ON ipo_tracker(cik);
      CREATE INDEX IF NOT EXISTS idx_ipo_ticker ON ipo_tracker(ticker_proposed);
      CREATE INDEX IF NOT EXISTS idx_ipo_ticker_final ON ipo_tracker(ticker_final);
      CREATE INDEX IF NOT EXISTS idx_ipo_dates ON ipo_tracker(initial_s1_date, trading_date);
      CREATE INDEX IF NOT EXISTS idx_ipo_sector ON ipo_tracker(sector);
      CREATE INDEX IF NOT EXISTS idx_ipo_industry ON ipo_tracker(industry);
      CREATE INDEX IF NOT EXISTS idx_ipo_deal_size ON ipo_tracker(deal_size DESC);
      CREATE INDEX IF NOT EXISTS idx_ipo_active_status ON ipo_tracker(is_active, status);
    `);

    // IPO Filings indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ipo_filings_ipo ON ipo_filings(ipo_id);
      CREATE INDEX IF NOT EXISTS idx_ipo_filings_date ON ipo_filings(filing_date DESC);
      CREATE INDEX IF NOT EXISTS idx_ipo_filings_type ON ipo_filings(form_type);
      CREATE INDEX IF NOT EXISTS idx_ipo_filings_accession ON ipo_filings(accession_number);
    `);

    // Watchlist indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ipo_watchlist_ipo ON ipo_watchlist(ipo_id);
    `);

    // Check log indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_ipo_check_log_date ON ipo_check_log(checked_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ipo_check_log_type ON ipo_check_log(check_type);
    `);

    database.exec('COMMIT');

    console.log('✅ IPO tables migration completed successfully!');
    console.log('');
    console.log('Tables created:');
    console.log('  - ipo_tracker (main IPO pipeline)');
    console.log('  - ipo_filings (SEC filings for each IPO)');
    console.log('  - ipo_watchlist (user watchlist)');
    console.log('  - ipo_check_log (audit trail)');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name LIKE 'ipo_%'
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  }
}

// Helper function to check if migration has been run
function isMigrationNeeded() {
  const database = db.getDatabase();
  const result = database.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='ipo_tracker'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('ℹ️  IPO tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
