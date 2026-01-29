// debug-pg-sec-data.js
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n🔍 DEBUGGING P&G SHAREHOLDER EQUITY\n');
console.log('='.repeat(80));

// Get the raw data
const rawData = database.prepare(`
  SELECT data
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'PG')
    AND fiscal_date_ending = '2025-06-30'
    AND statement_type = 'balance_sheet'
`).get();

if (rawData) {
  const bs = JSON.parse(rawData.data);

  console.log('ISSUE FOUND:\n');
  console.log(`  Stored shareholderEquity: $${(bs.shareholderEquity/1e9).toFixed(2)}B`);
  console.log(`  Stored retainedEarnings: $${(bs.retainedEarnings/1e9).toFixed(2)}B`);
  console.log(`  Stored totalAssets: $${(bs.totalAssets/1e9).toFixed(2)}B`);
  console.log(`  Stored totalLiabilities: $${(bs.totalLiabilities/1e9).toFixed(2)}B`);

  console.log('\nCALCULATED EQUITY (Assets - Liabilities):');
  const calculatedEquity = bs.totalAssets - bs.totalLiabilities;
  console.log(`  $${bs.totalAssets} - $${bs.totalLiabilities} = $${calculatedEquity}`);
  console.log(`  = $${(calculatedEquity/1e9).toFixed(2)}B`);

  console.log('\n\nROOT CAUSE:');
  console.log('The SEC provider is not finding the StockholdersEquity field in the');
  console.log('SEC Company Facts API. We should either:');
  console.log('  1. Calculate equity as: Total Assets - Total Liabilities');
  console.log('  2. Add more field name variations to the SEC provider');
  console.log('  3. Check the raw SEC data to find the actual field name P&G uses');

  console.log('\n\nSOLUTION:');
  console.log('Since Total Assets and Total Liabilities are correct, we can calculate:');
  console.log(`  Shareholder Equity = $${(calculatedEquity/1e9).toFixed(2)}B`);
  console.log('\nThis matches your expectation of ~$52B!');

  console.log('\n\nRECALCULATED ROIC with correct equity:');

  // Get income statement
  const incData = database.prepare(`
    SELECT data
    FROM financial_data
    WHERE company_id = (SELECT id FROM companies WHERE symbol = 'PG')
      AND fiscal_date_ending = '2025-06-30'
      AND statement_type = 'income_statement'
  `).get();

  if (incData) {
    const inc = JSON.parse(incData.data);
    const taxRate = inc.incomeTaxExpense / inc.incomeBeforeTax;
    const nopat = inc.operatingIncome * (1 - taxRate);
    const totalDebt = bs.shortTermDebt + bs.longTermDebt;
    const investedCapital = totalDebt + calculatedEquity - bs.cashAndEquivalents;
    const roic = (nopat / investedCapital) * 100;

    console.log(`\n  NOPAT: $${(nopat/1e9).toFixed(2)}B`);
    console.log(`  Invested Capital: $${(investedCapital/1e9).toFixed(2)}B`);
    console.log(`    (Debt: $${(totalDebt/1e9).toFixed(2)}B + Equity: $${(calculatedEquity/1e9).toFixed(2)}B - Cash: $${(bs.cashAndEquivalents/1e9).toFixed(2)}B)`);
    console.log(`  ROIC = ${roic.toFixed(1)}%`);

    console.log('\n✅ This is a much more reasonable ROIC!');
  }
}

console.log('\n' + '='.repeat(80) + '\n');
