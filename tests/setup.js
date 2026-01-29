// tests/setup.js
// Test setup and utilities for the investment project

const Database = require('better-sqlite3');
const path = require('path');

// Create an in-memory database for testing
let testDb = null;

/**
 * Get or create a test database
 * Uses in-memory SQLite for fast, isolated tests
 */
function getTestDatabase() {
  if (!testDb) {
    testDb = new Database(':memory:');
    initializeTestSchema(testDb);
  }
  return testDb;
}

/**
 * Reset the test database between tests
 */
function resetTestDatabase() {
  if (testDb) {
    testDb.close();
    testDb = null;
  }
  return getTestDatabase();
}

/**
 * Initialize the database schema for testing
 */
function initializeTestSchema(db) {
  // Companies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      sector TEXT,
      industry TEXT,
      market_cap REAL,
      exchange TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Daily prices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      price_date TEXT,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume INTEGER,
      adjusted_close REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(company_id, date)
    )
  `);

  // Portfolios table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      portfolio_type TEXT DEFAULT 'manual',
      benchmark_index_id INTEGER,
      currency TEXT DEFAULT 'USD',
      initial_cash REAL DEFAULT 0,
      initial_date TEXT,
      current_cash REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      total_deposited REAL DEFAULT 0,
      total_withdrawn REAL DEFAULT 0,
      high_water_mark REAL DEFAULT 0,
      dividend_reinvest INTEGER DEFAULT 0,
      auto_execute INTEGER DEFAULT 0,
      execution_threshold REAL DEFAULT 0.3,
      max_auto_position_pct REAL DEFAULT 0.05,
      require_confirmation INTEGER DEFAULT 1,
      auto_execute_actions TEXT DEFAULT 'buy,sell',
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Portfolio positions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      shares REAL DEFAULT 0,
      average_cost REAL DEFAULT 0,
      cost_basis REAL DEFAULT 0,
      current_value REAL DEFAULT 0,
      current_price REAL DEFAULT 0,
      unrealized_pnl REAL DEFAULT 0,
      unrealized_pnl_pct REAL DEFAULT 0,
      realized_pnl REAL DEFAULT 0,
      first_bought_at TEXT,
      last_traded_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Portfolio transactions table
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
      total_amount REAL,
      fees REAL DEFAULT 0,
      dividend_per_share REAL,
      cash_balance_after REAL,
      position_shares_after REAL,
      notes TEXT,
      order_id INTEGER,
      executed_at TEXT,
      transaction_date TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (position_id) REFERENCES portfolio_positions(id),
      FOREIGN KEY (lot_id) REFERENCES portfolio_lots(id)
    )
  `);

  // Pending executions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      recommendation_outcome_id INTEGER,
      symbol TEXT NOT NULL,
      company_id INTEGER,
      action TEXT NOT NULL,
      shares REAL,
      estimated_price REAL,
      estimated_value REAL,
      signal_score REAL,
      confidence REAL,
      regime TEXT,
      position_pct REAL,
      status TEXT DEFAULT 'pending',
      decided_at TEXT,
      decided_by TEXT,
      rejection_reason TEXT,
      executed_at TEXT,
      executed_price REAL,
      executed_shares REAL,
      notes TEXT,
      expires_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Agent recommendations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      action TEXT NOT NULL,
      score REAL,
      confidence REAL,
      regime TEXT,
      reasoning TEXT,
      signals TEXT,
      target_price REAL,
      stop_loss REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Recommendation outcomes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recommendation_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER NOT NULL,
      signal_type TEXT,
      predicted_return REAL,
      actual_return REAL,
      executed INTEGER DEFAULT 0,
      executed_at TEXT,
      executed_price REAL,
      executed_shares REAL,
      transaction_id INTEGER,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (recommendation_id) REFERENCES agent_recommendations(id)
    )
  `);

  // Market regimes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_regimes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      regime TEXT NOT NULL,
      vix_level REAL,
      trend_strength REAL,
      breadth_ratio REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Fundamental metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS fundamental_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      pe_ratio REAL,
      pb_ratio REAL,
      ps_ratio REAL,
      ev_ebitda REAL,
      debt_to_equity REAL,
      current_ratio REAL,
      roe REAL,
      roa REAL,
      profit_margin REAL,
      revenue_growth REAL,
      earnings_growth REAL,
      dividend_yield REAL,
      free_cash_flow REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      UNIQUE(company_id, date)
    )
  `);

  // Risk check history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS risk_check_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommendation_id INTEGER,
      portfolio_id INTEGER,
      company_id INTEGER,
      approved INTEGER,
      checks TEXT,
      original_position_size REAL,
      adjusted_position_size REAL,
      warnings TEXT,
      blockers TEXT,
      check_type TEXT,
      passed INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Price metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT,
      sma_20 REAL,
      sma_50 REAL,
      sma_200 REAL,
      rsi_14 REAL,
      macd REAL,
      macd_signal REAL,
      bollinger_upper REAL,
      bollinger_lower REAL,
      atr_14 REAL,
      volume_sma_20 REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Sentiment data table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sentiment_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT,
      news_sentiment REAL,
      social_sentiment REAL,
      analyst_sentiment REAL,
      overall_score REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Insider transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      transaction_date TEXT,
      insider_name TEXT,
      title TEXT,
      transaction_type TEXT,
      shares REAL,
      price REAL,
      value REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Optimized signal weights table
  db.exec(`
    CREATE TABLE IF NOT EXISTS optimized_signal_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regime TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      weight REAL NOT NULL,
      ic_value REAL,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(regime, signal_type)
    )
  `);

  // Portfolio lots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      position_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      shares_original REAL NOT NULL,
      shares_remaining REAL NOT NULL,
      shares_sold REAL DEFAULT 0,
      cost_per_share REAL NOT NULL,
      total_cost REAL NOT NULL,
      acquired_at TEXT,
      acquisition_type TEXT,
      realized_pnl REAL DEFAULT 0,
      is_closed INTEGER DEFAULT 0,
      closed_at TEXT,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (position_id) REFERENCES portfolio_positions(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Earnings dates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS earnings_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      earnings_date TEXT NOT NULL,
      estimate REAL,
      actual REAL,
      surprise REAL,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // 13F filings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS filings_13f (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      investor_id INTEGER,
      company_id INTEGER,
      quarter TEXT,
      shares REAL,
      value REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Daily analyses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      regime TEXT,
      analysis TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Dividend metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dividend_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      dividend_yield REAL,
      payout_ratio REAL,
      dividend_growth_5y REAL,
      ex_dividend_date TEXT,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Portfolio snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      total_value REAL,
      cash_value REAL,
      positions_value REAL,
      total_cost_basis REAL,
      unrealized_pnl REAL,
      realized_pnl REAL,
      total_deposited REAL,
      total_withdrawn REAL,
      positions_count INTEGER,
      benchmark_value REAL,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      UNIQUE(portfolio_id, snapshot_date)
    )
  `);

  // Portfolio orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      order_type TEXT NOT NULL,
      side TEXT NOT NULL,
      shares REAL NOT NULL,
      limit_price REAL,
      stop_price REAL,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      triggered_at TEXT,
      canceled_at TEXT,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Calculated metrics table (for TradingAgent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS calculated_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      fiscal_period TEXT,
      date TEXT,
      revenue REAL,
      net_income REAL,
      eps REAL,
      book_value REAL,
      operating_cash_flow REAL,
      free_cash_flow REAL,
      total_debt REAL,
      total_equity REAL,
      revenue_growth_yoy REAL,
      eps_growth_yoy REAL,
      gross_margin REAL,
      operating_margin REAL,
      net_margin REAL,
      roic REAL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // Trading signals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      value REAL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `);

  // ETF constituents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS etf_constituents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      weight REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Indices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS indices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Index constituents table
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_constituents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      index_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      weight REAL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Create test fixtures
 */
function createTestFixtures(db) {
  // Insert test companies
  db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, market_cap)
    VALUES (?, ?, ?, ?, ?)
  `).run('AAPL', 'Apple Inc.', 'Technology', 'Consumer Electronics', 3000000000000);

  db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, market_cap)
    VALUES (?, ?, ?, ?, ?)
  `).run('GOOGL', 'Alphabet Inc.', 'Technology', 'Internet Services', 2000000000000);

  db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, market_cap)
    VALUES (?, ?, ?, ?, ?)
  `).run('MSFT', 'Microsoft Corp.', 'Technology', 'Software', 2800000000000);

  // Insert test prices
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  db.prepare(`
    INSERT INTO daily_prices (company_id, date, price_date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, today, today, 175.0, 180.0, 174.0, 178.0, 50000000);

  db.prepare(`
    INSERT INTO daily_prices (company_id, date, price_date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(1, yesterday, yesterday, 172.0, 176.0, 171.0, 175.0, 48000000);

  db.prepare(`
    INSERT INTO daily_prices (company_id, date, price_date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(2, today, today, 140.0, 145.0, 139.0, 143.0, 30000000);

  db.prepare(`
    INSERT INTO daily_prices (company_id, date, price_date, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(3, today, today, 380.0, 390.0, 378.0, 385.0, 25000000);

  // Insert test portfolio
  db.prepare(`
    INSERT INTO portfolios (name, initial_cash, current_cash, current_value, total_deposited, auto_execute, execution_threshold, max_auto_position_pct, require_confirmation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Test Portfolio', 100000, 100000, 100000, 100000, 1, 0.3, 0.05, 0);

  // Insert test portfolio with confirmation required
  db.prepare(`
    INSERT INTO portfolios (name, initial_cash, current_cash, current_value, total_deposited, auto_execute, execution_threshold, max_auto_position_pct, require_confirmation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('Confirmation Portfolio', 100000, 100000, 100000, 100000, 1, 0.3, 0.05, 1);

  // Insert current market regime
  db.prepare(`
    INSERT INTO market_regimes (date, regime, vix_level, trend_strength, breadth_ratio)
    VALUES (?, ?, ?, ?, ?)
  `).run(today, 'BULL', 15.5, 0.7, 0.65);

  return {
    companies: {
      AAPL: { id: 1, symbol: 'AAPL', price: 178.0 },
      GOOGL: { id: 2, symbol: 'GOOGL', price: 143.0 },
      MSFT: { id: 3, symbol: 'MSFT', price: 385.0 }
    },
    portfolios: {
      test: { id: 1, name: 'Test Portfolio', cash: 100000 },
      confirmation: { id: 2, name: 'Confirmation Portfolio', cash: 100000 }
    }
  };
}

// Export utilities
module.exports = {
  getTestDatabase,
  resetTestDatabase,
  initializeTestSchema,
  createTestFixtures
};
