// src/database-migrations/000-postgres-base-schema.js
// PostgreSQL base schema migration
// Creates core tables with PostgreSQL syntax when DATABASE_URL is set
//
// Usage:
//   DATABASE_URL=postgres://... node src/database-migrations/000-postgres-base-schema.js

const { getDatabase, isUsingPostgres, dialect } = require('../lib/db');

async function runMigration() {
  const isPostgres = isUsingPostgres();

  if (!isPostgres) {
    console.log('⏭️  Skipping PostgreSQL migration - SQLite mode detected');
    console.log('   Set DATABASE_URL=postgres://... to run PostgreSQL migrations');
    return;
  }

  console.log('🐘 Starting PostgreSQL base schema migration...');

  const db = await getDatabase();

  // ============================================
  // TABLE 1: Companies
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      sector TEXT,
      industry TEXT,
      exchange TEXT,
      country TEXT DEFAULT 'US',
      market_cap REAL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      sentiment_signal TEXT,
      sentiment_score REAL,
      sentiment_confidence REAL,
      sentiment_updated_at TIMESTAMP,
      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created companies table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_companies_symbol ON companies(symbol);
    CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
    CREATE INDEX IF NOT EXISTS idx_companies_market_cap ON companies(market_cap DESC);
    CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active) WHERE is_active = true;
  `);

  // ============================================
  // TABLE 2: Financial Data
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS financial_data (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      statement_type TEXT NOT NULL,
      fiscal_date_ending DATE NOT NULL,
      fiscal_year INTEGER,
      fiscal_quarter INTEGER,
      period_type TEXT NOT NULL,
      fiscal_period TEXT,
      form TEXT,
      filed_date TEXT,
      data JSONB NOT NULL,
      total_assets REAL,
      total_liabilities REAL,
      shareholder_equity REAL,
      current_assets REAL,
      current_liabilities REAL,
      cash_and_equivalents REAL,
      long_term_debt REAL,
      short_term_debt REAL,
      total_revenue REAL,
      net_income REAL,
      operating_income REAL,
      cost_of_revenue REAL,
      gross_profit REAL,
      operating_cashflow REAL,
      capital_expenditures REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, statement_type, fiscal_date_ending, period_type)
    )
  `);
  console.log('✓ Created financial_data table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_financial_company ON financial_data(company_id);
    CREATE INDEX IF NOT EXISTS idx_financial_date ON financial_data(fiscal_date_ending DESC);
    CREATE INDEX IF NOT EXISTS idx_financial_type ON financial_data(statement_type);
    CREATE INDEX IF NOT EXISTS idx_financial_company_date ON financial_data(company_id, fiscal_date_ending DESC);
  `);

  // ============================================
  // TABLE 3: Calculated Metrics
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS calculated_metrics (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      fiscal_period DATE NOT NULL,
      period_type TEXT DEFAULT 'annual',
      roic REAL, roce REAL, roe REAL, roa REAL,
      operating_margin REAL, net_margin REAL, gross_margin REAL,
      fcf REAL, fcf_yield REAL, fcf_margin REAL, fcf_per_share REAL,
      pe_ratio REAL, pb_ratio REAL, ps_ratio REAL, peg_ratio REAL,
      pegy_ratio REAL, tobins_q REAL, ev_ebitda REAL, earnings_yield REAL,
      debt_to_equity REAL, debt_to_assets REAL, current_ratio REAL,
      quick_ratio REAL, interest_coverage REAL,
      revenue_growth_yoy REAL, earnings_growth_yoy REAL, fcf_growth_yoy REAL,
      dividend_yield REAL,
      data_quality_score INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, fiscal_period, period_type)
    )
  `);
  console.log('✓ Created calculated_metrics table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_metrics_company ON calculated_metrics(company_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_period ON calculated_metrics(fiscal_period DESC);
    CREATE INDEX IF NOT EXISTS idx_metrics_roic ON calculated_metrics(roic DESC) WHERE roic IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_metrics_fcf ON calculated_metrics(fcf_yield DESC) WHERE fcf_yield IS NOT NULL;
  `);

  // ============================================
  // TABLE 4: Daily Prices
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_prices (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      open REAL, high REAL, low REAL,
      close REAL NOT NULL,
      adjusted_close REAL,
      volume BIGINT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(company_id, date)
    )
  `);
  console.log('✓ Created daily_prices table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_prices_company_date ON daily_prices(company_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_prices_date ON daily_prices(date DESC);
  `);

  // ============================================
  // TABLE 5: Users (Authentication)
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      is_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_login_at TIMESTAMP
    )
  `);
  console.log('✓ Created users table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // ============================================
  // TABLE 6: Sessions (for express-session with connect-pg-simple)
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess JSONB NOT NULL,
      expire TIMESTAMP NOT NULL
    )
  `);
  console.log('✓ Created sessions table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
  `);

  // ============================================
  // TABLE 7: Portfolios
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      currency TEXT DEFAULT 'USD',
      benchmark TEXT DEFAULT 'SPY',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created portfolios table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_portfolios_user ON portfolios(user_id);
  `);

  // ============================================
  // TABLE 8: Portfolio Holdings
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      shares REAL NOT NULL DEFAULT 0,
      average_cost REAL,
      current_value REAL,
      currency TEXT DEFAULT 'USD',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(portfolio_id, symbol)
    )
  `);
  console.log('✓ Created portfolio_holdings table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON portfolio_holdings(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON portfolio_holdings(symbol);
  `);

  // ============================================
  // TABLE 9: Portfolio Transactions
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS portfolio_transactions (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      shares REAL NOT NULL,
      price REAL NOT NULL,
      total_amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      transaction_date TIMESTAMP NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created portfolio_transactions table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON portfolio_transactions(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON portfolio_transactions(transaction_date DESC);
  `);

  // ============================================
  // TABLE 10: Watchlists
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_watchlists (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created user_watchlists table');

  await db.query(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      id SERIAL PRIMARY KEY,
      watchlist_id INTEGER NOT NULL REFERENCES user_watchlists(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      added_at TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      UNIQUE(watchlist_id, symbol)
    )
  `);
  console.log('✓ Created watchlist_items table');

  // ============================================
  // TABLE 11: Famous Investors (13F Tracking)
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS famous_investors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      cik TEXT UNIQUE,
      description TEXT,
      investment_style TEXT,
      aum REAL,
      latest_filing_date DATE,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created famous_investors table');

  await db.query(`
    CREATE TABLE IF NOT EXISTS investor_holdings (
      id SERIAL PRIMARY KEY,
      investor_id INTEGER NOT NULL REFERENCES famous_investors(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      cusip TEXT,
      security_name TEXT,
      title_of_class TEXT,
      shares BIGINT,
      market_value REAL,
      portfolio_weight REAL,
      filing_date DATE NOT NULL,
      report_date DATE,
      option_type TEXT,
      prev_shares BIGINT,
      shares_change BIGINT,
      change_type TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created investor_holdings table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_investor_holdings_investor ON investor_holdings(investor_id);
    CREATE INDEX IF NOT EXISTS idx_investor_holdings_company ON investor_holdings(company_id);
    CREATE INDEX IF NOT EXISTS idx_investor_holdings_date ON investor_holdings(filing_date DESC);
  `);

  // ============================================
  // TABLE 12: Alerts
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      condition JSONB NOT NULL,
      is_active BOOLEAN DEFAULT true,
      triggered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created alerts table');

  // ============================================
  // TABLE 13: Sentiment Data
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS reddit_posts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      post_id TEXT UNIQUE NOT NULL,
      subreddit TEXT NOT NULL,
      title TEXT,
      body TEXT,
      score INTEGER DEFAULT 0,
      num_comments INTEGER DEFAULT 0,
      upvote_ratio REAL,
      author TEXT,
      posted_at TIMESTAMP NOT NULL,
      fetched_at TIMESTAMP DEFAULT NOW(),
      sentiment_score REAL,
      sentiment_label TEXT,
      tickers_mentioned JSONB
    )
  `);
  console.log('✓ Created reddit_posts table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_reddit_company ON reddit_posts(company_id);
    CREATE INDEX IF NOT EXISTS idx_reddit_posted ON reddit_posts(posted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reddit_subreddit ON reddit_posts(subreddit);
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS combined_sentiment (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      combined_score REAL,
      combined_signal TEXT,
      confidence REAL,
      reddit_sentiment REAL,
      stocktwits_sentiment REAL,
      news_sentiment REAL,
      market_sentiment REAL,
      sources_used INTEGER,
      agreement_score REAL,
      region TEXT DEFAULT 'US',
      calculated_at TIMESTAMP DEFAULT NOW(),
      calculated_date DATE GENERATED ALWAYS AS (DATE(calculated_at)) STORED,
      UNIQUE(company_id, calculated_date)
    )
  `);
  console.log('✓ Created combined_sentiment table');

  // ============================================
  // TABLE 14: Stock Indexes
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS stock_indexes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      country TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created stock_indexes table');

  await db.query(`
    CREATE TABLE IF NOT EXISTS index_constituents (
      id SERIAL PRIMARY KEY,
      index_id INTEGER NOT NULL REFERENCES stock_indexes(id) ON DELETE CASCADE,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      weight REAL,
      added_at TIMESTAMP DEFAULT NOW(),
      removed_at TIMESTAMP,
      UNIQUE(index_id, company_id, added_at)
    )
  `);
  console.log('✓ Created index_constituents table');

  // ============================================
  // TABLE 15: ETFs
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS etfs (
      id SERIAL PRIMARY KEY,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      issuer TEXT,
      expense_ratio REAL,
      aum REAL,
      category TEXT,
      asset_class TEXT,
      tier INTEGER DEFAULT 3,
      dividend_yield REAL,
      ytd_return REAL,
      is_active BOOLEAN DEFAULT true,
      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created etfs table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_etfs_symbol ON etfs(symbol);
    CREATE INDEX IF NOT EXISTS idx_etfs_category ON etfs(category);
  `);

  // ============================================
  // TABLE 16: Trading Agents
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS trading_agents (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      strategy_type TEXT NOT NULL,
      config JSONB NOT NULL,
      is_active BOOLEAN DEFAULT false,
      is_paper_trading BOOLEAN DEFAULT true,
      portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created trading_agents table');

  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES trading_agents(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      signal_strength REAL,
      confidence REAL,
      reasoning JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created agent_signals table');

  // ============================================
  // TABLE 17: PRISM Reports
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS prism_reports (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      generated_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP,
      overall_score REAL,
      confidence_level TEXT,
      report_data JSONB NOT NULL,
      investment_thesis TEXT,
      bull_case_price REAL,
      base_case_price REAL,
      bear_case_price REAL,
      generation_cost REAL,
      model_version TEXT,
      UNIQUE(company_id)
    )
  `);
  console.log('✓ Created prism_reports table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_prism_reports_symbol ON prism_reports(symbol);
    CREATE INDEX IF NOT EXISTS idx_prism_reports_score ON prism_reports(overall_score DESC);
  `);

  // ============================================
  // TABLE 18: User Preferences
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id SERIAL PRIMARY KEY,
      user_id TEXT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      theme TEXT DEFAULT 'system',
      default_currency TEXT DEFAULT 'USD',
      notification_preferences JSONB DEFAULT '{}',
      display_preferences JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created user_preferences table');

  // ============================================
  // TABLE 19: Notification Queue
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT,
      data JSONB,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created notifications table');

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
  `);

  // ============================================
  // Migrations Tracking Table
  // ============================================
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('✓ Created schema_migrations table');

  // Record this migration
  await db.query(`
    INSERT INTO schema_migrations (migration_name)
    VALUES ('000-postgres-base-schema')
    ON CONFLICT (migration_name) DO NOTHING
  `);

  console.log('');
  console.log('🎉 PostgreSQL base schema migration complete!');
  console.log('   All core tables created successfully.');

  await db.close();
}

// Run migration
runMigration().catch(err => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
