/**
 * Verify XBRL Coverage
 *
 * Checks coverage statistics after XBRL parser enhancements:
 * - Total Debt coverage
 * - EBITDA coverage
 * - Shares Outstanding coverage
 * - Lease Liabilities coverage (new field)
 * - Ratio completeness
 *
 * Provides detailed breakdown by metric and overall summary.
 */

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'stocks.db'));

console.log('\n=== XBRL Coverage Verification ===\n');

// Get total EU/UK companies with XBRL data
const totalCompaniesWithXBRL = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM companies c
  JOIN company_identifiers ci ON c.id = ci.company_id
  JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
  WHERE c.country NOT IN ('US', 'CA')
    AND c.is_active = 1
`).get().count;

console.log(`Total EU/UK companies with XBRL data: ${totalCompaniesWithXBRL}\n`);

// Get total company-periods
const totalPeriods = db.prepare(`
  SELECT COUNT(*) as count
  FROM xbrl_fundamental_metrics xfm
  JOIN company_identifiers ci ON xfm.identifier_id = ci.id
  JOIN companies c ON ci.company_id = c.id
  WHERE c.country NOT IN ('US', 'CA')
    AND xfm.period_type = 'annual'
`).get().count;

console.log(`Total company-periods (annual): ${totalPeriods}\n`);
console.log('='.repeat(60));

/**
 * Calculate coverage for a field
 */
function getCoverage(fieldName, displayName) {
  const query = db.prepare(`
    SELECT COUNT(DISTINCT c.id) as count
    FROM companies c
    JOIN company_identifiers ci ON c.id = ci.company_id
    JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
    WHERE c.country NOT IN ('US', 'CA')
      AND c.is_active = 1
      AND xfm.${fieldName} IS NOT NULL
  `).get();

  const count = query.count;
  const percentage = totalCompaniesWithXBRL > 0
    ? ((count / totalCompaniesWithXBRL) * 100).toFixed(1)
    : '0.0';

  console.log(`${displayName}:`);
  console.log(`  Companies: ${count}/${totalCompaniesWithXBRL} (${percentage}%)`);

  // Also show period-level coverage
  const periodQuery = db.prepare(`
    SELECT COUNT(*) as count
    FROM xbrl_fundamental_metrics xfm
    JOIN company_identifiers ci ON xfm.identifier_id = ci.id
    JOIN companies c ON ci.company_id = c.id
    WHERE c.country NOT IN ('US', 'CA')
      AND xfm.period_type = 'annual'
      AND xfm.${fieldName} IS NOT NULL
  `).get();

  const periodCount = periodQuery.count;
  const periodPercentage = totalPeriods > 0
    ? ((periodCount / totalPeriods) * 100).toFixed(1)
    : '0.0';

  console.log(`  Periods: ${periodCount}/${totalPeriods} (${periodPercentage}%)`);
  console.log('');

  return { count, percentage, periodCount, periodPercentage };
}

// Key metrics
console.log('\n=== KEY METRICS ===\n');
const totalDebt = getCoverage('total_debt', 'Total Debt');
const ebitda = getCoverage('ebitda', 'EBITDA');
const sharesOutstanding = getCoverage('shares_outstanding', 'Shares Outstanding');

// New fields
console.log('=== NEW FIELDS ===\n');
const leaseLiabilities = getCoverage('lease_liabilities', 'Lease Liabilities');
const totalFinancialLiabilities = getCoverage('total_financial_liabilities', 'Total Financial Liabilities');
const dilutedShares = getCoverage('diluted_shares_outstanding', 'Diluted Shares Outstanding');
const depreciation = getCoverage('depreciation', 'Depreciation (separate)');
const amortization = getCoverage('amortization', 'Amortization (separate)');

// Ratios
console.log('=== RATIOS COVERAGE ===\n');

const ratios = [
  { field: 'gross_margin', name: 'Gross Margin' },
  { field: 'operating_margin', name: 'Operating Margin' },
  { field: 'net_margin', name: 'Net Margin' },
  { field: 'roe', name: 'ROE' },
  { field: 'roa', name: 'ROA' },
  { field: 'roic', name: 'ROIC' },
  { field: 'current_ratio', name: 'Current Ratio' },
  { field: 'quick_ratio', name: 'Quick Ratio' },
  { field: 'debt_to_equity', name: 'Debt-to-Equity' },
  { field: 'debt_to_assets', name: 'Debt-to-Assets' },
  { field: 'interest_coverage', name: 'Interest Coverage' },
  { field: 'asset_turnover', name: 'Asset Turnover' },
  { field: 'inventory_turnover', name: 'Inventory Turnover' }
];

ratios.forEach(r => getCoverage(r.field, r.name));

// Calculate companies with complete ratios (all 13)
const completeRatios = db.prepare(`
  SELECT COUNT(DISTINCT c.id) as count
  FROM companies c
  JOIN company_identifiers ci ON c.id = ci.company_id
  JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
  WHERE c.country NOT IN ('US', 'CA')
    AND c.is_active = 1
    AND xfm.gross_margin IS NOT NULL
    AND xfm.operating_margin IS NOT NULL
    AND xfm.net_margin IS NOT NULL
    AND xfm.roe IS NOT NULL
    AND xfm.roa IS NOT NULL
    AND xfm.roic IS NOT NULL
    AND xfm.current_ratio IS NOT NULL
    AND xfm.quick_ratio IS NOT NULL
    AND xfm.debt_to_equity IS NOT NULL
    AND xfm.debt_to_assets IS NOT NULL
    AND xfm.interest_coverage IS NOT NULL
    AND xfm.asset_turnover IS NOT NULL
    AND xfm.inventory_turnover IS NOT NULL
`).get().count;

const completeRatiosPercentage = totalCompaniesWithXBRL > 0
  ? ((completeRatios / totalCompaniesWithXBRL) * 100).toFixed(1)
  : '0.0';

console.log('='.repeat(60));
console.log(`\nCompanies with ALL 13 ratios: ${completeRatios}/${totalCompaniesWithXBRL} (${completeRatiosPercentage}%)\n`);

// Top countries by coverage
console.log('=== TOP COUNTRIES ===\n');
const topCountries = db.prepare(`
  SELECT
    c.country,
    COUNT(DISTINCT c.id) as companies,
    SUM(CASE WHEN xfm.total_debt IS NOT NULL THEN 1 ELSE 0 END) as with_debt,
    SUM(CASE WHEN xfm.ebitda IS NOT NULL THEN 1 ELSE 0 END) as with_ebitda,
    SUM(CASE WHEN xfm.shares_outstanding IS NOT NULL THEN 1 ELSE 0 END) as with_shares
  FROM companies c
  JOIN company_identifiers ci ON c.id = ci.company_id
  JOIN xbrl_fundamental_metrics xfm ON ci.id = xfm.identifier_id
  WHERE c.country NOT IN ('US', 'CA')
    AND c.is_active = 1
  GROUP BY c.country
  ORDER BY companies DESC
  LIMIT 10
`).all();

topCountries.forEach(row => {
  const debtPct = ((row.with_debt / row.companies) * 100).toFixed(0);
  const ebitdaPct = ((row.with_ebitda / row.companies) * 100).toFixed(0);
  const sharesPct = ((row.with_shares / row.companies) * 100).toFixed(0);

  console.log(`${row.country}: ${row.companies} companies`);
  console.log(`  Debt: ${debtPct}% | EBITDA: ${ebitdaPct}% | Shares: ${sharesPct}%`);
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ Coverage verification complete!\n');

db.close();
