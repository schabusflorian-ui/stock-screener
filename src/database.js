// src/database.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'stocks.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

console.log('📊 Initializing database...');

// ============================================
// TABLE 1: Companies
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT UNIQUE NOT NULL,
    name TEXT,
    sector TEXT,
    industry TEXT,
    exchange TEXT,
    country TEXT DEFAULT 'US',
    market_cap REAL,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create indexes for fast lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_companies_symbol ON companies(symbol);
  CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
  CREATE INDEX IF NOT EXISTS idx_companies_market_cap ON companies(market_cap DESC);
  CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active) WHERE is_active = 1;
`);

// ============================================
// TABLE 2: Financial Data (flexible JSON storage)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS financial_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    statement_type TEXT NOT NULL, -- 'balance_sheet', 'income_statement', 'cash_flow'
    fiscal_date_ending DATE NOT NULL,
    fiscal_year INTEGER,
    fiscal_quarter INTEGER,
    period_type TEXT NOT NULL, -- 'annual' or 'quarterly'
    fiscal_period TEXT,         -- 'FY', 'Q1', 'Q2', 'Q3' (from SEC)
    form TEXT,                  -- '10-K' or '10-Q' (from SEC)
    filed_date TEXT,            -- When filed with SEC (for deduplication)

    -- Complete XBRL data (200+ fields preserved)
    data TEXT NOT NULL,         -- JSON blob with ALL financial line items

    -- Commonly accessed fields (extracted for query performance)
    -- Balance Sheet
    total_assets REAL,
    total_liabilities REAL,
    shareholder_equity REAL,
    current_assets REAL,
    current_liabilities REAL,
    cash_and_equivalents REAL,
    long_term_debt REAL,
    short_term_debt REAL,

    -- Income Statement
    total_revenue REAL,
    net_income REAL,
    operating_income REAL,
    cost_of_revenue REAL,
    gross_profit REAL,

    -- Cash Flow
    operating_cashflow REAL,
    capital_expenditures REAL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, statement_type, fiscal_date_ending, period_type)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_financial_company ON financial_data(company_id);
  CREATE INDEX IF NOT EXISTS idx_financial_date ON financial_data(fiscal_date_ending DESC);
  CREATE INDEX IF NOT EXISTS idx_financial_type ON financial_data(statement_type);
  CREATE INDEX IF NOT EXISTS idx_financial_company_date ON financial_data(company_id, fiscal_date_ending DESC);
`);

// ============================================
// TABLE 3: Calculated Metrics (denormalized for speed)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS calculated_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    fiscal_period DATE NOT NULL,
    period_type TEXT DEFAULT 'annual',
    
    -- Profitability Metrics
    roic REAL,
    roce REAL,
    roe REAL,
    roa REAL,
    operating_margin REAL,
    net_margin REAL,
    gross_margin REAL,
    
    -- Cash Flow Metrics
    fcf REAL,
    fcf_yield REAL,
    fcf_margin REAL,
    fcf_per_share REAL,
    
    -- Valuation Metrics
    pe_ratio REAL,
    pb_ratio REAL,
    ps_ratio REAL,
    peg_ratio REAL,
    pegy_ratio REAL,
    tobins_q REAL,
    ev_ebitda REAL,
    earnings_yield REAL,
    
    -- Quality Metrics
    debt_to_equity REAL,
    debt_to_assets REAL,
    current_ratio REAL,
    quick_ratio REAL,
    interest_coverage REAL,
    
    -- Growth Metrics
    revenue_growth_yoy REAL,
    earnings_growth_yoy REAL,
    fcf_growth_yoy REAL,
    
    -- Metadata
    data_quality_score INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, fiscal_period, period_type)
  );
`);

// Critical indexes for fast screening
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_metrics_company ON calculated_metrics(company_id);
  CREATE INDEX IF NOT EXISTS idx_metrics_period ON calculated_metrics(fiscal_period DESC);
  CREATE INDEX IF NOT EXISTS idx_metrics_roic ON calculated_metrics(roic DESC) WHERE roic IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_metrics_fcf ON calculated_metrics(fcf_yield DESC) WHERE fcf_yield IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_metrics_pe ON calculated_metrics(pe_ratio) WHERE pe_ratio IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_metrics_quality ON calculated_metrics(roic, debt_to_equity) 
    WHERE roic IS NOT NULL AND debt_to_equity IS NOT NULL;
`);

// ============================================
// TABLE 4: Stock Indexes (DAX, S&P 500, etc.)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_indexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL, -- 'DAX', 'SPX', 'NDX'
    name TEXT NOT NULL, -- 'DAX 40', 'S&P 500'
    country TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS index_constituents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id INTEGER NOT NULL,
    company_id INTEGER NOT NULL,
    weight REAL, -- For weighted calculations
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    removed_at DATETIME, -- NULL if still in index
    FOREIGN KEY (index_id) REFERENCES stock_indexes(id) ON DELETE CASCADE,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(index_id, company_id, added_at)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_constituents_index ON index_constituents(index_id);
  CREATE INDEX IF NOT EXISTS idx_constituents_company ON index_constituents(company_id);
  CREATE INDEX IF NOT EXISTS idx_constituents_active ON index_constituents(removed_at) 
    WHERE removed_at IS NULL;
`);

// ============================================
// TABLE 5: Index Metrics (aggregated)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS index_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    index_id INTEGER NOT NULL,
    calculation_date DATE NOT NULL,
    period_type TEXT DEFAULT 'annual',
    aggregation_method TEXT DEFAULT 'market_cap_weighted',
    
    -- Aggregated metrics
    weighted_roic REAL,
    median_roic REAL,
    weighted_fcf_yield REAL,
    median_fcf_yield REAL,
    weighted_pe_ratio REAL,
    median_pe_ratio REAL,
    weighted_pb_ratio REAL,
    median_pb_ratio REAL,
    
    -- Distribution metrics
    roic_percentile_25 REAL,
    roic_percentile_50 REAL,
    roic_percentile_75 REAL,
    
    -- Index-specific
    constituent_count INTEGER,
    total_market_cap REAL,
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (index_id) REFERENCES stock_indexes(id) ON DELETE CASCADE,
    UNIQUE(index_id, calculation_date, aggregation_method)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_index_metrics_date ON index_metrics(index_id, calculation_date DESC);
`);

// ============================================
// TABLE 6: Price History
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL NOT NULL,
    adjusted_close REAL,
    volume INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, date)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_prices_company_date ON daily_prices(company_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_prices_date ON daily_prices(date DESC);
`);

// ============================================
// TABLE 7: Data Fetch Log (track API usage)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS data_fetch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,
    endpoint_type TEXT, -- 'overview', 'balance_sheet', etc.
    fetch_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    success INTEGER DEFAULT 1,
    error_message TEXT,
    response_cached INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_fetch_log_company ON data_fetch_log(company_id, fetch_date DESC);
  CREATE INDEX IF NOT EXISTS idx_fetch_log_type ON data_fetch_log(endpoint_type, fetch_date DESC);
`);

// ============================================
// TABLE 8: Tracked Subreddits (dynamic discovery)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS tracked_subreddits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,           -- subreddit name without r/
    category TEXT DEFAULT 'general',     -- 'core', 'general', 'sector', 'discovered'
    priority INTEGER DEFAULT 50,         -- 1-100, higher = scan first
    is_active INTEGER DEFAULT 1,         -- whether to include in scans
    quality_score REAL DEFAULT 50,       -- 0-100, based on post quality

    -- Stats
    total_posts_scanned INTEGER DEFAULT 0,
    ticker_mentions_found INTEGER DEFAULT 0,
    avg_post_score REAL DEFAULT 0,
    avg_comments REAL DEFAULT 0,
    last_scanned_at DATETIME,

    -- Discovery metadata
    discovered_from TEXT,                -- which subreddit led to discovery
    discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_subreddits_active ON tracked_subreddits(is_active, priority DESC);
  CREATE INDEX IF NOT EXISTS idx_subreddits_quality ON tracked_subreddits(quality_score DESC);
`);

// Seed default subreddits if table is empty
const subredditCount = db.prepare('SELECT COUNT(*) as count FROM tracked_subreddits').get();
if (subredditCount.count === 0) {
  const seedSubreddits = db.prepare(`
    INSERT OR IGNORE INTO tracked_subreddits (name, category, priority, quality_score)
    VALUES (?, ?, ?, ?)
  `);

  // Core high-quality subreddits
  const coreSubreddits = [
    ['wallstreetbets', 'core', 100, 60],
    ['stocks', 'core', 95, 75],
    ['investing', 'core', 90, 80],
    ['stockmarket', 'core', 85, 70],
    ['options', 'core', 80, 65],
    ['SecurityAnalysis', 'core', 75, 90],
    ['ValueInvesting', 'core', 75, 85],
    ['dividends', 'core', 70, 80],
    ['thetagang', 'core', 65, 70],
    ['smallstreetbets', 'core', 60, 55],
  ];

  // Additional quality subreddits
  const additionalSubreddits = [
    ['FluentInFinance', 'general', 55, 75],
    ['Bogleheads', 'general', 50, 85],
    ['personalfinance', 'general', 45, 70],
    ['FinancialPlanning', 'general', 40, 75],
    ['pennystocks', 'general', 35, 40],
    ['RobinhoodTrade', 'general', 30, 50],
    ['SPACs', 'sector', 35, 55],
    ['weedstocks', 'sector', 25, 45],
    ['biotech', 'sector', 30, 65],
    ['semiconductor', 'sector', 30, 70],
    ['energy_stocks', 'sector', 25, 60],
    ['REITs', 'sector', 25, 70],
  ];

  for (const [name, category, priority, quality] of [...coreSubreddits, ...additionalSubreddits]) {
    seedSubreddits.run(name, category, priority, quality);
  }

  console.log('🌱 Seeded default subreddits');
}

// ============================================
// TABLE 9: StockTwits Messages
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS stocktwits_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,

    message_id TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,

    user_id TEXT,
    username TEXT,
    user_followers INTEGER,
    user_join_date TEXT,

    user_sentiment TEXT,             -- 'Bullish', 'Bearish', or NULL

    likes_count INTEGER DEFAULT 0,
    reshares_count INTEGER DEFAULT 0,

    posted_at DATETIME NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    nlp_sentiment_score REAL,
    nlp_sentiment_label TEXT,

    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stocktwits_company ON stocktwits_messages(company_id);
  CREATE INDEX IF NOT EXISTS idx_stocktwits_posted ON stocktwits_messages(posted_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stocktwits_sentiment ON stocktwits_messages(user_sentiment);
`);

// ============================================
// TABLE 10: News Articles (Google/Yahoo RSS)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS news_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER,

    source TEXT NOT NULL,            -- 'google_news', 'yahoo_finance', 'seeking_alpha'
    source_name TEXT,                -- 'Reuters', 'Bloomberg', etc.

    article_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,

    published_at DATETIME,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    sentiment_score REAL,
    sentiment_label TEXT,
    sentiment_confidence REAL,

    UNIQUE(source, url),
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_news_company ON news_articles(company_id);
  CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);
  CREATE INDEX IF NOT EXISTS idx_news_source ON news_articles(source);
`);

// ============================================
// TABLE 11: Market Sentiment Indicators
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS market_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    indicator_type TEXT NOT NULL,    -- 'cnn_fear_greed', 'vix', 'overall_market'

    indicator_value REAL,
    indicator_label TEXT,            -- 'Extreme Fear', 'Fear', 'Neutral', 'Greed', 'Extreme Greed'
    components TEXT,                 -- JSON of sub-components

    previous_value REAL,
    change_value REAL,

    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_market_sentiment_type ON market_sentiment(indicator_type);
  CREATE INDEX IF NOT EXISTS idx_market_sentiment_date ON market_sentiment(fetched_at DESC);
`);

// ============================================
// TABLE 12: Combined Sentiment Summary
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS combined_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,

    combined_score REAL,
    combined_signal TEXT,
    confidence REAL,

    reddit_sentiment REAL,
    reddit_signal TEXT,
    reddit_confidence REAL,

    stocktwits_sentiment REAL,
    stocktwits_signal TEXT,
    stocktwits_confidence REAL,

    news_sentiment REAL,
    news_signal TEXT,
    news_confidence REAL,

    market_sentiment REAL,
    market_signal TEXT,
    market_confidence REAL,

    sources_used INTEGER,
    agreement_score REAL,

    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    calculated_date TEXT GENERATED ALWAYS AS (date(calculated_at)) STORED,

    UNIQUE(company_id, calculated_date),
    FOREIGN KEY (company_id) REFERENCES companies(id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_combined_company ON combined_sentiment(company_id);
  CREATE INDEX IF NOT EXISTS idx_combined_date ON combined_sentiment(calculated_at DESC);
`);

// ============================================
// TABLE 13: Analyst Estimates (Yahoo Finance)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS analyst_estimates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Price targets
    current_price REAL,
    target_high REAL,
    target_low REAL,
    target_mean REAL,
    target_median REAL,
    number_of_analysts INTEGER,
    recommendation_key TEXT,           -- 'strong_buy', 'buy', 'hold', etc.
    recommendation_mean REAL,          -- 1.0 = Strong Buy, 5.0 = Strong Sell
    upside_potential REAL,             -- Percentage upside to mean target

    -- Recommendation distribution
    strong_buy INTEGER DEFAULT 0,
    buy INTEGER DEFAULT 0,
    hold INTEGER DEFAULT 0,
    sell INTEGER DEFAULT 0,
    strong_sell INTEGER DEFAULT 0,
    buy_percent REAL,
    hold_percent REAL,
    sell_percent REAL,

    -- Earnings track record
    earnings_beat_rate REAL,           -- Percentage of quarters that beat estimates

    -- Generated signal
    signal TEXT,                       -- 'strong_buy', 'buy', 'hold', 'sell', 'strong_sell'
    signal_strength INTEGER,           -- 1-5
    signal_confidence REAL,            -- 0-1
    signal_score INTEGER,              -- Raw score used to determine signal

    -- Full raw data for detailed analysis
    raw_data TEXT,                     -- JSON blob with complete response

    UNIQUE(company_id),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_analyst_company ON analyst_estimates(company_id);
  CREATE INDEX IF NOT EXISTS idx_analyst_signal ON analyst_estimates(signal);
  CREATE INDEX IF NOT EXISTS idx_analyst_upside ON analyst_estimates(upside_potential DESC);
`);

// ============================================
// TABLE: Liquidity Metrics (Agent 2 - Trading)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS liquidity_metrics (
    company_id INTEGER PRIMARY KEY,

    -- Volume metrics
    avg_volume_30d REAL,              -- Average daily volume (shares)
    avg_value_30d REAL,               -- Average daily dollar volume
    volume_volatility REAL,           -- Std dev of daily volume

    -- Spread and impact
    bid_ask_spread_bps REAL,          -- Estimated spread in basis points
    amihud_illiquidity REAL,          -- Price impact per $ traded

    -- Volatility
    volatility_30d REAL,              -- 30-day annualized volatility
    volatility_60d REAL,              -- 60-day annualized volatility

    -- Turnover
    turnover_ratio REAL,              -- Daily volume / shares outstanding

    -- Trading cost estimates
    estimated_impact_1pct REAL,       -- Impact cost for 1% of ADV
    estimated_impact_5pct REAL,       -- Impact cost for 5% of ADV

    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_liquidity_volume ON liquidity_metrics(avg_volume_30d DESC);
  CREATE INDEX IF NOT EXISTS idx_liquidity_volatility ON liquidity_metrics(volatility_30d);
`);

// Add sentiment columns to companies table if not exists
try {
  db.exec(`ALTER TABLE companies ADD COLUMN sentiment_signal TEXT`);
} catch (e) { /* Column may already exist */ }

try {
  db.exec(`ALTER TABLE companies ADD COLUMN sentiment_score REAL`);
} catch (e) { /* Column may already exist */ }

try {
  db.exec(`ALTER TABLE companies ADD COLUMN sentiment_confidence REAL`);
} catch (e) { /* Column may already exist */ }

try {
  db.exec(`ALTER TABLE companies ADD COLUMN sentiment_updated_at DATETIME`);
} catch (e) { /* Column may already exist */ }

// ============================================
// TABLE: NL Conversations (Chatbot Memory)
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS nl_conversations (
    id TEXT PRIMARY KEY,
    session_id TEXT,              -- Browser session or user ID
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_symbol TEXT,             -- Most recent symbol discussed
    last_intent TEXT,             -- Most recent intent
    message_count INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_nl_conv_session ON nl_conversations(session_id);
  CREATE INDEX IF NOT EXISTS idx_nl_conv_updated ON nl_conversations(updated_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS nl_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,           -- 'user' or 'assistant'
    content TEXT,                 -- Query or response summary
    intent TEXT,                  -- Classified intent
    symbols TEXT,                 -- JSON array of symbols mentioned
    entities TEXT,                -- JSON of extracted entities
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES nl_conversations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nl_msg_conv ON nl_messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_nl_msg_time ON nl_messages(timestamp);
`);

console.log('✅ Database schema created successfully!');
console.log(`📁 Database location: ${dbPath}`);
console.log('');

// ============================================
// Helper Functions
// ============================================

// Get database instance
function getDatabase() {
  return db;
}

// Get company by symbol
function getCompany(symbol) {
  const stmt = db.prepare('SELECT * FROM companies WHERE symbol = ? COLLATE NOCASE');
  return stmt.get(symbol);
}

// Get all companies
function getAllCompanies() {
  const stmt = db.prepare('SELECT * FROM companies WHERE is_active = 1 ORDER BY symbol');
  return stmt.all();
}

// Get company count
function getCompanyCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM companies WHERE is_active = 1');
  return stmt.get().count;
}

// Insert or update company
function upsertCompany(data) {
  const stmt = db.prepare(`
    INSERT INTO companies (symbol, name, sector, industry, exchange, market_cap, description)
    VALUES (@symbol, @name, @sector, @industry, @exchange, @market_cap, @description)
    ON CONFLICT(symbol) DO UPDATE SET
      name = @name,
      sector = @sector,
      industry = @industry,
      exchange = @exchange,
      market_cap = @market_cap,
      description = @description,
      last_updated = CURRENT_TIMESTAMP
  `);
  
  return stmt.run(data);
}

// Get metrics for a company
function getMetrics(companyId, limit = 5) {
  const stmt = db.prepare(`
    SELECT * FROM calculated_metrics 
    WHERE company_id = ? 
    ORDER BY fiscal_period DESC 
    LIMIT ?
  `);
  return stmt.all(companyId, limit);
}

// Close database connection
function closeDatabase() {
  db.close();
  console.log('🔒 Database connection closed');
}

// Export functions
module.exports = {
  db,
  getDatabase,
  getCompany,
  getAllCompanies,
  getCompanyCount,
  upsertCompany,
  getMetrics,
  closeDatabase
};

// If run directly (not imported)
if (require.main === module) {
  console.log('');
  console.log('📊 Database Statistics:');
  console.log('   Companies:', getCompanyCount());
  console.log('');
  console.log('Ready to start importing data!');
}