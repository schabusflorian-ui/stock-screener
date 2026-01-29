// Analyze Adobe's balance sheet structure to understand the Assets discrepancy
const db = require('./src/database');
const database = db.getDatabase();

// Get raw Adobe balance sheet
const bs = database.prepare(`
  SELECT data
  FROM financial_data
  WHERE company_id = 43
    AND statement_type = 'balance_sheet'
    AND fiscal_date_ending = '2024-08-31'
`).get();

if (!bs) {
  console.log('No balance sheet found');
  process.exit(0);
}

const data = JSON.parse(bs.data);

// Calculate expected total assets from components
const currentAssets = parseFloat(data.currentAssets || data.AssetsCurrent) || 0;
const noncurrentAssets = parseFloat(data.noncurrentAssets || data.AssetsNoncurrent) || 0;
const reportedAssets = parseFloat(data.totalAssets || data.Assets) || 0;

// Also check liabilities + equity
const totalLiab = parseFloat(data.totalLiabilities || data.Liabilities) || 0;
const equity = parseFloat(data.shareholderEquity || data.StockholdersEquity) || 0;

console.log('\n📊 Adobe Q3 2024 Balance Sheet Structure\n');
console.log('='.repeat(60));

console.log('\n💰 ASSETS:');
console.log('   Current Assets: $' + (currentAssets/1e9).toFixed(3) + 'B');
console.log('   Non-current Assets: $' + (noncurrentAssets/1e9).toFixed(3) + 'B');
console.log('   Sum: $' + ((currentAssets + noncurrentAssets)/1e9).toFixed(3) + 'B');
console.log('   Reported Total Assets: $' + (reportedAssets/1e9).toFixed(3) + 'B');

if (noncurrentAssets === 0) {
  console.log('\n   ⚠️  WARNING: Non-current assets = 0');
  console.log('   This suggests the import is missing non-current asset data!');
}

console.log('\n📋 LIABILITIES + EQUITY:');
console.log('   Total Liabilities: $' + (totalLiab/1e9).toFixed(3) + 'B');
console.log('   Shareholder Equity: $' + (equity/1e9).toFixed(3) + 'B');
console.log('   Sum (L+E): $' + ((totalLiab + equity)/1e9).toFixed(3) + 'B');

console.log('\n⚖️  ACCOUNTING EQUATION CHECK:');
console.log('   Assets should equal L+E');
console.log('   Difference: $' + ((totalLiab + equity - reportedAssets)/1e9).toFixed(3) + 'B');

// Show all keys
console.log('\n🔑 All Keys in Balance Sheet Data:');
const keys = Object.keys(data).filter(k => !k.match(/^[A-Z]/)); // Show canonical names
keys.forEach(k => {
  const val = parseFloat(data[k]) || 0;
  if (val > 1e9) {
    console.log('   ' + k + ': $' + (val/1e9).toFixed(3) + 'B');
  }
});

console.log('\n' + '='.repeat(60));
console.log('');
