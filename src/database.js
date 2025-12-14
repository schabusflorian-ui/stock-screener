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