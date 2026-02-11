#!/usr/bin/env node
/**
 * Metrics Recalculation Job
 *
 * Recalculates all valuation metrics using corrected historical market cap.
 * This fixes the bug where current market cap was used for historical periods.
 *
 * Usage:
 *   node src/jobs/recalculateMetrics.js [options]
 *
 * Options:
 *   --symbol AAPL    Recalculate for a single stock
 *   --limit 100      Process only N companies
 *   --offset 0       Skip first N companies
 *   --dry-run        Show what would be done without making changes
 *   --verify         Run verification queries after completion
 *
 * Examples:
 *   node src/jobs/recalculateMetrics.js                    # All companies
 *   node src/jobs/recalculateMetrics.js --symbol AAPL      # Single stock
 *   node src/jobs/recalculateMetrics.js --limit 100        # First 100
 *   node src/jobs/recalculateMetrics.js --dry-run          # Preview only
 */

require('dotenv').config();

const { getDatabaseAsync } = require('../lib/db');
const MetricCalculator = require('../services/metricCalculator');

// European country codes for filtering
const EUROPEAN_COUNTRIES = [
  'GB', 'DE', 'FR', 'NL', 'BE', 'ES', 'IT', 'CH', 'SE', 'DK',
  'NO', 'FI', 'AT', 'PT', 'IE', 'PL', 'GR', 'LU'
];

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    symbol: null,
    limit: null,
    offset: 0,
    dryRun: false,
    verify: false,
    country: null,
    european: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--symbol':
        options.symbol = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--offset':
        options.offset = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verify':
        options.verify = true;
        break;
      case '--country':
        options.country = args[++i]?.toUpperCase();
        break;
      case '--european':
        options.european = true;
        break;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();
  const database = await getDatabaseAsync();
  const calculator = new MetricCalculator(database);

  console.log('='.repeat(60));
  console.log('METRICS RECALCULATION JOB');
  console.log('Started:', new Date().toISOString());
  console.log('='.repeat(60));
  console.log('Options:', JSON.stringify(options, null, 2));
  console.log('');

  // Get companies to process
  let query = `
    SELECT c.id, c.symbol, c.name, c.country,
           (SELECT COUNT(*) FROM financial_data fd WHERE fd.company_id = c.id) as periods,
           (SELECT COUNT(*) FROM daily_prices dp WHERE dp.company_id = c.id) as price_days
    FROM companies c
    WHERE c.is_active = 1
  `;

  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (options.symbol) {
    query += ` AND c.symbol = ${addParam(options.symbol)}`;
  }

  if (options.country) {
    query += ` AND c.country = ${addParam(options.country)}`;
  }

  if (options.european) {
    const placeholders = EUROPEAN_COUNTRIES.map(country => addParam(country)).join(',');
    query += ` AND c.country IN (${placeholders})`;
  }

  query += ' ORDER BY c.market_cap DESC NULLS LAST';

  if (options.limit) {
    query += ` LIMIT ${addParam(options.limit)}`;
  }

  if (options.offset > 0) {
    query += ` OFFSET ${addParam(options.offset)}`;
  }

  const companiesResult = await database.query(query, params);
  const companies = companiesResult.rows;

  console.log(`Found ${companies.length} companies to process\n`);

  if (options.dryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
    console.log('Companies that would be processed:');
    for (const company of companies.slice(0, 20)) {
      console.log(`  ${company.symbol.padEnd(8)} - ${company.periods} periods, ${company.price_days} price days`);
    }
    if (companies.length > 20) {
      console.log(`  ... and ${companies.length - 20} more`);
    }
    return;
  }

  // Process companies
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors = [];
  const startTime = Date.now();

  for (const company of companies) {
    processed++;
    const progress = ((processed / companies.length) * 100).toFixed(1);

    try {
      process.stdout.write(`\r[${progress}%] Processing ${company.symbol.padEnd(8)} (${processed}/${companies.length})...`);

      const result = await calculator.calculateForCompany(company.id, database);

      if (result.success !== false) {
        succeeded++;
      } else {
        failed++;
        errors.push({ symbol: company.symbol, error: result.message });
      }
    } catch (error) {
      failed++;
      errors.push({ symbol: company.symbol, error: error.message });
    }

    // Progress update every 100 companies
    if (processed % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (companies.length - processed) / rate;
      console.log(`\n   Elapsed: ${elapsed.toFixed(0)}s, Rate: ${rate.toFixed(1)}/s, ETA: ${remaining.toFixed(0)}s`);
    }
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('RECALCULATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    for (const err of errors.slice(0, 10)) {
      console.log(`  ${err.symbol}: ${err.error}`);
    }
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  // Verification
  if (options.verify) {
    console.log('\n');
    console.log('='.repeat(60));
    console.log('VERIFICATION');
    console.log('='.repeat(60));

    // Check sample historical P/E values
    const sampleChecks = database.prepare(`
      SELECT
        c.symbol,
        cm.fiscal_period,
        cm.pe_ratio,
        fd.net_income,
        dp.close as historical_price,
        pm.shares_outstanding,
        CASE
          WHEN pm.shares_outstanding > 0 AND fd.net_income > 0
          THEN (dp.close * pm.shares_outstanding) / fd.net_income
          ELSE NULL
        END as expected_pe
      FROM companies c
      JOIN calculated_metrics cm ON c.id = cm.company_id
      JOIN financial_data fd ON c.id = fd.company_id
        AND fd.fiscal_date_ending = cm.fiscal_period
        AND fd.statement_type = 'income_statement'
      JOIN daily_prices dp ON c.id = dp.company_id AND dp.date = cm.fiscal_period
      JOIN price_metrics pm ON c.id = pm.company_id
      WHERE c.symbol IN ('AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JNJ')
        AND cm.period_type = 'annual'
        AND cm.fiscal_period LIKE '2015%'
      ORDER BY c.symbol
    `).all();

    console.log('\nSample 2015 P/E Values (should be ~15-35x, not 100+):');
    console.log('-'.repeat(50));
    for (const row of sampleChecks) {
      const status = row.pe_ratio < 50 ? '✓' : '✗';
      console.log(`${status} ${row.symbol.padEnd(6)} ${row.fiscal_period}: P/E = ${row.pe_ratio?.toFixed(1) || 'N/A'}`);
    }

    // Check aggregate S&P 500 P/E for 2015
    const sp500PE2015 = database.prepare(`
      SELECT
        ROUND(SUM(cm.pe_ratio * c.market_cap) / SUM(c.market_cap), 2) as weighted_pe,
        COUNT(*) as companies
      FROM index_constituents ic
      JOIN companies c ON ic.company_id = c.id
      JOIN calculated_metrics cm ON c.id = cm.company_id
      WHERE ic.index_id = 1
        AND ic.removed_at IS NULL
        AND cm.pe_ratio > 0 AND cm.pe_ratio < 100
        AND c.market_cap > 0
        AND cm.period_type = 'annual'
        AND cm.fiscal_period LIKE '2015%'
    `).get();

    console.log('\nS&P 500 Weighted P/E (2015):');
    console.log(`  Value: ${sp500PE2015?.weighted_pe || 'N/A'}x (should be ~18-22x)`);
    console.log(`  Companies: ${sp500PE2015?.companies || 0}`);
  }

  console.log('\nDone.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
