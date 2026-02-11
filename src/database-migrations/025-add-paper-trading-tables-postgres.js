// src/database-migrations/025-add-paper-trading-tables-postgres.js
// PostgreSQL migration: paper trading tables (paper_accounts, positions, orders, trades, snapshots)

async function migrate(db) {
  console.log('📊 Creating paper trading tables for PostgreSQL...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      initial_capital DOUBLE PRECISION NOT NULL,
      cash_balance DOUBLE PRECISION NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_positions (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL,
      avg_cost DOUBLE PRECISION NOT NULL,
      current_price DOUBLE PRECISION,
      unrealized_pnl DOUBLE PRECISION,
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
      quantity DOUBLE PRECISION NOT NULL,
      limit_price DOUBLE PRECISION,
      stop_price DOUBLE PRECISION,
      filled_quantity DOUBLE PRECISION DEFAULT 0,
      avg_fill_price DOUBLE PRECISION,
      status TEXT DEFAULT 'pending',
      commission DOUBLE PRECISION DEFAULT 0,
      slippage DOUBLE PRECISION DEFAULT 0,
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
      quantity DOUBLE PRECISION NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      commission DOUBLE PRECISION NOT NULL,
      slippage DOUBLE PRECISION NOT NULL,
      realized_pnl DOUBLE PRECISION,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS paper_snapshots (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
      snapshot_date DATE NOT NULL,
      portfolio_value DOUBLE PRECISION NOT NULL,
      cash_balance DOUBLE PRECISION NOT NULL,
      positions_value DOUBLE PRECISION NOT NULL,
      daily_pnl DOUBLE PRECISION,
      cumulative_pnl DOUBLE PRECISION,
      UNIQUE(account_id, snapshot_date)
    )
  `);

  await db.query(`CREATE INDEX IF NOT EXISTS idx_paper_positions_account ON paper_positions(account_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_paper_orders_account ON paper_orders(account_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_paper_trades_account ON paper_trades(account_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_paper_snapshots_account ON paper_snapshots(account_id)`);

  console.log('   paper_accounts, paper_positions, paper_orders, paper_trades, paper_snapshots created');
}

module.exports = { migrate };
