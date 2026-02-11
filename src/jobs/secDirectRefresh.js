/**
 * SEC Direct Refresh Job
 *
 * Fetches latest financial data directly from SEC EDGAR API
 * for individual companies. Use this for real-time updates
 * instead of waiting for quarterly bulk files.
 *
 * Usage:
 *   node src/jobs/secDirectRefresh.js [watchlist|all|SYMBOL1,SYMBOL2,...]
 */

const { getDatabaseAsync } = require('../lib/db');
const SECProvider = require('../providers/SECProvider');

let databasePromise;
async function getDatabase() {
  if (!databasePromise) {
    databasePromise = getDatabaseAsync();
  }
  return databasePromise;
}
const secProvider = new SECProvider();

// Tag mappings for converting XBRL concepts to our standard fields
// These match the actual financial_data table schema
const TAG_MAPPINGS = {
  // Income Statement
  'Revenues': 'total_revenue',
  'RevenueFromContractWithCustomerExcludingAssessedTax': 'total_revenue',
  'SalesRevenueNet': 'total_revenue',
  'GrossProfit': 'gross_profit',
  'OperatingIncomeLoss': 'operating_income',
  'NetIncomeLoss': 'net_income',
  'CostOfGoodsAndServicesSold': 'cost_of_revenue',
  'CostOfRevenue': 'cost_of_revenue',

  // Balance Sheet
  'Assets': 'total_assets',
  'AssetsCurrent': 'current_assets',
  'CashAndCashEquivalentsAtCarryingValue': 'cash_and_equivalents',
  'Liabilities': 'total_liabilities',
  'LiabilitiesCurrent': 'current_liabilities',
  'LongTermDebtNoncurrent': 'long_term_debt',
  'LongTermDebt': 'long_term_debt',
  'ShortTermBorrowings': 'short_term_debt',
  'StockholdersEquity': 'shareholder_equity',
  'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest': 'shareholder_equity',

  // Cash Flow
  'NetCashProvidedByUsedInOperatingActivities': 'operating_cashflow',
  'PaymentsToAcquirePropertyPlantAndEquipment': 'capital_expenditures',
};

// Shares outstanding - stored in 'shares' units, not USD
const SHARES_TAGS = [
  'CommonStockSharesOutstanding',
  'CommonStockSharesIssued',  // fallback if outstanding not available
];

/**
 * Fetch and store financial data for a company from SEC EDGAR
 */
async function refreshCompanyFromSEC(symbol) {
  console.log(`\n📥 Fetching ${symbol} from SEC EDGAR...`);

  try {
    const database = await getDatabase();
    // Get company from database
    const companyResult = await database.query(`
      SELECT id, cik, name FROM companies WHERE symbol = $1
    `, [symbol.toUpperCase()]);
    const company = companyResult.rows[0];

    if (!company) {
      console.log(`   ⚠️ Company ${symbol} not found in database`);
      return { success: false, error: 'Company not found' };
    }

    // Fetch company facts from SEC
    const facts = await secProvider.getCompanyFacts(symbol);
    const usGaap = facts.facts?.['us-gaap'];

    if (!usGaap) {
      console.log(`   ⚠️ No US-GAAP data found for ${symbol}`);
      return { success: false, error: 'No US-GAAP data' };
    }

    // Get submissions for filing dates
    const submissions = await secProvider.getSubmissions(symbol);
    const recentFilings = submissions.filings?.recent || {};

    // Build a map of accession numbers to filing info
    const filingInfo = new Map();
    if (recentFilings.accessionNumber) {
      for (let i = 0; i < recentFilings.accessionNumber.length; i++) {
        const accn = recentFilings.accessionNumber[i].replace(/-/g, '');
        filingInfo.set(accn, {
          form: recentFilings.form[i],
          filingDate: recentFilings.filingDate[i],
          reportDate: recentFilings.reportDate[i],
        });
      }
    }

    // Extract all financial data points
    const dataPoints = [];

    for (const [concept, standardField] of Object.entries(TAG_MAPPINGS)) {
      const conceptData = usGaap[concept];
      if (!conceptData?.units?.USD) continue;

      // Filter to 10-K and 10-Q filings only
      const values = conceptData.units.USD.filter(v =>
        v.form === '10-K' || v.form === '10-Q'
      );

      for (const item of values) {
        // Determine fiscal period from frame or form
        let fiscalPeriod = 'FY';
        if (item.frame) {
          if (item.frame.includes('Q1')) fiscalPeriod = 'Q1';
          else if (item.frame.includes('Q2')) fiscalPeriod = 'Q2';
          else if (item.frame.includes('Q3')) fiscalPeriod = 'Q3';
          else if (item.frame.includes('Q4')) fiscalPeriod = 'Q4';
        } else if (item.fp) {
          fiscalPeriod = item.fp;
        }

        // Extract fiscal year from end date or frame
        let fiscalYear = null;
        if (item.frame) {
          const match = item.frame.match(/CY(\d{4})/);
          if (match) fiscalYear = parseInt(match[1]);
        }
        if (!fiscalYear && item.end) {
          fiscalYear = parseInt(item.end.substring(0, 4));
        }

        dataPoints.push({
          company_id: company.id,
          field: standardField,
          concept: concept,
          fiscal_date_ending: item.end,
          fiscal_period: fiscalPeriod,
          fiscal_year: fiscalYear,
          value: item.val,
          filed_date: item.filed,
          form: item.form,
          accn: item.accn,
        });
      }
    }

    // Extract shares outstanding (stored in 'shares' units, not USD)
    const sharesDataPoints = [];
    for (const sharesTag of SHARES_TAGS) {
      const conceptData = usGaap[sharesTag];
      if (!conceptData?.units?.shares) continue;

      const values = conceptData.units.shares.filter(v =>
        v.form === '10-K' || v.form === '10-Q'
      );

      for (const item of values) {
        let fiscalPeriod = 'FY';
        if (item.frame) {
          if (item.frame.includes('Q1')) fiscalPeriod = 'Q1';
          else if (item.frame.includes('Q2')) fiscalPeriod = 'Q2';
          else if (item.frame.includes('Q3')) fiscalPeriod = 'Q3';
          else if (item.frame.includes('Q4')) fiscalPeriod = 'Q4';
        } else if (item.fp) {
          fiscalPeriod = item.fp;
        }

        let fiscalYear = null;
        if (item.frame) {
          const match = item.frame.match(/CY(\d{4})/);
          if (match) fiscalYear = parseInt(match[1]);
        }
        if (!fiscalYear && item.end) {
          fiscalYear = parseInt(item.end.substring(0, 4));
        }

        sharesDataPoints.push({
          company_id: company.id,
          field: 'shares_outstanding',
          concept: sharesTag,
          fiscal_date_ending: item.end,
          fiscal_period: fiscalPeriod,
          fiscal_year: fiscalYear,
          value: item.val,
          filed_date: item.filed,
          form: item.form,
          accn: item.accn,
        });
      }

      // If we got CommonStockSharesOutstanding, don't need fallback
      if (sharesDataPoints.length > 0 && sharesTag === 'CommonStockSharesOutstanding') {
        break;
      }
    }

    console.log(`   📊 Found ${dataPoints.length} financial data points, ${sharesDataPoints.length} shares data points`);

    // Group by fiscal period for financial_data table
    const periodGroups = new Map();

    for (const dp of dataPoints) {
      const key = `${dp.fiscal_date_ending}-${dp.fiscal_period}`;
      if (!periodGroups.has(key)) {
        periodGroups.set(key, {
          company_id: dp.company_id,
          fiscal_date_ending: dp.fiscal_date_ending,
          fiscal_period: dp.fiscal_period,
          fiscal_year: dp.fiscal_year,
          filed_date: dp.filed_date,
          form: dp.form,
          period_type: dp.form === '10-K' ? 'annual' : 'quarterly',
        });
      }

      const group = periodGroups.get(key);
      group[dp.field] = dp.value;

      // Keep most recent filed date
      if (dp.filed_date > group.filed_date) {
        group.filed_date = dp.filed_date;
      }
    }

    // Add shares outstanding to period groups
    for (const sp of sharesDataPoints) {
      const key = `${sp.fiscal_date_ending}-${sp.fiscal_period}`;
      if (periodGroups.has(key)) {
        const group = periodGroups.get(key);
        // Only set if not already set (prefer first match which is CommonStockSharesOutstanding)
        if (!group.shares_outstanding) {
          group.shares_outstanding = sp.value;
        }
      }
    }

    // Insert/update financial_data (using actual table columns)
    // UNIQUE constraint is: (company_id, statement_type, fiscal_date_ending, period_type)
    const insertSql = `
      INSERT INTO financial_data (
        company_id, statement_type, fiscal_date_ending, fiscal_period, fiscal_year,
        period_type, filed_date, form, data,
        total_revenue, gross_profit, operating_income, net_income, cost_of_revenue,
        total_assets, current_assets, cash_and_equivalents,
        total_liabilities, current_liabilities, long_term_debt, short_term_debt,
        shareholder_equity, operating_cashflow, capital_expenditures,
        shares_outstanding
      ) VALUES (
        $1, 'all', $2, $3, $4,
        $5, $6, $7, '{}',
        $8, $9, $10, $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22,
        $23
      )
      ON CONFLICT(company_id, statement_type, fiscal_date_ending, period_type)
      DO UPDATE SET
        fiscal_period = excluded.fiscal_period,
        fiscal_year = excluded.fiscal_year,
        filed_date = MAX(excluded.filed_date, financial_data.filed_date),
        form = excluded.form,
        total_revenue = COALESCE(excluded.total_revenue, financial_data.total_revenue),
        gross_profit = COALESCE(excluded.gross_profit, financial_data.gross_profit),
        operating_income = COALESCE(excluded.operating_income, financial_data.operating_income),
        net_income = COALESCE(excluded.net_income, financial_data.net_income),
        cost_of_revenue = COALESCE(excluded.cost_of_revenue, financial_data.cost_of_revenue),
        total_assets = COALESCE(excluded.total_assets, financial_data.total_assets),
        current_assets = COALESCE(excluded.current_assets, financial_data.current_assets),
        cash_and_equivalents = COALESCE(excluded.cash_and_equivalents, financial_data.cash_and_equivalents),
        total_liabilities = COALESCE(excluded.total_liabilities, financial_data.total_liabilities),
        current_liabilities = COALESCE(excluded.current_liabilities, financial_data.current_liabilities),
        long_term_debt = COALESCE(excluded.long_term_debt, financial_data.long_term_debt),
        short_term_debt = COALESCE(excluded.short_term_debt, financial_data.short_term_debt),
        shareholder_equity = COALESCE(excluded.shareholder_equity, financial_data.shareholder_equity),
        operating_cashflow = COALESCE(excluded.operating_cashflow, financial_data.operating_cashflow),
        capital_expenditures = COALESCE(excluded.capital_expenditures, financial_data.capital_expenditures),
        shares_outstanding = COALESCE(excluded.shares_outstanding, financial_data.shares_outstanding)
    `;

    let inserted = 0;
    const updated = 0;

    for (const [key, data] of periodGroups) {
      try {
        const result = await database.query(insertSql, [
          data.company_id,
          data.fiscal_date_ending,
          data.fiscal_period,
          data.fiscal_year,
          data.period_type,
          data.filed_date,
          data.form,
          data.total_revenue || null,
          data.gross_profit || null,
          data.operating_income || null,
          data.net_income || null,
          data.cost_of_revenue || null,
          data.total_assets || null,
          data.current_assets || null,
          data.cash_and_equivalents || null,
          data.total_liabilities || null,
          data.current_liabilities || null,
          data.long_term_debt || null,
          data.short_term_debt || null,
          data.shareholder_equity || null,
          data.operating_cashflow || null,
          data.capital_expenditures || null,
          data.shares_outstanding || null
        ]);

        if (result && (result.rowCount > 0 || result.changes > 0)) {
          inserted++;
        }
      } catch (err) {
        // Ignore constraint errors
      }
    }

    console.log(`   ✅ Processed ${periodGroups.size} periods (${inserted} new/updated)`);

    // Show latest data
    const latestResult = await database.query(`
      SELECT fiscal_date_ending, fiscal_period, filed_date, total_revenue
      FROM financial_data
      WHERE company_id = $1
      ORDER BY fiscal_date_ending DESC
      LIMIT 3
    `, [company.id]);
    const latest = latestResult.rows;

    console.log('   📅 Latest periods:');
    for (const l of latest) {
      const rev = l.total_revenue ? `$${(l.total_revenue / 1e9).toFixed(1)}B` : 'N/A';
      console.log(`      ${l.fiscal_date_ending} ${l.fiscal_period} (filed ${l.filed_date}) - Revenue: ${rev}`);
    }

    return {
      success: true,
      periods: periodGroups.size,
      inserted,
      symbol
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message, symbol };
  }
}

/**
 * Get watchlist symbols
 */
async function getWatchlistSymbols() {
  const database = await getDatabase();
  const watchlistResult = await database.query(`
    SELECT c.symbol
    FROM watchlist w
    JOIN companies c ON c.id = w.company_id
    WHERE c.symbol IS NOT NULL AND c.symbol NOT LIKE 'CIK_%'
    ORDER BY w.added_at DESC
  `);
  const watchlist = watchlistResult.rows;

  return watchlist.map(w => w.symbol);
}

/**
 * Get top companies by market activity
 */
async function getTopCompanies(limit = 50) {
  const database = await getDatabase();
  const companiesResult = await database.query(`
    SELECT DISTINCT c.symbol
    FROM companies c
    JOIN financial_data fd ON fd.company_id = c.id
    WHERE c.symbol IS NOT NULL
      AND c.symbol NOT LIKE 'CIK_%'
      AND c.is_active = 1
    ORDER BY fd.total_revenue DESC
    LIMIT $1
  `, [limit]);
  const companies = companiesResult.rows;

  return companies.map(c => c.symbol);
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'watchlist';

  console.log('═══════════════════════════════════════════════════════');
  console.log('         SEC DIRECT DATA REFRESH                       ');
  console.log('═══════════════════════════════════════════════════════');

  let symbols = [];

  if (mode === 'watchlist') {
    symbols = await getWatchlistSymbols();
    console.log(`\n📋 Refreshing ${symbols.length} watchlist companies`);
  } else if (mode === 'all' || mode === 'top') {
    symbols = await getTopCompanies(50);
    console.log(`\n📋 Refreshing top ${symbols.length} companies`);
  } else {
    // Assume comma-separated symbols
    symbols = mode.split(',').map(s => s.trim().toUpperCase());
    console.log(`\n📋 Refreshing ${symbols.length} specified symbols: ${symbols.join(', ')}`);
  }

  if (symbols.length === 0) {
    console.log('\n⚠️ No companies to refresh');
    return;
  }

  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const symbol of symbols) {
    const result = await refreshCompanyFromSEC(symbol);

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
      results.errors.push({ symbol, error: result.error });
    }

    // Rate limiting - wait between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('                    SUMMARY                            ');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Success: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of results.errors) {
      console.log(`   ${err.symbol}: ${err.error}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

// Export for use as module
module.exports = {
  refreshCompanyFromSEC,
  getWatchlistSymbols,
  getTopCompanies
};

// Run if called directly
if (require.main === module) {
  main().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
