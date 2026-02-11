// src/database-migrations/012-add-company-data-freshness-postgres.js
// update_history + company_data_freshness for update tracking and updates route

async function migrate(db) {
  console.log('🐘 Creating update tracking tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS update_history (
      id SERIAL PRIMARY KEY,
      update_type TEXT NOT NULL,
      quarter TEXT,
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMP,
      status TEXT DEFAULT 'running',
      companies_checked INTEGER DEFAULT 0,
      companies_updated INTEGER DEFAULT 0,
      records_added INTEGER DEFAULT 0,
      records_updated INTEGER DEFAULT 0,
      records_skipped INTEGER DEFAULT 0,
      error_message TEXT,
      details TEXT
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_history_status ON update_history(status)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_update_history_quarter ON update_history(quarter)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_data_freshness (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      cik TEXT NOT NULL,
      symbol TEXT,
      latest_filing_date TEXT,
      latest_10k_date TEXT,
      latest_10q_date TEXT,
      latest_10k_period TEXT,
      latest_10q_period TEXT,
      last_checked_at TIMESTAMP,
      last_updated_at TIMESTAMP,
      needs_update INTEGER DEFAULT 0,
      pending_filings TEXT
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_freshness_needs_update ON company_data_freshness(needs_update)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_freshness_cik ON company_data_freshness(cik)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_freshness_symbol ON company_data_freshness(symbol)');

  console.log('✅ Update tracking tables ready.');
}

module.exports = migrate;
