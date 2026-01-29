#!/usr/bin/env node
/**
 * Calculate Metrics for TTM Financial Data
 *
 * Calculates and stores financial metrics for all TTM (Trailing Twelve Months) data.
 */

const Database = require('better-sqlite3');
const MetricCalculator = require('../src/services/metricCalculator');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);
const calculator = new MetricCalculator();

console.log('\n📊 TTM METRICS CALCULATOR\n');

// Get all companies with TTM data
const companiesWithTTM = db.prepare(`
  SELECT DISTINCT c.id, c.symbol, c.name, c.sector, c.market_cap
  FROM companies c
  JOIN financial_data fd ON c.id = fd.company_id
  WHERE fd.period_type = 'ttm'
  ORDER BY c.symbol
`).all();

console.log(`Found ${companiesWithTTM.length} companies with TTM data\n`);

let processed = 0;
let metricsCreated = 0;
let errors = 0;

// Prepare insert statement
const insertMetrics = db.prepare(`
  INSERT OR REPLACE INTO calculated_metrics (
    company_id, period_type, fiscal_period, fiscal_year,
    roe, roa, roic, roce,
    gross_margin, operating_margin, net_margin,
    current_ratio, quick_ratio, debt_to_equity, debt_to_assets,
    interest_coverage, fcf, fcf_margin, fcf_yield,
    pe_ratio, pb_ratio, ps_ratio, ev_ebitda,
    asset_turnover, equity_multiplier, dupont_roe,
    revenue_growth_yoy, earnings_growth_yoy, fcf_growth_yoy,
    revenue_growth_qoq, earnings_growth_qoq,
    peg_ratio, pegy_ratio, earnings_yield,
    tobins_q, graham_number,
    dividend_yield, buyback_yield, shareholder_yield,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    datetime('now'), datetime('now')
  )
`);

for (const company of companiesWithTTM) {
  try {
    // Get TTM financial data
    const ttmRecords = db.prepare(`
      SELECT statement_type, data, fiscal_date_ending, fiscal_year, fiscal_period
      FROM financial_data
      WHERE company_id = ? AND period_type = 'ttm'
      ORDER BY fiscal_date_ending DESC
      LIMIT 3
    `).all(company.id);

    if (ttmRecords.length < 3) {
      // Need all 3 statement types
      continue;
    }

    // Parse the financial statements
    const financialData = {};
    let fiscalYear, fiscalPeriod, fiscalDateEnding;

    for (const record of ttmRecords) {
      financialData[record.statement_type] = JSON.parse(record.data);
      fiscalYear = record.fiscal_year;
      fiscalPeriod = record.fiscal_period;
      fiscalDateEnding = record.fiscal_date_ending;
    }

    // Get current price for valuation metrics
    const priceData = db.prepare(`
      SELECT close as price FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC LIMIT 1
    `).get(company.id);

    const currentPrice = priceData ? priceData.price : null;

    // Calculate metrics
    const metrics = calculator.calculateAllMetrics(
      financialData,
      company.market_cap,
      currentPrice,
      {
        symbol: company.symbol,
        sector: company.sector,
        periodType: 'ttm'
      }
    );

    // Insert metrics
    insertMetrics.run(
      company.id, 'ttm', fiscalPeriod, fiscalYear,
      metrics.roe, metrics.roa, metrics.roic, metrics.roce,
      metrics.gross_margin, metrics.operating_margin, metrics.net_margin,
      metrics.current_ratio, metrics.quick_ratio, metrics.debt_to_equity, metrics.debt_to_assets,
      metrics.interest_coverage, metrics.fcf, metrics.fcf_margin, metrics.fcf_yield,
      metrics.pe_ratio, metrics.pb_ratio, metrics.ps_ratio, metrics.ev_ebitda,
      metrics.asset_turnover, metrics.equity_multiplier, metrics.dupont_roe,
      metrics.revenue_growth_yoy, metrics.earnings_growth_yoy, metrics.fcf_growth_yoy,
      metrics.revenue_growth_qoq, metrics.earnings_growth_qoq,
      metrics.peg_ratio, metrics.pegy_ratio, metrics.earnings_yield,
      metrics.tobins_q, metrics.graham_number,
      metrics.dividend_yield, metrics.buyback_yield, metrics.shareholder_yield
    );

    metricsCreated++;
    processed++;

    if (processed % 500 === 0) {
      console.log(`  Processed ${processed} companies, created ${metricsCreated} metric records`);
    }

  } catch (error) {
    errors++;
    if (errors < 10) {
      console.error(`  Error processing ${company.symbol}: ${error.message}`);
    }
  }
}

console.log(`\n✅ Complete!\n`);
console.log(`  Companies processed: ${processed}`);
console.log(`  Metric records created: ${metricsCreated}`);
console.log(`  Errors: ${errors}\n`);

db.close();
