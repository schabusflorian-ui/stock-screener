#!/usr/bin/env node

/**
 * Calculate Market-Dependent Metrics
 *
 * Uses shares outstanding from price_metrics to calculate:
 * - Market Cap = Shares Outstanding × Last Price
 * - EPS = Net Income / Shares Outstanding
 * - Enterprise Value = Market Cap + Total Debt - Cash
 * - Beta = Covariance(stock returns, market returns) / Variance(market returns)
 *
 * Updates price_metrics and calculated_metrics tables.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(DB_PATH);

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

console.log('='.repeat(80));
console.log('MARKET METRICS CALCULATOR');
console.log('='.repeat(80));
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
console.log();

// ============================================================================
// 1. CALCULATE MARKET CAP FROM SHARES OUTSTANDING
// ============================================================================

console.log('1. CALCULATING MARKET CAP');
console.log('-'.repeat(40));

// Get companies with shares outstanding but no/stale market cap
const companiesForMarketCap = db.prepare(`
  SELECT
    pm.company_id,
    c.symbol,
    pm.shares_outstanding,
    pm.last_price,
    pm.market_cap as existing_market_cap,
    (pm.shares_outstanding * pm.last_price) as calculated_market_cap
  FROM price_metrics pm
  JOIN companies c ON c.id = pm.company_id
  WHERE pm.shares_outstanding IS NOT NULL
    AND pm.shares_outstanding > 0
    AND pm.last_price IS NOT NULL
    AND pm.last_price > 0
    AND (
      pm.market_cap IS NULL
      OR ABS(pm.market_cap - (pm.shares_outstanding * pm.last_price)) / pm.market_cap > 0.1
    )
  ORDER BY c.symbol
`).all();

console.log(`Companies needing market cap calculation: ${companiesForMarketCap.length}`);

if (!DRY_RUN && companiesForMarketCap.length > 0) {
  const updateMarketCap = db.prepare(`
    UPDATE price_metrics
    SET market_cap = shares_outstanding * last_price,
        updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `);

  let updated = 0;
  for (const company of companiesForMarketCap) {
    updateMarketCap.run(company.company_id);
    updated++;
    if (VERBOSE) {
      console.log(`  ${company.symbol}: ${(company.calculated_market_cap / 1e9).toFixed(2)}B`);
    }
  }
  console.log(`Updated market cap for ${updated} companies`);
} else if (DRY_RUN && companiesForMarketCap.length > 0) {
  console.log('(Dry run - sample of first 10):');
  for (const company of companiesForMarketCap.slice(0, 10)) {
    console.log(`  ${company.symbol}: ${(company.calculated_market_cap / 1e9).toFixed(2)}B`);
  }
}
console.log();

// ============================================================================
// 2. CALCULATE ENTERPRISE VALUE
// ============================================================================

console.log('2. CALCULATING ENTERPRISE VALUE');
console.log('-'.repeat(40));

// EV = Market Cap + Total Debt - Cash
const companiesForEV = db.prepare(`
  SELECT
    pm.company_id,
    c.symbol,
    pm.market_cap,
    COALESCE(f.total_liabilities, 0) as total_debt,
    COALESCE(
      json_extract(f.data, '$.cashAndCashEquivalents'),
      json_extract(f.data, '$.CashAndCashEquivalentsAtCarryingValue'),
      json_extract(f.data, '$.Cash'),
      0
    ) as cash
  FROM price_metrics pm
  JOIN companies c ON c.id = pm.company_id
  LEFT JOIN (
    SELECT company_id, total_liabilities, data,
           ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY fiscal_date_ending DESC) as rn
    FROM financial_data
    WHERE statement_type = 'balance_sheet'
  ) f ON f.company_id = pm.company_id AND f.rn = 1
  WHERE pm.market_cap IS NOT NULL
    AND pm.market_cap > 0
    AND pm.enterprise_value IS NULL
  ORDER BY c.symbol
`).all();

console.log(`Companies needing EV calculation: ${companiesForEV.length}`);

if (!DRY_RUN && companiesForEV.length > 0) {
  const updateEV = db.prepare(`
    UPDATE price_metrics
    SET enterprise_value = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
  `);

  let updated = 0;
  for (const company of companiesForEV) {
    const ev = company.market_cap + company.total_debt - company.cash;
    if (ev > 0) {
      updateEV.run(ev, company.company_id);
      updated++;
      if (VERBOSE) {
        console.log(`  ${company.symbol}: EV = ${(ev / 1e9).toFixed(2)}B`);
      }
    }
  }
  console.log(`Updated EV for ${updated} companies`);
}
console.log();

// ============================================================================
// 3. CALCULATE BETA (requires SPY data)
// ============================================================================

console.log('3. CALCULATING BETA');
console.log('-'.repeat(40));

// Check if we have SPY data
const spyCompany = db.prepare(`
  SELECT id FROM companies WHERE symbol = 'SPY'
`).get();

if (!spyCompany) {
  console.log('SPY not found in database. Adding SPY for beta calculation...');

  if (!DRY_RUN) {
    db.prepare(`
      INSERT OR IGNORE INTO companies (symbol, name, created_at)
      VALUES ('SPY', 'SPDR S&P 500 ETF Trust', CURRENT_TIMESTAMP)
    `).run();
    console.log('Added SPY. Run price_updater to fetch SPY price data, then re-run this script.');
  }
} else {
  // Check if SPY has enough price data
  const spyPriceCount = db.prepare(`
    SELECT COUNT(*) as count FROM daily_prices WHERE company_id = ?
  `).get(spyCompany.id);

  if (spyPriceCount.count < 252) {
    console.log(`SPY has ${spyPriceCount.count} price records. Need at least 252 for beta calculation.`);
    console.log('Run price_fetcher.py to get historical SPY data.');
  } else {
    console.log(`SPY has ${spyPriceCount.count} price records. Calculating betas...`);

    // Get SPY returns for last 252 days
    const spyPrices = db.prepare(`
      SELECT date, adjusted_close
      FROM daily_prices
      WHERE company_id = ?
      ORDER BY date DESC
      LIMIT 253
    `).all(spyCompany.id);

    if (spyPrices.length >= 253) {
      // Calculate SPY daily returns
      const spyReturns = {};
      for (let i = 0; i < spyPrices.length - 1; i++) {
        const today = spyPrices[i];
        const yesterday = spyPrices[i + 1];
        if (today.adjusted_close && yesterday.adjusted_close && yesterday.adjusted_close > 0) {
          spyReturns[today.date] = (today.adjusted_close - yesterday.adjusted_close) / yesterday.adjusted_close;
        }
      }

      // Calculate variance of SPY returns
      const spyReturnValues = Object.values(spyReturns);
      const spyMean = spyReturnValues.reduce((a, b) => a + b, 0) / spyReturnValues.length;
      const spyVariance = spyReturnValues.reduce((sum, r) => sum + Math.pow(r - spyMean, 2), 0) / spyReturnValues.length;

      // Get companies that need beta calculation
      const companiesForBeta = db.prepare(`
        SELECT pm.company_id, c.symbol
        FROM price_metrics pm
        JOIN companies c ON c.id = pm.company_id
        WHERE pm.beta IS NULL
          AND c.symbol NOT LIKE 'CIK_%'
          AND c.symbol != 'SPY'
        ORDER BY c.update_tier ASC
        LIMIT 1000
      `).all();

      console.log(`Companies needing beta calculation: ${companiesForBeta.length}`);

      if (!DRY_RUN && companiesForBeta.length > 0) {
        const updateBeta = db.prepare(`
          UPDATE price_metrics
          SET beta = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE company_id = ?
        `);

        let calculated = 0;
        let skipped = 0;

        for (const company of companiesForBeta) {
          // Get stock prices
          const stockPrices = db.prepare(`
            SELECT date, adjusted_close
            FROM daily_prices
            WHERE company_id = ?
            ORDER BY date DESC
            LIMIT 253
          `).all(company.company_id);

          if (stockPrices.length < 100) {
            skipped++;
            continue;
          }

          // Calculate stock returns
          const stockReturns = [];
          for (let i = 0; i < stockPrices.length - 1; i++) {
            const today = stockPrices[i];
            const yesterday = stockPrices[i + 1];
            if (today.adjusted_close && yesterday.adjusted_close && yesterday.adjusted_close > 0) {
              const stockReturn = (today.adjusted_close - yesterday.adjusted_close) / yesterday.adjusted_close;
              const spyReturn = spyReturns[today.date];
              if (spyReturn !== undefined) {
                stockReturns.push({ stock: stockReturn, spy: spyReturn });
              }
            }
          }

          if (stockReturns.length < 50) {
            skipped++;
            continue;
          }

          // Calculate covariance and beta
          const stockMean = stockReturns.reduce((a, b) => a + b.stock, 0) / stockReturns.length;
          const spyMeanCalc = stockReturns.reduce((a, b) => a + b.spy, 0) / stockReturns.length;

          const covariance = stockReturns.reduce((sum, r) =>
            sum + (r.stock - stockMean) * (r.spy - spyMeanCalc), 0) / stockReturns.length;

          const beta = covariance / spyVariance;

          // Sanity check: beta should be between -3 and 5 for most stocks
          if (beta >= -3 && beta <= 5) {
            updateBeta.run(Math.round(beta * 100) / 100, company.company_id);
            calculated++;
            if (VERBOSE) {
              console.log(`  ${company.symbol}: Beta = ${beta.toFixed(2)}`);
            }
          } else {
            skipped++;
          }
        }

        console.log(`Calculated beta for ${calculated} companies`);
        console.log(`Skipped ${skipped} companies (insufficient data or outliers)`);
      }
    }
  }
}
console.log();

// ============================================================================
// 4. UPDATE VALUATION METRICS IN calculated_metrics
// ============================================================================

console.log('4. UPDATING VALUATION METRICS');
console.log('-'.repeat(40));

// Get companies with market cap that need valuation metrics updated
const companiesForValuation = db.prepare(`
  SELECT
    pm.company_id,
    c.symbol,
    pm.market_cap,
    pm.shares_outstanding,
    pm.last_price,
    pm.enterprise_value,
    cm.fiscal_period,
    cm.period_type,
    -- Get latest income statement data for EPS calculation
    (SELECT json_extract(data, '$.netIncome')
     FROM financial_data
     WHERE company_id = pm.company_id
       AND statement_type = 'income_statement'
       AND fiscal_date_ending = cm.fiscal_period
     LIMIT 1) as net_income,
    -- Get latest revenue
    (SELECT json_extract(data, '$.totalRevenue')
     FROM financial_data
     WHERE company_id = pm.company_id
       AND statement_type = 'income_statement'
       AND fiscal_date_ending = cm.fiscal_period
     LIMIT 1) as revenue,
    -- Get shareholder equity for P/B
    (SELECT shareholder_equity
     FROM financial_data
     WHERE company_id = pm.company_id
       AND statement_type = 'balance_sheet'
       AND fiscal_date_ending = cm.fiscal_period
     LIMIT 1) as equity
  FROM price_metrics pm
  JOIN companies c ON c.id = pm.company_id
  JOIN calculated_metrics cm ON cm.company_id = pm.company_id
  WHERE pm.market_cap IS NOT NULL
    AND pm.market_cap > 0
    AND pm.shares_outstanding IS NOT NULL
    AND pm.shares_outstanding > 0
  ORDER BY cm.fiscal_period DESC
`).all();

// Group by company, take latest period
const latestByCompany = {};
for (const row of companiesForValuation) {
  if (!latestByCompany[row.company_id]) {
    latestByCompany[row.company_id] = row;
  }
}

const uniqueCompanies = Object.values(latestByCompany);
console.log(`Companies with market cap for valuation: ${uniqueCompanies.length}`);

if (!DRY_RUN && uniqueCompanies.length > 0) {
  const updateValuation = db.prepare(`
    UPDATE calculated_metrics
    SET
      pe_ratio = ?,
      pb_ratio = ?,
      ps_ratio = ?,
      ev_ebitda = COALESCE(ev_ebitda, ?),
      fcf_yield = CASE
        WHEN fcf IS NOT NULL AND ? > 0
        THEN ROUND((fcf / ?) * 100, 2)
        ELSE fcf_yield
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE company_id = ?
      AND fiscal_period = ?
  `);

  let updated = 0;
  for (const company of uniqueCompanies) {
    // Annualize quarterly data
    const multiplier = company.period_type === 'quarterly' ? 4 : 1;

    // P/E Ratio
    let peRatio = null;
    if (company.net_income && company.net_income > 0) {
      const annualizedNetIncome = company.net_income * multiplier;
      peRatio = Math.round((company.market_cap / annualizedNetIncome) * 100) / 100;
    }

    // P/B Ratio
    let pbRatio = null;
    if (company.equity && company.equity > 0) {
      pbRatio = Math.round((company.market_cap / company.equity) * 100) / 100;
    }

    // P/S Ratio
    let psRatio = null;
    if (company.revenue && company.revenue > 0) {
      const annualizedRevenue = company.revenue * multiplier;
      psRatio = Math.round((company.market_cap / annualizedRevenue) * 100) / 100;
    }

    // Placeholder for EV/EBITDA (keep existing if calculated elsewhere)
    const evEbitda = null;

    updateValuation.run(
      peRatio,
      pbRatio,
      psRatio,
      evEbitda,
      company.market_cap,
      company.market_cap,
      company.company_id,
      company.fiscal_period
    );
    updated++;

    if (VERBOSE) {
      console.log(`  ${company.symbol}: P/E=${peRatio}, P/B=${pbRatio}, P/S=${psRatio}`);
    }
  }
  console.log(`Updated valuation metrics for ${updated} company-periods`);
}
console.log();

// ============================================================================
// 5. SUMMARY STATISTICS
// ============================================================================

console.log('5. SUMMARY');
console.log('-'.repeat(40));

const stats = db.prepare(`
  SELECT
    COUNT(*) as total_companies,
    SUM(CASE WHEN shares_outstanding IS NOT NULL THEN 1 ELSE 0 END) as has_shares,
    SUM(CASE WHEN market_cap IS NOT NULL THEN 1 ELSE 0 END) as has_mcap,
    SUM(CASE WHEN enterprise_value IS NOT NULL THEN 1 ELSE 0 END) as has_ev,
    SUM(CASE WHEN beta IS NOT NULL THEN 1 ELSE 0 END) as has_beta
  FROM price_metrics
`).get();

console.log(`Total companies in price_metrics: ${stats.total_companies}`);
console.log(`  Has shares outstanding: ${stats.has_shares} (${(stats.has_shares/stats.total_companies*100).toFixed(1)}%)`);
console.log(`  Has market cap: ${stats.has_mcap} (${(stats.has_mcap/stats.total_companies*100).toFixed(1)}%)`);
console.log(`  Has enterprise value: ${stats.has_ev} (${(stats.has_ev/stats.total_companies*100).toFixed(1)}%)`);
console.log(`  Has beta: ${stats.has_beta} (${(stats.has_beta/stats.total_companies*100).toFixed(1)}%)`);

const valuationStats = db.prepare(`
  SELECT
    COUNT(*) as total,
    SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) as has_pe,
    SUM(CASE WHEN pb_ratio IS NOT NULL THEN 1 ELSE 0 END) as has_pb,
    SUM(CASE WHEN fcf_yield IS NOT NULL THEN 1 ELSE 0 END) as has_fcf_yield
  FROM calculated_metrics
  WHERE period_type = 'annual'
`).get();

console.log();
console.log(`Calculated metrics (annual periods): ${valuationStats.total}`);
console.log(`  Has P/E ratio: ${valuationStats.has_pe} (${(valuationStats.has_pe/valuationStats.total*100).toFixed(1)}%)`);
console.log(`  Has P/B ratio: ${valuationStats.has_pb} (${(valuationStats.has_pb/valuationStats.total*100).toFixed(1)}%)`);
console.log(`  Has FCF yield: ${valuationStats.has_fcf_yield} (${(valuationStats.has_fcf_yield/valuationStats.total*100).toFixed(1)}%)`);

db.close();
console.log();
console.log('='.repeat(80));
console.log('Calculation complete.');

if (DRY_RUN) {
  console.log('\nTo apply changes, run without --dry-run flag:');
  console.log('  node scripts/calculate-market-metrics.js');
}
