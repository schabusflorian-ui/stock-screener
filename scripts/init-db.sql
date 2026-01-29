-- scripts/init-db.sql
-- PostgreSQL initialization script for Docker

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For fuzzy text search

-- Set timezone
SET timezone = 'UTC';

-- Create schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  batch INTEGER NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- Core Tables
-- ============================================

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  name TEXT,
  sector TEXT,
  industry TEXT,
  exchange TEXT,
  country TEXT DEFAULT 'US',
  market_cap DOUBLE PRECISION,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sentiment_signal TEXT,
  sentiment_score DOUBLE PRECISION,
  sentiment_confidence DOUBLE PRECISION,
  sentiment_updated_at TIMESTAMP,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_symbol ON companies(symbol);
CREATE INDEX IF NOT EXISTS idx_companies_sector ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_market_cap ON companies(market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies(is_active) WHERE is_active = TRUE;

-- Financial Data
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
  data TEXT NOT NULL,
  total_assets DOUBLE PRECISION,
  total_liabilities DOUBLE PRECISION,
  shareholder_equity DOUBLE PRECISION,
  current_assets DOUBLE PRECISION,
  current_liabilities DOUBLE PRECISION,
  cash_and_equivalents DOUBLE PRECISION,
  long_term_debt DOUBLE PRECISION,
  short_term_debt DOUBLE PRECISION,
  total_revenue DOUBLE PRECISION,
  net_income DOUBLE PRECISION,
  operating_income DOUBLE PRECISION,
  cost_of_revenue DOUBLE PRECISION,
  gross_profit DOUBLE PRECISION,
  operating_cashflow DOUBLE PRECISION,
  capital_expenditures DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, statement_type, fiscal_date_ending, period_type)
);

CREATE INDEX IF NOT EXISTS idx_financial_company ON financial_data(company_id);
CREATE INDEX IF NOT EXISTS idx_financial_date ON financial_data(fiscal_date_ending DESC);
CREATE INDEX IF NOT EXISTS idx_financial_type ON financial_data(statement_type);

-- Calculated Metrics
CREATE TABLE IF NOT EXISTS calculated_metrics (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_period DATE NOT NULL,
  period_type TEXT DEFAULT 'annual',
  roic DOUBLE PRECISION,
  roce DOUBLE PRECISION,
  roe DOUBLE PRECISION,
  roa DOUBLE PRECISION,
  operating_margin DOUBLE PRECISION,
  net_margin DOUBLE PRECISION,
  gross_margin DOUBLE PRECISION,
  fcf DOUBLE PRECISION,
  fcf_yield DOUBLE PRECISION,
  fcf_margin DOUBLE PRECISION,
  fcf_per_share DOUBLE PRECISION,
  pe_ratio DOUBLE PRECISION,
  pb_ratio DOUBLE PRECISION,
  ps_ratio DOUBLE PRECISION,
  peg_ratio DOUBLE PRECISION,
  pegy_ratio DOUBLE PRECISION,
  tobins_q DOUBLE PRECISION,
  ev_ebitda DOUBLE PRECISION,
  earnings_yield DOUBLE PRECISION,
  debt_to_equity DOUBLE PRECISION,
  debt_to_assets DOUBLE PRECISION,
  current_ratio DOUBLE PRECISION,
  quick_ratio DOUBLE PRECISION,
  interest_coverage DOUBLE PRECISION,
  revenue_growth_yoy DOUBLE PRECISION,
  earnings_growth_yoy DOUBLE PRECISION,
  fcf_growth_yoy DOUBLE PRECISION,
  data_quality_score INTEGER DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, fiscal_period, period_type)
);

CREATE INDEX IF NOT EXISTS idx_metrics_company ON calculated_metrics(company_id);
CREATE INDEX IF NOT EXISTS idx_metrics_period ON calculated_metrics(fiscal_period DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_roic ON calculated_metrics(roic DESC) WHERE roic IS NOT NULL;

-- Daily Prices
CREATE TABLE IF NOT EXISTS daily_prices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  open DOUBLE PRECISION,
  high DOUBLE PRECISION,
  low DOUBLE PRECISION,
  close DOUBLE PRECISION NOT NULL,
  adjusted_close DOUBLE PRECISION,
  volume BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_company_date ON daily_prices(company_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_prices_date ON daily_prices(date DESC);

-- Stock Indexes
CREATE TABLE IF NOT EXISTS stock_indexes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index Constituents
CREATE TABLE IF NOT EXISTS index_constituents (
  id SERIAL PRIMARY KEY,
  index_id INTEGER NOT NULL REFERENCES stock_indexes(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  weight DOUBLE PRECISION,
  added_at TIMESTAMP DEFAULT NOW(),
  removed_at TIMESTAMP,
  UNIQUE(index_id, company_id, added_at)
);

-- Liquidity Metrics
CREATE TABLE IF NOT EXISTS liquidity_metrics (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  avg_volume_30d DOUBLE PRECISION,
  avg_value_30d DOUBLE PRECISION,
  volume_volatility DOUBLE PRECISION,
  bid_ask_spread_bps DOUBLE PRECISION,
  amihud_illiquidity DOUBLE PRECISION,
  volatility_30d DOUBLE PRECISION,
  volatility_60d DOUBLE PRECISION,
  turnover_ratio DOUBLE PRECISION,
  estimated_impact_1pct DOUBLE PRECISION,
  estimated_impact_5pct DOUBLE PRECISION,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions (for express-session with PostgreSQL)
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- ============================================
-- PRISM Investment Reports
-- ============================================

-- PRISM Reports (AI-generated equity research)
CREATE TABLE IF NOT EXISTS prism_reports (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,

  -- Overall scores
  overall_score DOUBLE PRECISION,
  confidence_level TEXT,

  -- Complete report data
  report_data JSONB NOT NULL,

  -- Executive summary fields
  investment_thesis TEXT,
  bull_case_price DOUBLE PRECISION,
  base_case_price DOUBLE PRECISION,
  bear_case_price DOUBLE PRECISION,
  bull_probability DOUBLE PRECISION,
  base_probability DOUBLE PRECISION,
  bear_probability DOUBLE PRECISION,

  -- Metadata
  generation_cost DOUBLE PRECISION,
  data_sources JSONB,
  model_version TEXT,

  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_prism_reports_symbol ON prism_reports(symbol);
CREATE INDEX IF NOT EXISTS idx_prism_reports_score ON prism_reports(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_prism_reports_generated ON prism_reports(generated_at DESC);

-- PRISM Scores History
CREATE TABLE IF NOT EXISTS prism_scores (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  scored_at TIMESTAMP DEFAULT NOW(),

  overall_score DOUBLE PRECISION,

  -- Market factors
  market_need_score DOUBLE PRECISION,
  market_need_confidence TEXT,
  market_direction_score DOUBLE PRECISION,
  market_direction_confidence TEXT,
  market_size_score DOUBLE PRECISION,
  market_size_confidence TEXT,

  -- Competitive factors
  competitive_strength_score DOUBLE PRECISION,
  competitive_strength_confidence TEXT,
  competitive_direction_score DOUBLE PRECISION,
  competitive_direction_confidence TEXT,
  moat_durability_score DOUBLE PRECISION,
  moat_durability_confidence TEXT,

  -- Financial factors
  growth_momentum_score DOUBLE PRECISION,
  growth_momentum_confidence TEXT,
  profitability_score DOUBLE PRECISION,
  profitability_confidence TEXT,
  cash_generation_score DOUBLE PRECISION,
  cash_generation_confidence TEXT,
  balance_sheet_score DOUBLE PRECISION,
  balance_sheet_confidence TEXT,

  -- Management factors
  capital_allocation_score DOUBLE PRECISION,
  capital_allocation_confidence TEXT,
  leadership_quality_score DOUBLE PRECISION,
  leadership_quality_confidence TEXT,

  scorecard JSONB
);

CREATE INDEX IF NOT EXISTS idx_prism_scores_company ON prism_scores(company_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_prism_scores_symbol ON prism_scores(symbol);
CREATE INDEX IF NOT EXISTS idx_prism_scores_date ON prism_scores(scored_at DESC);

-- SEC Filings (parsed 10-K, 10-Q, DEF14A)
CREATE TABLE IF NOT EXISTS sec_filings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  cik TEXT NOT NULL,

  form_type TEXT NOT NULL,
  filing_date DATE NOT NULL,
  accession_number TEXT NOT NULL,
  fiscal_year INTEGER,
  fiscal_period TEXT,

  business_description TEXT,
  risk_factors TEXT,
  mda_discussion TEXT,
  competition_section TEXT,
  executive_compensation TEXT,

  raw_sections JSONB,
  key_metrics JSONB,

  parsed_at TIMESTAMP DEFAULT NOW(),
  parse_version TEXT DEFAULT '1.0',
  filing_url TEXT,

  UNIQUE(symbol, accession_number)
);

CREATE INDEX IF NOT EXISTS idx_sec_filings_symbol ON sec_filings(symbol);
CREATE INDEX IF NOT EXISTS idx_sec_filings_cik ON sec_filings(cik);
CREATE INDEX IF NOT EXISTS idx_sec_filings_form ON sec_filings(form_type);
CREATE INDEX IF NOT EXISTS idx_sec_filings_date ON sec_filings(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_sec_filings_company ON sec_filings(company_id);

-- Grant permissions (if using separate app user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

COMMENT ON DATABASE investment IS 'Investment analysis platform database';
