/**
 * Database Migration: Add market indices and prices tables (PostgreSQL)
 *
 * Creates:
 * 1. market_indices - Market index metadata (SPY, QQQ, etc.)
 * 2. market_index_prices - Daily price data for market indices
 *
 * These tables are referenced by:
 * - src/api/routes/indices.js (alpha timeseries calculation)
 * - src/services/indexService.js (index tracking)
 * - src/services/portfolio/*.js (benchmark comparison)
 */

async function up(db) {
  console.log('🔄 Running migration: 005-add-market-indices-tables');

  const query = (sql, params = []) => (db.query ? db.query(sql, params) : db.raw.query(sql, params));

  // ============================================
  // TABLE: market_indices
  // ============================================
  await query(`
    CREATE TABLE IF NOT EXISTS market_indices (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(255) NOT NULL,
      short_name VARCHAR(100),
      index_type VARCHAR(50) DEFAULT 'market',
      region VARCHAR(50) DEFAULT 'US',
      currency VARCHAR(3) DEFAULT 'USD',
      is_primary BOOLEAN DEFAULT FALSE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('✓ Created market_indices table');

  await query('CREATE INDEX IF NOT EXISTS idx_market_indices_symbol ON market_indices(symbol)');
  await query('CREATE INDEX IF NOT EXISTS idx_market_indices_type ON market_indices(index_type)');
  await query('CREATE INDEX IF NOT EXISTS idx_market_indices_primary ON market_indices(is_primary) WHERE is_primary = TRUE');

  // ============================================
  // TABLE: market_index_prices
  // ============================================
  await query(`
    CREATE TABLE IF NOT EXISTS market_index_prices (
      id SERIAL PRIMARY KEY,
      index_id INTEGER NOT NULL REFERENCES market_indices(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      open NUMERIC(12, 4),
      high NUMERIC(12, 4),
      low NUMERIC(12, 4),
      close NUMERIC(12, 4) NOT NULL,
      volume BIGINT,
      adjusted_close NUMERIC(12, 4),
      data_source VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(index_id, date)
    )
  `);

  console.log('✓ Created market_index_prices table');

  await query('CREATE INDEX IF NOT EXISTS idx_market_index_prices_index_date ON market_index_prices(index_id, date DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_market_index_prices_date ON market_index_prices(date DESC)');

  // ============================================
  // Seed default market indices
  // ============================================
  const indices = [
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', short_name: 'S&P 500', type: 'market', region: 'US', primary: true },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', short_name: 'NASDAQ 100', type: 'market', region: 'US', primary: false },
    { symbol: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', short_name: 'Dow Jones', type: 'market', region: 'US', primary: false },
    { symbol: 'IWM', name: 'iShares Russell 2000 ETF', short_name: 'Russell 2000', type: 'market', region: 'US', primary: false },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', short_name: 'Total Market', type: 'market', region: 'US', primary: false },
    
    // Sector ETFs
    { symbol: 'XLK', name: 'Technology Select Sector SPDR Fund', short_name: 'Tech', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLF', name: 'Financial Select Sector SPDR Fund', short_name: 'Financials', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLV', name: 'Health Care Select Sector SPDR Fund', short_name: 'Healthcare', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLE', name: 'Energy Select Sector SPDR Fund', short_name: 'Energy', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLY', name: 'Consumer Discretionary Select Sector SPDR', short_name: 'Consumer Disc', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLP', name: 'Consumer Staples Select Sector SPDR', short_name: 'Consumer Staples', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLI', name: 'Industrial Select Sector SPDR Fund', short_name: 'Industrials', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLB', name: 'Materials Select Sector SPDR Fund', short_name: 'Materials', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLU', name: 'Utilities Select Sector SPDR Fund', short_name: 'Utilities', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLRE', name: 'Real Estate Select Sector SPDR Fund', short_name: 'Real Estate', type: 'sector', region: 'US', primary: false },
    { symbol: 'XLC', name: 'Communication Services Select Sector SPDR', short_name: 'Communications', type: 'sector', region: 'US', primary: false },
    
    // Style indices
    { symbol: 'IVW', name: 'iShares S&P 500 Growth ETF', short_name: 'Growth', type: 'style', region: 'US', primary: false },
    { symbol: 'IVE', name: 'iShares S&P 500 Value ETF', short_name: 'Value', type: 'style', region: 'US', primary: false },
    
    // International
    { symbol: 'EFA', name: 'iShares MSCI EAFE ETF', short_name: 'Developed Markets', type: 'international', region: 'Global', primary: false },
    { symbol: 'EEM', name: 'iShares MSCI Emerging Markets ETF', short_name: 'Emerging Markets', type: 'international', region: 'Global', primary: false }
  ];

  for (const idx of indices) {
    await query(
      `INSERT INTO market_indices (symbol, name, short_name, index_type, region, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (symbol) DO NOTHING`,
      [idx.symbol, idx.name, idx.short_name, idx.type, idx.region, idx.primary]
    );
  }

  console.log(`✓ Seeded ${indices.length} market indices`);

  // Ensure SPY exists in companies (alpha calculation fallback)
  await query(`
    INSERT INTO companies (symbol, name, exchange, type, country, created_at)
    VALUES ('SPY', 'SPDR S&P 500 ETF Trust', 'NYSE Arca', 'ETF', 'US', CURRENT_TIMESTAMP)
    ON CONFLICT (symbol) DO NOTHING
  `);
  
  console.log('✓ Ensured SPY exists in companies table');
  console.log('');
  console.log('🎉 Migration complete: 005-add-market-indices-tables');
  console.log('');
  console.log('⚠️  IMPORTANT: Run index price backfill to populate market_index_prices:');
  console.log('   - SPY price data is required for alpha calculations');
  console.log('   - Use the price fetcher service to backfill historical data');
}

async function down(db) {
  console.log('🔄 Rolling back migration: 005-add-market-indices-tables');
  
  await db.exec('DROP TABLE IF EXISTS market_index_prices CASCADE');
  await db.exec('DROP TABLE IF EXISTS market_indices CASCADE');
  
  console.log('✓ Rolled back 005-add-market-indices-tables');
}

// Runner expects migrate(db) or migration.run(db)
module.exports = async (db) => up(db);
module.exports.up = up;
module.exports.down = down;
