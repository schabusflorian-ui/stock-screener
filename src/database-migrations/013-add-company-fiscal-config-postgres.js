// src/database-migrations/013-add-company-fiscal-config-postgres.js
// company_fiscal_config + fiscal_calendar for companies route and fiscalCalendar service

async function migrate(db) {
  console.log('🐘 Creating company fiscal config tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS company_fiscal_config (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
      fiscal_year_end TEXT,
      fiscal_year_end_month INTEGER,
      fiscal_year_end_day INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_company_fiscal_config_company ON company_fiscal_config(company_id)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS fiscal_calendar (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      fiscal_year INTEGER NOT NULL,
      fiscal_period TEXT NOT NULL,
      period_start DATE,
      period_end DATE,
      filed_date DATE,
      calendar_quarter INTEGER,
      calendar_year INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, fiscal_year, fiscal_period)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_company ON fiscal_calendar(company_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_period ON fiscal_calendar(period_end DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_fiscal_calendar_calendar ON fiscal_calendar(calendar_year, calendar_quarter)');

  console.log('✅ Company fiscal config tables ready.');
}

module.exports = migrate;
