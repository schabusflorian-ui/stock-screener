// scripts/fix-pe-coverage.js
// Fix P/E coverage issues by marking non-applicable entities and fixing calculation bugs

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../data/stocks.db'));

console.log('🔧 P/E Coverage Fix Script\n');
console.log('='.repeat(60));

// Step 1: Mark CIK-only companies as not applicable
console.log('\n📋 Step 1: Mark CIK-only companies as valuation_applicable = 0');

const cikOnlyCount = db.prepare(`
  SELECT COUNT(DISTINCT cm.id) as count
  FROM calculated_metrics cm
  JOIN companies c ON cm.company_id = c.id
  WHERE (c.symbol IS NULL OR c.symbol LIKE 'CIK_%')
    AND (cm.valuation_applicable IS NULL OR cm.valuation_applicable = 1)
`).get();

console.log(`   Found ${cikOnlyCount.count.toLocaleString()} periods to update`);

const cikOnlyResult = db.prepare(`
  UPDATE calculated_metrics
  SET valuation_applicable = 0
  WHERE company_id IN (
    SELECT id FROM companies WHERE symbol IS NULL OR symbol LIKE 'CIK_%'
  )
`).run();

console.log(`   ✅ Updated ${cikOnlyResult.changes.toLocaleString()} periods`);

// Step 2: Mark warrants as not applicable
console.log('\n📋 Step 2: Mark warrants (xxxW symbols) as valuation_applicable = 0');

const warrantCount = db.prepare(`
  SELECT COUNT(DISTINCT cm.id) as count
  FROM calculated_metrics cm
  JOIN companies c ON cm.company_id = c.id
  WHERE c.symbol LIKE '%W'
    AND LENGTH(c.symbol) >= 4
    AND c.symbol NOT IN ('BMW', 'SAW', 'COW', 'NOW', 'SNOW', 'FLOW', 'GROW', 'KNOW', 'SHOW')
    AND (cm.valuation_applicable IS NULL OR cm.valuation_applicable = 1)
`).get();

console.log(`   Found ${warrantCount.count.toLocaleString()} warrant periods to check`);

// Get actual warrants - symbols ending in W that look like warrant tickers
const warrantResult = db.prepare(`
  UPDATE calculated_metrics
  SET valuation_applicable = 0
  WHERE company_id IN (
    SELECT id FROM companies
    WHERE symbol LIKE '%W'
      AND LENGTH(symbol) >= 4
      AND symbol GLOB '*[A-Z]W'
      AND symbol NOT IN ('BMW', 'SAW', 'COW', 'NOW', 'SNOW', 'FLOW', 'GROW', 'KNOW', 'SHOW', 'SLOW', 'STEW', 'THAW', 'VIEW', 'BREW', 'CHEW', 'CLAW', 'CRAW', 'CREW', 'CROW', 'DRAW', 'DREW', 'FLEW', 'FLAW', 'GNAW', 'GREW', 'THEW', 'SCOW', 'SKEW', 'SLEW', 'SPEW', 'STOW', 'THAW')
      AND (
        symbol LIKE '____W' -- 5 char ending in W (common warrant pattern)
        OR symbol LIKE '_____W' -- 6 char ending in W
        OR name LIKE '%Warrant%'
      )
  )
`).run();

console.log(`   ✅ Updated ${warrantResult.changes.toLocaleString()} warrant periods`);

// Step 3: Mark future periods as not applicable
console.log('\n📋 Step 3: Mark future periods as valuation_applicable = 0');

const futureCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM calculated_metrics
  WHERE fiscal_period > date('now')
    AND (valuation_applicable IS NULL OR valuation_applicable = 1)
`).get();

console.log(`   Found ${futureCount.count.toLocaleString()} future periods`);

const futureResult = db.prepare(`
  UPDATE calculated_metrics
  SET valuation_applicable = 0
  WHERE fiscal_period > date('now')
`).run();

console.log(`   ✅ Updated ${futureResult.changes.toLocaleString()} future periods`);

// Step 4: Investigate and fix calculation bugs
console.log('\n📋 Step 4: Fix calculation bugs (has EPS + Price but no P/E)');

const buggyPeriods = db.prepare(`
  SELECT
    cm.id,
    cm.company_id,
    c.symbol,
    c.name,
    cm.fiscal_period,
    cm.eps_diluted,
    cm.price_at_report,
    cm.pe_ratio,
    cm.market_cap
  FROM calculated_metrics cm
  JOIN companies c ON cm.company_id = c.id
  WHERE cm.pe_ratio IS NULL
    AND cm.eps_diluted IS NOT NULL
    AND cm.eps_diluted != 0
    AND cm.price_at_report IS NOT NULL
    AND cm.price_at_report > 0
    AND (cm.valuation_applicable IS NULL OR cm.valuation_applicable = 1)
  LIMIT 50
`).all();

console.log(`   Found ${buggyPeriods.length} periods with calculation bugs`);

if (buggyPeriods.length > 0) {
  console.log('\n   Fixing individual calculation bugs:');

  const updateStmt = db.prepare(`
    UPDATE calculated_metrics
    SET pe_ratio = ?
    WHERE id = ?
  `);

  let fixed = 0;
  for (const period of buggyPeriods) {
    const pe = period.price_at_report / period.eps_diluted;

    // Only set reasonable P/E values (between -1000 and 1000)
    if (pe > -1000 && pe < 1000) {
      updateStmt.run(pe, period.id);
      console.log(`   - ${period.symbol} (${period.fiscal_period}): EPS=${period.eps_diluted.toFixed(2)}, Price=${period.price_at_report.toFixed(2)} → P/E=${pe.toFixed(2)}`);
      fixed++;
    } else {
      console.log(`   - ${period.symbol} (${period.fiscal_period}): Skipped (P/E=${pe.toFixed(2)} out of range)`);
    }
  }

  console.log(`   ✅ Fixed ${fixed} calculation bugs`);
}

// Step 5: Verify new coverage
console.log('\n📋 Step 5: Verify improved coverage');
console.log('='.repeat(60));

const newCoverage = db.prepare(`
  SELECT
    COUNT(*) as total_periods,
    SUM(CASE WHEN valuation_applicable = 0 THEN 1 ELSE 0 END) as not_applicable,
    SUM(CASE WHEN valuation_applicable != 0 OR valuation_applicable IS NULL THEN 1 ELSE 0 END) as applicable,
    SUM(CASE WHEN pe_ratio IS NOT NULL AND (valuation_applicable != 0 OR valuation_applicable IS NULL) THEN 1 ELSE 0 END) as has_pe
  FROM calculated_metrics
`).get();

const applicableCoverage = (newCoverage.has_pe / newCoverage.applicable * 100).toFixed(1);

console.log(`
📊 Updated Coverage Statistics:
   Total periods:     ${newCoverage.total_periods.toLocaleString()}
   Not applicable:    ${newCoverage.not_applicable.toLocaleString()} (marked as valuation_applicable=0)
   Applicable:        ${newCoverage.applicable.toLocaleString()}
   Has P/E ratio:     ${newCoverage.has_pe.toLocaleString()}

   📈 P/E Coverage (applicable only): ${applicableCoverage}%
`);

// Coverage by year for applicable periods
console.log('📅 Coverage by Year (applicable periods only):');
const yearCoverage = db.prepare(`
  SELECT
    strftime('%Y', fiscal_period) as year,
    COUNT(*) as total,
    SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) as has_pe,
    ROUND(100.0 * SUM(CASE WHEN pe_ratio IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as coverage_pct
  FROM calculated_metrics
  WHERE valuation_applicable != 0 OR valuation_applicable IS NULL
  GROUP BY year
  ORDER BY year DESC
  LIMIT 10
`).all();

console.log('   Year    Total     Has P/E   Coverage');
console.log('   ----    -----     -------   --------');
for (const row of yearCoverage) {
  console.log(`   ${row.year}    ${row.total.toString().padStart(5)}     ${row.has_pe.toString().padStart(5)}     ${row.coverage_pct}%`);
}

// Remaining issues breakdown
console.log('\n📋 Remaining Missing P/E Analysis (applicable periods):');
const remaining = db.prepare(`
  SELECT
    CASE
      WHEN eps_diluted IS NULL THEN 'No EPS data'
      WHEN eps_diluted = 0 THEN 'EPS is zero'
      WHEN price_at_report IS NULL THEN 'No price at report'
      WHEN price_at_report = 0 THEN 'Price is zero'
      ELSE 'Unknown'
    END as reason,
    COUNT(*) as count
  FROM calculated_metrics
  WHERE pe_ratio IS NULL
    AND (valuation_applicable != 0 OR valuation_applicable IS NULL)
  GROUP BY reason
  ORDER BY count DESC
`).all();

for (const row of remaining) {
  console.log(`   ${row.reason}: ${row.count.toLocaleString()} periods`);
}

console.log('\n✅ P/E Coverage Fix Complete!');
db.close();
