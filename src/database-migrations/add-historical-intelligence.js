// src/database-migrations/add-historical-intelligence.js
// Database migration for Historical Intelligence System
// Enables pattern recognition, precedent finding, and historically-informed AI analysis

const db = require('../database').db;

console.log('🧠 Running Historical Intelligence migration...');

// ============================================
// TABLE: Investment Decisions
// Core table capturing each investment decision by famous investors
// with full context at the time of the decision
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investment_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Decision identification
    investor_id INTEGER NOT NULL,
    company_id INTEGER,
    cusip TEXT,
    symbol TEXT,
    security_name TEXT,

    -- Decision details
    decision_date DATE NOT NULL,
    report_date DATE,
    decision_type TEXT NOT NULL,  -- 'new_position', 'increased', 'decreased', 'sold_out', 'held'

    -- Position details at decision time
    shares REAL,
    position_value REAL,
    portfolio_weight REAL,
    previous_shares REAL,
    shares_change REAL,
    shares_change_pct REAL,

    -- Conviction indicators
    is_top_10_position INTEGER DEFAULT 0,
    is_new_position INTEGER DEFAULT 0,
    position_size_category TEXT,  -- 'core', 'significant', 'starter', 'trimmed'

    -- Stock context at decision time (captured from calculated_metrics)
    stock_price REAL,
    market_cap REAL,
    enterprise_value REAL,

    -- Valuation metrics at decision
    pe_ratio REAL,
    pb_ratio REAL,
    ps_ratio REAL,
    ev_ebitda REAL,
    ev_revenue REAL,
    fcf_yield REAL,
    earnings_yield REAL,
    dividend_yield REAL,

    -- Growth metrics at decision
    revenue_growth_yoy REAL,
    revenue_growth_3y_cagr REAL,
    earnings_growth_yoy REAL,
    fcf_growth_yoy REAL,

    -- Profitability metrics at decision
    gross_margin REAL,
    operating_margin REAL,
    net_margin REAL,
    roe REAL,
    roic REAL,
    roa REAL,

    -- Quality/Safety metrics at decision
    debt_to_equity REAL,
    debt_to_assets REAL,
    current_ratio REAL,
    interest_coverage REAL,
    fcf_per_share REAL,

    -- Sector/Industry context
    sector TEXT,
    industry TEXT,

    -- Market context at decision (from market_context_snapshots)
    market_context_id INTEGER,
    sp500_pe REAL,
    sp500_1y_return REAL,
    vix REAL,
    fed_funds_rate REAL,
    yield_curve_spread REAL,  -- 10Y - 2Y treasury
    market_cycle TEXT,  -- 'early_bull', 'mid_bull', 'late_bull', 'bear', 'recovery'

    -- Outcomes (calculated after the fact)
    outcome_calculated_at DATETIME,
    return_1m REAL,
    return_3m REAL,
    return_6m REAL,
    return_1y REAL,
    return_2y REAL,
    return_3y REAL,
    return_5y REAL,
    max_drawdown_1y REAL,
    max_gain_1y REAL,
    sp500_return_1y REAL,
    alpha_1y REAL,  -- return_1y - sp500_return_1y

    -- Outcome classification
    outcome_category TEXT,  -- 'big_winner', 'winner', 'neutral', 'loser', 'big_loser'
    beat_market_1y INTEGER,  -- 1 if outperformed S&P 500

    -- Holding period tracking
    still_held INTEGER DEFAULT 1,
    exit_date DATE,
    exit_price REAL,
    total_return REAL,
    holding_period_days INTEGER,
    annualized_return REAL,

    -- Pattern matching (set by PatternExtractor)
    primary_pattern_id INTEGER,
    pattern_confidence REAL,
    pattern_tags TEXT,  -- JSON array of pattern tags

    -- Thesis/Notes (if known from investor letters, etc.)
    thesis_summary TEXT,
    lessons_learned TEXT,

    -- Metadata
    data_quality_score REAL,  -- 0-100, indicates completeness of context data
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id),
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (market_context_id) REFERENCES market_context_snapshots(id),
    FOREIGN KEY (primary_pattern_id) REFERENCES investment_patterns(id)
  );
`);

// Create comprehensive indexes for flexible querying
db.exec(`
  -- Core lookups
  CREATE INDEX IF NOT EXISTS idx_decisions_investor ON investment_decisions(investor_id, decision_date DESC);
  CREATE INDEX IF NOT EXISTS idx_decisions_company ON investment_decisions(company_id, decision_date DESC);
  CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON investment_decisions(symbol, decision_date DESC);
  CREATE INDEX IF NOT EXISTS idx_decisions_date ON investment_decisions(decision_date DESC);
  CREATE INDEX IF NOT EXISTS idx_decisions_type ON investment_decisions(decision_type);

  -- Pattern and outcome analysis
  CREATE INDEX IF NOT EXISTS idx_decisions_pattern ON investment_decisions(primary_pattern_id);
  CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON investment_decisions(outcome_category);
  CREATE INDEX IF NOT EXISTS idx_decisions_beat_market ON investment_decisions(beat_market_1y);

  -- Sector/industry analysis
  CREATE INDEX IF NOT EXISTS idx_decisions_sector ON investment_decisions(sector);
  CREATE INDEX IF NOT EXISTS idx_decisions_industry ON investment_decisions(industry);

  -- Valuation-based lookups (for finding similar situations)
  CREATE INDEX IF NOT EXISTS idx_decisions_pe ON investment_decisions(pe_ratio);
  CREATE INDEX IF NOT EXISTS idx_decisions_pb ON investment_decisions(pb_ratio);
  CREATE INDEX IF NOT EXISTS idx_decisions_roic ON investment_decisions(roic);
  CREATE INDEX IF NOT EXISTS idx_decisions_fcf_yield ON investment_decisions(fcf_yield);

  -- Combined indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_decisions_sector_pe ON investment_decisions(sector, pe_ratio);
  CREATE INDEX IF NOT EXISTS idx_decisions_investor_outcome ON investment_decisions(investor_id, outcome_category);
  CREATE INDEX IF NOT EXISTS idx_decisions_new_positions ON investment_decisions(decision_type, decision_date DESC);
`);

console.log('✅ Created investment_decisions table with comprehensive indexes');

// ============================================
// TABLE: Market Context Snapshots
// Captures overall market conditions at specific points in time
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS market_context_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE UNIQUE NOT NULL,

    -- Major index levels and valuations
    sp500_level REAL,
    sp500_pe REAL,
    sp500_forward_pe REAL,
    sp500_pb REAL,
    sp500_dividend_yield REAL,
    sp500_earnings_yield REAL,

    -- Index returns at snapshot date
    sp500_1m_return REAL,
    sp500_3m_return REAL,
    sp500_6m_return REAL,
    sp500_1y_return REAL,
    sp500_3y_cagr REAL,
    sp500_5y_cagr REAL,

    -- Other major indexes
    nasdaq_level REAL,
    nasdaq_pe REAL,
    russell2000_level REAL,

    -- Volatility and sentiment
    vix REAL,
    vix_3m_avg REAL,
    put_call_ratio REAL,

    -- Interest rates
    fed_funds_rate REAL,
    treasury_3m REAL,
    treasury_2y REAL,
    treasury_10y REAL,
    treasury_30y REAL,
    yield_curve_spread REAL,  -- 10Y - 2Y

    -- Credit spreads
    investment_grade_spread REAL,
    high_yield_spread REAL,

    -- Economic indicators
    gdp_growth REAL,
    unemployment_rate REAL,
    inflation_rate REAL,
    consumer_confidence REAL,

    -- Market cycle classification
    market_cycle TEXT,
    cycle_confidence REAL,

    -- Market breadth
    sp500_above_200dma_pct REAL,  -- % of S&P 500 stocks above 200 DMA
    advance_decline_ratio REAL,
    new_highs_new_lows REAL,

    -- Sector performance (1Y returns)
    sector_technology_return REAL,
    sector_healthcare_return REAL,
    sector_financials_return REAL,
    sector_consumer_disc_return REAL,
    sector_consumer_staples_return REAL,
    sector_industrials_return REAL,
    sector_energy_return REAL,
    sector_utilities_return REAL,
    sector_materials_return REAL,
    sector_real_estate_return REAL,
    sector_communication_return REAL,

    -- Metadata
    data_completeness REAL,  -- 0-100
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_market_context_date ON market_context_snapshots(snapshot_date DESC);
  CREATE INDEX IF NOT EXISTS idx_market_context_cycle ON market_context_snapshots(market_cycle);
  CREATE INDEX IF NOT EXISTS idx_market_context_vix ON market_context_snapshots(vix);
`);

console.log('✅ Created market_context_snapshots table');

// ============================================
// TABLE: Investment Patterns
// Discovered patterns from clustering historical decisions
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investment_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Pattern identification
    pattern_code TEXT UNIQUE NOT NULL,  -- e.g., 'deep_value', 'quality_growth', 'turnaround'
    pattern_name TEXT NOT NULL,
    pattern_category TEXT,  -- 'value', 'growth', 'special_situations', 'macro'
    description TEXT,

    -- Pattern characteristics (typical metric ranges)
    -- Stored as JSON for flexibility
    typical_metrics JSONB,  -- {"pe_ratio": {"min": 5, "max": 15, "avg": 10}, ...}
    typical_context JSONB,  -- {"market_cycle": ["bear", "recovery"], "sector": ["financials"]}

    -- Entry criteria
    entry_criteria TEXT,  -- Human-readable description
    entry_signals JSONB,  -- Specific signals that trigger pattern match

    -- Historical performance
    sample_size INTEGER DEFAULT 0,
    success_rate REAL,  -- % that outperformed market
    avg_return_1y REAL,
    avg_return_3y REAL,
    median_return_1y REAL,
    best_return_1y REAL,
    worst_return_1y REAL,
    avg_max_drawdown REAL,
    sharpe_ratio REAL,

    -- Risk characteristics
    avg_holding_period_days REAL,
    win_rate REAL,  -- % of positive returns
    profit_factor REAL,  -- gross gains / gross losses

    -- Associated investors
    top_investors JSONB,  -- [{"id": 1, "name": "Buffett", "count": 45}, ...]
    investor_success_rates JSONB,  -- {"1": 0.82, "2": 0.65, ...} investor_id -> success rate

    -- Example decisions (for few-shot learning)
    example_decisions JSONB,  -- Array of notable decision IDs with brief descriptions

    -- Key differentiators (what separates winners from losers)
    success_factors JSONB,
    failure_factors JSONB,

    -- Clustering metadata
    cluster_method TEXT,
    cluster_params JSONB,
    silhouette_score REAL,

    -- Usage tracking
    times_matched INTEGER DEFAULT 0,
    last_matched_at DATETIME,

    -- Metadata
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_patterns_code ON investment_patterns(pattern_code);
  CREATE INDEX IF NOT EXISTS idx_patterns_category ON investment_patterns(pattern_category);
  CREATE INDEX IF NOT EXISTS idx_patterns_success ON investment_patterns(success_rate DESC);
  CREATE INDEX IF NOT EXISTS idx_patterns_sample ON investment_patterns(sample_size DESC);
`);

console.log('✅ Created investment_patterns table');

// ============================================
// TABLE: Historical Precedents
// Pre-computed similar historical situations for fast retrieval
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS historical_precedents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- The historical situation
    symbol TEXT NOT NULL,
    company_name TEXT,
    precedent_date DATE NOT NULL,

    -- Situation description
    situation_type TEXT,  -- 'high_growth_tech', 'value_trap', 'turnaround', etc.
    situation_summary TEXT,
    narrative_context TEXT,  -- What was the story at the time?

    -- Key metrics at the time
    price REAL,
    market_cap REAL,
    pe_ratio REAL,
    pb_ratio REAL,
    ps_ratio REAL,
    ev_ebitda REAL,
    revenue_growth REAL,
    earnings_growth REAL,
    roic REAL,
    roe REAL,
    net_margin REAL,
    debt_to_equity REAL,
    fcf_yield REAL,

    -- Context
    sector TEXT,
    industry TEXT,
    market_cycle TEXT,
    sp500_pe REAL,
    vix REAL,

    -- What happened (outcomes)
    outcome_1y REAL,
    outcome_3y REAL,
    outcome_5y REAL,
    max_drawdown_1y REAL,
    sp500_return_1y REAL,
    alpha_1y REAL,

    -- Outcome classification
    outcome_summary TEXT,
    outcome_category TEXT,  -- 'big_winner', 'winner', 'neutral', 'loser', 'big_loser'

    -- Key lessons
    lessons JSONB,  -- Array of lesson strings
    warning_signs JSONB,  -- What should have been noticed
    success_factors JSONB,  -- What made it work (if it did)

    -- Famous investor involvement
    investors_who_bought JSONB,  -- [{"id": 1, "name": "Buffett", "date": "2011-03-15"}]
    investors_who_sold JSONB,

    -- Similarity matching (for vector search if needed later)
    metrics_vector TEXT,  -- Normalized metrics as comma-separated values

    -- Categorization tags for filtering
    tags JSONB,  -- ["high_pe", "tech", "ai_related", "slowing_growth"]

    -- Relevance scoring (updated as it's used)
    times_retrieved INTEGER DEFAULT 0,
    avg_relevance_score REAL,
    last_retrieved_at DATETIME,

    -- Metadata
    data_quality_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(symbol, precedent_date)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_precedents_symbol ON historical_precedents(symbol);
  CREATE INDEX IF NOT EXISTS idx_precedents_date ON historical_precedents(precedent_date DESC);
  CREATE INDEX IF NOT EXISTS idx_precedents_type ON historical_precedents(situation_type);
  CREATE INDEX IF NOT EXISTS idx_precedents_sector ON historical_precedents(sector);
  CREATE INDEX IF NOT EXISTS idx_precedents_outcome ON historical_precedents(outcome_category);

  -- For finding similar valuations
  CREATE INDEX IF NOT EXISTS idx_precedents_pe ON historical_precedents(pe_ratio);
  CREATE INDEX IF NOT EXISTS idx_precedents_sector_pe ON historical_precedents(sector, pe_ratio);

  -- For finding similar situations
  CREATE INDEX IF NOT EXISTS idx_precedents_situation ON historical_precedents(situation_type, sector);
`);

console.log('✅ Created historical_precedents table');

// ============================================
// TABLE: Decision-Pattern Associations
// Many-to-many relationship between decisions and patterns
// (a decision can match multiple patterns)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS decision_pattern_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision_id INTEGER NOT NULL,
    pattern_id INTEGER NOT NULL,
    match_confidence REAL,  -- 0-1
    match_score REAL,  -- Raw score from clustering
    matched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (decision_id) REFERENCES investment_decisions(id) ON DELETE CASCADE,
    FOREIGN KEY (pattern_id) REFERENCES investment_patterns(id) ON DELETE CASCADE,
    UNIQUE(decision_id, pattern_id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_decision_patterns_decision ON decision_pattern_matches(decision_id);
  CREATE INDEX IF NOT EXISTS idx_decision_patterns_pattern ON decision_pattern_matches(pattern_id);
`);

console.log('✅ Created decision_pattern_matches table');

// ============================================
// TABLE: Investor Track Records
// Pre-computed performance statistics per investor
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS investor_track_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    investor_id INTEGER NOT NULL,

    -- Time period for this record
    period_start DATE,
    period_end DATE,
    period_type TEXT,  -- 'all_time', '10y', '5y', '3y', '1y'

    -- Overall statistics
    total_decisions INTEGER,
    new_positions INTEGER,
    increased_positions INTEGER,
    decreased_positions INTEGER,
    sold_positions INTEGER,

    -- Performance metrics
    win_rate REAL,  -- % of decisions that beat market
    avg_return_1y REAL,
    median_return_1y REAL,
    avg_alpha_1y REAL,
    best_pick TEXT,  -- symbol
    best_pick_return REAL,
    worst_pick TEXT,
    worst_pick_return REAL,

    -- Style analysis
    avg_pe_at_purchase REAL,
    avg_market_cap_at_purchase REAL,
    avg_holding_period_days REAL,
    avg_position_size REAL,
    concentration_score REAL,  -- How concentrated is the portfolio

    -- Sector preferences
    sector_allocations JSONB,  -- {"Technology": 0.35, "Financials": 0.20, ...}
    sector_success_rates JSONB,  -- {"Technology": 0.72, "Financials": 0.65, ...}

    -- Pattern preferences
    pattern_usage JSONB,  -- {"deep_value": 45, "quality_growth": 30, ...}
    pattern_success JSONB,  -- {"deep_value": 0.78, "quality_growth": 0.65, ...}

    -- Timing analysis
    avg_entry_timing_score REAL,  -- How close to bottom did they buy
    avg_exit_timing_score REAL,  -- How close to top did they sell

    -- Market cycle performance
    bull_market_alpha REAL,
    bear_market_alpha REAL,

    -- Metadata
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (investor_id) REFERENCES famous_investors(id) ON DELETE CASCADE,
    UNIQUE(investor_id, period_type)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_track_records_investor ON investor_track_records(investor_id);
  CREATE INDEX IF NOT EXISTS idx_track_records_period ON investor_track_records(period_type);
`);

console.log('✅ Created investor_track_records table');

// ============================================
// TABLE: Similarity Cache
// Caches similarity scores between current stocks and historical precedents
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS similarity_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    current_symbol TEXT NOT NULL,
    current_date TEXT NOT NULL,
    precedent_id INTEGER NOT NULL,
    overall_similarity REAL,
    valuation_similarity REAL,
    growth_similarity REAL,
    quality_similarity REAL,
    context_similarity REAL,
    cached_at TEXT,
    expires_at TEXT,
    FOREIGN KEY (precedent_id) REFERENCES historical_precedents(id) ON DELETE CASCADE
  );
`);

try {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_similarity_unique ON similarity_cache(current_symbol, current_date, precedent_id)`);
} catch (e) {
  console.log('  Note: idx_similarity_unique already exists or creation skipped');
}
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_similarity_current ON similarity_cache(current_symbol, current_date)`);
} catch (e) {
  console.log('  Note: idx_similarity_current already exists or creation skipped');
}
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_similarity_expires ON similarity_cache(expires_at)`);
} catch (e) {
  console.log('  Note: idx_similarity_expires already exists or creation skipped');
}

console.log('✅ Created similarity_cache table');

// ============================================
// Seed Initial Investment Patterns
// Pre-defined patterns that will be refined by the PatternExtractor
// ============================================
const initialPatterns = [
  {
    pattern_code: 'deep_value',
    pattern_name: 'Deep Value',
    pattern_category: 'value',
    description: 'Stocks trading at significant discounts to intrinsic value, often due to temporary problems or market overreaction. Low P/E, low P/B, beaten down.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 3, max: 12, avg: 8 },
      pb_ratio: { min: 0.3, max: 1.5, avg: 0.9 },
      fcf_yield: { min: 8, max: 25, avg: 12 }
    }),
    entry_criteria: 'P/E < 12, P/B < 1.5, stock down >30% from highs, no bankruptcy risk'
  },
  {
    pattern_code: 'quality_value',
    pattern_name: 'Quality at Fair Price',
    pattern_category: 'value',
    description: 'High-quality businesses (strong ROIC, moats) at reasonable valuations. The Buffett approach.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 12, max: 22, avg: 16 },
      roic: { min: 15, max: 50, avg: 25 },
      roe: { min: 15, max: 40, avg: 22 },
      debt_to_equity: { min: 0, max: 0.5, avg: 0.2 }
    }),
    entry_criteria: 'ROIC > 15%, ROE > 15%, reasonable P/E, strong balance sheet, durable moat'
  },
  {
    pattern_code: 'quality_compounder',
    pattern_name: 'Quality Compounder',
    pattern_category: 'growth',
    description: 'Exceptional businesses with high returns on capital that can reinvest at high rates. Long-term compounding machines.',
    typical_metrics: JSON.stringify({
      roic: { min: 20, max: 60, avg: 30 },
      revenue_growth_yoy: { min: 10, max: 30, avg: 18 },
      net_margin: { min: 15, max: 40, avg: 22 }
    }),
    entry_criteria: 'ROIC > 20%, consistent growth, expanding margins, long reinvestment runway'
  },
  {
    pattern_code: 'growth_at_reasonable_price',
    pattern_name: 'GARP (Growth at Reasonable Price)',
    pattern_category: 'growth',
    description: 'Growing companies where the growth rate justifies the valuation. PEG ratio focus.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 15, max: 35, avg: 22 },
      revenue_growth_yoy: { min: 15, max: 40, avg: 25 },
      earnings_growth_yoy: { min: 15, max: 50, avg: 28 }
    }),
    entry_criteria: 'PEG < 1.5, consistent earnings growth, path to profitability clear'
  },
  {
    pattern_code: 'high_growth_premium',
    pattern_name: 'High Growth at Premium',
    pattern_category: 'growth',
    description: 'Very high growth companies commanding premium valuations. High risk, high reward.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 40, max: 150, avg: 65 },
      ps_ratio: { min: 10, max: 50, avg: 20 },
      revenue_growth_yoy: { min: 30, max: 100, avg: 50 }
    }),
    entry_criteria: 'Revenue growth > 30%, large TAM, network effects or switching costs, path to profitability'
  },
  {
    pattern_code: 'turnaround',
    pattern_name: 'Turnaround',
    pattern_category: 'special_situations',
    description: 'Companies with operational or financial issues that are showing signs of improvement under new management or strategy.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: -50, max: 20, avg: 12 },
      revenue_growth_yoy: { min: -10, max: 10, avg: 2 }
    }),
    entry_criteria: 'New management, cost cuts showing results, improving margins, reasonable debt load'
  },
  {
    pattern_code: 'cyclical_bottom',
    pattern_name: 'Cyclical Bottom',
    pattern_category: 'special_situations',
    description: 'Cyclical companies at or near the bottom of their cycle with depressed earnings and valuations.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 20, max: 100, avg: 40 },
      pb_ratio: { min: 0.5, max: 2, avg: 1.2 }
    }),
    entry_criteria: 'Below mid-cycle earnings, strong balance sheet to survive, industry consolidation'
  },
  {
    pattern_code: 'activist_target',
    pattern_name: 'Activist Target',
    pattern_category: 'special_situations',
    description: 'Companies targeted by activist investors for changes in capital allocation, strategy, or management.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 8, max: 25, avg: 15 }
    }),
    entry_criteria: 'Activist stake disclosed, clear path to value unlock, management receptive or board changing'
  },
  {
    pattern_code: 'dividend_value',
    pattern_name: 'Dividend Value',
    pattern_category: 'value',
    description: 'High-yield stocks with sustainable dividends trading at value prices.',
    typical_metrics: JSON.stringify({
      dividend_yield: { min: 3, max: 8, avg: 5 },
      pe_ratio: { min: 8, max: 18, avg: 12 },
      fcf_yield: { min: 6, max: 15, avg: 9 }
    }),
    entry_criteria: 'Dividend yield > 3%, payout ratio sustainable, no dividend cuts likely'
  },
  {
    pattern_code: 'fallen_angel',
    pattern_name: 'Fallen Angel',
    pattern_category: 'special_situations',
    description: 'Former high-flyers that have crashed but still have quality business underneath. Sentiment washout.',
    typical_metrics: JSON.stringify({
      pe_ratio: { min: 10, max: 25, avg: 16 }
    }),
    entry_criteria: 'Down >50% from highs, business fundamentally intact, temporary issues not permanent'
  }
];

const insertPattern = db.prepare(`
  INSERT OR IGNORE INTO investment_patterns
  (pattern_code, pattern_name, pattern_category, description, typical_metrics, entry_criteria)
  VALUES (@pattern_code, @pattern_name, @pattern_category, @description, @typical_metrics, @entry_criteria)
`);

const insertPatterns = db.transaction((patterns) => {
  for (const pattern of patterns) {
    insertPattern.run(pattern);
  }
});

insertPatterns(initialPatterns);

const patternCount = db.prepare('SELECT COUNT(*) as count FROM investment_patterns').get();
console.log(`✅ Seeded ${patternCount.count} initial investment patterns`);

// ============================================
// Helper Views for Common Queries
// ============================================

// View: Decisions with full investor and company info
db.exec(`
  CREATE VIEW IF NOT EXISTS v_decisions_enriched AS
  SELECT
    d.*,
    fi.name as investor_name,
    fi.fund_name,
    fi.investment_style as investor_style,
    c.name as company_name,
    ip.pattern_name,
    ip.pattern_category
  FROM investment_decisions d
  LEFT JOIN famous_investors fi ON d.investor_id = fi.id
  LEFT JOIN companies c ON d.company_id = c.id
  LEFT JOIN investment_patterns ip ON d.primary_pattern_id = ip.id;
`);

// View: Pattern performance summary
db.exec(`
  CREATE VIEW IF NOT EXISTS v_pattern_performance AS
  SELECT
    ip.id,
    ip.pattern_code,
    ip.pattern_name,
    ip.pattern_category,
    COUNT(d.id) as decision_count,
    AVG(d.return_1y) as avg_return_1y,
    AVG(d.alpha_1y) as avg_alpha_1y,
    SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(d.id) as win_rate,
    AVG(d.max_drawdown_1y) as avg_max_drawdown
  FROM investment_patterns ip
  LEFT JOIN investment_decisions d ON d.primary_pattern_id = ip.id
  WHERE d.return_1y IS NOT NULL
  GROUP BY ip.id;
`);

// View: Investor performance by sector
db.exec(`
  CREATE VIEW IF NOT EXISTS v_investor_sector_performance AS
  SELECT
    d.investor_id,
    fi.name as investor_name,
    d.sector,
    COUNT(*) as decision_count,
    AVG(d.return_1y) as avg_return_1y,
    AVG(d.alpha_1y) as avg_alpha_1y,
    SUM(CASE WHEN d.beat_market_1y = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as win_rate
  FROM investment_decisions d
  JOIN famous_investors fi ON d.investor_id = fi.id
  WHERE d.return_1y IS NOT NULL AND d.sector IS NOT NULL
  GROUP BY d.investor_id, d.sector
  HAVING COUNT(*) >= 3;
`);

console.log('✅ Created helper views');

console.log('🧠 Historical Intelligence migration complete!');

module.exports = { success: true };
