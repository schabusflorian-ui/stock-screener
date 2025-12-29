// src/database-migrations/add-portfolio-tables.js
// Database migration for portfolio management system

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Starting portfolio tables migration...');

// ============================================
// TABLE 1: Portfolios
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    portfolio_type TEXT DEFAULT 'manual',
    benchmark_index_id INTEGER,
    currency TEXT DEFAULT 'USD',
    initial_cash REAL DEFAULT 0,
    initial_date DATE,
    current_cash REAL DEFAULT 0,
    current_value REAL DEFAULT 0,
    total_deposited REAL DEFAULT 0,
    total_withdrawn REAL DEFAULT 0,
    clone_investor_id INTEGER,
    is_archived INTEGER DEFAULT 0,
    dividend_reinvest INTEGER DEFAULT 0,
    high_water_mark REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (benchmark_index_id) REFERENCES stock_indexes(id)
  )
`);
console.log('Created portfolios table');

// ============================================
// TABLE 2: Portfolio Positions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    shares REAL NOT NULL DEFAULT 0,
    average_cost REAL,
    current_price REAL,
    current_value REAL,
    cost_basis REAL,
    unrealized_pnl REAL,
    unrealized_pnl_pct REAL,
    realized_pnl REAL DEFAULT 0,
    total_dividends REAL DEFAULT 0,
    first_bought_at DATETIME,
    last_traded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    UNIQUE(portfolio_id, company_id)
  )
`);
console.log('Created portfolio_positions table');

// ============================================
// TABLE 3: Portfolio Lots (Tax Lot Tracking)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    position_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    shares_original REAL NOT NULL,
    shares_remaining REAL NOT NULL,
    cost_per_share REAL NOT NULL,
    total_cost REAL NOT NULL,
    acquired_at DATETIME NOT NULL,
    acquisition_type TEXT DEFAULT 'buy',
    shares_sold REAL DEFAULT 0,
    realized_pnl REAL DEFAULT 0,
    is_closed INTEGER DEFAULT 0,
    closed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (position_id) REFERENCES portfolio_positions(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id)
  )
`);
console.log('Created portfolio_lots table');

// ============================================
// TABLE 4: Portfolio Transactions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    company_id INTEGER,
    position_id INTEGER,
    lot_id INTEGER,
    transaction_type TEXT NOT NULL,
    shares REAL,
    price_per_share REAL,
    total_amount REAL NOT NULL,
    fees REAL DEFAULT 0,
    dividend_per_share REAL,
    cash_balance_after REAL,
    position_shares_after REAL,
    notes TEXT,
    order_id INTEGER,
    executed_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (position_id) REFERENCES portfolio_positions(id),
    FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id),
    FOREIGN KEY (order_id) REFERENCES portfolio_orders(id)
  )
`);
console.log('Created portfolio_transactions table');

// ============================================
// TABLE 5: Portfolio Orders (Standing Orders)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    position_id INTEGER,
    order_type TEXT NOT NULL,
    order_side TEXT NOT NULL,
    trigger_price REAL NOT NULL,
    trigger_comparison TEXT DEFAULT 'lte',
    limit_price REAL,
    trailing_pct REAL,
    trailing_high_price REAL,
    trailing_trigger_price REAL,
    shares REAL,
    shares_pct REAL,
    valid_until DATE,
    status TEXT DEFAULT 'active',
    triggered_at DATETIME,
    triggered_price REAL,
    execution_transaction_id INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (position_id) REFERENCES portfolio_positions(id)
  )
`);
console.log('Created portfolio_orders table');

// ============================================
// TABLE 6: Portfolio Snapshots (for historical tracking)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    total_value REAL NOT NULL,
    cash_value REAL NOT NULL,
    positions_value REAL NOT NULL,
    total_cost_basis REAL,
    unrealized_pnl REAL,
    realized_pnl REAL,
    total_deposited REAL,
    total_withdrawn REAL,
    positions_count INTEGER,
    benchmark_value REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
    UNIQUE(portfolio_id, snapshot_date)
  )
`);
console.log('Created portfolio_snapshots table');

// ============================================
// Indexes
// ============================================
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_positions_portfolio ON portfolio_positions(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_positions_company ON portfolio_positions(company_id);
  CREATE INDEX IF NOT EXISTS idx_lots_position ON portfolio_lots(position_id, is_closed);
  CREATE INDEX IF NOT EXISTS idx_lots_portfolio ON portfolio_lots(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_lots_open ON portfolio_lots(is_closed, acquired_at);
  CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON portfolio_transactions(portfolio_id, executed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON portfolio_transactions(transaction_type);
  CREATE INDEX IF NOT EXISTS idx_orders_active ON portfolio_orders(status, company_id);
  CREATE INDEX IF NOT EXISTS idx_orders_portfolio ON portfolio_orders(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_snapshots_portfolio ON portfolio_snapshots(portfolio_id, snapshot_date DESC);
`);
console.log('Created indexes');

db.close();
console.log('Portfolio tables migration completed successfully!');
