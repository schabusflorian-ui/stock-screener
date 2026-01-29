// src/database-migrations/add-user-factors-table.js
// User-defined custom factors for Quant Workbench
// Enables factor research and discovery (Jim Simons-style)

const db = require('../database').db;

console.log('\n🔬 Creating User Factors tables for Quant Workbench...\n');

// ============================================
// TABLE: User-Defined Factors
// Custom factors created by users from raw metrics
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS user_factors (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    formula TEXT NOT NULL,
    description TEXT,

    -- Formula metadata
    higher_is_better INTEGER DEFAULT 1,
    required_metrics TEXT,  -- JSON array of metrics used in formula

    -- Transformations
    transformations TEXT,  -- JSON: { zscore, winsorize, sectorNeutral }

    -- Cached performance stats (updated by IC analysis)
    ic_stats TEXT,         -- JSON: { "1d": 0.023, "5d": 0.031, "21d": 0.028, "63d": 0.025 }
    ic_tstat REAL,         -- Statistical significance
    ic_ir REAL,            -- Information ratio (IC / IC_stdev)
    wfe REAL,              -- Walk-forward efficiency
    uniqueness_score REAL, -- 1 - max(correlation with existing factors)
    turnover_monthly REAL, -- Expected monthly turnover

    -- Status
    is_active INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    validation_error TEXT,

    -- Metadata
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_analyzed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_user_factors_user ON user_factors(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_factors_active ON user_factors(is_active);
  CREATE INDEX IF NOT EXISTS idx_user_factors_ic ON user_factors(ic_tstat DESC);
`);

console.log('✅ Created user_factors table');

// ============================================
// TABLE: Factor Values Cache
// Pre-calculated factor values for each stock/date
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_values_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_id TEXT NOT NULL,
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,

    -- Calculated values
    raw_value REAL,
    zscore_value REAL,
    percentile_value REAL,

    -- Component values (for debugging)
    component_values TEXT,  -- JSON: { "fcf_yield": 0.045, "roe": 0.25 }

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (factor_id) REFERENCES user_factors(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_values_unique ON factor_values_cache(factor_id, symbol, date);
  CREATE INDEX IF NOT EXISTS idx_factor_values_date ON factor_values_cache(date);
  CREATE INDEX IF NOT EXISTS idx_factor_values_symbol ON factor_values_cache(symbol);
`);

console.log('✅ Created factor_values_cache table');

// ============================================
// TABLE: Factor IC History
// Time series of IC values for tracking decay
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_ic_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_id TEXT NOT NULL,
    calculation_date TEXT NOT NULL,

    -- IC by horizon
    ic_1d REAL,
    ic_5d REAL,
    ic_21d REAL,
    ic_63d REAL,
    ic_126d REAL,
    ic_252d REAL,

    -- Statistical measures
    tstat_21d REAL,
    pvalue_21d REAL,

    -- Sample info
    universe_size INTEGER,
    universe_type TEXT,  -- 'ALL', 'SP500', 'RUSSELL1000'

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (factor_id) REFERENCES user_factors(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_ic_unique ON factor_ic_history(factor_id, calculation_date, universe_type);
  CREATE INDEX IF NOT EXISTS idx_factor_ic_date ON factor_ic_history(calculation_date);
`);

console.log('✅ Created factor_ic_history table');

// ============================================
// TABLE: Factor Correlation Matrix
// Correlations between user factors and standard factors
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_correlations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_id TEXT NOT NULL,
    calculation_date TEXT NOT NULL,

    -- Correlations with standard factors
    corr_value REAL,
    corr_quality REAL,
    corr_momentum REAL,
    corr_growth REAL,
    corr_size REAL,
    corr_volatility REAL,

    -- Correlations with other user factors (JSON)
    user_factor_correlations TEXT,  -- { "factor_id": correlation }

    -- Multicollinearity
    vif REAL,  -- Variance inflation factor

    -- Uniqueness
    uniqueness_score REAL,  -- 1 - max(all correlations)
    most_similar_factor TEXT,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (factor_id) REFERENCES user_factors(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_corr_unique ON factor_correlations(factor_id, calculation_date);
`);

console.log('✅ Created factor_correlations table');

// ============================================
// TABLE: Factor Backtest Runs
// History of factor backtests for audit trail
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_backtest_runs (
    id TEXT PRIMARY KEY,
    factor_id TEXT,
    user_id TEXT,

    -- Configuration
    config TEXT NOT NULL,  -- JSON: { startDate, endDate, rebalanceFreq, topN, universe }

    -- Results summary
    total_return REAL,
    annualized_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    alpha REAL,
    beta REAL,

    -- Walk-forward stats
    is_ic REAL,  -- In-sample IC
    oos_ic REAL, -- Out-of-sample IC
    wfe REAL,    -- OOS / IS ratio

    -- Overfitting diagnostics
    overfitting_flags TEXT,  -- JSON array of warnings
    deflated_sharpe REAL,

    -- Full results
    equity_curve TEXT,    -- JSON array
    period_returns TEXT,  -- JSON array

    run_at TEXT DEFAULT (datetime('now')),
    run_duration_ms INTEGER,

    FOREIGN KEY (factor_id) REFERENCES user_factors(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_factor_backtest_factor ON factor_backtest_runs(factor_id);
  CREATE INDEX IF NOT EXISTS idx_factor_backtest_user ON factor_backtest_runs(user_id);
  CREATE INDEX IF NOT EXISTS idx_factor_backtest_date ON factor_backtest_runs(run_at);
`);

console.log('✅ Created factor_backtest_runs table');

// ============================================
// TABLE: Factor Signals
// Generated trading signals from factor analysis
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_id TEXT,
    signal_date TEXT NOT NULL,

    -- Signal details
    symbol TEXT NOT NULL,
    signal_type TEXT NOT NULL,  -- 'BUY', 'SELL', 'HOLD'
    signal_strength REAL,       -- 0-1 confidence

    -- Factor values
    factor_value REAL,
    factor_percentile REAL,

    -- Context
    sector TEXT,
    market_cap REAL,

    -- Outcome tracking
    return_1d REAL,
    return_5d REAL,
    return_21d REAL,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (factor_id) REFERENCES user_factors(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_factor_signals_date ON factor_signals(signal_date);
  CREATE INDEX IF NOT EXISTS idx_factor_signals_symbol ON factor_signals(symbol);
  CREATE INDEX IF NOT EXISTS idx_factor_signals_factor ON factor_signals(factor_id);
`);

console.log('✅ Created factor_signals table');

// ============================================
// TABLE: Available Metrics Catalog
// Documents all metrics available for factor construction
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS available_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_code TEXT UNIQUE NOT NULL,
    metric_name TEXT NOT NULL,
    category TEXT NOT NULL,  -- valuation, profitability, growth, quality, technical, alternative
    description TEXT,

    -- Data characteristics
    source_table TEXT,       -- Where to find this metric
    source_column TEXT,      -- Column name
    data_frequency TEXT,     -- daily, quarterly, annual

    -- Coverage
    coverage_start TEXT,     -- Earliest date available
    coverage_pct REAL,       -- % of stocks with this metric

    -- Statistical properties
    typical_range TEXT,      -- e.g., "0 to 1" or "-100 to 100"
    is_ratio INTEGER,        -- 1 if bounded ratio
    higher_is_better INTEGER,

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_category ON available_metrics(category);
`);

console.log('✅ Created available_metrics table');

// ============================================
// Seed Available Metrics
// ============================================
const metrics = [
  // Valuation
  { metric_code: 'pe_ratio', metric_name: 'P/E Ratio', category: 'valuation', description: 'Price to earnings ratio', source_table: 'companies', source_column: 'pe_ratio', higher_is_better: 0 },
  { metric_code: 'pb_ratio', metric_name: 'P/B Ratio', category: 'valuation', description: 'Price to book ratio', source_table: 'companies', source_column: 'pb_ratio', higher_is_better: 0 },
  { metric_code: 'ps_ratio', metric_name: 'P/S Ratio', category: 'valuation', description: 'Price to sales ratio', source_table: 'companies', source_column: 'ps_ratio', higher_is_better: 0 },
  { metric_code: 'ev_ebitda', metric_name: 'EV/EBITDA', category: 'valuation', description: 'Enterprise value to EBITDA', source_table: 'companies', source_column: 'ev_ebitda', higher_is_better: 0 },
  { metric_code: 'earnings_yield', metric_name: 'Earnings Yield', category: 'valuation', description: 'Earnings per share / price (inverse of P/E)', source_table: 'companies', source_column: 'earnings_yield', higher_is_better: 1 },
  { metric_code: 'fcf_yield', metric_name: 'FCF Yield', category: 'valuation', description: 'Free cash flow yield', source_table: 'companies', source_column: 'fcf_yield', higher_is_better: 1 },
  { metric_code: 'dividend_yield', metric_name: 'Dividend Yield', category: 'valuation', description: 'Annual dividend / price', source_table: 'companies', source_column: 'dividend_yield', higher_is_better: 1 },
  { metric_code: 'enterprise_value', metric_name: 'Enterprise Value', category: 'valuation', description: 'Market cap + debt - cash', source_table: 'companies', source_column: 'enterprise_value', higher_is_better: 0 },
  { metric_code: 'market_cap', metric_name: 'Market Cap', category: 'valuation', description: 'Market capitalization', source_table: 'companies', source_column: 'market_cap', higher_is_better: 0 },

  // Profitability
  { metric_code: 'roe', metric_name: 'Return on Equity', category: 'profitability', description: 'Net income / shareholders equity', source_table: 'companies', source_column: 'roe', higher_is_better: 1 },
  { metric_code: 'roic', metric_name: 'Return on Invested Capital', category: 'profitability', description: 'NOPAT / invested capital', source_table: 'companies', source_column: 'roic', higher_is_better: 1 },
  { metric_code: 'roa', metric_name: 'Return on Assets', category: 'profitability', description: 'Net income / total assets', source_table: 'companies', source_column: 'roa', higher_is_better: 1 },
  { metric_code: 'gross_margin', metric_name: 'Gross Margin', category: 'profitability', description: 'Gross profit / revenue', source_table: 'companies', source_column: 'gross_margin', higher_is_better: 1 },
  { metric_code: 'operating_margin', metric_name: 'Operating Margin', category: 'profitability', description: 'Operating income / revenue', source_table: 'companies', source_column: 'operating_margin', higher_is_better: 1 },
  { metric_code: 'net_margin', metric_name: 'Net Margin', category: 'profitability', description: 'Net income / revenue', source_table: 'companies', source_column: 'net_margin', higher_is_better: 1 },
  { metric_code: 'asset_turnover', metric_name: 'Asset Turnover', category: 'profitability', description: 'Revenue / total assets', source_table: 'companies', source_column: 'asset_turnover', higher_is_better: 1 },

  // Growth
  { metric_code: 'revenue_growth_yoy', metric_name: 'Revenue Growth (YoY)', category: 'growth', description: 'Year-over-year revenue growth', source_table: 'companies', source_column: 'revenue_growth_yoy', higher_is_better: 1 },
  { metric_code: 'earnings_growth_yoy', metric_name: 'Earnings Growth (YoY)', category: 'growth', description: 'Year-over-year earnings growth', source_table: 'companies', source_column: 'earnings_growth_yoy', higher_is_better: 1 },
  { metric_code: 'fcf_growth_yoy', metric_name: 'FCF Growth (YoY)', category: 'growth', description: 'Year-over-year free cash flow growth', source_table: 'companies', source_column: 'fcf_growth_yoy', higher_is_better: 1 },

  // Quality
  { metric_code: 'debt_to_equity', metric_name: 'Debt to Equity', category: 'quality', description: 'Total debt / shareholders equity', source_table: 'companies', source_column: 'debt_to_equity', higher_is_better: 0 },
  { metric_code: 'current_ratio', metric_name: 'Current Ratio', category: 'quality', description: 'Current assets / current liabilities', source_table: 'companies', source_column: 'current_ratio', higher_is_better: 1 },
  { metric_code: 'quick_ratio', metric_name: 'Quick Ratio', category: 'quality', description: '(Current assets - inventory) / current liabilities', source_table: 'companies', source_column: 'quick_ratio', higher_is_better: 1 },
  { metric_code: 'interest_coverage', metric_name: 'Interest Coverage', category: 'quality', description: 'EBIT / interest expense', source_table: 'companies', source_column: 'interest_coverage', higher_is_better: 1 },
  { metric_code: 'piotroski_f', metric_name: 'Piotroski F-Score', category: 'quality', description: 'Financial strength score (0-9)', source_table: 'companies', source_column: 'piotroski_f', higher_is_better: 1 },

  // Technical
  { metric_code: 'momentum_1m', metric_name: '1-Month Momentum', category: 'technical', description: 'Price return over 1 month', source_table: 'stock_factor_scores', source_column: 'momentum_score', higher_is_better: 1 },
  { metric_code: 'momentum_3m', metric_name: '3-Month Momentum', category: 'technical', description: 'Price return over 3 months', source_table: 'stock_factor_scores', source_column: 'momentum_score', higher_is_better: 1 },
  { metric_code: 'momentum_6m', metric_name: '6-Month Momentum', category: 'technical', description: 'Price return over 6 months', source_table: 'stock_factor_scores', source_column: 'momentum_score', higher_is_better: 1 },
  { metric_code: 'momentum_12m', metric_name: '12-Month Momentum', category: 'technical', description: 'Price return over 12 months', source_table: 'stock_factor_scores', source_column: 'momentum_score', higher_is_better: 1 },
  { metric_code: 'volatility', metric_name: 'Volatility', category: 'technical', description: 'Price volatility (standard deviation)', source_table: 'stock_factor_scores', source_column: 'volatility_score', higher_is_better: 0 },
  { metric_code: 'beta', metric_name: 'Beta', category: 'technical', description: 'Market beta', source_table: 'stock_factor_scores', source_column: 'beta', higher_is_better: 0 },

  // Alternative Data
  { metric_code: 'congressional_signal', metric_name: 'Congressional Signal', category: 'alternative', description: 'Congressional trading activity signal', source_table: 'trading_signals', source_column: 'congressional_signal', higher_is_better: 1 },
  { metric_code: 'insider_signal', metric_name: 'Insider Signal', category: 'alternative', description: 'Insider trading activity signal', source_table: 'trading_signals', source_column: 'insider_signal', higher_is_better: 1 },
  { metric_code: 'short_interest', metric_name: 'Short Interest', category: 'alternative', description: 'Short interest as % of float', source_table: 'companies', source_column: 'short_interest', higher_is_better: 0 },
  { metric_code: 'sentiment_score', metric_name: 'Sentiment Score', category: 'alternative', description: 'Aggregated sentiment from news/social', source_table: 'sentiment_history', source_column: 'sentiment_score', higher_is_better: 1 }
];

const insertMetric = db.prepare(`
  INSERT OR IGNORE INTO available_metrics (
    metric_code, metric_name, category, description,
    source_table, source_column, higher_is_better
  ) VALUES (
    @metric_code, @metric_name, @category, @description,
    @source_table, @source_column, @higher_is_better
  )
`);

for (const metric of metrics) {
  insertMetric.run(metric);
}

console.log(`✅ Seeded ${metrics.length} available metrics`);

// ============================================
// Helper Views
// ============================================

// View: Active user factors with stats
db.exec(`
  CREATE VIEW IF NOT EXISTS v_user_factors_summary AS
  SELECT
    uf.id,
    uf.name,
    uf.formula,
    uf.description,
    uf.higher_is_better,
    uf.is_active,
    uf.ic_tstat,
    uf.ic_ir,
    uf.wfe,
    uf.uniqueness_score,
    uf.turnover_monthly,
    json_extract(uf.ic_stats, '$.21d') as ic_21d,
    uf.created_at,
    uf.last_analyzed_at,
    CASE
      WHEN uf.ic_tstat > 2.0 AND uf.wfe > 0.5 AND uf.uniqueness_score > 0.3 THEN 'Strong'
      WHEN uf.ic_tstat > 1.5 AND uf.wfe > 0.3 THEN 'Moderate'
      WHEN uf.ic_tstat > 1.0 THEN 'Weak'
      ELSE 'Untested'
    END as signal_quality
  FROM user_factors uf
  WHERE uf.is_valid = 1
  ORDER BY uf.ic_tstat DESC NULLS LAST
`);

console.log('✅ Created helper views');

console.log('\n✅ User Factors migration complete!\n');
