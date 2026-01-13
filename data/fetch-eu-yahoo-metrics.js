/**
 * Fetch Yahoo Finance Metrics for EU/UK Companies
 *
 * Fetches prices from Yahoo v8 chart endpoint (less rate-limited)
 * and combines with XBRL shares_outstanding to calculate market cap.
 * Then calculates valuation ratios using XBRL fundamental data.
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');

const db = new Database(path.join(__dirname, 'stocks.db'));

// Rate limiting - v8 chart endpoint is more lenient
const BATCH_SIZE = 100;
const DELAY_BETWEEN_REQUESTS = 300; // ms
const DELAY_BETWEEN_BATCHES = 2000; // ms

// Stats
let stats = {
  processed: 0,
  updated: 0,
  noData: 0,
  errors: 0
};

/**
 * Fetch price from Yahoo v8 chart endpoint (less rate-limited)
 */
function fetchYahooPrice(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json?.chart?.result?.[0];
          if (!result) {
            resolve({ success: false, error: 'No data' });
            return;
          }

          const meta = result.meta || {};
          resolve({
            success: true,
            data: {
              price: meta.regularMarketPrice || meta.previousClose,
              currency: meta.currency,
              exchangeName: meta.exchangeName
            }
          });
        } catch (e) {
          resolve({ success: false, error: e.message });
        }
      });
    }).on('error', (e) => {
      resolve({ success: false, error: e.message });
    }).on('timeout', () => {
      resolve({ success: false, error: 'Timeout' });
    });
  });
}

/**
 * Get EU/UK companies with XBRL data for valuation calculation
 */
function getCompaniesWithFundamentals() {
  return db.prepare(`
    SELECT DISTINCT
      c.id as company_id,
      c.symbol,
      c.name,
      c.country,
      ci.yahoo_symbol,
      m.shares_outstanding,
      m.net_income,
      m.total_equity,
      m.revenue,
      m.ebitda,
      m.total_debt,
      m.cash_and_equivalents,
      m.eps_basic,
      m.eps_diluted,
      m.period_end
    FROM companies c
    JOIN company_identifiers ci ON ci.company_id = c.id
    LEFT JOIN xbrl_fundamental_metrics m ON m.identifier_id = ci.id
    WHERE c.country NOT IN ('US', 'CA')
      AND LENGTH(c.symbol) < 20
    GROUP BY c.id
    HAVING m.period_end = MAX(m.period_end) OR m.period_end IS NULL
    ORDER BY c.country, c.symbol
  `).all();
}

/**
 * Build Yahoo symbol from company data
 */
function buildYahooSymbol(company) {
  // If we have a yahoo_symbol from company_identifiers, use it
  if (company.yahoo_symbol && company.yahoo_symbol.includes('.')) {
    return company.yahoo_symbol;
  }

  // If symbol already has a suffix, use as-is
  if (company.symbol.includes('.')) {
    return company.symbol;
  }

  // Add exchange suffix based on country
  const suffixMap = {
    'GB': '.L',     // London
    'DE': '.DE',    // Germany (XETRA)
    'FR': '.PA',    // Paris
    'NL': '.AS',    // Amsterdam
    'ES': '.MC',    // Madrid
    'IT': '.MI',    // Milan
    'CH': '.SW',    // Swiss
    'SE': '.ST',    // Stockholm
    'DK': '.CO',    // Copenhagen
    'NO': '.OL',    // Oslo
    'FI': '.HE',    // Helsinki
    'BE': '.BR',    // Brussels
    'AT': '.VI',    // Vienna
    'PT': '.LS',    // Lisbon
    'IE': '.IR',    // Ireland
    'GR': '.AT',    // Athens
    'PL': '.WA',    // Warsaw
    'LU': '.LU',    // Luxembourg
  };

  const suffix = suffixMap[company.country];
  return suffix ? company.symbol + suffix : company.symbol;
}

/**
 * Calculate valuation metrics from price + XBRL fundamentals
 */
function calculateValuationMetrics(price, company, currency) {
  const result = {
    last_price: price,
    market_cap: null,
    pe_ratio: null,
    pb_ratio: null,
    ps_ratio: null,
    ev_ebitda: null,
    earnings_yield: null
  };

  if (!price || price <= 0) return result;

  // Adjust price for pence (GBp) to pounds
  let adjustedPrice = price;
  if (currency === 'GBp' || currency === 'GBX') {
    adjustedPrice = price / 100; // Convert pence to pounds
  }

  // Calculate market cap if we have shares outstanding
  if (company.shares_outstanding && company.shares_outstanding > 0) {
    result.market_cap = adjustedPrice * company.shares_outstanding;
  }

  // P/E ratio from EPS
  const eps = company.eps_diluted || company.eps_basic;
  if (eps && eps > 0) {
    result.pe_ratio = adjustedPrice / eps;
    result.earnings_yield = (eps / adjustedPrice) * 100;
  } else if (result.market_cap && company.net_income && company.net_income > 0) {
    // Fallback: P/E from market cap / net income
    result.pe_ratio = result.market_cap / company.net_income;
    result.earnings_yield = (company.net_income / result.market_cap) * 100;
  }

  // P/B ratio
  if (result.market_cap && company.total_equity && company.total_equity > 0) {
    result.pb_ratio = result.market_cap / company.total_equity;
  } else if (company.shares_outstanding && company.total_equity) {
    const bvps = company.total_equity / company.shares_outstanding;
    if (bvps > 0) {
      result.pb_ratio = adjustedPrice / bvps;
    }
  }

  // P/S ratio
  if (result.market_cap && company.revenue && company.revenue > 0) {
    result.ps_ratio = result.market_cap / company.revenue;
  }

  // EV/EBITDA
  if (company.ebitda && company.ebitda > 0 && result.market_cap) {
    const debt = company.total_debt || 0;
    const cash = company.cash_and_equivalents || 0;
    const ev = result.market_cap + debt - cash;
    if (ev > 0) {
      result.ev_ebitda = ev / company.ebitda;
    }
  }

  return result;
}

/**
 * Update price_metrics table
 */
function updatePriceMetrics(companyId, data) {
  // Check if row exists
  const existing = db.prepare('SELECT id FROM price_metrics WHERE company_id = ?').get(companyId);

  if (existing) {
    // Update existing row
    db.prepare(`
      UPDATE price_metrics SET
        last_price = COALESCE(?, last_price),
        last_price_date = date('now'),
        market_cap = ?,
        enterprise_value = ?,
        shares_outstanding = ?,
        beta = ?,
        shares_short = ?,
        short_ratio = ?,
        short_percent_of_float = ?,
        updated_at = datetime('now')
      WHERE company_id = ?
    `).run(
      data.last_price,
      data.market_cap,
      data.enterprise_value,
      data.shares_outstanding,
      data.beta,
      data.shares_short,
      data.short_ratio,
      data.short_percent_of_float,
      companyId
    );
  } else {
    // Insert new row
    db.prepare(`
      INSERT INTO price_metrics (
        company_id, last_price, last_price_date, market_cap, enterprise_value,
        shares_outstanding, beta, shares_short, short_ratio, short_percent_of_float,
        updated_at
      ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      data.last_price,
      data.market_cap,
      data.enterprise_value,
      data.shares_outstanding,
      data.beta,
      data.shares_short,
      data.short_ratio,
      data.short_percent_of_float
    );
  }
}

/**
 * Update calculated_metrics with valuation ratios
 */
function updateCalculatedMetrics(companyId, data) {
  // Get latest fiscal period for this company
  const latestPeriod = db.prepare(`
    SELECT fiscal_period FROM calculated_metrics
    WHERE company_id = ?
    ORDER BY fiscal_period DESC LIMIT 1
  `).get(companyId);

  if (latestPeriod) {
    db.prepare(`
      UPDATE calculated_metrics SET
        pe_ratio = COALESCE(?, pe_ratio),
        pb_ratio = COALESCE(?, pb_ratio),
        ps_ratio = COALESCE(?, ps_ratio),
        peg_ratio = COALESCE(?, peg_ratio),
        ev_ebitda = COALESCE(?, ev_ebitda),
        dividend_yield = COALESCE(?, dividend_yield),
        updated_at = datetime('now')
      WHERE company_id = ? AND fiscal_period = ?
    `).run(
      data.pe_ratio,
      data.pb_ratio,
      data.ps_ratio,
      data.peg_ratio,
      data.ev_ebitda,
      data.dividend_yield,
      companyId,
      latestPeriod.fiscal_period
    );
  }
}

/**
 * Process a single company
 */
async function processCompany(company) {
  const yahooSymbol = buildYahooSymbol(company);

  try {
    // Fetch price from Yahoo v8 chart endpoint
    const priceResult = await fetchYahooPrice(yahooSymbol);

    if (!priceResult.success || !priceResult.data.price) {
      stats.noData++;
      return false;
    }

    const { price, currency } = priceResult.data;

    // Calculate valuation metrics using price + XBRL fundamentals
    const metrics = calculateValuationMetrics(price, company, currency);

    // Update price_metrics with price and calculated market cap
    updatePriceMetrics(company.company_id, {
      last_price: price,
      market_cap: metrics.market_cap,
      shares_outstanding: company.shares_outstanding
    });

    // Update calculated_metrics with valuation ratios
    if (metrics.pe_ratio || metrics.pb_ratio || metrics.ps_ratio) {
      updateCalculatedMetrics(company.company_id, {
        pe_ratio: metrics.pe_ratio,
        pb_ratio: metrics.pb_ratio,
        ps_ratio: metrics.ps_ratio,
        ev_ebitda: metrics.ev_ebitda,
        earnings_yield: metrics.earnings_yield
      });
    }

    stats.updated++;
    return true;
  } catch (error) {
    stats.errors++;
    return false;
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function
 */
async function main() {
  console.log('\n=== Yahoo Finance Metrics Fetcher for EU/UK ===\n');

  // Get companies with XBRL fundamentals
  const companies = getCompaniesWithFundamentals();
  console.log(`Found ${companies.length} EU/UK companies\n`);

  if (companies.length === 0) {
    console.log('No companies to process');
    return;
  }

  // Estimate time
  const estimatedMinutes = (companies.length * (DELAY_BETWEEN_REQUESTS + 200) / 60000).toFixed(1);
  console.log(`Estimated time: ~${estimatedMinutes} minutes\n`);

  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(companies.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} companies)`);

    for (const company of batch) {
      stats.processed++;

      const success = await processCompany(company);

      if (success && stats.updated % 10 === 0) {
        process.stdout.write(`  Updated: ${stats.updated}\r`);
      }

      // Rate limit
      await sleep(DELAY_BETWEEN_REQUESTS);
    }

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = stats.processed / elapsed;
    const remaining = companies.length - stats.processed;
    const eta = remaining / rate;

    console.log(`  Processed: ${stats.processed}/${companies.length} | Updated: ${stats.updated} | No Data: ${stats.noData} | Errors: ${stats.errors} | ETA: ${Math.round(eta)}s`);

    // Pause between batches
    if (i + BATCH_SIZE < companies.length) {
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n=== Final Results ===');
  console.log(`Processed: ${stats.processed}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`No Data: ${stats.noData}`);
  console.log(`Errors: ${stats.errors}`);

  // Show coverage improvement
  const coverage = db.prepare(`
    SELECT
      COUNT(DISTINCT pm.company_id) as with_mkt_cap
    FROM price_metrics pm
    JOIN companies c ON pm.company_id = c.id
    WHERE c.country NOT IN ('US', 'CA')
      AND pm.market_cap IS NOT NULL
      AND pm.market_cap > 0
  `).get();

  console.log(`\nMarket cap coverage: ${coverage.with_mkt_cap} companies`);
}

main().catch(console.error);
