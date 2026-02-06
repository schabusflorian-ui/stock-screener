-- Recreate all tables with proper PRIMARY KEY and UNIQUE constraints
-- This fixes the duplicate data issue from previous migration attempts

-- Drop tables in dependency order (foreign keys first)
DROP TABLE IF EXISTS company_identifiers CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS stock_indexes CASCADE;
DROP TABLE IF EXISTS tracked_subreddits CASCADE;

-- Recreate companies with proper constraints
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  symbol TEXT UNIQUE NOT NULL,
  name TEXT,
  sector TEXT,
  industry TEXT,
  exchange TEXT,
  country TEXT DEFAULT 'US',
  market_cap DOUBLE PRECISION,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cik TEXT,
  sic_code TEXT,
  sic_description TEXT,
  user_sector TEXT,
  user_industry TEXT,
  user_subsector TEXT,
  user_tags TEXT,
  sentiment_signal TEXT,
  sentiment_score DOUBLE PRECISION,
  sentiment_confidence DOUBLE PRECISION,
  sentiment_updated_at TIMESTAMP,
  reddit_mentions_24h INTEGER DEFAULT 0,
  combined_sentiment DOUBLE PRECISION,
  update_tier INTEGER DEFAULT 3,
  last_price_update DATE,
  update_priority_score DOUBLE PRECISION DEFAULT 0,
  is_sp500 INTEGER DEFAULT 0,
  lei TEXT,
  isin TEXT,
  companies_house_number TEXT,
  sedol TEXT,
  is_ftse INTEGER DEFAULT 0,
  is_dax INTEGER DEFAULT 0,
  is_cac INTEGER DEFAULT 0,
  is_aex INTEGER DEFAULT 0,
  is_smi INTEGER DEFAULT 0,
  is_ibex INTEGER DEFAULT 0,
  is_ftsemib INTEGER DEFAULT 0,
  is_omx30 INTEGER DEFAULT 0,
  is_eurostoxx50 INTEGER DEFAULT 0,
  is_atx INTEGER DEFAULT 0,
  reporting_currency TEXT DEFAULT 'USD',
  nace_code TEXT,
  nace_description TEXT,
  nace_section TEXT,
  is_publicly_traded INTEGER,
  yahoo_symbol TEXT,
  tradability_checked_at TEXT
);

CREATE INDEX idx_companies_symbol ON companies(symbol);
CREATE INDEX idx_companies_sector ON companies(sector);
CREATE INDEX idx_companies_market_cap ON companies(market_cap DESC);
CREATE INDEX idx_companies_active ON companies(is_active) WHERE is_active = 1;
CREATE INDEX idx_companies_cik ON companies(cik);
CREATE INDEX idx_companies_tier ON companies(update_tier);
CREATE INDEX idx_companies_last_price_update ON companies(last_price_update);
CREATE INDEX idx_companies_tier_update ON companies(update_tier, last_price_update);
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_sentiment ON companies(sentiment_signal, sentiment_score DESC) WHERE sentiment_signal IS NOT NULL;
CREATE INDEX idx_companies_lei ON companies(lei);
CREATE INDEX idx_companies_isin ON companies(isin);
CREATE INDEX idx_companies_ch ON companies(companies_house_number);
CREATE INDEX idx_companies_sector_industry ON companies(sector, industry);
CREATE INDEX idx_companies_country_active ON companies(country, is_active) WHERE is_active = 1;
CREATE INDEX idx_companies_currency ON companies(reporting_currency);
CREATE INDEX idx_companies_nace ON companies(nace_code);
CREATE INDEX idx_companies_nace_section ON companies(nace_section);
CREATE INDEX idx_companies_active_sector ON companies(is_active, sector);
CREATE INDEX idx_companies_tradability ON companies(country, is_publicly_traded) WHERE is_publicly_traded IS NULL;

-- Recreate company_identifiers with proper constraints
CREATE TABLE company_identifiers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  lei TEXT UNIQUE,
  isin TEXT,
  cusip TEXT,
  sedol TEXT,
  figi TEXT,
  composite_figi TEXT,
  cik TEXT,
  ticker TEXT,
  exchange TEXT,
  yahoo_symbol TEXT,
  legal_name TEXT,
  country TEXT,
  jurisdiction TEXT,
  link_status TEXT DEFAULT 'pending',
  link_method TEXT,
  link_confidence DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  linked_at TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX idx_company_identifiers_company ON company_identifiers(company_id);
CREATE INDEX idx_company_identifiers_lei ON company_identifiers(lei);
CREATE INDEX idx_company_identifiers_isin ON company_identifiers(isin);
CREATE INDEX idx_company_identifiers_cusip ON company_identifiers(cusip);
CREATE INDEX idx_company_identifiers_figi ON company_identifiers(figi);
CREATE INDEX idx_company_identifiers_cik ON company_identifiers(cik);
CREATE INDEX idx_company_identifiers_ticker ON company_identifiers(ticker, exchange);
CREATE INDEX idx_company_identifiers_yahoo ON company_identifiers(yahoo_symbol);
CREATE INDEX idx_company_identifiers_status ON company_identifiers(link_status);
CREATE INDEX idx_company_identifiers_country ON company_identifiers(country);

-- Recreate stock_indexes with proper constraints
CREATE TABLE stock_indexes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recreate tracked_subreddits with proper constraints
CREATE TABLE tracked_subreddits (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  category TEXT DEFAULT 'general',
  priority INTEGER DEFAULT 50,
  is_active INTEGER DEFAULT 1,
  quality_score DOUBLE PRECISION DEFAULT 50,
  total_posts_scanned INTEGER DEFAULT 0,
  ticker_mentions_found INTEGER DEFAULT 0,
  avg_post_score DOUBLE PRECISION DEFAULT 0,
  avg_comments DOUBLE PRECISION DEFAULT 0,
  last_scanned_at TIMESTAMP,
  discovered_from TEXT,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subreddits_active ON tracked_subreddits(is_active, priority DESC);
CREATE INDEX idx_subreddits_quality ON tracked_subreddits(quality_score DESC);

SELECT 'All base tables recreated with proper constraints' AS status;
