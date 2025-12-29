// src/database-migrations/add-portfolio-analytics.js
// Database migration for portfolio analytics tables (Agent 2)

const db = require('../database');

function runMigration() {
  const database = db.getDatabase();

  console.log('🔄 Running portfolio analytics migration...');

  // ============================================
  // Add additional columns to portfolio_snapshots if needed
  // (Table created by Agent 1)
  // ============================================
  const additionalSnapshotColumns = [
    ['net_flows', 'REAL'],
    ['daily_return', 'REAL'],
    ['daily_return_pct', 'REAL'],
    ['benchmark_daily_return_pct', 'REAL']
  ];

  for (const [column, type] of additionalSnapshotColumns) {
    try {
      database.exec(`ALTER TABLE portfolio_snapshots ADD COLUMN ${column} ${type}`);
      console.log(`  Added column: ${column}`);
    } catch (e) {
      // Column may already exist
    }
  }

  console.log('✅ Updated portfolio_snapshots table');

  // ============================================
  // TABLE: Backtests
  // Store backtest configurations and results
  // ============================================
  database.exec(`
    CREATE TABLE IF NOT EXISTS backtests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      config TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      initial_value REAL NOT NULL,
      benchmark_index_id INTEGER,
      rebalance_frequency TEXT,
      final_value REAL,
      total_return_pct REAL,
      cagr REAL,
      volatility REAL,
      sharpe_ratio REAL,
      sortino_ratio REAL,
      max_drawdown REAL,
      max_drawdown_start DATE,
      max_drawdown_end DATE,
      calmar_ratio REAL,
      benchmark_final_value REAL,
      benchmark_cagr REAL,
      alpha REAL,
      beta REAL,
      tracking_error REAL,
      information_ratio REAL,
      total_trades INTEGER,
      annual_returns TEXT,
      value_series TEXT,
      drawdown_series TEXT,
      execution_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (benchmark_index_id) REFERENCES market_indices(id)
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_backtests_created
    ON backtests(created_at DESC);
  `);

  console.log('✅ Created backtests table');

  // ============================================
  // TABLE: Monte Carlo Runs
  // Store simulation configurations and results
  // ============================================
  database.exec(`
    CREATE TABLE IF NOT EXISTS monte_carlo_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      config TEXT NOT NULL,
      portfolio_id INTEGER,
      simulation_count INTEGER NOT NULL,
      time_horizon_years INTEGER NOT NULL,
      return_model TEXT NOT NULL,
      initial_value REAL NOT NULL,
      annual_contribution REAL DEFAULT 0,
      annual_withdrawal REAL DEFAULT 0,
      inflation_rate REAL DEFAULT 0.025,
      survival_rate REAL,
      median_ending_value REAL,
      mean_ending_value REAL,
      percentile_5 REAL,
      percentile_25 REAL,
      percentile_75 REAL,
      percentile_95 REAL,
      median_depletion_year REAL,
      percentile_paths TEXT,
      execution_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE SET NULL
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_monte_carlo_created
    ON monte_carlo_runs(created_at DESC);
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_monte_carlo_portfolio
    ON monte_carlo_runs(portfolio_id);
  `);

  console.log('✅ Created monte_carlo_runs table');

  // ============================================
  // TABLE: Stress Test Runs
  // Store stress test configurations and results
  // ============================================
  database.exec(`
    CREATE TABLE IF NOT EXISTS stress_test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      scenario_description TEXT,
      scenario_start_date DATE NOT NULL,
      scenario_end_date DATE NOT NULL,
      data_points INTEGER,
      has_data INTEGER DEFAULT 1,
      start_value REAL,
      end_value REAL,
      total_return REAL,
      max_drawdown REAL,
      max_drawdown_start DATE,
      max_drawdown_end DATE,
      recovery_days INTEGER,
      worst_day_date DATE,
      worst_day_return REAL,
      benchmark_symbol TEXT,
      benchmark_total_return REAL,
      benchmark_max_drawdown REAL,
      relative_drawdown REAL,
      outperformed INTEGER,
      beta_estimate REAL,
      value_series TEXT,
      execution_time_ms INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    );
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_stress_test_portfolio
    ON stress_test_runs(portfolio_id, created_at DESC);
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_stress_test_scenario
    ON stress_test_runs(scenario_id);
  `);

  console.log('✅ Created stress_test_runs table');

  console.log('✅ Portfolio analytics migration complete!');
}

// Run if executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
