// src/database-migrations/add-insider-capital-tables.js
// Migration to add insider trading and capital allocation tracking tables

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('Starting insider trading & capital allocation tables migration...');

  database.exec('BEGIN TRANSACTION');

  try {
    // ============================================
    // INSIDER TRADING TABLES
    // ============================================

    // TABLE 1: Insiders (officers, directors, 10% owners)
    console.log('  Creating insiders table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS insiders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        cik TEXT,
        name TEXT NOT NULL,
        title TEXT,
        is_officer INTEGER DEFAULT 0,
        is_director INTEGER DEFAULT 0,
        is_ten_percent_owner INTEGER DEFAULT 0,
        first_filing_date TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        UNIQUE(company_id, cik)
      );
    `);

    // TABLE 2: Insider Transactions (Form 4 data)
    console.log('  Creating insider_transactions table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS insider_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        insider_id INTEGER NOT NULL,

        -- Filing info
        accession_number TEXT UNIQUE,
        filing_date TEXT NOT NULL,

        -- Transaction details
        transaction_date TEXT NOT NULL,
        transaction_code TEXT,
        transaction_type TEXT,

        -- Shares
        shares_transacted REAL,
        shares_owned_after REAL,

        -- Price
        price_per_share REAL,
        total_value REAL,

        -- Options (if derivative)
        is_derivative INTEGER DEFAULT 0,
        derivative_security TEXT,
        exercise_price REAL,
        expiration_date TEXT,
        underlying_shares REAL,

        -- Context
        acquisition_disposition TEXT,
        direct_indirect TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (insider_id) REFERENCES insiders(id)
      );
    `);

    // TABLE 3: Insider Activity Summary
    console.log('  Creating insider_activity_summary table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS insider_activity_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        period TEXT NOT NULL,

        -- Buy activity
        buy_count INTEGER DEFAULT 0,
        buy_shares REAL DEFAULT 0,
        buy_value REAL DEFAULT 0,
        unique_buyers INTEGER DEFAULT 0,

        -- Sell activity
        sell_count INTEGER DEFAULT 0,
        sell_shares REAL DEFAULT 0,
        sell_value REAL DEFAULT 0,
        unique_sellers INTEGER DEFAULT 0,

        -- Net activity
        net_shares REAL DEFAULT 0,
        net_value REAL DEFAULT 0,

        -- Sentiment signal
        insider_signal TEXT,
        signal_strength INTEGER,
        signal_score INTEGER,

        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, period),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // ============================================
    // CAPITAL ALLOCATION TABLES
    // ============================================

    // TABLE 4: Buyback Programs
    console.log('  Creating buyback_programs table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS buyback_programs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,

        -- Program details
        announced_date TEXT NOT NULL,
        authorization_amount REAL,
        authorization_shares REAL,
        expiration_date TEXT,

        -- Execution tracking
        shares_repurchased REAL DEFAULT 0,
        amount_spent REAL DEFAULT 0,
        average_price REAL,
        remaining_authorization REAL,

        -- Status
        status TEXT DEFAULT 'active',

        -- Source
        source_filing TEXT,
        accession_number TEXT,
        notes TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // TABLE 5: Buyback Activity (quarterly execution)
    console.log('  Creating buyback_activity table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS buyback_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        program_id INTEGER,

        fiscal_quarter TEXT NOT NULL,

        shares_repurchased REAL,
        amount_spent REAL,
        average_price REAL,

        -- Monthly breakdown if available
        month1_shares REAL,
        month1_amount REAL,
        month2_shares REAL,
        month2_amount REAL,
        month3_shares REAL,
        month3_amount REAL,

        -- Source
        source_filing TEXT,
        accession_number TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, fiscal_quarter),
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (program_id) REFERENCES buyback_programs(id)
      );
    `);

    // TABLE 6: Dividends
    console.log('  Creating dividends table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS dividends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,

        -- Key dates
        declared_date TEXT,
        ex_dividend_date TEXT NOT NULL,
        record_date TEXT,
        payment_date TEXT,

        -- Amount
        dividend_amount REAL NOT NULL,
        dividend_type TEXT DEFAULT 'regular',
        frequency TEXT,

        -- Change tracking
        prior_dividend REAL,
        change_amount REAL,
        change_pct REAL,
        consecutive_increases INTEGER DEFAULT 0,

        -- Flags
        is_increase INTEGER DEFAULT 0,
        is_decrease INTEGER DEFAULT 0,
        is_initiation INTEGER DEFAULT 0,
        is_suspension INTEGER DEFAULT 0,

        -- Source
        source_filing TEXT,
        accession_number TEXT,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, ex_dividend_date, dividend_type),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // TABLE 7: Capital Allocation Summary
    console.log('  Creating capital_allocation_summary table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS capital_allocation_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        fiscal_quarter TEXT NOT NULL,

        -- Cash generation
        operating_cash_flow REAL,
        free_cash_flow REAL,

        -- Capital deployment
        dividends_paid REAL,
        buybacks_executed REAL,
        capex REAL,
        acquisitions REAL,
        debt_repayment REAL,
        debt_issuance REAL,

        -- Calculated metrics
        total_shareholder_return REAL,
        shareholder_yield REAL,
        dividend_pct_of_fcf REAL,
        buyback_pct_of_fcf REAL,
        capex_pct_of_revenue REAL,

        -- Payout ratios
        dividend_payout_ratio REAL,
        total_payout_ratio REAL,

        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(company_id, fiscal_quarter),
        FOREIGN KEY (company_id) REFERENCES companies(id)
      );
    `);

    // TABLE 8: Significant Events / Alerts
    console.log('  Creating significant_events table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS significant_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,

        event_type TEXT NOT NULL,
        event_date TEXT NOT NULL,

        -- Event details
        headline TEXT NOT NULL,
        description TEXT,

        -- Quantitative context
        value REAL,
        value_formatted TEXT,

        -- Significance scoring
        significance_score INTEGER,
        is_positive INTEGER,

        -- Source tracking
        source_type TEXT,
        source_url TEXT,
        accession_number TEXT,

        -- Alert management
        alert_sent INTEGER DEFAULT 0,
        alert_sent_at DATETIME,

        -- Related entities
        insider_id INTEGER,
        program_id INTEGER,

        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id),
        FOREIGN KEY (insider_id) REFERENCES insiders(id),
        FOREIGN KEY (program_id) REFERENCES buyback_programs(id)
      );
    `);

    // ============================================
    // INDEXES
    // ============================================
    console.log('  Creating indexes...');

    // Insider indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_insiders_company ON insiders(company_id);
      CREATE INDEX IF NOT EXISTS idx_insiders_cik ON insiders(cik);
    `);

    // Transaction indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_insider_tx_company ON insider_transactions(company_id);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_insider ON insider_transactions(insider_id);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_date ON insider_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_type ON insider_transactions(transaction_type);
      CREATE INDEX IF NOT EXISTS idx_insider_tx_accession ON insider_transactions(accession_number);
    `);

    // Summary indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_insider_summary_company ON insider_activity_summary(company_id);
    `);

    // Buyback indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_buyback_prog_company ON buyback_programs(company_id);
      CREATE INDEX IF NOT EXISTS idx_buyback_prog_status ON buyback_programs(status);
      CREATE INDEX IF NOT EXISTS idx_buyback_activity_company ON buyback_activity(company_id);
      CREATE INDEX IF NOT EXISTS idx_buyback_activity_quarter ON buyback_activity(fiscal_quarter);
    `);

    // Dividend indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_dividends_company ON dividends(company_id);
      CREATE INDEX IF NOT EXISTS idx_dividends_exdate ON dividends(ex_dividend_date);
      CREATE INDEX IF NOT EXISTS idx_dividends_payment ON dividends(payment_date);
    `);

    // Capital allocation indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_capital_summary_company ON capital_allocation_summary(company_id);
      CREATE INDEX IF NOT EXISTS idx_capital_summary_quarter ON capital_allocation_summary(fiscal_quarter);
    `);

    // Event indexes
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_company ON significant_events(company_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON significant_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_date ON significant_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_events_significance ON significant_events(significance_score DESC);
    `);

    database.exec('COMMIT');

    console.log('Insider trading & capital allocation tables migration completed!');
    console.log('');
    console.log('Tables created:');
    console.log('  - insiders');
    console.log('  - insider_transactions');
    console.log('  - insider_activity_summary');
    console.log('  - buyback_programs');
    console.log('  - buyback_activity');
    console.log('  - dividends');
    console.log('  - capital_allocation_summary');
    console.log('  - significant_events');

    // Verify tables exist
    const tables = database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND (
        name LIKE 'insider%' OR
        name LIKE 'buyback%' OR
        name = 'dividends' OR
        name LIKE 'capital%' OR
        name = 'significant_events'
      )
      ORDER BY name
    `).all();

    console.log('');
    console.log('Verified tables:', tables.map(t => t.name).join(', '));

  } catch (error) {
    database.exec('ROLLBACK');
    console.error('Migration failed:', error.message);
    throw error;
  }
}

// Helper function to check if migration has been run
function isMigrationNeeded() {
  const database = db.getDatabase();
  const result = database.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master
    WHERE type='table' AND name='insiders'
  `).get();
  return result.count === 0;
}

// Run migration if executed directly
if (require.main === module) {
  if (isMigrationNeeded()) {
    runMigration();
  } else {
    console.log('Insider & capital allocation tables already exist. Migration skipped.');
  }
}

module.exports = { runMigration, isMigrationNeeded };
