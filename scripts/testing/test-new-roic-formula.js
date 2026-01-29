// Test the new ROIC formula
const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');

const database = db.getDatabase();
const calculator = new MetricCalculator();

console.log('\n📊 TESTING NEW ROIC FORMULA - Apple FY 2024\n');
console.log('='.repeat(70));

// Get Apple company ID
const apple = database.prepare(`SELECT id FROM companies WHERE symbol = 'AAPL'`).get();

// Get FY 2024 financial statements
const financials = database.prepare(`
  SELECT statement_type, data
  FROM financial_data
  WHERE company_id = ?
    AND fiscal_date_ending = '2024-09-30'
    AND period_type = 'annual'
`).all(apple.id);

const statements = {};
for (const f of financials) {
  statements[f.statement_type] = JSON.parse(f.data);
}

const income = statements.income_statement || {};
const balance = statements.balance_sheet || {};

// Manual calculation with new formula
const operatingIncome = parseFloat(income.operatingIncome) || 0;
const netIncome = parseFloat(income.netIncome) || 0;
const taxExpense = parseFloat(income.incomeTaxExpense) || 0;
const incomeBeforeTax = netIncome + taxExpense;
const taxRate = incomeBeforeTax > 0 ? taxExpense / incomeBeforeTax : 0;
const nopat = operatingIncome * (1 - taxRate);

const totalAssets = parseFloat(balance.totalAssets) || 0;
const currentLiabilities = parseFloat(balance.currentLiabilities) || 0;
const shortTermDebt = parseFloat(balance.shortTermDebt) || 0;

const nonDebtCurrentLiab = currentLiabilities - shortTermDebt;
const investedCapital = totalAssets - nonDebtCurrentLiab;

const roic = (nopat / investedCapital) * 100;

console.log('1️⃣  NOPAT CALCULATION:');
console.log('   Operating Income: $' + (operatingIncome/1e9).toFixed(2) + 'B');
console.log('   Tax Rate: ' + (taxRate * 100).toFixed(2) + '%');
console.log('   NOPAT: $' + (nopat/1e9).toFixed(2) + 'B');

console.log('\n2️⃣  INVESTED CAPITAL (NEW FORMULA):');
console.log('   Total Assets: $' + (totalAssets/1e9).toFixed(2) + 'B');
console.log('   Current Liabilities: $' + (currentLiabilities/1e9).toFixed(2) + 'B');
console.log('   Short-term Debt: $' + (shortTermDebt/1e9).toFixed(2) + 'B');
console.log('   Non-debt Current Liab: $' + (nonDebtCurrentLiab/1e9).toFixed(2) + 'B');
console.log('   Invested Capital = Assets - Non-debt Current Liab');
console.log('   IC = $' + (totalAssets/1e9).toFixed(2) + 'B - $' + (nonDebtCurrentLiab/1e9).toFixed(2) + 'B');
console.log('   IC = $' + (investedCapital/1e9).toFixed(2) + 'B');

console.log('\n3️⃣  ROIC CALCULATION (NEW):');
console.log('   ROIC = NOPAT / Invested Capital');
console.log('   ROIC = $' + (nopat/1e9).toFixed(2) + 'B / $' + (investedCapital/1e9).toFixed(2) + 'B');
console.log('   ROIC = ' + roic.toFixed(2) + '%');

// Test with the calculator class
const financialData = {
  balance_sheet: balance,
  income_statement: income,
  cash_flow: statements.cash_flow
};

const calculatedROIC = calculator.calculateROIC(income, balance, 'annual');

console.log('\n4️⃣  CALCULATOR RESULT:');
console.log('   Calculator ROIC: ' + calculatedROIC + '%');

console.log('\n5️⃣  COMPARISON TO INDUSTRY:');
console.log('   Old Formula (Debt+Equity-Cash): 82.01%');
console.log('   New Formula (Assets-Non-debt CL): ' + roic.toFixed(2) + '%');
console.log('   GuruFocus Published: 38.29%');
console.log('   YCharts: 52%');
console.log('   FinanceCharts: 47.84%');
console.log('   Industry Range: 38-52%');

console.log('\n6️⃣  IMPROVEMENT:');
const improvement = 82.01 - roic;
console.log('   Decreased by: ' + improvement.toFixed(2) + ' percentage points');
console.log('   Now ' + ((roic / 52) * 100 - 100).toFixed(1) + '% relative to YCharts (52%)');

console.log('\n' + '='.repeat(70) + '\n');
