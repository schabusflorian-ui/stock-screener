// src/database-migrations/add-macro-data.js
// Macroeconomic Data Infrastructure
// Supports FRED API integration and macro regime detection

const db = require('../database').db;

console.log('\n📊 Creating Macroeconomic Data tables...\n');

// ============================================
// TABLE: Economic Indicators
// Stores time series from FRED and other sources
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS economic_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    series_name TEXT,
    category TEXT,           -- rates, inflation, employment, growth, credit, housing
    frequency TEXT,          -- daily, weekly, monthly, quarterly
    units TEXT,
    observation_date DATE NOT NULL,
    value REAL,

    -- Derived metrics
    change_1d REAL,
    change_1w REAL,
    change_1m REAL,
    change_3m REAL,
    change_1y REAL,

    -- Percentile ranks (vs history)
    percentile_1y REAL,
    percentile_5y REAL,
    percentile_10y REAL,

    -- Z-scores
    zscore_1y REAL,
    zscore_5y REAL,

    source TEXT DEFAULT 'FRED',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    UNIQUE(series_id, observation_date)
  );

  CREATE INDEX IF NOT EXISTS idx_econ_series ON economic_indicators(series_id);
  CREATE INDEX IF NOT EXISTS idx_econ_date ON economic_indicators(observation_date DESC);
  CREATE INDEX IF NOT EXISTS idx_econ_category ON economic_indicators(category);
`);

console.log('✅ Created economic_indicators table');

// ============================================
// TABLE: Yield Curve
// Daily yield curve snapshots
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS yield_curve (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    curve_date DATE NOT NULL UNIQUE,

    -- Treasury yields by maturity
    y_1m REAL,
    y_3m REAL,
    y_6m REAL,
    y_1y REAL,
    y_2y REAL,
    y_3y REAL,
    y_5y REAL,
    y_7y REAL,
    y_10y REAL,
    y_20y REAL,
    y_30y REAL,

    -- Key spreads
    spread_2s10s REAL,       -- 10Y - 2Y (classic inversion indicator)
    spread_3m10y REAL,       -- 10Y - 3M (Fed's preferred)
    spread_2s30s REAL,       -- 30Y - 2Y

    -- Curve characteristics
    slope REAL,              -- Linear regression slope
    curvature REAL,          -- Butterfly spread (2*5Y - 2Y - 10Y)
    level REAL,              -- Average yield

    -- Inversion flags
    is_inverted_2s10s INTEGER DEFAULT 0,
    is_inverted_3m10y INTEGER DEFAULT 0,
    consecutive_inversion_days INTEGER DEFAULT 0,

    -- Historical context
    spread_percentile_2s10s REAL,
    spread_percentile_3m10y REAL,

    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_yield_curve_date ON yield_curve(curve_date DESC);
`);

console.log('✅ Created yield_curve table');

// ============================================
// TABLE: Macro Regimes
// Economic regime classification
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS macro_regimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    regime_date DATE NOT NULL UNIQUE,

    -- Component regimes
    growth_regime TEXT CHECK (growth_regime IN ('expansion', 'peak', 'contraction', 'trough')),
    inflation_regime TEXT CHECK (inflation_regime IN ('deflation', 'low', 'moderate', 'high', 'very_high')),
    policy_regime TEXT CHECK (policy_regime IN ('very_easy', 'easy', 'neutral', 'tight', 'very_tight')),
    credit_regime TEXT CHECK (credit_regime IN ('very_tight', 'tight', 'normal', 'loose', 'very_loose')),
    volatility_regime TEXT CHECK (volatility_regime IN ('calm', 'normal', 'elevated', 'high', 'crisis')),

    -- Composite classification
    macro_regime TEXT,       -- goldilocks, reflation, stagflation, deflation, crisis
    regime_confidence REAL,

    -- Key indicators at time of classification
    gdp_growth_yoy REAL,
    cpi_yoy REAL,
    unemployment_rate REAL,
    fed_funds_rate REAL,
    yield_curve_spread REAL,
    credit_spread REAL,
    vix REAL,

    -- Signals
    recession_probability REAL,
    expansion_months INTEGER,
    cycle_phase TEXT,        -- early, mid, late, recession

    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_macro_regime_date ON macro_regimes(regime_date DESC);
`);

console.log('✅ Created macro_regimes table');

// ============================================
// TABLE: Series Definitions
// Metadata for tracked economic series
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS economic_series_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT UNIQUE NOT NULL,
    series_name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    frequency TEXT,
    units TEXT,
    seasonal_adjustment TEXT,
    source TEXT DEFAULT 'FRED',
    description TEXT,
    is_active INTEGER DEFAULT 1,
    last_updated DATE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_series_def_category ON economic_series_definitions(category);
`);

// Seed key series definitions
const seriesDefinitions = [
  // Interest Rates
  { series_id: 'DFF', series_name: 'Federal Funds Effective Rate', category: 'rates', subcategory: 'policy', frequency: 'daily', units: 'percent' },
  { series_id: 'DFEDTARU', series_name: 'Fed Funds Target Upper', category: 'rates', subcategory: 'policy', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS1MO', series_name: '1-Month Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS3MO', series_name: '3-Month Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS6MO', series_name: '6-Month Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS1', series_name: '1-Year Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS2', series_name: '2-Year Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS5', series_name: '5-Year Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS10', series_name: '10-Year Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'DGS30', series_name: '30-Year Treasury', category: 'rates', subcategory: 'treasury', frequency: 'daily', units: 'percent' },
  { series_id: 'T10Y2Y', series_name: '10Y-2Y Spread', category: 'rates', subcategory: 'spreads', frequency: 'daily', units: 'percent' },
  { series_id: 'T10Y3M', series_name: '10Y-3M Spread', category: 'rates', subcategory: 'spreads', frequency: 'daily', units: 'percent' },

  // Inflation
  { series_id: 'CPIAUCSL', series_name: 'CPI All Items', category: 'inflation', subcategory: 'headline', frequency: 'monthly', units: 'index' },
  { series_id: 'CPILFESL', series_name: 'Core CPI (ex Food & Energy)', category: 'inflation', subcategory: 'core', frequency: 'monthly', units: 'index' },
  { series_id: 'PCEPI', series_name: 'PCE Price Index', category: 'inflation', subcategory: 'headline', frequency: 'monthly', units: 'index' },
  { series_id: 'PCEPILFE', series_name: 'Core PCE (ex Food & Energy)', category: 'inflation', subcategory: 'core', frequency: 'monthly', units: 'index' },
  { series_id: 'T5YIE', series_name: '5-Year Breakeven Inflation', category: 'inflation', subcategory: 'expectations', frequency: 'daily', units: 'percent' },
  { series_id: 'T10YIE', series_name: '10-Year Breakeven Inflation', category: 'inflation', subcategory: 'expectations', frequency: 'daily', units: 'percent' },

  // Employment
  { series_id: 'UNRATE', series_name: 'Unemployment Rate', category: 'employment', subcategory: 'headline', frequency: 'monthly', units: 'percent' },
  { series_id: 'PAYEMS', series_name: 'Nonfarm Payrolls', category: 'employment', subcategory: 'jobs', frequency: 'monthly', units: 'thousands' },
  { series_id: 'ICSA', series_name: 'Initial Jobless Claims', category: 'employment', subcategory: 'claims', frequency: 'weekly', units: 'number' },
  { series_id: 'CCSA', series_name: 'Continuing Claims', category: 'employment', subcategory: 'claims', frequency: 'weekly', units: 'number' },
  { series_id: 'CIVPART', series_name: 'Labor Force Participation', category: 'employment', subcategory: 'participation', frequency: 'monthly', units: 'percent' },
  { series_id: 'AWHMAN', series_name: 'Avg Weekly Hours Manufacturing', category: 'employment', subcategory: 'hours', frequency: 'monthly', units: 'hours' },

  // Growth & Activity
  { series_id: 'GDP', series_name: 'Gross Domestic Product', category: 'growth', subcategory: 'gdp', frequency: 'quarterly', units: 'billions' },
  { series_id: 'GDPC1', series_name: 'Real GDP', category: 'growth', subcategory: 'gdp', frequency: 'quarterly', units: 'billions_chained' },
  { series_id: 'A191RL1Q225SBEA', series_name: 'Real GDP Growth (QoQ Annualized)', category: 'growth', subcategory: 'gdp', frequency: 'quarterly', units: 'percent' },
  { series_id: 'INDPRO', series_name: 'Industrial Production', category: 'growth', subcategory: 'production', frequency: 'monthly', units: 'index' },
  { series_id: 'RSAFS', series_name: 'Retail Sales', category: 'growth', subcategory: 'consumption', frequency: 'monthly', units: 'millions' },
  { series_id: 'DGORDER', series_name: 'Durable Goods Orders', category: 'growth', subcategory: 'orders', frequency: 'monthly', units: 'millions' },
  { series_id: 'NEWORDER', series_name: 'New Orders Manufacturing', category: 'growth', subcategory: 'orders', frequency: 'monthly', units: 'millions' },

  // Credit & Financial Conditions
  { series_id: 'BAMLH0A0HYM2', series_name: 'High Yield OAS', category: 'credit', subcategory: 'spreads', frequency: 'daily', units: 'percent' },
  { series_id: 'BAMLC0A0CM', series_name: 'IG Corporate OAS', category: 'credit', subcategory: 'spreads', frequency: 'daily', units: 'percent' },
  { series_id: 'TEDRATE', series_name: 'TED Spread', category: 'credit', subcategory: 'spreads', frequency: 'daily', units: 'percent' },
  { series_id: 'NFCI', series_name: 'Chicago Fed Financial Conditions', category: 'credit', subcategory: 'conditions', frequency: 'weekly', units: 'index' },
  { series_id: 'STLFSI4', series_name: 'St Louis Fed Financial Stress', category: 'credit', subcategory: 'stress', frequency: 'weekly', units: 'index' },

  // Volatility
  { series_id: 'VIXCLS', series_name: 'VIX', category: 'volatility', subcategory: 'equity', frequency: 'daily', units: 'index' },

  // Housing
  { series_id: 'HOUST', series_name: 'Housing Starts', category: 'housing', subcategory: 'construction', frequency: 'monthly', units: 'thousands' },
  { series_id: 'PERMIT', series_name: 'Building Permits', category: 'housing', subcategory: 'construction', frequency: 'monthly', units: 'thousands' },
  { series_id: 'CSUSHPISA', series_name: 'Case-Shiller Home Price', category: 'housing', subcategory: 'prices', frequency: 'monthly', units: 'index' },
  { series_id: 'MORTGAGE30US', series_name: '30-Year Mortgage Rate', category: 'housing', subcategory: 'rates', frequency: 'weekly', units: 'percent' },

  // Consumer & Sentiment
  { series_id: 'UMCSENT', series_name: 'U Michigan Consumer Sentiment', category: 'sentiment', subcategory: 'consumer', frequency: 'monthly', units: 'index' },
  { series_id: 'PCE', series_name: 'Personal Consumption', category: 'consumption', subcategory: 'total', frequency: 'monthly', units: 'billions' },
  { series_id: 'PSAVERT', series_name: 'Personal Savings Rate', category: 'consumption', subcategory: 'savings', frequency: 'monthly', units: 'percent' },

  // Commodities
  { series_id: 'DCOILWTICO', series_name: 'WTI Crude Oil', category: 'commodities', subcategory: 'energy', frequency: 'daily', units: 'dollars' },
  { series_id: 'DCOILBRENTEU', series_name: 'Brent Crude Oil', category: 'commodities', subcategory: 'energy', frequency: 'daily', units: 'dollars' },
  { series_id: 'GOLDAMGBD228NLBM', series_name: 'Gold Price', category: 'commodities', subcategory: 'metals', frequency: 'daily', units: 'dollars' },

  // Money Supply
  { series_id: 'M2SL', series_name: 'M2 Money Supply', category: 'money', subcategory: 'supply', frequency: 'monthly', units: 'billions' },
  { series_id: 'WALCL', series_name: 'Fed Balance Sheet', category: 'money', subcategory: 'fed', frequency: 'weekly', units: 'millions' },
];

const insertSeries = db.prepare(`
  INSERT OR IGNORE INTO economic_series_definitions
  (series_id, series_name, category, subcategory, frequency, units)
  VALUES (@series_id, @series_name, @category, @subcategory, @frequency, @units)
`);

for (const series of seriesDefinitions) {
  insertSeries.run(series);
}

console.log(`✅ Seeded ${seriesDefinitions.length} economic series definitions`);

// ============================================
// TABLE: Recession Indicators
// Leading recession probability indicators
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS recession_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    indicator_date DATE NOT NULL UNIQUE,

    -- NBER official (lagged)
    nber_recession INTEGER DEFAULT 0,

    -- Leading indicators
    yield_curve_signal INTEGER,           -- 1 if inverted
    sahm_rule_trigger INTEGER,            -- 1 if triggered
    leading_index_change REAL,            -- Conference Board LEI
    credit_conditions_signal INTEGER,     -- 1 if tightening

    -- Model-based probabilities
    recession_prob_3m REAL,               -- 3-month forward
    recession_prob_6m REAL,               -- 6-month forward
    recession_prob_12m REAL,              -- 12-month forward

    -- Composite
    composite_recession_score REAL,       -- 0-1 scale
    alert_level TEXT,                     -- green, yellow, orange, red

    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_recession_date ON recession_indicators(indicator_date DESC);
`);

console.log('✅ Created recession_indicators table');

// ============================================
// Helper Views
// ============================================

// Latest values for each series
db.exec(`
  CREATE VIEW IF NOT EXISTS v_latest_economic_indicators AS
  SELECT ei.*
  FROM economic_indicators ei
  INNER JOIN (
    SELECT series_id, MAX(observation_date) as max_date
    FROM economic_indicators
    GROUP BY series_id
  ) latest ON ei.series_id = latest.series_id AND ei.observation_date = latest.max_date
`);

// Current yield curve
db.exec(`
  CREATE VIEW IF NOT EXISTS v_current_yield_curve AS
  SELECT * FROM yield_curve
  ORDER BY curve_date DESC
  LIMIT 1
`);

// Current macro regime
db.exec(`
  CREATE VIEW IF NOT EXISTS v_current_macro_regime AS
  SELECT * FROM macro_regimes
  ORDER BY regime_date DESC
  LIMIT 1
`);

// Key rates summary
db.exec(`
  CREATE VIEW IF NOT EXISTS v_key_rates AS
  SELECT
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'DFF') as fed_funds,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'DGS2') as treasury_2y,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'DGS10') as treasury_10y,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'DGS30') as treasury_30y,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'T10Y2Y') as spread_2s10s,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'BAMLH0A0HYM2') as hy_spread,
    (SELECT value FROM v_latest_economic_indicators WHERE series_id = 'MORTGAGE30US') as mortgage_30y
`);

console.log('✅ Created helper views');

console.log('\n✅ Macroeconomic Data migration complete!\n');
