// src/database-migrations/add-price-metrics.js
// Adds price_metrics table required by sector analysis and other services
// SectorAnalysisService LEFT JOINs price_metrics for market_cap_usd, last_price, change_*, high_52w, low_52w

async function migrate(db) {
  console.log('📊 Creating price_metrics table...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS price_metrics (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

      date DATE,
      last_price NUMERIC,
      market_cap NUMERIC,
      market_cap_usd NUMERIC,

      change_1d NUMERIC,
      change_1w NUMERIC,
      change_1m NUMERIC,
      change_ytd NUMERIC,
      change_1y NUMERIC,
      high_52w NUMERIC,
      low_52w NUMERIC,

      sma_20 NUMERIC,
      sma_50 NUMERIC,
      sma_200 NUMERIC,
      rsi_14 NUMERIC,
      macd NUMERIC,
      macd_signal NUMERIC,
      bollinger_upper NUMERIC,
      bollinger_lower NUMERIC,
      atr_14 NUMERIC,
      volume_sma_20 NUMERIC,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(company_id)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_price_metrics_company ON price_metrics(company_id);
  `);

  console.log('  ✓ price_metrics table created');
}

module.exports = migrate;
