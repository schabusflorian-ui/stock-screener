// src/database-migrations/add-performance-indexes.js
// Database migration to add missing performance indexes

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/stocks.db');
const db = new Database(dbPath);

console.log('Starting performance indexes migration...');

// Helper to check if index exists
function indexExists(indexName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='index' AND name=?
  `).get(indexName);
  return !!result;
}

// Helper to safely create index
function createIndex(name, sql) {
  if (!indexExists(name)) {
    try {
      db.exec(sql);
      console.log(`✅ Created index: ${name}`);
    } catch (err) {
      console.warn(`⚠️ Failed to create ${name}: ${err.message}`);
    }
  } else {
    console.log(`⏭️ Index ${name} already exists, skipping`);
  }
}

// ============================================
// Portfolio Performance Indexes
// ============================================
createIndex(
  'idx_portfolios_user_updated',
  'CREATE INDEX idx_portfolios_user_updated ON portfolios(user_id, updated_at DESC)'
);

createIndex(
  'idx_portfolios_last_refresh',
  'CREATE INDEX idx_portfolios_last_refresh ON portfolios(last_refresh_at)'
);

// ============================================
// Calculated Metrics Indexes (heavily queried)
// ============================================
createIndex(
  'idx_calculated_metrics_company_period_type',
  'CREATE INDEX idx_calculated_metrics_company_period_type ON calculated_metrics(company_id, fiscal_period DESC, period_type)'
);

createIndex(
  'idx_calculated_metrics_period_roic',
  'CREATE INDEX idx_calculated_metrics_period_roic ON calculated_metrics(fiscal_period DESC, roic DESC) WHERE roic IS NOT NULL'
);

// ============================================
// Daily Prices Indexes (valuation lookups)
// ============================================
createIndex(
  'idx_daily_prices_company_date_close',
  'CREATE INDEX idx_daily_prices_company_date_close ON daily_prices(company_id, date DESC, close)'
);

// ============================================
// Investor Holdings Indexes
// ============================================
createIndex(
  'idx_investor_holdings_investor_filing',
  'CREATE INDEX idx_investor_holdings_investor_filing ON investor_holdings(investor_id, filing_date DESC, change_type)'
);

createIndex(
  'idx_investor_holdings_symbol_date',
  'CREATE INDEX idx_investor_holdings_symbol_date ON investor_holdings(symbol, filing_date DESC)'
);

// ============================================
// Financial Data Indexes (analysis queries)
// ============================================
createIndex(
  'idx_financial_company_type_date',
  'CREATE INDEX idx_financial_company_type_date ON financial_data(company_id, statement_type, fiscal_date_ending DESC)'
);

// ============================================
// Company Indexes (screening)
// ============================================
createIndex(
  'idx_companies_sector_industry',
  'CREATE INDEX idx_companies_sector_industry ON companies(sector, industry)'
);

createIndex(
  'idx_companies_country_active',
  'CREATE INDEX idx_companies_country_active ON companies(country, is_active) WHERE is_active = 1'
);

// ============================================
// ETF Definitions Index
// ============================================
createIndex(
  'idx_etf_definitions_symbol',
  'CREATE INDEX idx_etf_definitions_symbol ON etf_definitions(symbol)'
);

// ============================================
// Trading Agents Indexes
// ============================================
createIndex(
  'idx_trading_agents_user_status',
  'CREATE INDEX idx_trading_agents_user_status ON trading_agents(user_id, status)'
);

createIndex(
  'idx_agent_trades_agent_date',
  'CREATE INDEX idx_agent_trades_agent_date ON agent_trades(agent_id, executed_at DESC)'
);

// ============================================
// Notes & Theses Indexes
// ============================================
createIndex(
  'idx_notes_user_updated',
  'CREATE INDEX idx_notes_user_updated ON notes(user_id, updated_at DESC)'
);

createIndex(
  'idx_theses_user_status',
  'CREATE INDEX idx_theses_user_status ON theses(user_id, status)'
);

// ============================================
// Analyze tables for query optimizer
// ============================================
console.log('\n📊 Running ANALYZE to update query statistics...');
db.exec('ANALYZE');

db.close();
console.log('\n✅ Performance indexes migration completed successfully!');
