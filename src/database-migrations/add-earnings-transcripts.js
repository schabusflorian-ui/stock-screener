// src/database-migrations/add-earnings-transcripts.js
// Earnings Call Transcripts & Valuation History
// Supports qualitative analysis and historical context for value investing

const db = require('../database').db;

console.log('\n📊 Creating Earnings Transcripts & Valuation History tables...\n');

// ============================================
// TABLE: Earnings Call Transcripts
// Stores earnings call transcripts for NLP analysis
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS earnings_transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,

    -- Call metadata
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER NOT NULL,  -- 1, 2, 3, 4
    call_date DATE NOT NULL,
    call_type TEXT DEFAULT 'earnings',  -- earnings, guidance, investor_day

    -- Content
    title TEXT,
    full_transcript TEXT,
    prepared_remarks TEXT,     -- Management presentation
    qa_section TEXT,           -- Q&A with analysts

    -- Participants
    executives TEXT,           -- JSON array of executives
    analysts TEXT,             -- JSON array of analysts

    -- NLP Analysis
    sentiment_score REAL,      -- -1 to +1
    confidence_score REAL,     -- 0 to 1
    tone TEXT,                 -- positive, neutral, cautious, negative

    -- Key phrases detected
    guidance_phrases TEXT,     -- JSON: raised, maintained, lowered, withdrew
    uncertainty_phrases INTEGER,  -- Count of hedging language
    forward_looking_count INTEGER,
    risk_mentions INTEGER,

    -- Comparison to prior call
    tone_change REAL,          -- Change in sentiment vs prior quarter
    guidance_change TEXT,      -- raised, maintained, lowered

    -- Source
    source TEXT,               -- seeking_alpha, motley_fool, yahoo
    source_url TEXT,

    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, fiscal_year, fiscal_quarter, call_type)
  );

  CREATE INDEX IF NOT EXISTS idx_transcripts_company ON earnings_transcripts(company_id);
  CREATE INDEX IF NOT EXISTS idx_transcripts_date ON earnings_transcripts(call_date DESC);
  CREATE INDEX IF NOT EXISTS idx_transcripts_symbol ON earnings_transcripts(symbol);
`);

console.log('✅ Created earnings_transcripts table');

// ============================================
// TABLE: Management Guidance
// Tracks company guidance over time
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS management_guidance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,

    -- When guidance was given
    guidance_date DATE NOT NULL,
    fiscal_year INTEGER NOT NULL,
    fiscal_quarter INTEGER,      -- NULL for full year

    -- Revenue guidance
    revenue_low REAL,
    revenue_high REAL,
    revenue_mid REAL,
    revenue_prior_low REAL,      -- Prior guidance for comparison
    revenue_prior_high REAL,
    revenue_change TEXT,         -- raised, maintained, lowered, initiated, withdrew

    -- EPS guidance
    eps_low REAL,
    eps_high REAL,
    eps_mid REAL,
    eps_prior_low REAL,
    eps_prior_high REAL,
    eps_change TEXT,

    -- Margin guidance
    gross_margin_guidance TEXT,
    operating_margin_guidance TEXT,

    -- Qualitative
    tone TEXT,                   -- confident, cautious, uncertain
    key_drivers TEXT,            -- JSON array of mentioned drivers
    headwinds TEXT,              -- JSON array of mentioned headwinds
    tailwinds TEXT,              -- JSON array of mentioned tailwinds

    -- Track record
    beat_prior_guidance INTEGER, -- Did they beat prior quarter's guidance?

    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_guidance_company ON management_guidance(company_id);
  CREATE INDEX IF NOT EXISTS idx_guidance_date ON management_guidance(guidance_date DESC);
`);

console.log('✅ Created management_guidance table');

// ============================================
// TABLE: Valuation History
// Historical valuation metrics for percentile analysis
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    snapshot_date DATE NOT NULL,

    -- Price & Market Cap
    price REAL,
    market_cap REAL,
    enterprise_value REAL,

    -- Valuation Multiples
    pe_ratio REAL,
    pe_forward REAL,
    pb_ratio REAL,
    ps_ratio REAL,
    ev_ebitda REAL,
    ev_sales REAL,
    fcf_yield REAL,
    earnings_yield REAL,
    dividend_yield REAL,

    -- Growth-adjusted
    peg_ratio REAL,

    -- Quality metrics at time (for context)
    roic REAL,
    roe REAL,
    operating_margin REAL,
    revenue_growth_yoy REAL,

    -- Calculated percentiles (vs own history)
    pe_percentile_1y REAL,
    pe_percentile_3y REAL,
    pe_percentile_5y REAL,
    pb_percentile_5y REAL,
    fcf_yield_percentile_5y REAL,

    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, snapshot_date)
  );

  CREATE INDEX IF NOT EXISTS idx_valuation_company ON valuation_history(company_id);
  CREATE INDEX IF NOT EXISTS idx_valuation_date ON valuation_history(snapshot_date DESC);
  CREATE INDEX IF NOT EXISTS idx_valuation_symbol ON valuation_history(symbol);
`);

console.log('✅ Created valuation_history table');

// ============================================
// TABLE: Valuation Ranges
// Pre-calculated valuation ranges for quick lookups
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS valuation_ranges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- PE Ratio ranges
    pe_min_1y REAL, pe_max_1y REAL, pe_avg_1y REAL, pe_median_1y REAL,
    pe_min_3y REAL, pe_max_3y REAL, pe_avg_3y REAL, pe_median_3y REAL,
    pe_min_5y REAL, pe_max_5y REAL, pe_avg_5y REAL, pe_median_5y REAL,

    -- P/B Ratio ranges
    pb_min_5y REAL, pb_max_5y REAL, pb_avg_5y REAL, pb_median_5y REAL,

    -- EV/EBITDA ranges
    ev_ebitda_min_5y REAL, ev_ebitda_max_5y REAL, ev_ebitda_avg_5y REAL,

    -- FCF Yield ranges
    fcf_yield_min_5y REAL, fcf_yield_max_5y REAL, fcf_yield_avg_5y REAL,

    -- Current position
    current_pe REAL,
    current_pe_percentile REAL,  -- 0-100, where in the range
    current_pb REAL,
    current_pb_percentile REAL,
    current_fcf_yield REAL,
    current_fcf_yield_percentile REAL,

    -- Valuation signal
    valuation_signal TEXT,       -- cheap, fair, expensive, very_expensive
    signal_confidence REAL,

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_valuation_ranges_symbol ON valuation_ranges(symbol);
`);

console.log('✅ Created valuation_ranges table');

// ============================================
// TABLE: Management Track Record
// Tracks management credibility over time
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS management_track_record (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL UNIQUE,
    symbol TEXT NOT NULL,

    -- Guidance accuracy
    total_guidance_given INTEGER DEFAULT 0,
    guidance_beats INTEGER DEFAULT 0,
    guidance_misses INTEGER DEFAULT 0,
    guidance_accuracy_rate REAL,  -- beats / total

    -- Earnings track record
    earnings_beats INTEGER DEFAULT 0,
    earnings_misses INTEGER DEFAULT 0,
    earnings_beat_rate REAL,

    -- Capital allocation score
    buyback_roi REAL,            -- Returns on buybacks vs market
    dividend_growth_cagr REAL,
    acquisition_success_rate REAL,
    capital_allocation_score REAL,  -- 0-100 composite

    -- Communication quality
    transparency_score REAL,     -- Based on NLP of calls
    consistency_score REAL,      -- Tone consistency over time

    -- Overall credibility
    credibility_score REAL,      -- 0-100 composite

    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_track_record_symbol ON management_track_record(symbol);
`);

console.log('✅ Created management_track_record table');

// ============================================
// Helper Views
// ============================================

// Stocks trading below historical average
db.exec(`
  CREATE VIEW IF NOT EXISTS v_undervalued_vs_history AS
  SELECT
    vr.symbol,
    c.name,
    c.sector,
    vr.current_pe,
    vr.pe_avg_5y,
    vr.current_pe_percentile,
    vr.current_pb,
    vr.pb_avg_5y,
    vr.current_pb_percentile,
    vr.current_fcf_yield,
    vr.fcf_yield_avg_5y,
    vr.valuation_signal,
    vr.signal_confidence
  FROM valuation_ranges vr
  JOIN companies c ON vr.company_id = c.id
  WHERE vr.current_pe_percentile < 30
    OR vr.current_pb_percentile < 30
    OR vr.current_fcf_yield_percentile > 70
`);

// Latest transcript per company
db.exec(`
  CREATE VIEW IF NOT EXISTS v_latest_transcripts AS
  SELECT et.*
  FROM earnings_transcripts et
  INNER JOIN (
    SELECT company_id, MAX(call_date) as max_date
    FROM earnings_transcripts
    GROUP BY company_id
  ) latest ON et.company_id = latest.company_id AND et.call_date = latest.max_date
`);

// Management with best track records
db.exec(`
  CREATE VIEW IF NOT EXISTS v_credible_management AS
  SELECT
    mtr.symbol,
    c.name,
    mtr.guidance_accuracy_rate,
    mtr.earnings_beat_rate,
    mtr.capital_allocation_score,
    mtr.credibility_score
  FROM management_track_record mtr
  JOIN companies c ON mtr.company_id = c.id
  WHERE mtr.credibility_score >= 70
  ORDER BY mtr.credibility_score DESC
`);

console.log('✅ Created helper views');

console.log('\n✅ Earnings Transcripts & Valuation History migration complete!\n');
