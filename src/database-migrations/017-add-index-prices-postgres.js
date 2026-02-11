// src/database-migrations/017-add-index-prices-postgres.js
// index_prices for benchmark comparison (e.g. outcome calculator SPY fallback)

async function migrate(db) {
  console.log('🐘 Creating index_prices table (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS index_prices (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT,
      index_type TEXT DEFAULT 'market',

      last_price REAL,
      last_price_date DATE,
      high_52w REAL,
      low_52w REAL,
      change_1d REAL,
      change_1w REAL,
      change_1m REAL,
      change_3m REAL,
      change_6m REAL,
      change_1y REAL,
      change_ytd REAL,
      sma_50 REAL,
      sma_200 REAL,
      rsi_14 REAL,

      is_primary INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_index_prices_symbol ON index_prices(symbol)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_index_prices_type ON index_prices(index_type)');

  console.log('✅ index_prices table ready.');
}

module.exports = migrate;
