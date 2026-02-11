// src/database-migrations/014-add-portfolio-positions-postgres.js
// portfolio_positions + portfolio_lots for autoExecutor and portfolio services

async function migrate(db) {
  console.log('🐘 Creating portfolio positions tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      shares REAL NOT NULL DEFAULT 0,
      average_cost REAL,
      current_price REAL,
      current_value REAL,
      cost_basis REAL,
      unrealized_pnl REAL,
      unrealized_pnl_pct REAL,
      realized_pnl REAL DEFAULT 0,
      total_dividends REAL DEFAULT 0,
      first_bought_at TIMESTAMP,
      last_traded_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(portfolio_id, company_id)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON portfolio_positions(portfolio_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_positions_company ON portfolio_positions(company_id)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS portfolio_lots (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      position_id INTEGER NOT NULL REFERENCES portfolio_positions(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      shares_original REAL NOT NULL,
      shares_remaining REAL NOT NULL,
      cost_per_share REAL NOT NULL,
      total_cost REAL NOT NULL,
      acquired_at TIMESTAMP NOT NULL,
      acquisition_type TEXT DEFAULT 'buy',
      shares_sold REAL DEFAULT 0,
      realized_pnl REAL DEFAULT 0,
      is_closed INTEGER DEFAULT 0,
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_lots_position ON portfolio_lots(position_id, is_closed)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_lots_portfolio ON portfolio_lots(portfolio_id)');

  console.log('✅ Portfolio positions tables ready.');
}

module.exports = migrate;
