// src/database-migrations/add-factor-analysis.js
// Factor Analysis System - Database Schema
// Enables multi-factor analysis of investor decisions and portfolio exposures

const db = require('../database').db;

console.log('\n📊 Creating Factor Analysis tables...\n');

// ============================================
// TABLE: Factor Definitions
// Defines the investment factors we track
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factor_code TEXT UNIQUE NOT NULL,
    factor_name TEXT NOT NULL,
    factor_category TEXT NOT NULL,  -- value, momentum, quality, size, volatility, growth
    description TEXT,

    -- How to calculate this factor (scoring methodology)
    calculation_method TEXT,  -- rank, zscore, percentile, composite

    -- Component metrics used in calculation
    primary_metric TEXT,      -- Main metric (e.g., 'pe_ratio' for value)
    secondary_metrics TEXT,   -- JSON array of additional metrics

    -- Scoring direction
    higher_is_better INTEGER DEFAULT 1,  -- 1 = higher score = more factor exposure

    -- Weighting for composite factors
    weight REAL DEFAULT 1.0,

    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_factor_def_category ON factor_definitions(factor_category);
  CREATE INDEX IF NOT EXISTS idx_factor_def_active ON factor_definitions(is_active);
`);

console.log('✅ Created factor_definitions table');

// ============================================
// TABLE: Stock Factor Scores
// Point-in-time factor scores for each stock
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_factor_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT,
    score_date TEXT NOT NULL,

    -- Classic Fama-French Factors
    value_score REAL,           -- Composite value (low P/E, P/B, high earnings yield)
    size_score REAL,            -- Market cap rank (negative = small cap)
    momentum_score REAL,        -- Price momentum (6-12 month returns)

    -- Quality Factor
    quality_score REAL,         -- Composite quality (ROE, margins, stability)
    profitability_score REAL,   -- ROE, ROA, ROIC
    investment_score REAL,      -- Asset growth, capex intensity

    -- Growth Factor
    growth_score REAL,          -- Revenue & earnings growth

    -- Volatility Factor
    volatility_score REAL,      -- Low volatility = higher score
    beta REAL,                  -- Market beta

    -- Additional Factors
    dividend_score REAL,        -- Dividend yield
    leverage_score REAL,        -- Low leverage = higher score
    liquidity_score REAL,       -- Trading liquidity

    -- Composite Scores
    value_growth_blend REAL,    -- GARP score
    defensive_score REAL,       -- Quality + Low Vol + Dividend

    -- Factor percentiles (0-100, relative to universe)
    value_percentile REAL,
    quality_percentile REAL,
    momentum_percentile REAL,
    growth_percentile REAL,
    size_percentile REAL,

    -- Metadata
    universe_size INTEGER,      -- Number of stocks in comparison universe
    calculation_version TEXT,
    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_factor_unique ON stock_factor_scores(company_id, score_date);
  CREATE INDEX IF NOT EXISTS idx_stock_factor_date ON stock_factor_scores(score_date);
  CREATE INDEX IF NOT EXISTS idx_stock_factor_symbol ON stock_factor_scores(symbol);
`);

// Create indexes for factor-based queries
try {
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_factor_value ON stock_factor_scores(score_date, value_score DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_factor_quality ON stock_factor_scores(score_date, quality_score DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_factor_momentum ON stock_factor_scores(score_date, momentum_score DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stock_factor_growth ON stock_factor_scores(score_date, growth_score DESC)');
} catch (e) {
  console.log('  Note: Some factor indexes already exist');
}

console.log('✅ Created stock_factor_scores table');

// ============================================
// TABLE: Portfolio Factor Exposures
// Aggregated factor exposures for investor portfolios
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_factor_exposures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,
    snapshot_date TEXT NOT NULL,

    -- Weighted average factor scores
    avg_value_score REAL,
    avg_quality_score REAL,
    avg_momentum_score REAL,
    avg_growth_score REAL,
    avg_size_score REAL,
    avg_volatility_score REAL,
    avg_dividend_score REAL,

    -- Factor tilts (relative to market/benchmark)
    value_tilt REAL,            -- Positive = overweight value
    quality_tilt REAL,
    momentum_tilt REAL,
    growth_tilt REAL,
    size_tilt REAL,             -- Positive = overweight small cap

    -- Portfolio characteristics
    weighted_pe REAL,
    weighted_pb REAL,
    weighted_roe REAL,
    weighted_roic REAL,
    weighted_revenue_growth REAL,
    weighted_earnings_growth REAL,
    weighted_dividend_yield REAL,
    weighted_market_cap REAL,

    -- Portfolio beta and volatility
    portfolio_beta REAL,
    estimated_volatility REAL,

    -- Concentration metrics
    herfindahl_index REAL,      -- Position concentration
    top_10_weight REAL,
    sector_concentration REAL,

    -- Style box classification
    style_box TEXT,             -- e.g., 'large_value', 'small_growth', 'mid_blend'
    style_confidence REAL,

    -- Number of positions
    position_count INTEGER,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_factor_unique ON portfolio_factor_exposures(investor_id, snapshot_date);
  CREATE INDEX IF NOT EXISTS idx_portfolio_factor_date ON portfolio_factor_exposures(snapshot_date);
  CREATE INDEX IF NOT EXISTS idx_portfolio_factor_investor ON portfolio_factor_exposures(investor_id);
`);

console.log('✅ Created portfolio_factor_exposures table');

// ============================================
// TABLE: Factor Returns
// Historical returns for each factor (for attribution)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_date TEXT NOT NULL,
    period_type TEXT NOT NULL,  -- daily, weekly, monthly, quarterly

    -- Factor returns (long-short portfolio returns)
    value_return REAL,
    quality_return REAL,
    momentum_return REAL,
    growth_return REAL,
    size_return REAL,           -- Small minus Big
    low_vol_return REAL,
    dividend_return REAL,

    -- Market return for comparison
    market_return REAL,
    risk_free_rate REAL,

    -- Factor spreads
    value_spread REAL,          -- Value quintile 1 - quintile 5
    quality_spread REAL,
    momentum_spread REAL,

    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_returns_unique ON factor_returns(return_date, period_type);
  CREATE INDEX IF NOT EXISTS idx_factor_returns_date ON factor_returns(return_date);
`);

console.log('✅ Created factor_returns table');

// ============================================
// TABLE: Investor Factor Attribution
// Decomposes investor returns into factor contributions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_factor_attribution (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    period_type TEXT NOT NULL,  -- monthly, quarterly, yearly

    -- Total return
    total_return REAL,

    -- Factor contributions to return
    value_contribution REAL,
    quality_contribution REAL,
    momentum_contribution REAL,
    growth_contribution REAL,
    size_contribution REAL,
    volatility_contribution REAL,

    -- Alpha (unexplained return)
    alpha REAL,

    -- Factor exposures during period
    avg_value_exposure REAL,
    avg_quality_exposure REAL,
    avg_momentum_exposure REAL,
    avg_growth_exposure REAL,
    avg_size_exposure REAL,

    -- R-squared of factor model
    r_squared REAL,

    -- Benchmark comparison
    benchmark_return REAL,
    active_return REAL,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_factor_attr_unique ON investor_factor_attribution(investor_id, period_start, period_end, period_type);
  CREATE INDEX IF NOT EXISTS idx_factor_attr_investor ON investor_factor_attribution(investor_id);
  CREATE INDEX IF NOT EXISTS idx_factor_attr_period ON investor_factor_attribution(period_start, period_end);
`);

console.log('✅ Created investor_factor_attribution table');

// ============================================
// TABLE: Decision Factor Context
// Links investment decisions to factor scores at time of decision
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS decision_factor_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id INTEGER NOT NULL,

    -- Factor scores at decision time
    value_score REAL,
    quality_score REAL,
    momentum_score REAL,
    growth_score REAL,
    size_score REAL,
    volatility_score REAL,

    -- Factor percentiles at decision time
    value_percentile REAL,
    quality_percentile REAL,
    momentum_percentile REAL,
    growth_percentile REAL,

    -- Dominant factor (which factor was most extreme)
    dominant_factor TEXT,
    dominant_factor_percentile REAL,

    -- Factor-based decision classification
    is_value_play INTEGER,      -- Value percentile > 80
    is_quality_play INTEGER,    -- Quality percentile > 80
    is_momentum_play INTEGER,   -- Momentum percentile > 80
    is_growth_play INTEGER,     -- Growth percentile > 80
    is_contrarian_play INTEGER, -- Momentum percentile < 20
    is_small_cap_play INTEGER,  -- Size percentile < 30

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (decision_id) REFERENCES investment_decisions(id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_factor_unique ON decision_factor_context(decision_id);
`);

console.log('✅ Created decision_factor_context table');

// ============================================
// TABLE: Factor Regime Classification
// Identifies market regimes for factor performance
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS factor_regimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regime_start TEXT NOT NULL,
    regime_end TEXT,
    regime_type TEXT NOT NULL,  -- value_dominant, growth_dominant, quality_flight, risk_on, risk_off

    -- Factor performance during regime
    value_performance REAL,
    quality_performance REAL,
    momentum_performance REAL,
    growth_performance REAL,

    -- Market conditions
    market_return REAL,
    volatility_level TEXT,      -- low, normal, high, extreme

    -- Economic context
    economic_phase TEXT,        -- expansion, peak, contraction, trough
    rate_environment TEXT,      -- rising, stable, falling

    confidence_score REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_factor_regime_dates ON factor_regimes(regime_start, regime_end);
  CREATE INDEX IF NOT EXISTS idx_factor_regime_type ON factor_regimes(regime_type);
`);

console.log('✅ Created factor_regimes table');

// ============================================
// Seed Factor Definitions
// ============================================
const factorDefinitions = [
  // Value Factors
  {
    factor_code: 'value_composite',
    factor_name: 'Value Composite',
    factor_category: 'value',
    description: 'Composite of P/E, P/B, and earnings yield',
    calculation_method: 'composite',
    primary_metric: 'pe_ratio',
    secondary_metrics: JSON.stringify(['pb_ratio', 'earnings_yield', 'fcf_yield']),
    higher_is_better: 0  // Lower valuation = higher value score
  },
  {
    factor_code: 'earnings_yield',
    factor_name: 'Earnings Yield',
    factor_category: 'value',
    description: 'Inverse of P/E ratio',
    calculation_method: 'rank',
    primary_metric: 'earnings_yield',
    higher_is_better: 1
  },
  {
    factor_code: 'book_to_market',
    factor_name: 'Book to Market',
    factor_category: 'value',
    description: 'Inverse of P/B ratio (Fama-French HML)',
    calculation_method: 'rank',
    primary_metric: 'pb_ratio',
    higher_is_better: 0
  },

  // Quality Factors
  {
    factor_code: 'quality_composite',
    factor_name: 'Quality Composite',
    factor_category: 'quality',
    description: 'ROE, ROIC, margins, and balance sheet strength',
    calculation_method: 'composite',
    primary_metric: 'roic',
    secondary_metrics: JSON.stringify(['roe', 'operating_margin', 'current_ratio']),
    higher_is_better: 1
  },
  {
    factor_code: 'profitability',
    factor_name: 'Profitability',
    factor_category: 'quality',
    description: 'ROE and operating margins',
    calculation_method: 'composite',
    primary_metric: 'roe',
    secondary_metrics: JSON.stringify(['operating_margin', 'net_margin']),
    higher_is_better: 1
  },
  {
    factor_code: 'balance_sheet',
    factor_name: 'Balance Sheet Strength',
    factor_category: 'quality',
    description: 'Low leverage and high liquidity',
    calculation_method: 'composite',
    primary_metric: 'debt_to_equity',
    secondary_metrics: JSON.stringify(['current_ratio', 'interest_coverage']),
    higher_is_better: 0  // Lower debt = higher score
  },

  // Growth Factors
  {
    factor_code: 'growth_composite',
    factor_name: 'Growth Composite',
    factor_category: 'growth',
    description: 'Revenue and earnings growth',
    calculation_method: 'composite',
    primary_metric: 'revenue_growth_yoy',
    secondary_metrics: JSON.stringify(['earnings_growth_yoy', 'fcf_growth_yoy']),
    higher_is_better: 1
  },
  {
    factor_code: 'revenue_growth',
    factor_name: 'Revenue Growth',
    factor_category: 'growth',
    description: 'Year-over-year revenue growth',
    calculation_method: 'rank',
    primary_metric: 'revenue_growth_yoy',
    higher_is_better: 1
  },

  // Momentum Factor
  {
    factor_code: 'price_momentum',
    factor_name: 'Price Momentum',
    factor_category: 'momentum',
    description: '12-month price return minus last month',
    calculation_method: 'rank',
    primary_metric: 'return_12m',
    higher_is_better: 1
  },

  // Size Factor
  {
    factor_code: 'size',
    factor_name: 'Size (SMB)',
    factor_category: 'size',
    description: 'Market capitalization (Fama-French SMB)',
    calculation_method: 'rank',
    primary_metric: 'market_cap',
    higher_is_better: 0  // Smaller = higher score for small-cap factor
  },

  // Volatility Factor
  {
    factor_code: 'low_volatility',
    factor_name: 'Low Volatility',
    factor_category: 'volatility',
    description: 'Inverse of price volatility',
    calculation_method: 'rank',
    primary_metric: 'volatility_252d',
    higher_is_better: 0  // Lower vol = higher score
  },

  // Dividend Factor
  {
    factor_code: 'dividend_yield',
    factor_name: 'Dividend Yield',
    factor_category: 'income',
    description: 'Annual dividend yield',
    calculation_method: 'rank',
    primary_metric: 'dividend_yield',
    higher_is_better: 1
  }
];

const insertFactor = db.prepare(`
  INSERT OR IGNORE INTO factor_definitions (
    factor_code, factor_name, factor_category, description,
    calculation_method, primary_metric, secondary_metrics, higher_is_better
  ) VALUES (
    @factor_code, @factor_name, @factor_category, @description,
    @calculation_method, @primary_metric, @secondary_metrics, @higher_is_better
  )
`);

for (const factor of factorDefinitions) {
  insertFactor.run({
    ...factor,
    secondary_metrics: factor.secondary_metrics || null
  });
}

console.log(`✅ Seeded ${factorDefinitions.length} factor definitions`);

// ============================================
// Helper Views
// ============================================

// View: Latest factor scores per stock
db.exec(`
  CREATE VIEW IF NOT EXISTS v_latest_factor_scores AS
  SELECT sfs.*
  FROM stock_factor_scores sfs
  INNER JOIN (
    SELECT company_id, MAX(score_date) as max_date
    FROM stock_factor_scores
    GROUP BY company_id
  ) latest ON sfs.company_id = latest.company_id AND sfs.score_date = latest.max_date
`);

// View: Investor factor style summary
db.exec(`
  CREATE VIEW IF NOT EXISTS v_investor_factor_style AS
  SELECT
    fi.id as investor_id,
    fi.name as investor_name,
    fi.investment_style,
    pfe.snapshot_date,
    pfe.avg_value_score,
    pfe.avg_quality_score,
    pfe.avg_momentum_score,
    pfe.avg_growth_score,
    pfe.style_box,
    pfe.value_tilt,
    pfe.quality_tilt,
    pfe.size_tilt,
    CASE
      WHEN pfe.value_tilt > 0.5 AND pfe.quality_tilt > 0.5 THEN 'Quality Value'
      WHEN pfe.value_tilt > 0.5 THEN 'Deep Value'
      WHEN pfe.quality_tilt > 0.5 AND pfe.growth_tilt > 0.5 THEN 'Quality Growth'
      WHEN pfe.growth_tilt > 0.5 THEN 'High Growth'
      WHEN pfe.momentum_tilt > 0.5 THEN 'Momentum'
      WHEN pfe.quality_tilt > 0.5 THEN 'Quality'
      ELSE 'Blend'
    END as factor_style
  FROM famous_investors fi
  LEFT JOIN portfolio_factor_exposures pfe ON fi.id = pfe.investor_id
`);

// View: Factor performance by decision type
db.exec(`
  CREATE VIEW IF NOT EXISTS v_factor_decision_performance AS
  SELECT
    dfc.dominant_factor,
    d.decision_type,
    COUNT(*) as decision_count,
    AVG(d.return_1y) as avg_return_1y,
    AVG(d.alpha_1y) as avg_alpha_1y,
    SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate,
    AVG(dfc.value_percentile) as avg_value_pct,
    AVG(dfc.quality_percentile) as avg_quality_pct,
    AVG(dfc.momentum_percentile) as avg_momentum_pct
  FROM decision_factor_context dfc
  JOIN investment_decisions d ON dfc.decision_id = d.id
  WHERE d.return_1y IS NOT NULL
  GROUP BY dfc.dominant_factor, d.decision_type
  ORDER BY avg_alpha_1y DESC
`);

console.log('✅ Created helper views');

console.log('\n✅ Factor Analysis migration complete!\n');
