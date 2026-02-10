// src/database-migrations/add-dividend-metrics.js
// Adds dividend_metrics table required by capital allocation API routes
// Used by: /api/capital/dividends-by-sector, /api/capital/stats, dividend screens, etc.

async function migrate(db) {
  console.log('📊 Creating dividend_metrics table...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS dividend_metrics (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

      current_annual_dividend NUMERIC,
      dividend_yield NUMERIC,
      payout_ratio NUMERIC,

      dividend_growth_1y NUMERIC,
      dividend_growth_3y NUMERIC,
      dividend_growth_5y NUMERIC,
      dividend_growth_10y NUMERIC,
      years_of_growth NUMERIC,

      last_increase_date TEXT,
      last_increase_pct NUMERIC,
      dividend_frequency TEXT,
      ex_dividend_date TEXT,

      is_dividend_aristocrat INTEGER DEFAULT 0,
      is_dividend_king INTEGER DEFAULT 0,

      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(company_id)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dividend_metrics_company ON dividend_metrics(company_id);
    CREATE INDEX IF NOT EXISTS idx_dividend_metrics_yield ON dividend_metrics(dividend_yield DESC) WHERE dividend_yield > 0;
    CREATE INDEX IF NOT EXISTS idx_dividend_metrics_aristocrat ON dividend_metrics(is_dividend_aristocrat) WHERE is_dividend_aristocrat = 1;
    CREATE INDEX IF NOT EXISTS idx_dividend_metrics_king ON dividend_metrics(is_dividend_king) WHERE is_dividend_king = 1;
  `);

  console.log('  ✓ dividend_metrics table created');
}

module.exports = migrate;
