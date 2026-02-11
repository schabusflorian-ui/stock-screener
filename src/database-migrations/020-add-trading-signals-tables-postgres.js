// src/database-migrations/020-add-trading-signals-tables-postgres.js
// PostgreSQL migration: technical_signals and aggregated_signals for Trading routes
// Unique indexes use (calculated_at AT TIME ZONE 'UTC')::date so the expression is IMMUTABLE (PG requires this for index expressions).

async function migrate(db) {
  console.log('📊 Creating technical_signals and aggregated_signals tables for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS technical_signals (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      calculated_at TIMESTAMP NOT NULL,

      score REAL CHECK (score >= -1 AND score <= 1),
      confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
      signal TEXT,
      signal_strength INTEGER CHECK (signal_strength >= 1 AND signal_strength <= 5),

      rsi_14 REAL,
      rsi_score REAL,
      macd_line REAL,
      macd_signal REAL,
      macd_histogram REAL,
      macd_score REAL,
      sma_20 REAL,
      sma_50 REAL,
      sma_200 REAL,
      trend_score REAL,
      atr_14 REAL,
      volume_trend REAL,
      volume_score REAL,
      current_price REAL,
      interpretation TEXT,

      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await db.query(`DROP INDEX IF EXISTS idx_tech_signals_unique`);
  await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tech_signals_unique ON technical_signals(company_id, ((calculated_at AT TIME ZONE 'UTC')::date))`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tech_signals_symbol ON technical_signals(symbol)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tech_signals_date ON technical_signals(calculated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_tech_signals_score ON technical_signals(score DESC)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS aggregated_signals (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      calculated_at TIMESTAMP NOT NULL,

      market_regime TEXT,
      regime_confidence REAL,
      technical_score REAL,
      technical_confidence REAL,
      technical_signal TEXT,
      sentiment_score REAL,
      sentiment_confidence REAL,
      sentiment_signal TEXT,
      insider_score REAL,
      insider_confidence REAL,
      insider_signal TEXT,
      analyst_score REAL,
      analyst_confidence REAL,
      analyst_signal TEXT,
      avg_score REAL,
      weighted_score REAL,
      bullish_count INTEGER,
      bearish_count INTEGER,
      highest_confidence REAL,
      overall_signal TEXT,
      overall_strength INTEGER,
      overall_confidence REAL,
      context TEXT,

      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  try {
    await db.query(`DROP INDEX IF EXISTS idx_agg_signals_unique`);
    await db.query(`
      DELETE FROM aggregated_signals a
      USING aggregated_signals b
      WHERE a.id < b.id AND a.company_id = b.company_id AND a.calculated_at::text = b.calculated_at::text
    `);
  } catch (_) {}

  try {
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agg_signals_unique ON aggregated_signals(company_id, ((calculated_at AT TIME ZONE 'UTC')::date))`);
  } catch (e) {
    console.log('   Note: idx_agg_signals_unique skipped (duplicates or type mismatch)');
  }

  await db.query(`CREATE INDEX IF NOT EXISTS idx_agg_signals_symbol ON aggregated_signals(symbol)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_agg_signals_date ON aggregated_signals(calculated_at DESC)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_agg_signals_overall ON aggregated_signals(overall_signal)`);

  console.log('✅ technical_signals and aggregated_signals tables ready');
}

module.exports = migrate;
