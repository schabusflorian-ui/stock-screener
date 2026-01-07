#!/usr/bin/env node
/**
 * Database Migration: Alternative Data & Risk Management Tables
 *
 * Creates tables for:
 * - Congressional trades (Quiver Quantitative)
 * - Short interest data (FINRA)
 * - Government contracts
 * - Alternative data signals (aggregated)
 * - Intrinsic value estimates
 * - Portfolio risk configuration
 * - Drawdown history
 * - Risk events audit log
 */

const db = require('../database');

console.log('\n📊 Running Alternative Data & Risk Management Migration...\n');

const dbConn = db.getDatabase();

// ============================================
// ALTERNATIVE DATA TABLES
// ============================================

// Congressional politicians
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS congressional_politicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,           -- Senator, Representative
    state TEXT,
    party TEXT,           -- D, R, I
    chamber TEXT,         -- Senate, House
    district TEXT,        -- For Representatives
    in_office INTEGER DEFAULT 1,
    net_worth_low INTEGER,
    net_worth_high INTEGER,
    track_record_score REAL,  -- -1 to +1 based on historical returns
    total_trades INTEGER DEFAULT 0,
    avg_return_30d REAL,
    avg_return_90d REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, chamber)
  );
  CREATE INDEX IF NOT EXISTS idx_politicians_track ON congressional_politicians(track_record_score DESC);
`);
console.log('  ✓ congressional_politicians table');

// Congressional trades
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS congressional_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    politician_id INTEGER REFERENCES congressional_politicians(id),
    company_id INTEGER REFERENCES companies(id),
    symbol TEXT NOT NULL,
    politician_name TEXT NOT NULL,
    transaction_date TEXT NOT NULL,
    disclosure_date TEXT NOT NULL,
    transaction_type TEXT NOT NULL,  -- purchase, sale, exchange
    asset_type TEXT,                 -- Stock, Stock Option, Bond
    amount_low INTEGER,              -- Transaction amount range
    amount_high INTEGER,
    description TEXT,
    source TEXT DEFAULT 'quiver',
    source_url TEXT,
    signal_score REAL,               -- Calculated signal contribution
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(politician_name, symbol, transaction_date, transaction_type)
  );
  CREATE INDEX IF NOT EXISTS idx_congress_symbol ON congressional_trades(symbol);
  CREATE INDEX IF NOT EXISTS idx_congress_company ON congressional_trades(company_id);
  CREATE INDEX IF NOT EXISTS idx_congress_date ON congressional_trades(transaction_date DESC);
  CREATE INDEX IF NOT EXISTS idx_congress_politician ON congressional_trades(politician_id);
`);
console.log('  ✓ congressional_trades table');

// Government contracts
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS government_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    symbol TEXT NOT NULL,
    contract_id TEXT,
    agency TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    award_date TEXT NOT NULL,
    completion_date TEXT,
    contract_type TEXT,        -- Fixed Price, Cost Plus, etc.
    naics_code TEXT,
    psc_code TEXT,
    is_competitive INTEGER,
    source TEXT DEFAULT 'quiver',
    signal_score REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(contract_id)
  );
  CREATE INDEX IF NOT EXISTS idx_contracts_symbol ON government_contracts(symbol);
  CREATE INDEX IF NOT EXISTS idx_contracts_company ON government_contracts(company_id);
  CREATE INDEX IF NOT EXISTS idx_contracts_date ON government_contracts(award_date DESC);
  CREATE INDEX IF NOT EXISTS idx_contracts_amount ON government_contracts(amount DESC);
`);
console.log('  ✓ government_contracts table');

// Short interest data
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS short_interest (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    symbol TEXT NOT NULL,
    settlement_date TEXT NOT NULL,
    short_interest INTEGER NOT NULL,       -- Total shares shorted
    avg_daily_volume INTEGER,
    days_to_cover REAL,                    -- short_interest / avg_daily_volume
    shares_outstanding INTEGER,
    float_shares INTEGER,
    short_pct_outstanding REAL,            -- short_interest / shares_outstanding
    short_pct_float REAL,                  -- short_interest / float_shares
    prior_short_interest INTEGER,
    change_pct REAL,                       -- Change from prior period
    squeeze_score REAL,                    -- Calculated squeeze potential
    signal_score REAL,                     -- -1 (bearish) to +1 (squeeze opportunity)
    source TEXT DEFAULT 'finra',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, settlement_date)
  );
  CREATE INDEX IF NOT EXISTS idx_short_symbol ON short_interest(symbol);
  CREATE INDEX IF NOT EXISTS idx_short_company ON short_interest(company_id);
  CREATE INDEX IF NOT EXISTS idx_short_date ON short_interest(settlement_date DESC);
  CREATE INDEX IF NOT EXISTS idx_short_pct ON short_interest(short_pct_float DESC);
`);
console.log('  ✓ short_interest table');

// Aggregated alternative data signals
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS alternative_data_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    symbol TEXT NOT NULL,
    signal_date TEXT NOT NULL,

    -- Individual signal components
    congress_signal REAL,           -- -1 to +1
    congress_buy_count INTEGER DEFAULT 0,
    congress_sell_count INTEGER DEFAULT 0,
    congress_net_amount REAL,

    short_interest_signal REAL,     -- -1 to +1
    short_pct_float REAL,
    days_to_cover REAL,
    is_squeeze_candidate INTEGER DEFAULT 0,

    contract_signal REAL,           -- 0 to +1
    recent_contract_value REAL,
    contract_to_mcap_ratio REAL,

    -- Combined scores
    combined_score REAL,            -- Weighted average of signals
    confidence REAL,                -- 0 to 1 based on data availability
    data_sources INTEGER,           -- Count of data sources with data

    -- Metadata
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, signal_date)
  );
  CREATE INDEX IF NOT EXISTS idx_altsig_symbol ON alternative_data_signals(symbol);
  CREATE INDEX IF NOT EXISTS idx_altsig_company ON alternative_data_signals(company_id);
  CREATE INDEX IF NOT EXISTS idx_altsig_date ON alternative_data_signals(signal_date DESC);
  CREATE INDEX IF NOT EXISTS idx_altsig_score ON alternative_data_signals(combined_score DESC);
`);
console.log('  ✓ alternative_data_signals table');

// ============================================
// RISK MANAGEMENT TABLES
// ============================================

// Intrinsic value estimates (multiple methods)
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS intrinsic_value_estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id),
    symbol TEXT NOT NULL,
    estimate_date TEXT NOT NULL,

    -- DCF Method
    dcf_value REAL,
    dcf_confidence REAL,
    dcf_assumptions TEXT,           -- JSON with growth, discount rate, terminal

    -- Graham Number
    graham_number REAL,
    eps_used REAL,
    book_value_used REAL,

    -- Earnings Power Value
    epv_value REAL,
    normalized_earnings REAL,
    cost_of_equity REAL,

    -- Asset-Based (Book Value)
    book_value_per_share REAL,
    tangible_book_value REAL,

    -- Dividend Discount Model
    ddm_value REAL,
    dividend_used REAL,
    dividend_growth_rate REAL,

    -- Combined estimate
    weighted_intrinsic_value REAL,
    method_weights TEXT,            -- JSON with weights used
    confidence_level REAL,          -- 0 to 1
    data_quality_score REAL,        -- How complete is the data

    -- Current market comparison
    current_price REAL,
    margin_of_safety REAL,          -- (intrinsic - price) / intrinsic
    valuation_signal TEXT,          -- UNDERVALUED, FAIR, OVERVALUED

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, estimate_date)
  );
  CREATE INDEX IF NOT EXISTS idx_intrinsic_symbol ON intrinsic_value_estimates(symbol);
  CREATE INDEX IF NOT EXISTS idx_intrinsic_company ON intrinsic_value_estimates(company_id);
  CREATE INDEX IF NOT EXISTS idx_intrinsic_date ON intrinsic_value_estimates(estimate_date DESC);
  CREATE INDEX IF NOT EXISTS idx_intrinsic_mos ON intrinsic_value_estimates(margin_of_safety DESC);
`);
console.log('  ✓ intrinsic_value_estimates table');

// Portfolio risk configuration
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_risk_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER REFERENCES portfolios(id) UNIQUE,

    -- Margin of Safety requirements
    min_margin_of_safety REAL DEFAULT 0.25,
    margin_outside_competence REAL DEFAULT 0.35,

    -- Circle of Competence
    core_sectors TEXT,              -- JSON array of familiar sectors
    core_industries TEXT,           -- JSON array of familiar industries
    require_competence_check INTEGER DEFAULT 1,

    -- Concentration limits
    max_position_pct REAL DEFAULT 0.20,     -- Max single position % of portfolio
    max_sector_pct REAL DEFAULT 0.35,       -- Max sector concentration
    max_positions INTEGER DEFAULT 15,
    min_positions INTEGER DEFAULT 5,

    -- Barbell allocation
    target_safe_pct REAL DEFAULT 0.85,      -- Target % in safe sleeve
    min_safe_pct REAL DEFAULT 0.75,         -- Critical threshold
    target_cash_pct REAL DEFAULT 0.05,      -- Target cash reserve
    max_speculative_pct REAL DEFAULT 0.15,  -- Max in speculative sleeve

    -- Safe sleeve criteria
    safe_min_market_cap REAL DEFAULT 10000000000,  -- $10B
    safe_max_beta REAL DEFAULT 1.2,
    safe_max_debt_to_equity REAL DEFAULT 1.0,

    -- Drawdown management
    max_portfolio_drawdown REAL DEFAULT 0.20,   -- Alert at 20%
    max_position_drawdown REAL DEFAULT 0.30,    -- Trim at 30%
    drawdown_action TEXT DEFAULT 'alert',       -- alert, trim, close

    -- Tail hedge
    target_tail_hedge_pct REAL DEFAULT 0.03,    -- 3% portfolio in tail hedges
    tail_hedge_instruments TEXT,                -- JSON: UVXY, put options, etc.

    -- Kelly criterion adjustments
    kelly_fraction REAL DEFAULT 0.5,            -- Half Kelly by default
    max_kelly_bet REAL DEFAULT 0.25,            -- Never more than 25%

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('  ✓ portfolio_risk_config table');

// Drawdown history
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS drawdown_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER REFERENCES portfolios(id),

    -- Drawdown event
    start_date TEXT NOT NULL,
    trough_date TEXT,
    recovery_date TEXT,

    -- Magnitudes
    peak_value REAL NOT NULL,
    trough_value REAL,
    current_value REAL,
    max_drawdown_pct REAL,
    current_drawdown_pct REAL,

    -- Duration
    days_to_trough INTEGER,
    days_to_recovery INTEGER,
    is_recovered INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,

    -- Attribution
    primary_contributors TEXT,      -- JSON: [{symbol, contribution_pct}]
    sector_attribution TEXT,        -- JSON: sector breakdown

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_dd_portfolio ON drawdown_history(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_dd_active ON drawdown_history(is_active, portfolio_id);
`);
console.log('  ✓ drawdown_history table');

// Risk events audit log
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS risk_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER REFERENCES portfolios(id),
    company_id INTEGER REFERENCES companies(id),

    event_type TEXT NOT NULL,       -- margin_of_safety, concentration, drawdown, barbell, etc.
    severity TEXT NOT NULL,         -- info, warning, critical, blocked

    -- Event details
    check_name TEXT,
    check_result TEXT,              -- passed, failed, warning
    required_value REAL,
    actual_value REAL,

    -- Context
    trade_context TEXT,             -- JSON with trade details if applicable
    message TEXT,
    recommendation TEXT,

    -- Resolution
    resolved INTEGER DEFAULT 0,
    resolution_action TEXT,
    resolved_at TEXT,
    resolved_by TEXT,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_risk_portfolio ON risk_events(portfolio_id);
  CREATE INDEX IF NOT EXISTS idx_risk_company ON risk_events(company_id);
  CREATE INDEX IF NOT EXISTS idx_risk_type ON risk_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_risk_severity ON risk_events(severity);
  CREATE INDEX IF NOT EXISTS idx_risk_unresolved ON risk_events(resolved, portfolio_id);
`);
console.log('  ✓ risk_events table');

// ============================================
// VERIFICATION
// ============================================

console.log('\n✅ Migration complete!\n');

// Verify tables
const tables = [
  'congressional_politicians',
  'congressional_trades',
  'government_contracts',
  'short_interest',
  'alternative_data_signals',
  'intrinsic_value_estimates',
  'portfolio_risk_config',
  'drawdown_history',
  'risk_events'
];

console.log('Verifying tables:');
for (const table of tables) {
  const count = dbConn.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get();
  console.log(`  ${table}: ${count.cnt} rows`);
}

console.log('\n📊 New tables created for alternative data and risk management.\n');

process.exit(0);
