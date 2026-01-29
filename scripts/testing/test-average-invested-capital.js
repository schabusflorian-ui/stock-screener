// Test using average invested capital (2-year average) like GuruFocus
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 ROIC with Average Invested Capital - Apple\n');
console.log('='.repeat(70));

// Get Apple company ID
const apple = database.prepare(`SELECT id FROM companies WHERE symbol = 'AAPL'`).get();

// Get FY 2024 and FY 2023 balance sheets
const fy2024 = database.prepare(`
  SELECT data
  FROM financial_data
  WHERE company_id = ?
    AND fiscal_date_ending = '2024-09-30'
    AND statement_type = 'balance_sheet'
    AND period_type = 'annual'
`).get(apple.id);

const fy2023 = database.prepare(`
  SELECT data
  FROM financial_data
  WHERE company_id = ?
    AND fiscal_date_ending = '2023-09-30'
    AND statement_type = 'balance_sheet'
    AND period_type = 'annual'
`).get(apple.id);

// Get FY 2024 income statement for NOPAT
const income2024 = database.prepare(`
  SELECT data
  FROM financial_data
  WHERE company_id = ?
    AND fiscal_date_ending = '2024-09-30'
    AND statement_type = 'income_statement'
    AND period_type = 'annual'
`).get(apple.id);

if (!fy2024 || !fy2023 || !income2024) {
  console.log('Missing data');
  process.exit(0);
}

const bs2024 = JSON.parse(fy2024.data);
const bs2023 = JSON.parse(fy2023.data);
const inc2024 = JSON.parse(income2024.data);

// Calculate NOPAT for FY 2024
const operatingIncome = parseFloat(inc2024.operatingIncome) || 0;
const netIncome = parseFloat(inc2024.netIncome) || 0;
const taxExpense = parseFloat(inc2024.incomeTaxExpense) || 0;
const incomeBeforeTax = netIncome + taxExpense;
const taxRate = incomeBeforeTax > 0 ? taxExpense / incomeBeforeTax : 0;
const nopat = operatingIncome * (1 - taxRate);

console.log('1️⃣  NOPAT (FY 2024):');
console.log('   Operating Income: $' + (operatingIncome/1e9).toFixed(2) + 'B');
console.log('   Tax Rate: ' + (taxRate * 100).toFixed(2) + '%');
console.log('   NOPAT: $' + (nopat/1e9).toFixed(2) + 'B');

// Calculate Invested Capital for both years using different methods

// METHOD 1: Debt + Equity - Cash
function calcIC_Method1(bs) {
  const equity = parseFloat(bs.shareholderEquity) || 0;
  const longTermDebt = parseFloat(bs.longTermDebt) || 0;
  const shortTermDebt = parseFloat(bs.shortTermDebt) || 0;
  const cash = parseFloat(bs.cashAndEquivalents) || parseFloat(bs.cashAndCashEquivalents) || 0;
  const totalDebt = longTermDebt + shortTermDebt;
  return totalDebt + equity - cash;
}

// METHOD 2: Total Assets - Current Liabilities (GuruFocus style)
function calcIC_Method2(bs) {
  const totalAssets = parseFloat(bs.totalAssets) || 0;
  const currentLiabilities = parseFloat(bs.currentLiabilities) || parseFloat(bs.totalCurrentLiabilities) || 0;
  return totalAssets - currentLiabilities;
}

const ic2024_m1 = calcIC_Method1(bs2024);
const ic2023_m1 = calcIC_Method1(bs2023);
const avgIC_m1 = (ic2024_m1 + ic2023_m1) / 2;

const ic2024_m2 = calcIC_Method2(bs2024);
const ic2023_m2 = calcIC_Method2(bs2023);
const avgIC_m2 = (ic2024_m2 + ic2023_m2) / 2;

console.log('\n2️⃣  METHOD 1: Debt + Equity - Cash');
console.log('   FY 2024 IC: $' + (ic2024_m1/1e9).toFixed(2) + 'B');
console.log('   FY 2023 IC: $' + (ic2023_m1/1e9).toFixed(2) + 'B');
console.log('   Average IC: $' + (avgIC_m1/1e9).toFixed(2) + 'B');
const roic_m1_single = (nopat / ic2024_m1) * 100;
const roic_m1_avg = (nopat / avgIC_m1) * 100;
console.log('   ROIC (single year): ' + roic_m1_single.toFixed(2) + '%');
console.log('   ROIC (2-yr average): ' + roic_m1_avg.toFixed(2) + '%');

console.log('\n3️⃣  METHOD 2: Assets - Current Liabilities');
console.log('   FY 2024 IC: $' + (ic2024_m2/1e9).toFixed(2) + 'B');
console.log('   FY 2023 IC: $' + (ic2023_m2/1e9).toFixed(2) + 'B');
console.log('   Average IC: $' + (avgIC_m2/1e9).toFixed(2) + 'B');
const roic_m2_single = (nopat / ic2024_m2) * 100;
const roic_m2_avg = (nopat / avgIC_m2) * 100;
console.log('   ROIC (single year): ' + roic_m2_single.toFixed(2) + '%');
console.log('   ROIC (2-yr average): ' + roic_m2_avg.toFixed(2) + '%');

console.log('\n4️⃣  COMPARISON TO GURUFOCUS:');
console.log('   GuruFocus Published: 38.29% (TTM)');
console.log('   Our Method 1 (avg): ' + roic_m1_avg.toFixed(2) + '%');
console.log('   Our Method 2 (avg): ' + roic_m2_avg.toFixed(2) + '%');
console.log('   Difference: Still ' + (roic_m2_avg - 38.29).toFixed(2) + ' percentage points too high');

console.log('\n5️⃣  HYPOTHESIS:');
console.log('   The discrepancy may be due to:');
console.log('   - GuruFocus using TTM (trailing twelve months) data');
console.log('   - Different NOPAT calculation (adjustments for leases, etc.)');
console.log('   - Excess cash calculation (not all cash is excess)');
console.log('   - Additional adjustments we are not aware of');

console.log('\n' + '='.repeat(70) + '\n');
