#!/usr/bin/env node

/**
 * Calculate TTM (Trailing Twelve Months) Metrics
 *
 * Creates a 'ttm' period_type record for each company by aggregating
 * the last 4 quarters of data. This is useful for:
 * - Screening (comparing companies on same time basis)
 * - Matching Yahoo Finance TTM data
 * - More current view than annual data
 */

const db = require('../../src/database').getDatabase();

console.log('\n📊 CALCULATING TTM METRICS');
console.log('=' .repeat(60));

// Get all companies with quarterly data
const companies = db.prepare(`
  SELECT DISTINCT c.id, c.symbol
  FROM companies c
  JOIN calculated_metrics m ON m.company_id = c.id
  WHERE m.period_type = 'quarterly'
  ORDER BY c.symbol
`).all();

console.log(`\n📋 Found ${companies.length} companies with quarterly data\n`);

let processed = 0;
let created = 0;
let updated = 0;
let skipped = 0;

// Helper to average non-null values
function avg(values) {
  const valid = values.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

// Helper to sum non-null values
function sum(values) {
  const valid = values.filter(v => v != null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0);
}

for (const company of companies) {
  // Get last 4 quarters
  const quarters = db.prepare(`
    SELECT *
    FROM calculated_metrics
    WHERE company_id = ?
      AND period_type = 'quarterly'
    ORDER BY fiscal_period DESC
    LIMIT 4
  `).all(company.id);

  if (quarters.length < 4) {
    skipped++;
    continue;
  }

  const latest = quarters[0];

  // Build TTM metrics
  const ttmMetrics = {
    // Margin metrics - average of 4 quarters
    gross_margin: avg(quarters.map(q => q.gross_margin)),
    operating_margin: avg(quarters.map(q => q.operating_margin)),
    net_margin: avg(quarters.map(q => q.net_margin)),

    // Return metrics - average (simplified)
    roic: avg(quarters.map(q => q.roic)),
    roce: avg(quarters.map(q => q.roce)),
    roe: avg(quarters.map(q => q.roe)),
    roa: avg(quarters.map(q => q.roa)),

    // Point-in-time ratios - use most recent quarter
    current_ratio: latest.current_ratio,
    quick_ratio: latest.quick_ratio,
    debt_to_equity: latest.debt_to_equity,
    debt_to_assets: latest.debt_to_assets,
    interest_coverage: latest.interest_coverage,

    // FCF metrics - sum for TTM, margins averaged
    fcf: sum(quarters.map(q => q.fcf)),
    fcf_margin: avg(quarters.map(q => q.fcf_margin)),
    fcf_yield: latest.fcf_yield, // Uses latest market cap
    fcf_per_share: sum(quarters.map(q => q.fcf_per_share)),

    // Valuation - use latest (depends on market cap)
    pe_ratio: latest.pe_ratio,
    pb_ratio: latest.pb_ratio,
    ps_ratio: latest.ps_ratio,
    peg_ratio: latest.peg_ratio,
    ev_ebitda: latest.ev_ebitda,
    earnings_yield: latest.earnings_yield,
    tobins_q: latest.tobins_q,
    msi: latest.msi,

    // Efficiency - use latest
    asset_turnover: latest.asset_turnover,
    owner_earnings: sum(quarters.map(q => q.owner_earnings)),

    // Growth - use latest quarterly YoY growth
    revenue_growth_yoy: latest.revenue_growth_yoy,
    earnings_growth_yoy: latest.earnings_growth_yoy,
    fcf_growth_yoy: latest.fcf_growth_yoy,
    revenue_growth_qoq: latest.revenue_growth_qoq,
    earnings_growth_qoq: latest.earnings_growth_qoq,

    // CAGR - not applicable for TTM, use latest annual if available
    revenue_cagr_3y: null,
    revenue_cagr_5y: null,
    earnings_cagr_3y: null,
    earnings_cagr_5y: null,

    // DuPont - use latest
    equity_multiplier: latest.equity_multiplier,
    dupont_roe: latest.dupont_roe,

    // Quality score - average
    data_quality_score: Math.round(avg(quarters.map(q => q.data_quality_score)) || 0),
  };

  // Check if TTM record exists
  const existingTTM = db.prepare(`
    SELECT id FROM calculated_metrics
    WHERE company_id = ? AND period_type = 'ttm'
  `).get(company.id);

  if (existingTTM) {
    // Update existing TTM record
    const setClauses = [];
    const values = [];

    for (const [key, value] of Object.entries(ttmMetrics)) {
      if (value !== undefined) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    // Add metadata
    setClauses.push('fiscal_period = ?');
    values.push(latest.fiscal_period);
    setClauses.push('fiscal_year = ?');
    values.push(latest.fiscal_year);
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    values.push(existingTTM.id);

    db.prepare(`
      UPDATE calculated_metrics
      SET ${setClauses.join(', ')}
      WHERE id = ?
    `).run(...values);

    updated++;
  } else {
    // Insert new TTM record
    const columns = ['company_id', 'fiscal_period', 'fiscal_year', 'period_type'];
    const values = [company.id, latest.fiscal_period, latest.fiscal_year, 'ttm'];

    for (const [key, value] of Object.entries(ttmMetrics)) {
      if (value !== undefined && value !== null) {
        columns.push(key);
        values.push(value);
      }
    }

    const placeholders = columns.map(() => '?').join(', ');

    db.prepare(`
      INSERT INTO calculated_metrics (${columns.join(', ')})
      VALUES (${placeholders})
    `).run(...values);

    created++;
  }

  processed++;

  if (processed % 100 === 0) {
    console.log(`  Processed ${processed} companies...`);
  }
}

console.log('\n' + '=' .repeat(60));
console.log(`✅ TTM CALCULATION COMPLETE`);
console.log(`   Processed: ${processed} companies`);
console.log(`   Created:   ${created} new TTM records`);
console.log(`   Updated:   ${updated} existing TTM records`);
console.log(`   Skipped:   ${skipped} (not enough quarterly data)`);
console.log('=' .repeat(60) + '\n');

// Verify
const ttmCount = db.prepare(`
  SELECT COUNT(*) as count FROM calculated_metrics WHERE period_type = 'ttm'
`).get();
console.log(`📊 Total TTM records in database: ${ttmCount.count}\n`);
