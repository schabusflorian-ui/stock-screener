// src/database-migrations/add-weight-optimization-tables.js
// Database schema for weight optimization and signal predictive power analysis

const { db } = require('../database');

function migrate() {
  console.log('Creating weight optimization tables...');

  // Weight optimization runs (main tracking table)
  db.exec(`
    CREATE TABLE IF NOT EXISTS weight_optimization_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_name TEXT NOT NULL,
      run_type TEXT NOT NULL, -- 'grid_search', 'ablation', 'fine_tune', 'bayesian'
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      optimization_target TEXT DEFAULT 'alpha', -- 'alpha', 'sharpe', 'sortino', 'composite'
      total_combinations_tested INTEGER DEFAULT 0,
      best_weights TEXT, -- JSON: optimal weights found
      best_alpha REAL,
      best_sharpe REAL,
      baseline_alpha REAL,
      baseline_sharpe REAL,
      improvement_pct REAL,
      search_config TEXT, -- JSON: step sizes, constraints, etc.
      walk_forward_validated INTEGER DEFAULT 0,
      walk_forward_efficiency REAL,
      status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed'
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    )
  `);

  // Individual weight combination results
  db.exec(`
    CREATE TABLE IF NOT EXISTS weight_combination_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES weight_optimization_runs(id),
      weights TEXT NOT NULL, -- JSON: {technical: 0.2, fundamental: 0.15, ...}
      regime TEXT, -- NULL for all-regime, or specific regime
      total_return REAL,
      annualized_return REAL,
      sharpe_ratio REAL,
      sortino_ratio REAL,
      max_drawdown REAL,
      alpha REAL,
      beta REAL,
      win_rate REAL,
      profit_factor REAL,
      total_trades INTEGER,
      avg_holding_days REAL,
      is_walk_forward_validated INTEGER DEFAULT 0,
      walk_forward_efficiency REAL,
      rank_in_run INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Signal predictive power analysis
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_predictive_power (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL, -- 'technical', 'fundamental', 'sentiment', 'insider', 'valuation', 'factor'
      horizon_days INTEGER NOT NULL, -- 1, 5, 21, 63
      ic REAL, -- Information Coefficient
      ic_ir REAL, -- IC Information Ratio (stability)
      t_stat REAL,
      p_value REAL,
      hit_rate REAL,
      hit_rate_ci_lower REAL,
      hit_rate_ci_upper REAL,
      decay_half_life REAL, -- days until IC halves
      sample_size INTEGER,
      regime TEXT, -- 'BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS', 'ALL'
      composite_score REAL, -- weighted combination of IC, hit_rate, stability
      rank_in_regime INTEGER,
      start_date TEXT,
      end_date TEXT,
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(signal_type, horizon_days, regime, calculated_at)
    )
  `);

  // Regime-specific optimal weights
  db.exec(`
    CREATE TABLE IF NOT EXISTS regime_optimal_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regime TEXT NOT NULL, -- 'BULL', 'BEAR', 'SIDEWAYS', 'HIGH_VOL', 'CRISIS'
      technical_weight REAL NOT NULL,
      fundamental_weight REAL NOT NULL,
      sentiment_weight REAL NOT NULL,
      insider_weight REAL NOT NULL,
      valuation_weight REAL NOT NULL,
      factor_weight REAL NOT NULL,
      optimization_run_id INTEGER REFERENCES weight_optimization_runs(id),
      alpha REAL,
      sharpe_ratio REAL,
      walk_forward_efficiency REAL,
      valid_from DATETIME DEFAULT CURRENT_TIMESTAMP,
      valid_until DATETIME,
      is_active INTEGER DEFAULT 1,
      UNIQUE(regime, valid_from)
    )
  `);

  // Ablation study results (signal importance)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ablation_study_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER REFERENCES weight_optimization_runs(id),
      signal_type TEXT NOT NULL,
      baseline_alpha REAL,
      without_signal_alpha REAL,
      alpha_degradation REAL, -- baseline - without_signal (higher = more important)
      importance_rank INTEGER,
      regime TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_weight_opt_runs_status ON weight_optimization_runs(status);
    CREATE INDEX IF NOT EXISTS idx_weight_opt_runs_type ON weight_optimization_runs(run_type);
    CREATE INDEX IF NOT EXISTS idx_weight_comb_run ON weight_combination_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_weight_comb_alpha ON weight_combination_results(alpha DESC);
    CREATE INDEX IF NOT EXISTS idx_weight_comb_regime ON weight_combination_results(regime);
    CREATE INDEX IF NOT EXISTS idx_signal_pred_type ON signal_predictive_power(signal_type, regime);
    CREATE INDEX IF NOT EXISTS idx_signal_pred_score ON signal_predictive_power(composite_score DESC);
    CREATE INDEX IF NOT EXISTS idx_regime_weights_active ON regime_optimal_weights(regime, is_active);
    CREATE INDEX IF NOT EXISTS idx_ablation_run ON ablation_study_results(run_id);
  `);

  console.log('Weight optimization tables created successfully');
}

function rollback() {
  console.log('Rolling back weight optimization tables...');

  db.exec(`
    DROP TABLE IF EXISTS ablation_study_results;
    DROP TABLE IF EXISTS regime_optimal_weights;
    DROP TABLE IF EXISTS signal_predictive_power;
    DROP TABLE IF EXISTS weight_combination_results;
    DROP TABLE IF EXISTS weight_optimization_runs;
  `);

  console.log('Weight optimization tables dropped');
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
