// deduplicate-financial-data.js
//
// This script removes duplicate financial periods for the same fiscal year
// while preserving quarterly data. It keeps the latest filing date.
//
// Rules:
// - For annual reports: Keep only the latest date per fiscal_year
// - For quarterly reports: Keep all quarters (Q1, Q2, Q3, Q4)
// - Two dates within 30 days with same fiscal_year = duplicate annual reports

const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🧹 DEDUPLICATING FINANCIAL DATA\n');
console.log('='.repeat(80));

function findDuplicates() {
  // Find potential duplicates: same company, same fiscal_year, same period_type,
  // but different dates within 30 days
  const query = `
    SELECT
      f1.id as id1,
      f2.id as id2,
      c.symbol,
      f1.fiscal_date_ending as date1,
      f2.fiscal_date_ending as date2,
      f1.fiscal_year,
      f1.period_type,
      f1.statement_type,
      CAST(julianday(f1.fiscal_date_ending) - julianday(f2.fiscal_date_ending) AS INTEGER) as days_apart
    FROM financial_data f1
    JOIN financial_data f2 ON
      f1.company_id = f2.company_id
      AND f1.fiscal_year = f2.fiscal_year
      AND f1.period_type = f2.period_type
      AND f1.statement_type = f2.statement_type
      AND f1.fiscal_date_ending > f2.fiscal_date_ending
      AND ABS(julianday(f1.fiscal_date_ending) - julianday(f2.fiscal_date_ending)) <= 30
    JOIN companies c ON c.id = f1.company_id
    ORDER BY c.symbol, f1.fiscal_year DESC, f1.statement_type
  `;

  return database.prepare(query).all();
}

function removeDuplicateFinancialData(olderIds) {
  if (olderIds.length === 0) return;

  const placeholders = olderIds.map(() => '?').join(',');
  const sql = `DELETE FROM financial_data WHERE id IN (${placeholders})`;

  const result = database.prepare(sql).run(...olderIds);
  return result.changes;
}

function removeDuplicateMetrics() {
  // Find duplicate metrics (same company, same fiscal_year, different fiscal_period)
  const query = `
    SELECT
      m1.id as id1,
      m2.id as id2,
      c.symbol,
      m1.fiscal_period as date1,
      m2.fiscal_period as date2,
      m1.fiscal_year
    FROM calculated_metrics m1
    JOIN calculated_metrics m2 ON
      m1.company_id = m2.company_id
      AND m1.fiscal_year = m2.fiscal_year
      AND m1.period_type = m2.period_type
      AND m1.fiscal_period > m2.fiscal_period
      AND ABS(julianday(m1.fiscal_period) - julianday(m2.fiscal_period)) <= 30
    JOIN companies c ON c.id = m1.company_id
    ORDER BY c.symbol, m1.fiscal_year DESC
  `;

  const duplicates = database.prepare(query).all();

  if (duplicates.length === 0) return 0;

  // Remove older metrics (keep the ones with later dates)
  const olderIds = duplicates.map(d => d.id2);
  const placeholders = olderIds.map(() => '?').join(',');
  const sql = `DELETE FROM calculated_metrics WHERE id IN (${placeholders})`;

  const result = database.prepare(sql).run(...olderIds);
  return result.changes;
}

// Main execution
console.log('Step 1: Finding duplicate financial data...\n');

const duplicates = findDuplicates();

if (duplicates.length === 0) {
  console.log('✅ No duplicates found in financial_data!\n');
} else {
  console.log(`Found ${duplicates.length} duplicate financial records:\n`);

  // Group by company and display
  const byCompany = {};
  duplicates.forEach(d => {
    if (!byCompany[d.symbol]) byCompany[d.symbol] = [];
    byCompany[d.symbol].push(d);
  });

  Object.keys(byCompany).forEach(symbol => {
    console.log(`\n${symbol}:`);
    const unique = new Map();
    byCompany[symbol].forEach(d => {
      const key = `${d.fiscal_year}-${d.statement_type}`;
      if (!unique.has(key)) {
        unique.set(key, []);
      }
      unique.get(key).push(d);
    });

    unique.forEach((dups, key) => {
      if (dups.length > 0) {
        const d = dups[0];
        console.log(`  FY${d.fiscal_year} ${d.statement_type}:`);
        console.log(`    Keep:   ${d.date1} (newer)`);
        console.log(`    Remove: ${d.date2} (${Math.abs(d.days_apart)} days older)`);
      }
    });
  });

  console.log('\n' + '='.repeat(80));
  console.log('\nStep 2: Removing duplicate financial data...\n');

  // Get IDs of older records to remove
  const olderIds = duplicates.map(d => d.id2);
  const uniqueOlderIds = [...new Set(olderIds)];

  console.log(`Removing ${uniqueOlderIds.length} older financial records...`);

  const removed = removeDuplicateFinancialData(uniqueOlderIds);
  console.log(`✅ Removed ${removed} financial data records\n`);
}

console.log('='.repeat(80));
console.log('\nStep 3: Cleaning up duplicate metrics...\n');

const metricsRemoved = removeDuplicateMetrics();
if (metricsRemoved > 0) {
  console.log(`✅ Removed ${metricsRemoved} duplicate metric records\n`);
} else {
  console.log('✅ No duplicate metrics found\n');
}

console.log('='.repeat(80));
console.log('\nStep 4: Removing orphaned metrics...\n');

// Remove metrics that no longer have matching financial_data
const orphanQuery = database.prepare(`
  DELETE FROM calculated_metrics
  WHERE NOT EXISTS (
    SELECT 1 FROM financial_data f
    WHERE f.company_id = calculated_metrics.company_id
      AND f.fiscal_date_ending = calculated_metrics.fiscal_period
  )
`);

const orphansRemoved = orphanQuery.run();
if (orphansRemoved.changes > 0) {
  console.log(`✅ Removed ${orphansRemoved.changes} orphaned metric records\n`);
} else {
  console.log('✅ No orphaned metrics found\n');
}

console.log('='.repeat(80));
console.log('\n📊 SUMMARY:\n');

const stats = database.prepare(`
  SELECT
    (SELECT COUNT(*) FROM financial_data) as financial_count,
    (SELECT COUNT(*) FROM calculated_metrics) as metrics_count,
    (SELECT COUNT(*) FROM companies WHERE is_active = 1) as company_count
`).get();

console.log(`Companies: ${stats.company_count}`);
console.log(`Financial records: ${stats.financial_count}`);
console.log(`Calculated metrics: ${stats.metrics_count}`);
console.log('\n✅ Deduplication complete!\n');
console.log('Run `node calculate-all-metrics.js` to recalculate metrics.\n');
console.log('='.repeat(80) + '\n');
