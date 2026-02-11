// src/database-migrations/010-add-market-indicator-history-postgres.js
// market_indicator_history for analytics bundle (Buffett indicator, S&P P/E, etc.)

async function migrate(db) {
  console.log('🐘 Creating market_indicator_history table (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS market_indicator_history (
      quarter TEXT PRIMARY KEY,
      quarter_end_date DATE,
      buffett_indicator REAL,
      buffett_market_cap REAL,
      buffett_gdp REAL,
      buffett_stock_count INTEGER,
      sp500_pe REAL,
      sp500_market_cap REAL,
      sp500_earnings REAL,
      sp500_company_count INTEGER,
      median_pe REAL,
      median_pb REAL,
      median_msi REAL,
      pct_undervalued REAL,
      total_stocks_analyzed INTEGER,
      undervalued_count INTEGER,
      treasury_2y REAL,
      treasury_10y REAL,
      yield_spread_2s10s REAL,
      calculated_at TIMESTAMP DEFAULT NOW(),
      data_quality TEXT
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_market_indicator_quarter_date ON market_indicator_history(quarter_end_date)');

  console.log('✅ market_indicator_history ready.');
}

module.exports = migrate;
