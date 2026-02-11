// src/database-migrations/018-add-congressional-postgres.js
// congressional_politicians + congressional_trades for Quiver/alt-data and congressional API

async function migrate(db) {
  console.log('🐘 Creating congressional_politicians and congressional_trades (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS congressional_politicians (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT,
      state TEXT,
      party TEXT,
      chamber TEXT,
      district TEXT,
      in_office INTEGER DEFAULT 1,
      track_record_score REAL,
      total_trades INTEGER DEFAULT 0,
      avg_return_30d REAL,
      avg_return_90d REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(name, chamber)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_politicians_name ON congressional_politicians(name)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_politicians_track ON congressional_politicians(track_record_score DESC NULLS LAST)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS congressional_trades (
      id SERIAL PRIMARY KEY,
      politician_id INTEGER REFERENCES congressional_politicians(id) ON DELETE SET NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      ticker TEXT NOT NULL,
      transaction_date DATE NOT NULL,
      filing_date DATE,
      transaction_type TEXT NOT NULL,
      asset_type TEXT,
      amount_min INTEGER,
      amount_max INTEGER,
      asset_description TEXT,
      amount_range TEXT,
      source TEXT DEFAULT 'quiver',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unq_congressional_trades_upsert
    ON congressional_trades (politician_id, transaction_date, COALESCE(asset_description, ''), COALESCE(amount_range, ''))
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_trades_politician ON congressional_trades(politician_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_trades_company ON congressional_trades(company_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_trades_date ON congressional_trades(transaction_date DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_trades_ticker ON congressional_trades(ticker)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_congressional_trades_type ON congressional_trades(transaction_type)');

  console.log('✅ congressional_politicians and congressional_trades ready.');
}

module.exports = migrate;
