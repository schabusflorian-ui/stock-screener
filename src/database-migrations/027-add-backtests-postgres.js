/**
 * PostgreSQL migration: Add portfolio simulation tables
 *
 * These tables were only defined in add-portfolio-analytics.js for SQLite.
 * Creates: backtests, monte_carlo_runs, stress_test_runs
 *
 * Requires: market_indices (005), portfolios
 */

async function migrate(db) {
  console.log('🐘 Creating portfolio simulation tables (Postgres)...');

  // TABLE: backtests
  await db.query(`
    CREATE TABLE IF NOT EXISTS backtests (
      id SERIAL PRIMARY KEY,
      name TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      initial_value NUMERIC NOT NULL,
      benchmark_index_id INTEGER REFERENCES market_indices(id) ON DELETE SET NULL,
      rebalance_frequency TEXT,
      final_value NUMERIC,
      total_return_pct NUMERIC,
      cagr NUMERIC,
      volatility NUMERIC,
      sharpe_ratio NUMERIC,
      sortino_ratio NUMERIC,
      max_drawdown NUMERIC,
      max_drawdown_start DATE,
      max_drawdown_end DATE,
      calmar_ratio NUMERIC,
      benchmark_final_value NUMERIC,
      benchmark_cagr NUMERIC,
      alpha NUMERIC,
      beta NUMERIC,
      tracking_error NUMERIC,
      information_ratio NUMERIC,
      total_trades INTEGER,
      annual_returns TEXT,
      value_series TEXT,
      drawdown_series TEXT,
      execution_time_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_backtests_created ON backtests(created_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_backtests_dates ON backtests(start_date, end_date)');
  console.log('✅ backtests table ready');

  // TABLE: monte_carlo_runs
  await db.query(`
    CREATE TABLE IF NOT EXISTS monte_carlo_runs (
      id SERIAL PRIMARY KEY,
      name TEXT,
      config TEXT NOT NULL DEFAULT '{}',
      portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL,
      simulation_count INTEGER NOT NULL,
      time_horizon_years INTEGER NOT NULL,
      return_model TEXT NOT NULL,
      initial_value NUMERIC NOT NULL,
      annual_contribution NUMERIC DEFAULT 0,
      annual_withdrawal NUMERIC DEFAULT 0,
      inflation_rate NUMERIC DEFAULT 0.025,
      survival_rate NUMERIC,
      median_ending_value NUMERIC,
      mean_ending_value NUMERIC,
      percentile_5 NUMERIC,
      percentile_25 NUMERIC,
      percentile_75 NUMERIC,
      percentile_95 NUMERIC,
      median_depletion_year NUMERIC,
      percentile_paths TEXT,
      execution_time_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_monte_carlo_created ON monte_carlo_runs(created_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_monte_carlo_portfolio ON monte_carlo_runs(portfolio_id)');
  console.log('✅ monte_carlo_runs table ready');

  // TABLE: stress_test_runs
  await db.query(`
    CREATE TABLE IF NOT EXISTS stress_test_runs (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      scenario_id TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      scenario_description TEXT,
      scenario_start_date DATE NOT NULL,
      scenario_end_date DATE NOT NULL,
      data_points INTEGER,
      has_data BOOLEAN DEFAULT true,
      start_value NUMERIC,
      end_value NUMERIC,
      total_return NUMERIC,
      max_drawdown NUMERIC,
      max_drawdown_start DATE,
      max_drawdown_end DATE,
      recovery_days INTEGER,
      worst_day_date DATE,
      worst_day_return NUMERIC,
      benchmark_symbol TEXT,
      benchmark_total_return NUMERIC,
      benchmark_max_drawdown NUMERIC,
      relative_drawdown NUMERIC,
      outperformed BOOLEAN,
      beta_estimate NUMERIC,
      value_series TEXT,
      execution_time_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_stress_test_portfolio ON stress_test_runs(portfolio_id, created_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_stress_test_scenario ON stress_test_runs(scenario_id)');
  console.log('✅ stress_test_runs table ready');
}

module.exports = migrate;
