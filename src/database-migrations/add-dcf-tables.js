/**
 * Database migration: Add DCF valuation tables
 * - industry_benchmarks: Industry-specific valuation benchmarks
 * - dcf_valuations: Stored DCF calculation results
 */

const db = require('../database');

function migrate() {
  const database = db.getDatabase();

  console.log('Creating DCF-related tables...');

  // Industry benchmarks table
  database.exec(`
    CREATE TABLE IF NOT EXISTS industry_benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      industry TEXT NOT NULL,
      sector TEXT,

      -- Valuation multiples (medians)
      ev_ebitda_median REAL,
      ev_ebitda_p25 REAL,
      ev_ebitda_p75 REAL,
      pe_median REAL,
      ps_median REAL,

      -- Cost of capital
      wacc_median REAL,
      beta_median REAL,

      -- Growth benchmarks
      revenue_growth_median REAL,
      margin_median REAL,

      -- Metadata
      source TEXT DEFAULT 'calculated',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      UNIQUE(industry)
    );
  `);

  // Pre-populate with common industries
  const insertBenchmark = database.prepare(`
    INSERT OR REPLACE INTO industry_benchmarks
    (industry, sector, ev_ebitda_median, pe_median, wacc_median, beta_median, revenue_growth_median, margin_median)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const benchmarks = [
    ['Technology', 'Technology', 18.0, 28.0, 0.10, 1.2, 0.15, 0.22],
    ['Software', 'Technology', 22.0, 35.0, 0.095, 1.1, 0.18, 0.25],
    ['Semiconductors', 'Technology', 16.0, 22.0, 0.105, 1.3, 0.12, 0.28],
    ['Internet Content & Information', 'Technology', 20.0, 30.0, 0.10, 1.15, 0.20, 0.24],
    ['Healthcare', 'Healthcare', 14.0, 22.0, 0.09, 0.9, 0.08, 0.18],
    ['Pharmaceuticals', 'Healthcare', 12.0, 18.0, 0.085, 0.8, 0.06, 0.20],
    ['Biotechnology', 'Healthcare', 15.0, 25.0, 0.11, 1.4, 0.15, 0.15],
    ['Medical Devices', 'Healthcare', 18.0, 28.0, 0.09, 0.95, 0.10, 0.22],
    ['Financial Services', 'Finance', 10.0, 12.0, 0.10, 1.1, 0.05, 0.30],
    ['Banks', 'Finance', 8.0, 10.0, 0.095, 1.0, 0.04, 0.35],
    ['Insurance', 'Finance', 9.0, 11.0, 0.09, 0.9, 0.05, 0.12],
    ['Asset Management', 'Finance', 12.0, 15.0, 0.10, 1.2, 0.06, 0.35],
    ['Consumer Discretionary', 'Consumer', 12.0, 18.0, 0.095, 1.1, 0.07, 0.12],
    ['Consumer Staples', 'Consumer', 14.0, 22.0, 0.08, 0.7, 0.04, 0.15],
    ['Retail', 'Consumer', 10.0, 16.0, 0.10, 1.0, 0.05, 0.08],
    ['Restaurants', 'Consumer', 14.0, 25.0, 0.095, 1.0, 0.06, 0.12],
    ['Industrials', 'Industrials', 11.0, 18.0, 0.09, 1.0, 0.05, 0.12],
    ['Aerospace & Defense', 'Industrials', 14.0, 22.0, 0.085, 0.9, 0.04, 0.14],
    ['Machinery', 'Industrials', 12.0, 18.0, 0.09, 1.0, 0.05, 0.13],
    ['Manufacturing', 'Industrials', 10.0, 15.0, 0.095, 1.05, 0.04, 0.10],
    ['Energy', 'Energy', 6.0, 10.0, 0.10, 1.2, 0.03, 0.15],
    ['Oil & Gas', 'Energy', 5.0, 8.0, 0.11, 1.3, 0.02, 0.18],
    ['Renewable Energy', 'Energy', 12.0, 25.0, 0.09, 1.1, 0.15, 0.10],
    ['Utilities', 'Utilities', 9.0, 16.0, 0.065, 0.5, 0.03, 0.18],
    ['Real Estate', 'Real Estate', 15.0, 20.0, 0.075, 0.8, 0.04, 0.35],
    ['REITs', 'Real Estate', 18.0, 25.0, 0.07, 0.75, 0.05, 0.40],
    ['Materials', 'Materials', 8.0, 12.0, 0.095, 1.1, 0.04, 0.14],
    ['Mining', 'Materials', 6.0, 10.0, 0.11, 1.3, 0.03, 0.20],
    ['Chemicals', 'Materials', 10.0, 15.0, 0.09, 1.0, 0.04, 0.15],
    ['Telecommunications', 'Telecommunications', 7.0, 12.0, 0.08, 0.7, 0.02, 0.20],
    ['Media & Entertainment', 'Communications', 12.0, 20.0, 0.095, 1.0, 0.05, 0.18],
    ['Default', null, 12.0, 18.0, 0.10, 1.0, 0.05, 0.15]
  ];

  const insertMany = database.transaction(() => {
    for (const b of benchmarks) {
      insertBenchmark.run(...b);
    }
  });
  insertMany();
  console.log(`  Inserted ${benchmarks.length} industry benchmarks`);

  // DCF valuations table
  database.exec(`
    CREATE TABLE IF NOT EXISTS dcf_valuations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,

      -- Inputs used
      base_fcf REAL NOT NULL,
      base_ebitda REAL,
      base_revenue REAL,
      shares_outstanding REAL,
      net_debt REAL,

      -- Growth assumptions
      growth_stage1 REAL,
      growth_stage2 REAL,
      growth_stage3 REAL,
      terminal_growth REAL,

      -- Margin assumptions
      current_margin REAL,
      target_margin REAL,
      margin_improvement_years INTEGER,

      -- Discount rate
      wacc REAL,
      risk_free_rate REAL,
      equity_risk_premium REAL,
      beta REAL,

      -- Terminal value
      terminal_value_gordon REAL,
      terminal_value_exit_multiple REAL,
      exit_multiple_used REAL,
      terminal_method_divergence REAL,

      -- Results - Base case
      enterprise_value REAL,
      equity_value REAL,
      intrinsic_value_per_share REAL,

      -- Results - Scenarios
      bull_case_value REAL,
      bear_case_value REAL,
      weighted_value REAL,

      -- Sanity checks
      implied_ev_ebitda REAL,
      implied_pe REAL,
      implied_pfcf REAL,
      terminal_value_pct REAL,

      -- Buy targets
      margin_of_safety_25 REAL,
      margin_of_safety_50 REAL,

      -- Flags (JSON array of warning strings)
      warning_flags TEXT,

      -- Metadata
      calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      model_version TEXT DEFAULT 'v2.0',

      FOREIGN KEY (company_id) REFERENCES companies(id)
    );

    CREATE INDEX IF NOT EXISTS idx_dcf_company ON dcf_valuations(company_id);
    CREATE INDEX IF NOT EXISTS idx_dcf_date ON dcf_valuations(calculated_at DESC);
  `);

  console.log('DCF tables created successfully!');
}

// Run migration
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
