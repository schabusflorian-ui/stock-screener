// src/database-migrations/add-backfill-tracking.js
// Database migration for historical investor backfill tracking

const db = require('../database').db;

console.log('📊 Running backfill tracking migration...');

// ============================================
// TABLE: Backfill Progress (for resumability)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS backfill_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL UNIQUE,
    last_accession_number TEXT,
    last_filing_date DATE,
    filings_processed INTEGER DEFAULT 0,
    filings_total INTEGER,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_backfill_progress_status ON backfill_progress(status);
`);

console.log('✅ Created backfill_progress table');

// ============================================
// TABLE: CUSIP Price Gaps
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS cusip_price_gaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cusip TEXT NOT NULL UNIQUE,
    company_id INTEGER,
    symbol TEXT,
    earliest_holding_date DATE,
    price_data_starts DATE,
    gap_days INTEGER,
    backfill_status TEXT DEFAULT 'pending',
    backfill_attempted_at DATETIME,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_cusip_price_gaps_status ON cusip_price_gaps(backfill_status);
  CREATE INDEX IF NOT EXISTS idx_cusip_price_gaps_company ON cusip_price_gaps(company_id);
`);

console.log('✅ Created cusip_price_gaps table');

// ============================================
// INDEXES: Optimize historical queries
// ============================================
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_filings_accession
    ON investor_filings(investor_id, accession_number);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_report_date
    ON investor_holdings(investor_id, report_date DESC);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_investor_holdings_cusip_investor
    ON investor_holdings(investor_id, cusip, filing_date);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_daily_prices_company_date_range
    ON daily_prices(company_id, date);
`);

console.log('✅ Created optimized indexes for historical queries');

console.log('🎉 Backfill tracking migration completed');
