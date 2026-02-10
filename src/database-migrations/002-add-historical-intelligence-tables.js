// src/database-migrations/002-add-historical-intelligence-tables.js
// Creates investment_decisions and decision_factor_context for PostgreSQL
// so Historical Intelligence / Quant Factors classification works in production

async function migrate(db) {
  console.log('🐘 Creating historical intelligence tables (investment_decisions, decision_factor_context)...');

  // investment_decisions: core columns needed for classify-all-investors and factor enrichment
  await db.query(`
    CREATE TABLE IF NOT EXISTS investment_decisions (
      id SERIAL PRIMARY KEY,
      investor_id INTEGER NOT NULL REFERENCES famous_investors(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
      cusip TEXT,
      symbol TEXT,
      security_name TEXT,

      decision_date DATE NOT NULL,
      report_date DATE,
      decision_type TEXT NOT NULL,

      shares REAL,
      position_value REAL,
      portfolio_weight REAL,
      previous_shares REAL,
      shares_change REAL,
      shares_change_pct REAL,

      is_top_10_position INTEGER DEFAULT 0,
      is_new_position INTEGER DEFAULT 0,
      position_size_category TEXT,

      stock_price REAL,
      market_cap REAL,
      enterprise_value REAL,
      pe_ratio REAL,
      pb_ratio REAL,
      ps_ratio REAL,
      ev_ebitda REAL,
      ev_revenue REAL,
      fcf_yield REAL,
      earnings_yield REAL,
      dividend_yield REAL,
      revenue_growth_yoy REAL,
      revenue_growth_3y_cagr REAL,
      earnings_growth_yoy REAL,
      fcf_growth_yoy REAL,
      gross_margin REAL,
      operating_margin REAL,
      net_margin REAL,
      roe REAL,
      roic REAL,
      roa REAL,
      debt_to_equity REAL,
      debt_to_assets REAL,
      current_ratio REAL,
      interest_coverage REAL,
      fcf_per_share REAL,
      sector TEXT,
      industry TEXT,
      market_context_id INTEGER,
      sp500_pe REAL,
      sp500_1y_return REAL,
      vix REAL,
      fed_funds_rate REAL,
      yield_curve_spread REAL,
      market_cycle TEXT,

      outcome_calculated_at TIMESTAMP,
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
      alpha_1y REAL,
      outcome_category TEXT,
      beat_market_1y INTEGER,

      still_held INTEGER DEFAULT 1,
      exit_date DATE,
      exit_price REAL,
      total_return REAL,
      holding_period_days INTEGER,
      annualized_return REAL,
      primary_pattern_id INTEGER,
      pattern_confidence REAL,
      pattern_tags TEXT,
      thesis_summary TEXT,
      lessons_learned TEXT,
      data_quality_score REAL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_decisions_investor ON investment_decisions(investor_id, decision_date DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_company ON investment_decisions(company_id, decision_date DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_symbol ON investment_decisions(symbol, decision_date DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_date ON investment_decisions(decision_date DESC);
    CREATE INDEX IF NOT EXISTS idx_decisions_type ON investment_decisions(decision_type);
    CREATE INDEX IF NOT EXISTS idx_decisions_beat_market ON investment_decisions(beat_market_1y);
  `);
  console.log('  ✓ investment_decisions');

  // decision_factor_context: required for classify-all-investors and factor analysis
  await db.query(`
    CREATE TABLE IF NOT EXISTS decision_factor_context (
      id SERIAL PRIMARY KEY,
      decision_id INTEGER NOT NULL REFERENCES investment_decisions(id) ON DELETE CASCADE,

      value_score REAL,
      quality_score REAL,
      momentum_score REAL,
      growth_score REAL,
      size_score REAL,
      volatility_score REAL,

      value_percentile REAL,
      quality_percentile REAL,
      momentum_percentile REAL,
      growth_percentile REAL,

      dominant_factor TEXT,
      dominant_factor_percentile REAL,

      is_value_play INTEGER,
      is_quality_play INTEGER,
      is_momentum_play INTEGER,
      is_growth_play INTEGER,
      is_contrarian_play INTEGER,
      is_small_cap_play INTEGER,

      created_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(decision_id)
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_factor_unique ON decision_factor_context(decision_id);
    CREATE INDEX IF NOT EXISTS idx_decision_factor_dominant ON decision_factor_context(dominant_factor);
  `);
  console.log('  ✓ decision_factor_context');

  console.log('✅ Historical intelligence tables ready.');
}

module.exports = migrate;
