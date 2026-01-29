/**
 * Re-Parse Interim/Semi-Annual Filings
 *
 * Identifies existing XBRL filings with 170-195 day periods that were
 * misclassified as "other" and re-parses them with the enhanced parser
 * to properly detect them as semi-annual periods.
 *
 * This captures interim reports that were previously missed.
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const { XBRLParser } = require('../src/services/xbrl/xbrlParser');

const db = new Database(path.join(__dirname, 'stocks.db'));
const parser = new XBRLParser();

console.log('\n=== Re-Parse Interim/Semi-Annual Filings ===\n');

// Statistics
const stats = {
  total: 0,
  fetched: 0,
  parsed: 0,
  reclassified: 0,
  newSemiAnnual: 0,
  newQuarterly: 0,
  errors: 0
};

/**
 * Find filings with 170-195 day periods (likely semi-annual)
 */
function findMisclassifiedFilings() {
  return db.prepare(`
    SELECT
      xf.id as filing_id,
      xf.filing_hash,
      xf.json_url,
      xf.identifier_id,
      xf.period_start,
      xf.period_end,
      julianday(xf.period_end) - julianday(xf.period_start) as days,
      c.id as company_id,
      c.symbol,
      c.name,
      c.country
    FROM xbrl_filings xf
    JOIN company_identifiers ci ON xf.identifier_id = ci.id
    JOIN companies c ON ci.company_id = c.id
    WHERE c.country NOT IN ('US', 'CA')
      AND xf.parsed = 1
      AND xf.json_url IS NOT NULL
      AND julianday(xf.period_end) - julianday(xf.period_start) BETWEEN 170 AND 195
      AND NOT EXISTS (
        SELECT 1 FROM xbrl_fundamental_metrics xfm
        WHERE xfm.identifier_id = xf.identifier_id
          AND xfm.period_end = xf.period_end
          AND xfm.period_type = 'semi-annual'
      )
    ORDER BY c.id, xf.period_end DESC
  `).all();
}

/**
 * Also find filings with 85-95 day periods (likely quarterly)
 */
function findMisclassifiedQuarterly() {
  return db.prepare(`
    SELECT
      xf.id as filing_id,
      xf.filing_hash,
      xf.json_url,
      xf.identifier_id,
      xf.period_start,
      xf.period_end,
      julianday(xf.period_end) - julianday(xf.period_start) as days,
      c.id as company_id,
      c.symbol,
      c.name,
      c.country
    FROM xbrl_filings xf
    JOIN company_identifiers ci ON xf.identifier_id = ci.id
    JOIN companies c ON ci.company_id = c.id
    WHERE c.country NOT IN ('US', 'CA')
      AND xf.parsed = 1
      AND xf.json_url IS NOT NULL
      AND julianday(xf.period_end) - julianday(xf.period_start) BETWEEN 85 AND 95
      AND NOT EXISTS (
        SELECT 1 FROM xbrl_fundamental_metrics xfm
        WHERE xfm.identifier_id = xf.identifier_id
          AND xfm.period_end = xf.period_end
          AND xfm.period_type = 'quarterly'
      )
    ORDER BY c.id, xf.period_end DESC
  `).all();
}

/**
 * Fetch XBRL-JSON from URL
 */
function fetchXBRLJson(jsonPath) {
  const fullUrl = `https://filings.xbrl.org${jsonPath}`;

  return new Promise((resolve) => {
    https.get(fullUrl, { timeout: 30000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            resolve(null);
          }
        } catch (error) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    }).on('timeout', () => {
      resolve(null);
    });
  });
}

/**
 * Sleep helper for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Insert or update metrics in database
 * Simplified to only update key fields that exist in the schema
 */
const upsertMetricsStmt = db.prepare(`
  INSERT INTO xbrl_fundamental_metrics (
    identifier_id, period_end, period_type, currency,
    revenue, gross_profit, operating_income, net_income,
    ebitda, depreciation_amortization, depreciation, amortization, impairment_loss,
    total_assets, current_assets, non_current_assets, cash_and_equivalents,
    total_liabilities, current_liabilities, non_current_liabilities,
    total_equity, retained_earnings,
    total_debt, short_term_debt, long_term_debt, lease_liabilities,
    total_financial_liabilities, other_debt,
    trade_payables, trade_receivables, inventories,
    operating_cash_flow, investing_cash_flow, financing_cash_flow, free_cash_flow, capital_expenditure,
    shares_outstanding, diluted_shares_outstanding, shares_issued, treasury_shares,
    eps_basic, eps_diluted, dividends_per_share,
    gross_margin, operating_margin, net_margin, roe, roa, roic,
    current_ratio, quick_ratio, debt_to_equity, debt_to_assets,
    interest_coverage, asset_turnover, inventory_turnover,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  ON CONFLICT(identifier_id, period_end, period_type) DO UPDATE SET
    revenue = COALESCE(excluded.revenue, revenue),
    gross_profit = COALESCE(excluded.gross_profit, gross_profit),
    operating_income = COALESCE(excluded.operating_income, operating_income),
    net_income = COALESCE(excluded.net_income, net_income),
    ebitda = COALESCE(excluded.ebitda, ebitda),
    total_assets = COALESCE(excluded.total_assets, total_assets),
    total_debt = COALESCE(excluded.total_debt, total_debt),
    shares_outstanding = COALESCE(excluded.shares_outstanding, shares_outstanding),
    updated_at = CURRENT_TIMESTAMP
`);

/**
 * Process a single filing
 */
async function processFiling(filing) {
  stats.total++;

  try {
    // Fetch XBRL-JSON
    const rawJson = await fetchXBRLJson(filing.json_url);
    if (!rawJson) {
      stats.errors++;
      return;
    }

    stats.fetched++;

    // Parse with enhanced parser
    const parsed = parser.parseXBRLJson(rawJson);

    if (!parsed || Object.keys(parsed.periods).length === 0) {
      return;
    }

    stats.parsed++;

    // Process each period
    for (const [periodEnd, periodData] of Object.entries(parsed.periods)) {
      const m = periodData.metrics;

      // Check if period type changed
      if (periodData.periodType === 'semi-annual') {
        stats.newSemiAnnual++;
        console.log(`  ✓ ${filing.symbol} (${periodEnd}): Reclassified as semi-annual (${Math.round(filing.days)} days)`);
      } else if (periodData.periodType === 'quarterly') {
        stats.newQuarterly++;
        console.log(`  ✓ ${filing.symbol} (${periodEnd}): Reclassified as quarterly (${Math.round(filing.days)} days)`);
      }

      stats.reclassified++;

      // Insert/update metrics
      upsertMetricsStmt.run(
        filing.identifier_id, periodEnd, periodData.periodType, m.currency,
        m.revenue, m.gross_profit, m.operating_income, m.net_income,
        m.ebitda, m.depreciation_amortization, m.depreciation, m.amortization, m.impairment_loss,
        m.total_assets, m.current_assets, m.non_current_assets, m.cash,
        m.total_liabilities, m.current_liabilities, m.non_current_liabilities,
        m.total_equity, m.retained_earnings,
        m.total_debt, m.short_term_debt, m.long_term_debt, m.lease_liabilities,
        m.total_financial_liabilities, m.other_debt,
        m.accounts_payable, m.accounts_receivable, m.inventories,
        m.operating_cash_flow, m.investing_cash_flow, m.financing_cash_flow, m.free_cash_flow, m.capex,
        m.shares_outstanding, m.diluted_shares_outstanding, m.shares_issued, m.treasury_shares,
        m.eps_basic, m.eps_diluted, m.dividend_per_share,
        m.gross_margin, m.operating_margin, m.net_margin, m.roe, m.roa, m.roic,
        m.current_ratio, m.quick_ratio, m.debt_to_equity, m.debt_to_assets,
        m.interest_coverage, m.asset_turnover, m.inventory_turnover
      );
    }

  } catch (error) {
    console.error(`  ✗ Error processing ${filing.symbol}:`, error.message);
    stats.errors++;
  }
}

/**
 * Main reparse process
 */
async function reparseFilings() {
  // Find misclassified semi-annual filings
  const semiAnnualFilings = findMisclassifiedFilings();
  console.log(`Found ${semiAnnualFilings.length} potential semi-annual filings (170-195 days)\\n`);

  // Find misclassified quarterly filings
  const quarterlyFilings = findMisclassifiedQuarterly();
  console.log(`Found ${quarterlyFilings.length} potential quarterly filings (85-95 days)\\n`);

  const allFilings = [...semiAnnualFilings, ...quarterlyFilings];

  if (allFilings.length === 0) {
    console.log('No filings to reparse.\\n');
    return stats;
  }

  console.log(`Processing ${allFilings.length} total filings...\\n`);

  let processed = 0;
  for (const filing of allFilings) {
    processed++;

    if (processed % 50 === 0) {
      console.log(`Processed ${processed}/${allFilings.length} filings...`);
    }

    await processFiling(filing);

    // Rate limiting - 10 requests per second max
    if (processed % 10 === 0) {
      await sleep(1000);
    }
  }

  return stats;
}

// Run reparse
reparseFilings().then((result) => {
  console.log('\\n=== Reparse Results ===');
  console.log(`Total filings processed: ${result.total}`);
  console.log(`Successfully fetched: ${result.fetched}`);
  console.log(`Successfully parsed: ${result.parsed}`);
  console.log(`Periods reclassified: ${result.reclassified}`);
  console.log(`  - New semi-annual: ${result.newSemiAnnual}`);
  console.log(`  - New quarterly: ${result.newQuarterly}`);
  console.log(`Errors: ${result.errors}`);
  console.log('');

  // Show final counts
  const finalCounts = db.prepare(`
    SELECT period_type, COUNT(*) as count, COUNT(DISTINCT ci.company_id) as companies
    FROM xbrl_fundamental_metrics xfm
    JOIN company_identifiers ci ON xfm.identifier_id = ci.id
    JOIN companies c ON ci.company_id = c.id
    WHERE c.country NOT IN ('US', 'CA')
    GROUP BY period_type
    ORDER BY count DESC
  `).all();

  console.log('=== Final Period Type Distribution ===');
  finalCounts.forEach(row => {
    console.log(`  ${row.period_type}: ${row.count} periods, ${row.companies} companies`);
  });
  console.log('');

  console.log('✅ Reparse complete!\\n');

  db.close();
}).catch((error) => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
