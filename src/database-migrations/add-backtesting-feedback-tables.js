// src/database-migrations/add-backtesting-feedback-tables.js
// Adds tables for HF-style backtesting feedback loop integration
// Used by: OutcomeUpdater, SignalOptimizer, RiskManager, TradingAgent

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('🔄 Adding backtesting feedback tables...');

  // 1. Signal IC Summary - stores daily IC analysis from backtesting
  database.exec(`
    CREATE TABLE IF NOT EXISTS signal_ic_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL UNIQUE,
      optimal_horizon INTEGER,
      optimal_ic REAL,
      decay_rate REAL,
      is_significant INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_signal_ic_summary_type ON signal_ic_summary(signal_type);
  `);
  console.log('  ✓ Created signal_ic_summary table');

  // 2. Portfolio Capacity Constraints - stores capacity analysis for position sizing
  database.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_capacity_constraints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL UNIQUE,
      estimated_capacity REAL,
      scalability_ratio REAL,
      liquidity_score REAL,
      illiquid_positions INTEGER DEFAULT 0,
      constraints_json TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

    CREATE INDEX IF NOT EXISTS idx_portfolio_capacity_portfolio ON portfolio_capacity_constraints(portfolio_id);
  `);
  console.log('  ✓ Created portfolio_capacity_constraints table');

  // 3. Alpha Validation Results - stores alpha validation from backtesting
  database.exec(`
    CREATE TABLE IF NOT EXISTS alpha_validation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      benchmark TEXT DEFAULT 'SPY',
      start_date TEXT,
      end_date TEXT,
      alpha REAL,
      alpha_t_stat REAL,
      alpha_p_value REAL,
      alpha_significant INTEGER DEFAULT 0,
      beta REAL,
      sharpe_ratio REAL,
      deflated_sharpe REAL,
      deflated_sharpe_p_value REAL,
      bootstrap_alpha_lower REAL,
      bootstrap_alpha_upper REAL,
      bootstrap_sharpe_lower REAL,
      bootstrap_sharpe_upper REAL,
      n_bootstrap INTEGER,
      min_track_record_months INTEGER,
      information_ratio REAL,
      tracking_error REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id)
    );

    CREATE INDEX IF NOT EXISTS idx_alpha_validation_portfolio ON alpha_validation_results(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_alpha_validation_date ON alpha_validation_results(created_at);
  `);
  console.log('  ✓ Created alpha_validation_results table');

  // 4. Risk Check History - enhanced with stress test data
  // Check if column exists before adding
  try {
    database.exec(`
      ALTER TABLE risk_check_history ADD COLUMN stress_test_result TEXT;
    `);
    console.log('  ✓ Added stress_test_result column to risk_check_history');
  } catch (e) {
    // Column likely already exists
    console.log('  ⏭ stress_test_result column already exists');
  }

  // 5. Ensure optimized_signal_weights has all needed columns
  try {
    // Check if table exists
    const tableExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='optimized_signal_weights'
    `).get();

    if (!tableExists) {
      database.exec(`
        CREATE TABLE optimized_signal_weights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          regime TEXT NOT NULL UNIQUE,
          technical_weight REAL DEFAULT 0.12,
          sentiment_weight REAL DEFAULT 0.12,
          insider_weight REAL DEFAULT 0.12,
          fundamental_weight REAL DEFAULT 0.15,
          alternative_weight REAL DEFAULT 0.12,
          valuation_weight REAL DEFAULT 0.12,
          filing_13f_weight REAL DEFAULT 0.13,
          earnings_weight REAL DEFAULT 0.12,
          lookback_days INTEGER DEFAULT 90,
          avg_ic REAL,
          calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          valid_until DATETIME
        );

        CREATE INDEX IF NOT EXISTS idx_optimized_weights_regime ON optimized_signal_weights(regime);
      `);
      console.log('  ✓ Created optimized_signal_weights table');

      // Insert default weights for each regime
      const insertStmt = database.prepare(`
        INSERT OR IGNORE INTO optimized_signal_weights (regime) VALUES (?)
      `);
      ['BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'].forEach(regime => {
        insertStmt.run(regime);
      });
      console.log('  ✓ Inserted default regime weights');
    } else {
      console.log('  ⏭ optimized_signal_weights table already exists');
    }
  } catch (e) {
    console.log('  ⚠ Could not create optimized_signal_weights:', e.message);
  }

  // 6. Signal performance tracking for IC calculation
  try {
    const tableExists = database.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='trading_signal_history'
    `).get();

    if (!tableExists) {
      database.exec(`
        CREATE TABLE trading_signal_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          company_id INTEGER,
          date TEXT NOT NULL,
          signal_type TEXT NOT NULL,
          signal_value REAL,
          regime TEXT,
          forward_return_1d REAL,
          forward_return_5d REAL,
          forward_return_21d REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (company_id) REFERENCES companies(id)
        );

        CREATE INDEX IF NOT EXISTS idx_trading_signal_symbol ON trading_signal_history(symbol, date);
        CREATE INDEX IF NOT EXISTS idx_trading_signal_type ON trading_signal_history(signal_type, date);
      `);
      console.log('  ✓ Created trading_signal_history table');
    } else {
      console.log('  ⏭ trading_signal_history table already exists');
    }
  } catch (e) {
    console.log('  ⚠ Could not create trading_signal_history:', e.message);
  }

  console.log('✅ Backtesting feedback tables migration complete');
}

// Run if called directly
if (require.main === module) {
  migrate();
  process.exit(0);
}

module.exports = { migrate };
