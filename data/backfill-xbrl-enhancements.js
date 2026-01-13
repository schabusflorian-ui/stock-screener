/**
 * Backfill XBRL Enhancements
 *
 * Re-parses existing xbrl_filings.raw_json with the enhanced parser to capture:
 * - New IFRS debt concepts (lease liabilities, total financial liabilities, etc.)
 * - New IFRS D&A concepts (for better EBITDA coverage)
 * - New IFRS share concepts (weighted average, issued, treasury)
 * - Calculated ratios (13 ratios)
 *
 * Updates xbrl_fundamental_metrics with enriched data.
 */

const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const { XBRLParser } = require('../src/services/xbrl/xbrlParser');

const db = new Database(path.join(__dirname, 'stocks.db'));
const parser = new XBRLParser();

console.log('\n=== XBRL Enhancement Backfill ===\n');

// Statistics
const stats = {
  total: 0,
  parsed: 0,
  updated: 0,
  errors: 0,
  improvements: {
    totalDebt: { before: 0, after: 0 },
    ebitda: { before: 0, after: 0 },
    sharesOutstanding: { before: 0, after: 0 },
    leaseliabilities: { new: 0 },
    ratios: { before: 0, after: 0 }
  }
};

/**
 * Get all filings with json_url
 */
function getFilings() {
  return db.prepare(`
    SELECT
      xf.id as filing_id,
      xf.json_url,
      xf.period_end,
      ci.id as identifier_id,
      c.id as company_id,
      c.symbol,
      c.name
    FROM xbrl_filings xf
    JOIN company_identifiers ci ON xf.identifier_id = ci.id
    JOIN companies c ON ci.company_id = c.id
    WHERE xf.parsed = 1
      AND xf.json_url IS NOT NULL
      AND c.country NOT IN ('US', 'CA')
    ORDER BY c.id, xf.period_end DESC
  `).all();
}

/**
 * Fetch XBRL-JSON from URL
 */
function fetchXBRLJson(jsonPath) {
  // Build full URL from relative path
  const fullUrl = `https://filings.xbrl.org${jsonPath}`;

  return new Promise((resolve, reject) => {
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
 * Get existing metrics for comparison
 */
function getExistingMetrics(identifierId, periodEnd) {
  return db.prepare(`
    SELECT
      id, total_debt, ebitda, shares_outstanding, lease_liabilities,
      gross_margin, operating_margin, net_margin, roe, roa, roic,
      current_ratio, quick_ratio, debt_to_equity, debt_to_assets,
      interest_coverage, asset_turnover, inventory_turnover
    FROM xbrl_fundamental_metrics
    WHERE identifier_id = ? AND period_end = ?
    LIMIT 1
  `).get(identifierId, periodEnd);
}

/**
 * Update fundamental metrics
 */
const updateMetricsStmt = db.prepare(`
  UPDATE xbrl_fundamental_metrics
  SET
    -- Debt fields
    total_debt = COALESCE(?, total_debt),
    short_term_debt = COALESCE(?, short_term_debt),
    long_term_debt = COALESCE(?, long_term_debt),
    lease_liabilities = COALESCE(?, lease_liabilities),
    total_financial_liabilities = COALESCE(?, total_financial_liabilities),
    other_debt = COALESCE(?, other_debt),

    -- EBITDA and D&A
    ebitda = COALESCE(?, ebitda),
    depreciation_amortization = COALESCE(?, depreciation_amortization),
    depreciation = COALESCE(?, depreciation),
    amortization = COALESCE(?, amortization),
    impairment_loss = COALESCE(?, impairment_loss),

    -- Shares
    shares_outstanding = COALESCE(?, shares_outstanding),
    diluted_shares_outstanding = COALESCE(?, diluted_shares_outstanding),
    shares_issued = COALESCE(?, shares_issued),
    treasury_shares = COALESCE(?, treasury_shares),

    -- Ratios
    gross_margin = COALESCE(?, gross_margin),
    operating_margin = COALESCE(?, operating_margin),
    net_margin = COALESCE(?, net_margin),
    roe = COALESCE(?, roe),
    roa = COALESCE(?, roa),
    roic = COALESCE(?, roic),
    current_ratio = COALESCE(?, current_ratio),
    quick_ratio = COALESCE(?, quick_ratio),
    debt_to_equity = COALESCE(?, debt_to_equity),
    debt_to_assets = COALESCE(?, debt_to_assets),
    interest_coverage = COALESCE(?, interest_coverage),
    asset_turnover = COALESCE(?, asset_turnover),
    inventory_turnover = COALESCE(?, inventory_turnover),

    updated_at = CURRENT_TIMESTAMP
  WHERE identifier_id = ? AND period_end = ?
`);

/**
 * Process a single filing
 */
async function processFiling(filing) {
  stats.total++;

  try {
    // Fetch XBRL-JSON from URL
    const rawJson = await fetchXBRLJson(filing.json_url);
    if (!rawJson) {
      stats.errors++;
      return;
    }

    // Parse raw JSON
    const parsed = parser.parseXBRLJson(rawJson);

    if (!parsed || Object.keys(parsed.periods).length === 0) {
      return;
    }

    stats.parsed++;

    // Process each period
    for (const [periodEnd, periodData] of Object.entries(parsed.periods)) {
      const m = periodData.metrics;

      // Get existing data for comparison
      const existing = getExistingMetrics(filing.identifier_id, periodEnd);
      if (!existing) continue;

      // Track improvements
      if (!existing.total_debt && m.total_debt) stats.improvements.totalDebt.after++;
      if (existing.total_debt) stats.improvements.totalDebt.before++;

      if (!existing.ebitda && m.ebitda) stats.improvements.ebitda.after++;
      if (existing.ebitda) stats.improvements.ebitda.before++;

      if (!existing.shares_outstanding && m.shares_outstanding) stats.improvements.sharesOutstanding.after++;
      if (existing.shares_outstanding) stats.improvements.sharesOutstanding.before++;

      if (!existing.lease_liabilities && m.lease_liabilities) stats.improvements.leaseliabilities.new++;

      // Count ratios
      const existingRatios = [
        existing.gross_margin, existing.operating_margin, existing.net_margin,
        existing.roe, existing.roa, existing.roic, existing.current_ratio,
        existing.quick_ratio, existing.debt_to_equity, existing.debt_to_assets,
        existing.interest_coverage, existing.asset_turnover, existing.inventory_turnover
      ].filter(r => r !== null).length;

      const newRatios = [
        m.gross_margin, m.operating_margin, m.net_margin,
        m.roe, m.roa, m.roic, m.current_ratio, m.quick_ratio,
        m.debt_to_equity, m.debt_to_assets, m.interest_coverage,
        m.asset_turnover, m.inventory_turnover
      ].filter(r => r !== undefined && r !== null).length;

      if (existingRatios < 13) stats.improvements.ratios.before++;
      if (newRatios > existingRatios) stats.improvements.ratios.after++;

      // Update database
      updateMetricsStmt.run(
        // Debt fields
        m.total_debt, m.short_term_debt, m.long_term_debt,
        m.lease_liabilities, m.total_financial_liabilities, m.other_debt,

        // EBITDA and D&A
        m.ebitda, m.depreciation_amortization,
        m.depreciation, m.amortization, m.impairment_loss,

        // Shares
        m.shares_outstanding, m.diluted_shares_outstanding,
        m.shares_issued, m.treasury_shares,

        // Ratios
        m.gross_margin, m.operating_margin, m.net_margin,
        m.roe, m.roa, m.roic,
        m.current_ratio, m.quick_ratio,
        m.debt_to_equity, m.debt_to_assets,
        m.interest_coverage, m.asset_turnover, m.inventory_turnover,

        // Where clause
        filing.identifier_id, periodEnd
      );

      stats.updated++;
    }

  } catch (error) {
    console.error(`Error processing ${filing.symbol}:`, error.message);
    stats.errors++;
  }
}

/**
 * Main backfill process
 */
async function runBackfill() {
  const filings = getFilings();
  console.log(`Found ${filings.length} filings to process\n`);

  // Process all filings
  const filingsToProcess = filings;

  console.log(`Processing all ${filingsToProcess.length} filings...\n`);

  let processed = 0;
  for (const filing of filingsToProcess) {
    processed++;

    if (processed % 50 === 0) {
      console.log(`Processed ${processed}/${filingsToProcess.length} filings...`);
    }

    await processFiling(filing);

    // Rate limiting - 10 requests per second max
    if (processed % 10 === 0) {
      await sleep(1000);
    }
  }

  return stats;
}

// Run backfill
runBackfill().then((result) => {
  console.log('\n=== Backfill Results ===');
  console.log(`Total filings: ${result.total}`);
  console.log(`Parsed successfully: ${result.parsed}`);
  console.log(`Metric records updated: ${result.updated}`);
  console.log(`Errors: ${result.errors}`);
  console.log('');

  console.log('=== Coverage Improvements ===');
  console.log(`Total Debt:`);
  console.log(`  Before: ${result.improvements.totalDebt.before} (had data)`);
  console.log(`  After: ${result.improvements.totalDebt.before + result.improvements.totalDebt.after} (new captures: ${result.improvements.totalDebt.after})`);
  console.log('');

  console.log(`EBITDA:`);
  console.log(`  Before: ${result.improvements.ebitda.before} (had data)`);
  console.log(`  After: ${result.improvements.ebitda.before + result.improvements.ebitda.after} (new captures: ${result.improvements.ebitda.after})`);
  console.log('');

  console.log(`Shares Outstanding:`);
  console.log(`  Before: ${result.improvements.sharesOutstanding.before} (had data)`);
  console.log(`  After: ${result.improvements.sharesOutstanding.before + result.improvements.sharesOutstanding.after} (new captures: ${result.improvements.sharesOutstanding.after})`);
  console.log('');

  console.log(`Lease Liabilities (NEW):`);
  console.log(`  Captured: ${result.improvements.leaseliabilities.new}`);
  console.log('');

  console.log(`Ratios (13 total):`);
  console.log(`  Companies with incomplete ratios before: ${result.improvements.ratios.before}`);
  console.log(`  Companies with improved ratios: ${result.improvements.ratios.after}`);
  console.log('');

  console.log('✅ Backfill complete!\n');

  db.close();
}).catch((error) => {
  console.error('Fatal error:', error);
  db.close();
  process.exit(1);
});
