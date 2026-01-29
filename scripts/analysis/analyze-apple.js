// analyze-apple.js
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🔍 ANALYZING APPLE (AAPL) DATA FOR DUPLICATES\n');
console.log('='.repeat(80));

// Check for duplicate periods in financial_data
console.log('\n1. FINANCIAL DATA - Checking for duplicates:\n');

const financialData = database.prepare(`
  SELECT
    statement_type,
    fiscal_date_ending,
    fiscal_year,
    COUNT(*) as count
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  GROUP BY statement_type, fiscal_date_ending
  ORDER BY fiscal_date_ending DESC, statement_type
`).all();

console.log('Statement Type      | Fiscal Date  | Year | Count | Status');
console.log('-'.repeat(80));

let hasDuplicatesFinancial = false;
financialData.forEach(f => {
  const status = f.count > 1 ? '⚠️  DUPLICATE' : '✅ OK';
  if (f.count > 1) hasDuplicatesFinancial = true;
  console.log(`${f.statement_type.padEnd(19)} | ${f.fiscal_date_ending} | ${f.fiscal_year} | ${f.count}     | ${status}`);
});

if (!hasDuplicatesFinancial) {
  console.log('\n✅ No duplicates found in financial_data');
} else {
  console.log('\n⚠️  Found duplicates in financial_data!');
}

// Check for duplicate periods in calculated_metrics
console.log('\n\n2. CALCULATED METRICS - Checking for duplicates:\n');

const metricsData = database.prepare(`
  SELECT
    fiscal_period,
    period_type,
    COUNT(*) as count
  FROM calculated_metrics
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  GROUP BY fiscal_period, period_type
  ORDER BY fiscal_period DESC
`).all();

console.log('Fiscal Period | Period Type | Count | Status');
console.log('-'.repeat(80));

let hasDuplicatesMetrics = false;
metricsData.forEach(m => {
  const status = m.count > 1 ? '⚠️  DUPLICATE' : '✅ OK';
  if (m.count > 1) hasDuplicatesMetrics = true;
  console.log(`${m.fiscal_period} | ${m.period_type.padEnd(11)} | ${m.count}     | ${status}`);
});

if (!hasDuplicatesMetrics) {
  console.log('\n✅ No duplicates found in calculated_metrics');
} else {
  console.log('\n⚠️  Found duplicates in calculated_metrics!');
}

// Check for close dates that might be duplicates
console.log('\n\n3. DATE ANALYSIS - Looking for close dates:\n');

const allDates = database.prepare(`
  SELECT DISTINCT fiscal_date_ending
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  ORDER BY fiscal_date_ending DESC
`).all();

console.log(`Unique fiscal dates found: ${allDates.length}`);
console.log('Dates:', allDates.map(d => d.fiscal_date_ending).join(', '));

// Check for dates within 7 days of each other
console.log('\nChecking for dates within 7 days of each other:');
let hasCloseDates = false;
for (let i = 0; i < allDates.length - 1; i++) {
  const date1 = new Date(allDates[i].fiscal_date_ending);
  const date2 = new Date(allDates[i + 1].fiscal_date_ending);
  const diffDays = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));

  if (diffDays < 7 && diffDays > 0) {
    hasCloseDates = true;
    console.log(`⚠️  Close dates: ${allDates[i].fiscal_date_ending} and ${allDates[i + 1].fiscal_date_ending} (${diffDays.toFixed(0)} days apart)`);

    // Show the data for both dates
    const data1 = database.prepare(`
      SELECT statement_type, LENGTH(data) as size
      FROM financial_data
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
        AND fiscal_date_ending = ?
    `).all(allDates[i].fiscal_date_ending);

    const data2 = database.prepare(`
      SELECT statement_type, LENGTH(data) as size
      FROM financial_data
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
        AND fiscal_date_ending = ?
    `).all(allDates[i + 1].fiscal_date_ending);

    console.log(`   ${allDates[i].fiscal_date_ending}: ${data1.map(d => d.statement_type).join(', ')}`);
    console.log(`   ${allDates[i + 1].fiscal_date_ending}: ${data2.map(d => d.statement_type).join(', ')}`);
  }
}

if (!hasCloseDates) {
  console.log('✅ No suspiciously close dates found');
}

// Show detailed metrics view
console.log('\n\n4. DETAILED METRICS VIEW:\n');

const detailedMetrics = database.prepare(`
  SELECT
    fiscal_period,
    period_type,
    roic,
    roe,
    net_margin,
    fcf,
    debt_to_equity
  FROM calculated_metrics
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  ORDER BY fiscal_period DESC
`).all();

console.log('Fiscal Period | Type   | ROIC   | ROE     | Net Margin | FCF (B)  | D/E');
console.log('-'.repeat(80));

detailedMetrics.forEach(m => {
  const roic = m.roic !== null ? m.roic.toFixed(1) : 'N/A';
  const roe = m.roe !== null ? m.roe.toFixed(1) : 'N/A';
  const margin = m.net_margin !== null ? m.net_margin.toFixed(1) : 'N/A';
  const fcf = m.fcf !== null ? (m.fcf / 1e9).toFixed(2) : 'N/A';
  const de = m.debt_to_equity !== null ? m.debt_to_equity.toFixed(2) : 'N/A';

  console.log(
    `${m.fiscal_period} | ${m.period_type.padEnd(6)} | ` +
    `${roic.padStart(6)} | ${roe.padStart(7)} | ${margin.padStart(10)} | ` +
    `${fcf.padStart(8)} | ${de}`
  );
});

// Summary
console.log('\n\n' + '='.repeat(80));
console.log('SUMMARY:\n');
console.log(`Financial Data Duplicates: ${hasDuplicatesFinancial ? '⚠️  YES' : '✅ NO'}`);
console.log(`Metrics Duplicates: ${hasDuplicatesMetrics ? '⚠️  YES' : '✅ NO'}`);
console.log(`Close Dates (potential duplicates): ${hasCloseDates ? '⚠️  YES' : '✅ NO'}`);
console.log(`Total unique periods: ${allDates.length}`);
console.log(`Total metrics records: ${detailedMetrics.length}`);
console.log('='.repeat(80) + '\n');
