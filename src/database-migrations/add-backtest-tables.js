// src/database-migrations/add-backtest-tables.js
// Database schema for HF-style comprehensive backtesting framework

const { db } = require('../database');

function migrate() {
  console.log('Creating backtest tables...');

  // Main backtest results table
  db.exec(`
    CREATE TABLE IF NOT EXISTS backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      strategy_name TEXT NOT NULL,
      run_type TEXT NOT NULL, -- 'walk_forward', 'stress_test', 'var_backtest', 'ic_analysis', 'alpha_validation'
      start_date TEXT,
      end_date TEXT,
      parameters TEXT, -- JSON: strategy parameters used
      metrics TEXT, -- JSON: computed metrics
      equity_curve TEXT, -- JSON: array of {date, value}
      trades TEXT, -- JSON: array of trade records
      status TEXT DEFAULT 'completed', -- 'running', 'completed', 'failed'
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Walk-forward optimization results
  db.exec(`
    CREATE TABLE IF NOT EXISTS walk_forward_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backtest_id INTEGER REFERENCES backtest_results(id),
      period_index INTEGER,
      is_start_date TEXT,
      is_end_date TEXT,
      oos_start_date TEXT,
      oos_end_date TEXT,
      is_sharpe REAL,
      oos_sharpe REAL,
      is_return REAL,
      oos_return REAL,
      is_max_drawdown REAL,
      oos_max_drawdown REAL,
      optimal_params TEXT, -- JSON: optimized parameters for this period
      walk_forward_efficiency REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Signal IC (Information Coefficient) history
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_ic_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL, -- 'technical', 'sentiment', 'insider', 'fundamental', etc.
      horizon_days INTEGER NOT NULL, -- 1, 5, 10, 21, 63
      ic_value REAL,
      ic_ir REAL, -- IC Information Ratio (IC / IC_std)
      t_stat REAL,
      p_value REAL,
      hit_rate REAL,
      regime TEXT, -- 'BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'
      sample_size INTEGER,
      calculated_date TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(signal_type, horizon_days, regime, calculated_date)
    )
  `);

  // VaR exceptions tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS var_exceptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      exception_date TEXT NOT NULL,
      var_estimate REAL NOT NULL,
      es_estimate REAL, -- Expected Shortfall estimate
      actual_loss REAL NOT NULL,
      confidence_level REAL NOT NULL, -- 0.90, 0.95, 0.99
      method TEXT NOT NULL, -- 'historical', 'parametric', 'monte_carlo'
      is_exception INTEGER DEFAULT 0, -- 1 if loss > VaR
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(portfolio_id, exception_date, confidence_level, method)
    )
  `);

  // VaR backtest summary results
  db.exec(`
    CREATE TABLE IF NOT EXISTS var_backtest_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      confidence_level REAL NOT NULL,
      method TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      total_observations INTEGER,
      total_exceptions INTEGER,
      exception_rate REAL,
      expected_exception_rate REAL,
      kupiec_stat REAL,
      kupiec_p_value REAL,
      kupiec_pass INTEGER,
      christoffersen_stat REAL,
      christoffersen_p_value REAL,
      christoffersen_pass INTEGER,
      basel_zone TEXT, -- 'green', 'yellow', 'red'
      es_ratio REAL, -- avg(loss|loss>VaR) / ES
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Stress test results
  db.exec(`
    CREATE TABLE IF NOT EXISTS stress_test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      scenario_name TEXT NOT NULL,
      scenario_type TEXT NOT NULL, -- 'historical', 'hypothetical', 'factor', 'reverse'
      scenario_params TEXT, -- JSON: shock parameters
      portfolio_impact REAL, -- portfolio P&L impact (%)
      portfolio_impact_dollar REAL, -- dollar impact
      position_impacts TEXT, -- JSON: per-position impacts
      var_impact REAL, -- change in VaR
      worst_position TEXT, -- symbol of worst performing position
      worst_position_impact REAL,
      recovery_time_days INTEGER, -- estimated recovery time
      run_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Regime-conditional performance
  db.exec(`
    CREATE TABLE IF NOT EXISTS regime_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      regime TEXT NOT NULL, -- 'BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS'
      start_date TEXT,
      end_date TEXT,
      trading_days INTEGER,
      total_return REAL,
      annualized_return REAL,
      volatility REAL,
      sharpe_ratio REAL,
      sortino_ratio REAL,
      max_drawdown REAL,
      win_rate REAL,
      avg_win REAL,
      avg_loss REAL,
      profit_factor REAL,
      calmar_ratio REAL,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Alpha validation results
  db.exec(`
    CREATE TABLE IF NOT EXISTS alpha_validation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      benchmark TEXT DEFAULT 'SPY',
      start_date TEXT,
      end_date TEXT,
      alpha REAL,
      alpha_t_stat REAL,
      alpha_p_value REAL,
      alpha_significant INTEGER,
      beta REAL,
      sharpe_ratio REAL,
      deflated_sharpe REAL, -- Harvey et al. adjustment
      deflated_sharpe_p_value REAL,
      bootstrap_alpha_lower REAL,
      bootstrap_alpha_upper REAL,
      bootstrap_sharpe_lower REAL,
      bootstrap_sharpe_upper REAL,
      n_bootstrap INTEGER DEFAULT 10000,
      min_track_record_months REAL, -- minimum months to validate
      information_ratio REAL,
      tracking_error REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Capacity analysis results
  db.exec(`
    CREATE TABLE IF NOT EXISTS capacity_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      strategy_name TEXT,
      estimated_capacity REAL, -- max AUM in dollars
      capacity_at_10bps REAL, -- AUM where slippage = 10bps
      capacity_at_25bps REAL, -- AUM where slippage = 25bps
      capacity_at_50bps REAL, -- AUM where slippage = 50bps
      avg_daily_turnover REAL,
      avg_position_size REAL,
      liquidity_score REAL, -- 0-100
      market_impact_model TEXT, -- 'almgren_chriss', 'square_root', 'linear'
      impact_curve TEXT, -- JSON: AUM vs expected slippage
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Execution analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS execution_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER,
      backtest_id INTEGER REFERENCES backtest_results(id),
      total_trades INTEGER,
      avg_slippage_bps REAL,
      total_slippage_bps REAL,
      avg_market_impact_bps REAL,
      total_market_impact_bps REAL,
      avg_spread_cost_bps REAL,
      total_spread_cost_bps REAL,
      gross_return REAL,
      net_return REAL,
      implementation_shortfall REAL,
      vwap_performance REAL,
      arrival_price_performance REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_backtest_results_portfolio ON backtest_results(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_backtest_results_type ON backtest_results(run_type);
    CREATE INDEX IF NOT EXISTS idx_signal_ic_type_date ON signal_ic_history(signal_type, calculated_date);
    CREATE INDEX IF NOT EXISTS idx_var_exceptions_portfolio ON var_exceptions(portfolio_id, exception_date);
    CREATE INDEX IF NOT EXISTS idx_stress_test_portfolio ON stress_test_results(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_regime_perf_portfolio ON regime_performance(portfolio_id, regime);
  `);

  console.log('Backtest tables created successfully');
}

function rollback() {
  console.log('Rolling back backtest tables...');

  db.exec(`
    DROP TABLE IF EXISTS execution_analysis;
    DROP TABLE IF EXISTS capacity_analysis;
    DROP TABLE IF EXISTS alpha_validation_results;
    DROP TABLE IF EXISTS regime_performance;
    DROP TABLE IF EXISTS stress_test_results;
    DROP TABLE IF EXISTS var_backtest_results;
    DROP TABLE IF EXISTS var_exceptions;
    DROP TABLE IF EXISTS signal_ic_history;
    DROP TABLE IF EXISTS walk_forward_results;
    DROP TABLE IF EXISTS backtest_results;
  `);

  console.log('Backtest tables dropped');
}

// Run migration if executed directly
if (require.main === module) {
  const action = process.argv[2];
  if (action === 'rollback') {
    rollback();
  } else {
    migrate();
  }
}

module.exports = { migrate, rollback };
