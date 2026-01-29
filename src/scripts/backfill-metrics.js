#!/usr/bin/env node
/**
 * Backfill Missing Metrics Script
 *
 * This script fixes missing metrics by:
 * 1. Calculating Enterprise Value (EV) from market cap + debt - cash
 * 2. Calculating Beta from price returns vs SPY
 * 3. Recalculating all derived metrics (dividend yield, buyback yield, etc.)
 *
 * Run: node src/scripts/backfill-metrics.js [--limit N] [--symbol AAPL]
 */

const db = require('../database');
const MetricCalculator = require('../services/metricCalculator');

// Parse command line arguments
const args = process.argv.slice(2);
let limit = null;
let targetSymbol = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1]);
  }
  if (args[i] === '--symbol' && args[i + 1]) {
    targetSymbol = args[i + 1].toUpperCase();
  }
}

const SPY_COMPANY_ID = 14353; // SPY's company_id in the database
const TRADING_DAYS_PER_YEAR = 252;

/**
 * Calculate Beta for a company using price returns vs SPY
 * Beta = Cov(stock returns, market returns) / Var(market returns)
 */
function calculateBeta(database, companyId, lookbackDays = 252) {
  try {
    // Get stock returns
    const stockPrices = database.prepare(`
      SELECT date, adjusted_close
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT ?
    `).all(companyId, lookbackDays + 1);

    if (stockPrices.length < 60) { // Need at least ~3 months of data
      return null;
    }

    // Get SPY returns for the same dates
    const spyPrices = database.prepare(`
      SELECT date, adjusted_close
      FROM daily_prices
      WHERE company_id = ?
        AND date IN (SELECT date FROM daily_prices WHERE company_id = ?)
      ORDER BY date DESC
      LIMIT ?
    `).all(SPY_COMPANY_ID, companyId, lookbackDays + 1);

    if (spyPrices.length < 60) {
      return null;
    }

    // Create date-indexed maps
    const stockMap = new Map(stockPrices.map(p => [p.date, p.adjusted_close]));
    const spyMap = new Map(spyPrices.map(p => [p.date, p.adjusted_close]));

    // Find common dates
    const commonDates = [...stockMap.keys()].filter(d => spyMap.has(d)).sort().reverse();

    if (commonDates.length < 60) {
      return null;
    }

    // Calculate returns
    const stockReturns = [];
    const spyReturns = [];

    for (let i = 0; i < commonDates.length - 1; i++) {
      const date1 = commonDates[i];
      const date2 = commonDates[i + 1];

      const stockReturn = (stockMap.get(date1) - stockMap.get(date2)) / stockMap.get(date2);
      const spyReturn = (spyMap.get(date1) - spyMap.get(date2)) / spyMap.get(date2);

      if (isFinite(stockReturn) && isFinite(spyReturn)) {
        stockReturns.push(stockReturn);
        spyReturns.push(spyReturn);
      }
    }

    if (stockReturns.length < 30) {
      return null;
    }

    // Calculate means
    const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const spyMean = spyReturns.reduce((a, b) => a + b, 0) / spyReturns.length;

    // Calculate covariance and variance
    let covariance = 0;
    let spyVariance = 0;

    for (let i = 0; i < stockReturns.length; i++) {
      covariance += (stockReturns[i] - stockMean) * (spyReturns[i] - spyMean);
      spyVariance += Math.pow(spyReturns[i] - spyMean, 2);
    }

    covariance /= stockReturns.length;
    spyVariance /= spyReturns.length;

    if (spyVariance === 0) {
      return null;
    }

    const beta = covariance / spyVariance;

    // Sanity check: beta should typically be between -2 and 5
    if (beta < -2 || beta > 5) {
      return null;
    }

    return Math.round(beta * 100) / 100;
  } catch (error) {
    console.error(`Error calculating beta for company ${companyId}:`, error.message);
    return null;
  }
}

/**
 * Calculate Enterprise Value from market cap and balance sheet data
 * EV = Market Cap + Total Debt - Cash
 *
 * FALLBACK: If no debt data available, assume debt = 0
 * This allows EV calculation for companies with only cash data
 */
function calculateEnterpriseValue(database, companyId) {
  try {
    // Get market cap from price_metrics
    const priceMetrics = database.prepare(`
      SELECT market_cap FROM price_metrics WHERE company_id = ?
    `).get(companyId);

    if (!priceMetrics?.market_cap) {
      return null;
    }

    const marketCap = priceMetrics.market_cap;

    // Get latest balance sheet data - try to get ANY balance sheet data
    const balanceSheet = database.prepare(`
      SELECT
        long_term_debt,
        short_term_debt,
        cash_and_equivalents
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
      ORDER BY fiscal_date_ending DESC
      LIMIT 1
    `).get(companyId);

    // FALLBACK: If no balance sheet at all, EV = Market Cap (assume no debt, no cash)
    if (!balanceSheet) {
      return marketCap;
    }

    // Use 0 as fallback for missing debt values (common for some companies)
    const totalDebt = (balanceSheet.long_term_debt || 0) + (balanceSheet.short_term_debt || 0);
    const cash = balanceSheet.cash_and_equivalents || 0;

    const ev = marketCap + totalDebt - cash;

    return ev > 0 ? ev : marketCap; // If EV is negative, use market cap
  } catch (error) {
    console.error(`Error calculating EV for company ${companyId}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('\n==========================================');
  console.log('  METRICS BACKFILL SCRIPT');
  console.log('==========================================\n');

  const database = db.getDatabase();
  const calculator = new MetricCalculator();

  // Get companies to process
  let companiesQuery = `
    SELECT c.id, c.symbol, c.name
    FROM companies c
    JOIN price_metrics pm ON pm.company_id = c.id
    WHERE c.is_active = 1
  `;

  if (targetSymbol) {
    companiesQuery += ` AND c.symbol = '${targetSymbol}'`;
  }

  companiesQuery += ' ORDER BY pm.market_cap DESC NULLS LAST';

  if (limit) {
    companiesQuery += ` LIMIT ${limit}`;
  }

  const companies = database.prepare(companiesQuery).all();

  console.log(`Processing ${companies.length} companies...\n`);

  // Prepare update statements
  const updatePriceMetrics = database.prepare(`
    UPDATE price_metrics
    SET enterprise_value = ?, beta = ?, updated_at = datetime('now')
    WHERE company_id = ?
  `);

  // Statistics
  const stats = {
    processed: 0,
    evCalculated: 0,
    betaCalculated: 0,
    metricsUpdated: 0,
    errors: 0
  };

  const startTime = Date.now();

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];

    try {
      // Progress indicator
      if ((i + 1) % 100 === 0 || i === companies.length - 1) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[${i + 1}/${companies.length}] ${company.symbol} (${elapsed}s elapsed)`);
      }

      // Step 1: Calculate Enterprise Value
      const ev = calculateEnterpriseValue(database, company.id);
      if (ev) {
        stats.evCalculated++;
      }

      // Step 2: Calculate Beta
      const beta = calculateBeta(database, company.id);
      if (beta !== null) {
        stats.betaCalculated++;
      }

      // Step 3: Update price_metrics with EV and Beta
      if (ev || beta !== null) {
        updatePriceMetrics.run(ev, beta, company.id);
      }

      // Step 4: Recalculate all derived metrics
      const result = await calculator.calculateForCompany(company.id, database);
      if (result.success && result.updated > 0) {
        stats.metricsUpdated++;
      }

      stats.processed++;
    } catch (error) {
      stats.errors++;
      console.error(`Error processing ${company.symbol}:`, error.message);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n==========================================');
  console.log('  RESULTS');
  console.log('==========================================');
  console.log(`Total processed:     ${stats.processed}`);
  console.log(`EV calculated:       ${stats.evCalculated}`);
  console.log(`Beta calculated:     ${stats.betaCalculated}`);
  console.log(`Metrics updated:     ${stats.metricsUpdated}`);
  console.log(`Errors:              ${stats.errors}`);
  console.log(`Time elapsed:        ${totalTime}s`);
  console.log('==========================================\n');

  // Verify results
  console.log('Verifying results...\n');

  const verification = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN enterprise_value IS NOT NULL THEN 1 ELSE 0 END) as with_ev,
      SUM(CASE WHEN beta IS NOT NULL THEN 1 ELSE 0 END) as with_beta
    FROM price_metrics
  `).get();

  console.log('price_metrics coverage:');
  console.log(`  Total:            ${verification.total}`);
  console.log(`  With EV:          ${verification.with_ev} (${(verification.with_ev / verification.total * 100).toFixed(1)}%)`);
  console.log(`  With Beta:        ${verification.with_beta} (${(verification.with_beta / verification.total * 100).toFixed(1)}%)`);

  const calcVerification = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN dividend_yield IS NOT NULL THEN 1 ELSE 0 END) as with_div_yield,
      SUM(CASE WHEN buyback_yield IS NOT NULL THEN 1 ELSE 0 END) as with_buyback,
      SUM(CASE WHEN shareholder_yield IS NOT NULL THEN 1 ELSE 0 END) as with_sh_yield,
      SUM(CASE WHEN graham_number IS NOT NULL THEN 1 ELSE 0 END) as with_graham,
      SUM(CASE WHEN fcf_margin IS NOT NULL THEN 1 ELSE 0 END) as with_fcf_margin,
      SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_pe,
      SUM(CASE WHEN peg_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_peg,
      SUM(CASE WHEN pegy_ratio IS NOT NULL THEN 1 ELSE 0 END) as with_pegy,
      SUM(CASE WHEN fcf IS NOT NULL THEN 1 ELSE 0 END) as with_fcf
    FROM calculated_metrics
  `).get();

  console.log('\ncalculated_metrics coverage:');
  console.log(`  Total:            ${calcVerification.total}`);
  console.log(`  With PE ratio:    ${calcVerification.with_pe} (${(calcVerification.with_pe / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With PEG ratio:   ${calcVerification.with_peg} (${(calcVerification.with_peg / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With PEGY ratio:  ${calcVerification.with_pegy} (${(calcVerification.with_pegy / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With FCF:         ${calcVerification.with_fcf} (${(calcVerification.with_fcf / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With FCF margin:  ${calcVerification.with_fcf_margin} (${(calcVerification.with_fcf_margin / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With div yield:   ${calcVerification.with_div_yield} (${(calcVerification.with_div_yield / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With buyback:     ${calcVerification.with_buyback} (${(calcVerification.with_buyback / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With sh yield:    ${calcVerification.with_sh_yield} (${(calcVerification.with_sh_yield / calcVerification.total * 100).toFixed(1)}%)`);
  console.log(`  With graham:      ${calcVerification.with_graham} (${(calcVerification.with_graham / calcVerification.total * 100).toFixed(1)}%)`);

  console.log('\nDone!');
}

main().catch(console.error);
