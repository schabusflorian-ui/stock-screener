/**
 * Migration: Add market_indicator_history table
 *
 * Stores pre-calculated historical market indicators by quarter.
 * This eliminates the need to recalculate ~40 quarters of data on every request.
 *
 * Run: node src/database-migrations/add-market-indicator-history.js
 */

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Creating market_indicator_history table...');

  database.exec(`
    CREATE TABLE IF NOT EXISTS market_indicator_history (
      quarter TEXT PRIMARY KEY,              -- '2015-Q1', '2015-Q2', etc.
      quarter_end_date DATE,                 -- Last day of quarter

      -- Buffett Indicator (Total Market Cap / GDP)
      buffett_indicator REAL,
      buffett_market_cap REAL,               -- Total market cap in billions
      buffett_gdp REAL,                      -- GDP in billions
      buffett_stock_count INTEGER,

      -- S&P 500 P/E (cap-weighted)
      sp500_pe REAL,
      sp500_market_cap REAL,
      sp500_earnings REAL,
      sp500_company_count INTEGER,

      -- Aggregate Valuation Metrics
      median_pe REAL,
      median_pb REAL,
      median_msi REAL,                       -- Market-cap to Sales to Income
      pct_undervalued REAL,                  -- % stocks with P/E < 16
      total_stocks_analyzed INTEGER,
      undervalued_count INTEGER,

      -- Treasury Yields (for context)
      treasury_2y REAL,
      treasury_10y REAL,
      yield_spread_2s10s REAL,

      -- Metadata
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_quality TEXT                      -- 'complete', 'partial', 'estimated'
    );

    CREATE INDEX IF NOT EXISTS idx_market_indicator_quarter_date
      ON market_indicator_history(quarter_end_date);
  `);

  console.log('market_indicator_history table created successfully!');
  console.log('');
  console.log('Next step: Run the backfill script to populate historical data:');
  console.log('  node src/scripts/backfill-market-indicator-history.js');
}

// Run migration
try {
  migrate();
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
