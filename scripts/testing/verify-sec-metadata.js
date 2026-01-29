// verify-sec-metadata.js - Verify SEC metadata is being stored
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🔍 VERIFYING SEC METADATA STORAGE\n');
console.log('='.repeat(80));

// Get Apple's recent financial data
const data = database.prepare(`
  SELECT
    statement_type,
    fiscal_date_ending,
    fiscal_year,
    period_type,
    fiscal_period,
    form,
    filed_date
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  ORDER BY fiscal_date_ending DESC
  LIMIT 10
`).all();

console.log('\nApple (AAPL) Recent Financial Data:\n');
console.log('Statement Type      | Date       | Year | Period | Form | Filed     ');
console.log('-'.repeat(80));

data.forEach(row => {
  const stmt = row.statement_type.padEnd(18);
  const date = row.fiscal_date_ending;
  const year = row.fiscal_year || 'N/A';
  const period = row.period_type.padEnd(9);
  const fp = row.fiscal_period || 'N/A';
  const form = row.form || 'N/A';
  const filed = row.filed_date || 'N/A';

  console.log(`${stmt} | ${date} | ${year} | ${period} | ${fp.padEnd(4)} | ${form.padEnd(4)} | ${filed}`);
});

console.log('\n' + '='.repeat(80));

// Check if metadata is populated
const withMetadata = database.prepare(`
  SELECT COUNT(*) as count
  FROM financial_data
  WHERE fiscal_period IS NOT NULL
    AND form IS NOT NULL
    AND filed_date IS NOT NULL
`).get();

const total = database.prepare(`
  SELECT COUNT(*) as count FROM financial_data
`).get();

console.log('\nMetadata Coverage:\n');
console.log(`  Total records: ${total.count}`);
console.log(`  With SEC metadata: ${withMetadata.count}`);
console.log(`  Coverage: ${((withMetadata.count / total.count) * 100).toFixed(1)}%`);

if (withMetadata.count > 0) {
  console.log('\n✅ SEC metadata is being stored correctly!');
} else {
  console.log('\n⚠️  No SEC metadata found. This is expected for:');
  console.log('   - Data imported before the update');
  console.log('   - Data from non-SEC providers (e.g., Alpha Vantage)');
  console.log('\nRe-import companies to populate SEC metadata.');
}

console.log('\n' + '='.repeat(80) + '\n');
