// Verify Apple's margin calculations for the last 3 years
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 APPLE MARGIN VERIFICATION (Last 3 Years)\n');
console.log('='.repeat(70));

// Get Apple company ID
const apple = database.prepare(`SELECT id FROM companies WHERE symbol = 'AAPL'`).get();

// Get financial data for FY 2022, 2023, 2024
const years = [
  { year: 'FY 2024', date: '2024-09-30' },
  { year: 'FY 2023', date: '2023-09-30' },
  { year: 'FY 2022', date: '2022-09-30' }
];

console.log('Apple Inc. - Profitability Margins\n');
console.log('Year      Revenue    Net Income  Operating Inc  Net Margin  Op Margin  Gross Margin');
console.log('-'.repeat(90));

for (const period of years) {
  const income = database.prepare(`
    SELECT data
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending = ?
      AND statement_type = 'income_statement'
      AND period_type = 'annual'
  `).get(apple.id, period.date);

  if (!income) {
    console.log(`${period.year.padEnd(9)} No data found`);
    continue;
  }

  const incomeData = JSON.parse(income.data);

  const revenue = parseFloat(incomeData.revenue) || 0;
  const netIncome = parseFloat(incomeData.netIncome) || 0;
  const operatingIncome = parseFloat(incomeData.operatingIncome) || 0;
  const grossProfit = parseFloat(incomeData.grossProfit) || 0;
  const costOfRevenue = parseFloat(incomeData.costOfRevenue) || 0;

  // Calculate margins
  const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
  const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;

  // Calculate gross margin (two methods to verify)
  let grossMargin = 0;
  if (grossProfit > 0 && revenue > 0) {
    grossMargin = (grossProfit / revenue) * 100;
  } else if (costOfRevenue > 0 && revenue > 0) {
    grossMargin = ((revenue - costOfRevenue) / revenue) * 100;
  }

  console.log(
    `${period.year.padEnd(9)} $${(revenue/1e9).toFixed(1).padStart(5)}B  ` +
    `$${(netIncome/1e9).toFixed(1).padStart(5)}B    ` +
    `$${(operatingIncome/1e9).toFixed(1).padStart(5)}B      ` +
    `${netMargin.toFixed(1).padStart(5)}%    ` +
    `${operatingMargin.toFixed(1).padStart(5)}%     ` +
    `${grossMargin.toFixed(1).padStart(5)}%`
  );
}

console.log('\n' + '='.repeat(70));
console.log('\nFormulas:');
console.log('  Net Margin = Net Income / Revenue × 100');
console.log('  Operating Margin = Operating Income / Revenue × 100');
console.log('  Gross Margin = Gross Profit / Revenue × 100');
console.log('              = (Revenue - Cost of Revenue) / Revenue × 100');
console.log('\n' + '='.repeat(70) + '\n');
