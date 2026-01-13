/**
 * EU/UK Metrics Enrichment Script
 *
 * Fills in missing fundamental metrics using multiple fallback methods:
 * 1. Calculated metrics from existing XBRL data (EBITDA, total debt)
 * 2. Shares Outstanding calculation priority:
 *    a. From EPS: shares = net_income / eps_basic (most accurate)
 *    b. From market cap: shares = market_cap / price
 *    c. From book value: shares = total_equity / book_value_per_share
 *    d. Yahoo Finance fallback
 * 3. Updates xbrl_fundamental_metrics with enriched data
 */

const Database = require('better-sqlite3');
const https = require('https');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Country to Yahoo suffix mapping
const COUNTRY_YAHOO_SUFFIX = {
  'GB': '.L',
  'FR': '.PA',
  'DE': '.DE',
  'NL': '.AS',
  'ES': '.MC',
  'IT': '.MI',
  'SE': '.ST',
  'DK': '.CO',
  'NO': '.OL',
  'FI': '.HE',
  'AT': '.VI',
  'BE': '.BR',
  'PL': '.WA',
  'PT': '.LS',
  'GR': '.AT',
  'LU': ''
};

console.log('\n=== EU/UK Metrics Enrichment ===\n');

// Statistics
const stats = {
  total: 0,
  ebitdaCalculated: 0,
  debtCalculated: 0,
  sharesFromEPS: 0,
  sharesFromMarketCap: 0,
  sharesFromBookValue: 0,
  sharesFromYahoo: 0,
  debtFromYahoo: 0,
  errors: 0
};

/**
 * Fetch Yahoo Finance data for a symbol
 */
function fetchYahooData(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=defaultKeyStatistics,financialData,summaryDetail`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.quoteSummary?.result?.[0];
          if (!result) {
            return resolve(null);
          }

          const stats = result.defaultKeyStatistics || {};
          const financial = result.financialData || {};
          const summary = result.summaryDetail || {};

          resolve({
            sharesOutstanding: stats.sharesOutstanding?.raw || null,
            totalDebt: financial.totalDebt?.raw || null,
            marketCap: summary.marketCap?.raw || null,
            bookValue: stats.bookValue?.raw || null,
            enterpriseValue: stats.enterpriseValue?.raw || null
          });
        } catch (error) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build Yahoo symbol from company data
 */
function buildYahooSymbol(symbol, country) {
  const suffix = COUNTRY_YAHOO_SUFFIX[country] || '';

  // Clean symbol
  let cleanSymbol = symbol.replace(/[\/\s]/g, '');

  // Special handling for UK pence symbols
  if (country === 'GB' && (cleanSymbol.endsWith('GBX') || cleanSymbol.endsWith('GBP'))) {
    cleanSymbol = cleanSymbol.replace(/GBX$|GBP$/, '');
  }

  return cleanSymbol + suffix;
}

/**
 * Main enrichment function
 */
async function enrichMetrics() {
  // Get all EU companies with XBRL fundamentals
  const companies = db.prepare(`
    SELECT
      c.id as company_id,
      c.symbol,
      c.name,
      c.country,
      ci.id as identifier_id,
      xfm.id as metric_id,
      xfm.period_end,
      xfm.revenue,
      xfm.net_income,
      xfm.eps_basic,
      xfm.operating_income,
      xfm.ebitda,
      xfm.depreciation_amortization,
      xfm.total_debt,
      xfm.short_term_debt,
      xfm.long_term_debt,
      xfm.current_liabilities,
      xfm.non_current_liabilities,
      xfm.shares_outstanding,
      xfm.total_assets,
      xfm.total_equity,
      pm.last_price,
      pm.market_cap
    FROM companies c
    JOIN company_identifiers ci ON c.id = ci.company_id
    JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
    LEFT JOIN price_metrics pm ON c.id = pm.company_id
    WHERE c.country NOT IN ('US', 'CA')
      AND xfm.period_type = 'annual'
      AND LENGTH(c.symbol) <= 10
    ORDER BY c.id, xfm.period_end DESC
  `).all();

  console.log(`Found ${companies.length} company-periods to enrich\n`);

  // Prepare update statement
  const updateStmt = db.prepare(`
    UPDATE xbrl_fundamental_metrics
    SET
      ebitda = COALESCE(ebitda, ?),
      total_debt = COALESCE(total_debt, ?),
      shares_outstanding = COALESCE(shares_outstanding, ?),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  // Group by company to minimize Yahoo API calls
  const companiesBySymbol = {};
  for (const row of companies) {
    if (!companiesBySymbol[row.symbol]) {
      companiesBySymbol[row.symbol] = {
        ...row,
        periods: []
      };
    }
    companiesBySymbol[row.symbol].periods.push(row);
  }

  const uniqueCompanies = Object.values(companiesBySymbol);
  console.log(`Processing ${uniqueCompanies.length} unique companies...\n`);

  let processedCompanies = 0;

  for (const company of uniqueCompanies) {
    processedCompanies++;

    if (processedCompanies % 50 === 0) {
      console.log(`Processed ${processedCompanies}/${uniqueCompanies.length} companies...`);
    }

    // Fetch Yahoo data once per company
    let yahooData = null;
    const needsYahoo = company.periods.some(p => !p.shares_outstanding || !p.total_debt);

    if (needsYahoo) {
      try {
        const yahooSymbol = buildYahooSymbol(company.symbol, company.country);
        yahooData = await fetchYahooData(yahooSymbol);
        await sleep(100); // Rate limiting
      } catch (error) {
        stats.errors++;
      }
    }

    // Process each period for this company
    for (const period of company.periods) {
      stats.total++;

      let ebitda = period.ebitda;
      let totalDebt = period.total_debt;
      let sharesOutstanding = period.shares_outstanding;

      // 1. CALCULATE EBITDA if missing
      if (!ebitda && period.operating_income && period.depreciation_amortization) {
        ebitda = period.operating_income + period.depreciation_amortization;
        stats.ebitdaCalculated++;
      }

      // 2. CALCULATE TOTAL DEBT if missing
      if (!totalDebt) {
        // Try summing short-term + long-term debt
        if (period.short_term_debt && period.long_term_debt) {
          totalDebt = period.short_term_debt + period.long_term_debt;
          stats.debtCalculated++;
        }
        // Or try current + non-current liabilities (less accurate but better than nothing)
        else if (!totalDebt && yahooData?.totalDebt) {
          totalDebt = yahooData.totalDebt;
          stats.debtFromYahoo++;
        }
      }

      // 3. CALCULATE SHARES OUTSTANDING if missing
      if (!sharesOutstanding) {
        // Method 1: Calculate from EPS (most accurate)
        if (period.net_income && period.eps_basic && period.eps_basic !== 0) {
          const calculatedShares = period.net_income / period.eps_basic;
          // Validate (must be positive and within reasonable range)
          if (calculatedShares > 1000 && calculatedShares < 100_000_000_000) {
            sharesOutstanding = calculatedShares;
            stats.sharesFromEPS++;
          }
        }
        // Method 2: Calculate from market cap and price
        if (!sharesOutstanding && period.market_cap && period.last_price && period.last_price > 0) {
          sharesOutstanding = period.market_cap / period.last_price;
          stats.sharesFromMarketCap++;
        }
        // Method 3: Calculate from total equity and book value per share
        if (!sharesOutstanding && yahooData?.bookValue && period.total_equity && yahooData.bookValue > 0) {
          sharesOutstanding = period.total_equity / yahooData.bookValue;
          stats.sharesFromBookValue++;
        }
        // Method 4: Yahoo fallback
        if (!sharesOutstanding && yahooData?.sharesOutstanding) {
          sharesOutstanding = yahooData.sharesOutstanding;
          stats.sharesFromYahoo++;
        }
      }

      // Update if any field was enriched
      if (ebitda !== period.ebitda ||
          totalDebt !== period.total_debt ||
          sharesOutstanding !== period.shares_outstanding) {

        try {
          updateStmt.run(ebitda, totalDebt, sharesOutstanding, period.metric_id);
        } catch (error) {
          console.error(`Error updating ${company.symbol}:`, error.message);
          stats.errors++;
        }
      }
    }
  }

  return stats;
}

// Run enrichment
enrichMetrics()
  .then((stats) => {
    console.log('\n=== Enrichment Results ===');
    console.log(`Total company-periods processed: ${stats.total}`);
    console.log('');
    console.log('EBITDA:');
    console.log(`  Calculated from operating income + D&A: ${stats.ebitdaCalculated}`);
    console.log('');
    console.log('Total Debt:');
    console.log(`  Calculated from short-term + long-term: ${stats.debtCalculated}`);
    console.log(`  Fetched from Yahoo Finance: ${stats.debtFromYahoo}`);
    console.log('');
    console.log('Shares Outstanding:');
    console.log(`  Calculated from EPS (net_income / eps_basic): ${stats.sharesFromEPS}`);
    console.log(`  Calculated from market cap / price: ${stats.sharesFromMarketCap}`);
    console.log(`  Calculated from book value: ${stats.sharesFromBookValue}`);
    console.log(`  Fetched from Yahoo Finance: ${stats.sharesFromYahoo}`);
    console.log('');
    console.log(`Errors: ${stats.errors}`);
    console.log('\n✅ Done!\n');
    db.close();
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    db.close();
    process.exit(1);
  });
