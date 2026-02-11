// src/database-migrations/024-add-paper-trading-postgres.js
// Paper trading tables for PostgreSQL (enables paper trading on Railway/Postgres deployments)

async function migrate(db) {
  console.log('🐘 Creating paper trading tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      initial_capital REAL NOT NULL,
      cash_balance REAL NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_positions (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_cost REAL NOT NULL,
      current_price REAL,
      unrealized_pnl REAL,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(account_id, symbol)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_orders (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL UNIQUE,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      order_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      limit_price REAL,
      stop_price REAL,
      filled_quantity REAL DEFAULT 0,
      avg_fill_price REAL,
      status TEXT DEFAULT 'pending',
      commission REAL DEFAULT 0,
      slippage REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      filled_at TIMESTAMP,
      canceled_at TIMESTAMP,
      notes TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_trades (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      commission REAL NOT NULL,
      slippage REAL NOT NULL,
      realized_pnl REAL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_snapshots (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      portfolio_value REAL NOT NULL,
      cash_balance REAL NOT NULL,
      positions_value REAL NOT NULL,
      daily_pnl REAL,
      cumulative_pnl REAL,
      UNIQUE(account_id, snapshot_date)
    )
  `);

  await db.query('CREATE INDEX IF NOT EXISTS idx_paper_positions_account ON paper_positions(account_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_paper_orders_account ON paper_orders(account_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_paper_trades_account ON paper_trades(account_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_paper_snapshots_account ON paper_snapshots(account_id)');

  console.log('✅ Paper trading tables ready.');
}

module.exports = migrate;
