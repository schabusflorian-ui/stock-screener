// src/database-migrations/add-performance-indexes.js
// Database migration to add missing performance indexes

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

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
// Tier 3 Performance Indexes (Added 2026-01)
// ============================================

// Combined sentiment: company+date lookups
createIndex(
  'idx_sentiment_company_date',
  'CREATE INDEX idx_sentiment_company_date ON combined_sentiment(company_id, calculated_date DESC)'
);

// Multi-metric screening index
createIndex(
  'idx_metrics_screening',
  'CREATE INDEX idx_metrics_screening ON calculated_metrics(company_id, roic, debt_to_equity, pe_ratio) WHERE roic IS NOT NULL AND debt_to_equity IS NOT NULL'
);

// Companies: active+sector filtering
createIndex(
  'idx_companies_active_sector',
  'CREATE INDEX idx_companies_active_sector ON companies(is_active, sector)'
);

// Reddit posts: date-based aggregation
createIndex(
  'idx_reddit_posted_at',
  'CREATE INDEX idx_reddit_posted_at ON reddit_posts(posted_at DESC)'
);

// Trending tickers: symbol+period lookups
createIndex(
  'idx_trending_symbol_period',
  'CREATE INDEX idx_trending_symbol_period ON trending_tickers(symbol, period)'
);

// Financial data: period_type filtering
createIndex(
  'idx_financial_period_type',
  'CREATE INDEX idx_financial_period_type ON financial_data(statement_type, period_type, fiscal_date_ending DESC)'
);

// Price metrics: company lookups
createIndex(
  'idx_price_metrics_company',
  'CREATE INDEX idx_price_metrics_company ON price_metrics(company_id)'
);

// ============================================
// Batch Query Optimization Indexes (Added for N+1 fixes)
// ============================================

// Reddit posts: batch company lookups with date filtering
createIndex(
  'idx_reddit_company_posted',
  'CREATE INDEX idx_reddit_company_posted ON reddit_posts(company_id, posted_at DESC)'
);

// StockTwits: batch company lookups with date filtering
createIndex(
  'idx_stocktwits_company_posted',
  'CREATE INDEX idx_stocktwits_company_posted ON stocktwits_messages(company_id, posted_at DESC)'
);

// News articles: batch company lookups with date filtering
createIndex(
  'idx_news_company_published',
  'CREATE INDEX idx_news_company_published ON news_articles(company_id, published_at DESC)'
);

// Insider transactions: batch company lookups with date filtering
createIndex(
  'idx_insider_company_date',
  'CREATE INDEX idx_insider_company_date ON insider_transactions(company_id, transaction_date DESC)'
);

// Analyst estimates: batch company lookups
createIndex(
  'idx_analyst_company',
  'CREATE INDEX idx_analyst_company ON analyst_estimates(company_id)'
);

// Holdings: portfolio batch lookups
createIndex(
  'idx_holdings_portfolio',
  'CREATE INDEX idx_holdings_portfolio ON holdings(portfolio_id)'
);

// Historical prices: symbol+date for price lookups
createIndex(
  'idx_historical_prices_symbol_date',
  'CREATE INDEX idx_historical_prices_symbol_date ON historical_prices(symbol, date DESC)'
);

// Investor holdings: cusip+option_type for first filing date lookups (N+1 fix)
createIndex(
  'idx_investor_holdings_cusip_option',
  'CREATE INDEX idx_investor_holdings_cusip_option ON investor_holdings(investor_id, cusip, option_type, filing_date)'
);

// Daily prices: optimized for batch latest price lookups
createIndex(
  'idx_daily_prices_company_id_desc',
  'CREATE INDEX idx_daily_prices_company_id_desc ON daily_prices(company_id, id DESC)'
);

// ============================================
// Analyze tables for query optimizer
// ============================================
console.log('\n📊 Running ANALYZE to update query statistics...');
db.exec('ANALYZE');
console.log('\n✅ Performance indexes migration completed successfully!');
