// Test FCF calculation fix
const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');
const database = db.getDatabase();

console.log('\n🔧 TESTING FCF CALCULATION FIX\n');
console.log('='.repeat(70));

const testCompanies = [
  { symbol: 'AAPL', expected: 108.81, name: 'Apple' },
  { symbol: 'MSFT', expected: 74.07, name: 'Microsoft' },
  { symbol: 'AMZN', expected: 32.22, name: 'Amazon' }
];

console.log('\nCompany         Expected FCF    Calculated FCF    Status');
console.log('-'.repeat(70));

const calculator = new MetricCalculator();

for (const test of testCompanies) {
  const company = database.prepare(`SELECT id FROM companies WHERE symbol = ?`).get(test.symbol);

  if (!company) {
    console.log(`${test.name.padEnd(15)} Company not found`);
    continue;
  }

  // Get FY 2024 cash flow data
  const cashFlowData = database.prepare(`
    SELECT data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'cash_flow'
      AND period_type = 'annual'
      AND fiscal_date_ending >= '2024-01-01'
    ORDER BY fiscal_date_ending DESC
    LIMIT 1
  `).get(company.id);

  if (!cashFlowData) {
    console.log(`${test.name.padEnd(15)} No FY 2024 cash flow data`);
    continue;
  }

  const cashFlow = JSON.parse(cashFlowData.data);

  // Calculate FCF using the fixed method
  const calculatedFCF = calculator.calculateFCF(cashFlow, 'annual');

  const calculatedFCF_B = calculatedFCF / 1e9;
  const diff = Math.abs(calculatedFCF_B - test.expected);
  const status = diff < 5 ? '✅ PASS' : '❌ FAIL';

  console.log(
    `${test.name.padEnd(15)} $${test.expected.toFixed(2).padStart(6)}B      ` +
    `$${calculatedFCF_B.toFixed(2).padStart(6)}B      ${status}`
  );

  // Debug: Show the raw values
  const ocf = parseFloat(cashFlow.operatingCashFlow || cashFlow.operatingCashflow) || 0;
  const capex = Math.abs(parseFloat(cashFlow.capitalExpenditures) || 0);
  console.log(`  → OCF: $${(ocf/1e9).toFixed(2)}B, CapEx: $${(capex/1e9).toFixed(2)}B`);
}

console.log('\n' + '='.repeat(70));
console.log('\n✅ Fix applied: Added fallback for operatingCashFlow field name');
console.log('   Code now checks: cashFlow.operatingCashFlow || cashFlow.operatingCashflow\n');
