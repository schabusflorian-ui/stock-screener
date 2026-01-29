#!/usr/bin/env node
// src/database-migrations/fix-investor-holdings-duplicates.js
// Fix duplicate holdings rows that were created during historical backfill

const db = require('../database').db;

console.log('🔧 Fixing investor holdings duplicates...\n');

// Step 1: Check current state
console.log('📊 Step 1: Analyzing current duplication...');
const beforeStats = db.prepare(`
  SELECT
    COUNT(*) as total_rows,
    COUNT(DISTINCT investor_id || '|' || report_date || '|' || cusip || '|' || COALESCE(option_type,'')) as unique_holdings
  FROM investor_holdings
`).get();
console.log(`   Total rows: ${beforeStats.total_rows.toLocaleString()}`);
console.log(`   Unique holdings: ${beforeStats.unique_holdings.toLocaleString()}`);
console.log(`   Duplication ratio: ${(beforeStats.total_rows / beforeStats.unique_holdings).toFixed(2)}x\n`);

// Step 2: Create consolidated table
console.log('📊 Step 2: Creating consolidated holdings table...');
db.exec(`
  DROP TABLE IF EXISTS investor_holdings_new;

  CREATE TABLE investor_holdings_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,
    company_id INTEGER,
    filing_date DATE NOT NULL,
    report_date DATE,
    cusip TEXT,
    security_name TEXT,
    shares REAL NOT NULL,
    market_value REAL NOT NULL,
    portfolio_weight REAL,
    prev_shares REAL,
    shares_change REAL,
    shares_change_pct REAL,
    value_change REAL,
    change_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    option_type TEXT,
    title_of_class TEXT,
    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

// Step 3: Insert consolidated data
console.log('📊 Step 3: Consolidating duplicate rows...');
db.exec(`
  INSERT INTO investor_holdings_new (
    investor_id, company_id, filing_date, report_date, cusip,
    security_name, shares, market_value, portfolio_weight,
    prev_shares, shares_change, shares_change_pct, value_change,
    change_type, created_at, option_type, title_of_class
  )
  SELECT
    investor_id,
    MAX(company_id) as company_id,
    filing_date,
    report_date,
    cusip,
    MAX(security_name) as security_name,
    SUM(shares) as shares,
    SUM(market_value) as market_value,
    NULL as portfolio_weight,
    SUM(prev_shares) as prev_shares,
    SUM(shares_change) as shares_change,
    NULL as shares_change_pct,
    SUM(value_change) as value_change,
    MAX(change_type) as change_type,
    MIN(created_at) as created_at,
    option_type,
    MAX(title_of_class) as title_of_class
  FROM investor_holdings
  GROUP BY investor_id, filing_date, report_date, cusip, option_type;
`);

// Check consolidated count
const consolidatedCount = db.prepare('SELECT COUNT(*) as count FROM investor_holdings_new').get();
console.log(`   Consolidated to ${consolidatedCount.count.toLocaleString()} rows\n`);

// Step 4: Recreate indexes
console.log('📊 Step 4: Recreating indexes...');
db.exec(`
  CREATE INDEX idx_holdings_new_lookup ON investor_holdings_new(investor_id, filing_date DESC);
  CREATE INDEX idx_holdings_new_company ON investor_holdings_new(company_id, filing_date DESC);
  CREATE INDEX idx_holdings_new_change ON investor_holdings_new(investor_id, change_type);
  CREATE INDEX idx_holdings_new_cusip ON investor_holdings_new(cusip);
  CREATE INDEX idx_holdings_new_report_date ON investor_holdings_new(investor_id, report_date DESC);
  CREATE INDEX idx_holdings_new_cusip_option ON investor_holdings_new(investor_id, cusip, option_type, filing_date);
`);

// Step 5: Swap tables (need to drop dependent views first)
console.log('📊 Step 5: Swapping tables...');
db.exec(`
  DROP VIEW IF EXISTS investor_holdings_stocks_only;
  DROP VIEW IF EXISTS investor_holdings_options_only;
  DROP TABLE investor_holdings;
  ALTER TABLE investor_holdings_new RENAME TO investor_holdings;
`);

// Recreate the views
db.exec(`
  CREATE VIEW investor_holdings_stocks_only AS
  SELECT * FROM investor_holdings WHERE option_type IS NULL;

  CREATE VIEW investor_holdings_options_only AS
  SELECT * FROM investor_holdings WHERE option_type IS NOT NULL;
`);

// Step 6: Update investor_filings.total_value
console.log('📊 Step 6: Recalculating investor_filings totals...');
const updateTotals = db.prepare(`
  UPDATE investor_filings
  SET
    total_value = (
      SELECT COALESCE(SUM(market_value), 0)
      FROM investor_holdings ih
      WHERE ih.investor_id = investor_filings.investor_id
        AND ih.report_date = investor_filings.report_date
    ),
    positions_count = (
      SELECT COUNT(DISTINCT cusip || COALESCE(option_type, ''))
      FROM investor_holdings ih
      WHERE ih.investor_id = investor_filings.investor_id
        AND ih.report_date = investor_filings.report_date
    )
`);
const updateResult = updateTotals.run();
console.log(`   Updated ${updateResult.changes} filing records\n`);

// Step 7: Verify fix for Warren Buffett
console.log('📊 Step 7: Verifying fix (Warren Buffett)...');
const verification = db.prepare(`
  SELECT
    report_date,
    COUNT(*) as rows,
    COUNT(DISTINCT cusip) as positions,
    ROUND(SUM(market_value)/1e9, 2) as value_billions
  FROM investor_holdings
  WHERE investor_id = 1
  GROUP BY report_date
  ORDER BY report_date DESC
  LIMIT 5
`).all();

console.log('   Report Date  | Rows | Positions | Value (B)');
console.log('   -------------|------|-----------|----------');
for (const row of verification) {
  console.log(`   ${row.report_date} | ${String(row.rows).padStart(4)} | ${String(row.positions).padStart(9)} | $${row.value_billions}`);
}

// Check investor_filings
const filingsCheck = db.prepare(`
  SELECT report_date, ROUND(total_value/1e9, 2) as value_billions, positions_count
  FROM investor_filings
  WHERE investor_id = 1
  ORDER BY report_date DESC
  LIMIT 5
`).all();

console.log('\n   investor_filings totals:');
console.log('   Report Date  | Value (B) | Positions');
console.log('   -------------|-----------|----------');
for (const row of filingsCheck) {
  console.log(`   ${row.report_date} | $${String(row.value_billions).padStart(8)} | ${row.positions_count}`);
}

// Final stats
console.log('\n✅ Fix complete!');
console.log(`   Reduced from ${beforeStats.total_rows.toLocaleString()} to ${consolidatedCount.count.toLocaleString()} rows`);
console.log(`   Compression ratio: ${(beforeStats.total_rows / consolidatedCount.count).toFixed(2)}x`);
