// query-db.js
const db = require('./src/database');

console.log('\n📊 DATABASE CONTENTS\n');
console.log('='.repeat(60));

// List all companies
const companies = db.getAllCompanies();
console.log(`\n📈 Companies (${companies.length}):`);
companies.forEach(c => {
  console.log(`   ${c.symbol} - ${c.name}`);
  console.log(`      Sector: ${c.sector}`);
  console.log(`      Market Cap: $${(c.market_cap / 1e9).toFixed(2)}B`);
  console.log('');
});

// Show financial data count
const financialCounts = db.getDatabase().prepare(`
  SELECT 
    c.symbol,
    COUNT(*) as total_reports,
    MAX(f.fiscal_date_ending) as latest_date
  FROM companies c
  JOIN financial_data f ON c.id = f.company_id
  GROUP BY c.symbol
`).all();

console.log('📊 Financial Data:');
financialCounts.forEach(f => {
  console.log(`   ${f.symbol}: ${f.total_reports} reports (latest: ${f.latest_date})`);
});

console.log('\n' + '='.repeat(60) + '\n');