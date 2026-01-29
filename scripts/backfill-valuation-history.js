#!/usr/bin/env node
/**
 * Backfill Valuation History
 *
 * Populates valuation_history table from existing calculated_metrics data.
 * This enables historical percentile analysis for value investing.
 */

const db = require('../src/database');

console.log('\n📊 Backfilling Valuation History from Calculated Metrics...\n');

const dbConn = db.getDatabase();

// Get distinct fiscal periods from calculated_metrics
const periods = dbConn.prepare(`
  SELECT DISTINCT fiscal_period
  FROM calculated_metrics
  WHERE fiscal_period IS NOT NULL
    AND period_type = 'annual'
  ORDER BY fiscal_period DESC
`).all();

console.log(`Found ${periods.length} distinct annual periods to process\n`);

// Prepare insert statement
const insertStmt = dbConn.prepare(`
  INSERT INTO valuation_history (
    company_id, symbol, snapshot_date,
    price, market_cap, enterprise_value,
    pe_ratio, pe_forward, pb_ratio, ps_ratio,
    ev_ebitda, ev_sales, fcf_yield, earnings_yield, dividend_yield,
    peg_ratio, roic, roe, operating_margin, revenue_growth_yoy
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(company_id, snapshot_date) DO UPDATE SET
    price = excluded.price,
    market_cap = excluded.market_cap,
    pe_ratio = excluded.pe_ratio,
    pb_ratio = excluded.pb_ratio,
    fcf_yield = excluded.fcf_yield,
    roic = excluded.roic,
    roe = excluded.roe
`);

// Process each period
let totalInserted = 0;
let processedPeriods = 0;

const insertMany = dbConn.transaction((metrics) => {
  for (const m of metrics) {
    insertStmt.run(
      m.company_id, m.symbol, m.fiscal_period,
      m.price, m.market_cap, m.enterprise_value,
      m.pe_ratio, m.forward_pe, m.pb_ratio, m.ps_ratio,
      m.ev_to_ebitda, m.ev_to_revenue, m.fcf_yield, m.earnings_yield, m.dividend_yield,
      m.peg_ratio, m.roic, m.roe, m.operating_margin, m.revenue_growth_yoy
    );
  }
  return metrics.length;
});

for (const period of periods) {
  // Get metrics for this period
  const metrics = dbConn.prepare(`
    SELECT
      cm.company_id,
      c.symbol,
      cm.fiscal_period,
      pm.last_price as price,
      pm.market_cap,
      pm.enterprise_value,
      cm.pe_ratio,
      NULL as forward_pe,
      cm.pb_ratio,
      cm.ps_ratio,
      cm.ev_ebitda as ev_to_ebitda,
      NULL as ev_to_revenue,
      cm.fcf_yield,
      cm.earnings_yield,
      cm.dividend_yield,
      cm.peg_ratio,
      cm.roic,
      cm.roe,
      cm.operating_margin,
      cm.revenue_growth_yoy
    FROM calculated_metrics cm
    JOIN companies c ON cm.company_id = c.id
    LEFT JOIN price_metrics pm ON pm.company_id = c.id
    WHERE cm.fiscal_period = ?
      AND cm.period_type = 'annual'
      AND c.symbol NOT LIKE 'CIK_%'
      AND (cm.pe_ratio IS NOT NULL OR cm.pb_ratio IS NOT NULL OR cm.fcf_yield IS NOT NULL)
  `).all(period.fiscal_period);

  if (metrics.length > 0) {
    const inserted = insertMany(metrics);
    totalInserted += inserted;
    processedPeriods++;

    if (processedPeriods % 10 === 0) {
      console.log(`  Processed ${processedPeriods}/${periods.length} periods (${totalInserted.toLocaleString()} records)`);
    }
  }
}

console.log(`\n✅ Backfill complete!`);
console.log(`   Periods processed: ${processedPeriods}`);
console.log(`   Records inserted: ${totalInserted.toLocaleString()}\n`);

// Verify
const count = dbConn.prepare('SELECT COUNT(*) as cnt FROM valuation_history').get();
console.log(`📊 Total valuation_history records: ${count.cnt.toLocaleString()}\n`);

// Show sample data
const sample = dbConn.prepare(`
  SELECT symbol, snapshot_date, pe_ratio, pb_ratio, fcf_yield, roic
  FROM valuation_history
  WHERE symbol IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN')
  ORDER BY symbol, snapshot_date DESC
  LIMIT 12
`).all();

if (sample.length > 0) {
  console.log('Sample data (FAANG):');
  console.table(sample);
}

process.exit(0);
