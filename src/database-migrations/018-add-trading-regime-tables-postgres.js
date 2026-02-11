// src/database-migrations/018-add-trading-regime-tables-postgres.js
// PostgreSQL migration: market_regimes table for RegimeDetector

async function migrate(db) {
  console.log('📊 Creating market_regimes table for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS market_regimes (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL UNIQUE,
      regime TEXT NOT NULL CHECK (regime IN ('BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS')),
      confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

      vix REAL,
      breadth_pct REAL,
      sma_spread REAL,
      volatility_20d REAL,
      spy_price REAL,
      spy_sma20 REAL,
      spy_sma50 REAL,
      spy_sma200 REAL,
      trend_strength REAL,
      description TEXT,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_regimes_date ON market_regimes(date DESC);
    CREATE INDEX IF NOT EXISTS idx_regimes_regime ON market_regimes(regime);
  `);

  console.log('✅ market_regimes table ready');
}

module.exports = migrate;
