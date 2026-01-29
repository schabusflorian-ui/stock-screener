// Verify Apple ROIC calculation step by step
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 APPLE FY 2024 ROIC VERIFICATION\n');
console.log('='.repeat(70));

// Get Apple company ID
const apple = database.prepare(`SELECT id FROM companies WHERE symbol = 'AAPL'`).get();

// Get FY 2024 financial statements (ending Sep 30, 2024)
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

console.log('\n1️⃣  INCOME STATEMENT (FY 2024):');
console.log('   Operating Income: $' + (parseFloat(income.operatingIncome)/1e9).toFixed(2) + 'B');
console.log('   Net Income: $' + (parseFloat(income.netIncome)/1e9).toFixed(2) + 'B');
console.log('   Income Tax Expense: $' + (parseFloat(income.incomeTaxExpense)/1e9).toFixed(2) + 'B');

const operatingIncome = parseFloat(income.operatingIncome) || 0;
const netIncome = parseFloat(income.netIncome) || 0;
const taxExpense = parseFloat(income.incomeTaxExpense) || 0;
const incomeBeforeTax = netIncome + taxExpense;
const taxRate = incomeBeforeTax > 0 ? taxExpense / incomeBeforeTax : 0;

console.log('\n2️⃣  TAX RATE CALCULATION:');
console.log('   Income Before Tax: $' + (incomeBeforeTax/1e9).toFixed(2) + 'B');
console.log('   Tax Rate: ' + (taxRate * 100).toFixed(2) + '%');

const nopat = operatingIncome * (1 - taxRate);
console.log('   NOPAT = Operating Income × (1 - Tax Rate)');
console.log('   NOPAT = $' + (operatingIncome/1e9).toFixed(2) + 'B × ' + ((1-taxRate)*100).toFixed(2) + '%');
console.log('   NOPAT = $' + (nopat/1e9).toFixed(2) + 'B');

console.log('\n3️⃣  BALANCE SHEET (FY 2024):');
console.log('   Total Assets: $' + (parseFloat(balance.totalAssets)/1e9).toFixed(2) + 'B');
console.log('   Total Liabilities: $' + (parseFloat(balance.totalLiabilities)/1e9).toFixed(2) + 'B');
console.log('   Shareholder Equity: $' + (parseFloat(balance.shareholderEquity)/1e9).toFixed(2) + 'B');

const equity = parseFloat(balance.shareholderEquity) || 0;
const longTermDebt = parseFloat(balance.longTermDebt) || 0;
const shortTermDebt = parseFloat(balance.shortTermDebt) || 0;
const cash = parseFloat(balance.cashAndEquivalents) || parseFloat(balance.cashAndCashEquivalents) || 0;

console.log('   Long-term Debt: $' + (longTermDebt/1e9).toFixed(2) + 'B');
console.log('   Short-term Debt: $' + (shortTermDebt/1e9).toFixed(2) + 'B');
console.log('   Cash & Equivalents: $' + (cash/1e9).toFixed(2) + 'B');

console.log('\n4️⃣  INVESTED CAPITAL CALCULATION:');
const totalDebt = longTermDebt + shortTermDebt;
const investedCapital = totalDebt + equity - cash;
console.log('   Total Debt = $' + (totalDebt/1e9).toFixed(2) + 'B');
console.log('   Invested Capital = Debt + Equity - Cash');
console.log('   IC = $' + (totalDebt/1e9).toFixed(2) + 'B + $' + (equity/1e9).toFixed(2) + 'B - $' + (cash/1e9).toFixed(2) + 'B');
console.log('   IC = $' + (investedCapital/1e9).toFixed(2) + 'B');

console.log('\n5️⃣  ROIC CALCULATION:');
const roic = (nopat / investedCapital) * 100;
console.log('   ROIC = NOPAT / Invested Capital');
console.log('   ROIC = $' + (nopat/1e9).toFixed(2) + 'B / $' + (investedCapital/1e9).toFixed(2) + 'B');
console.log('   ROIC = ' + roic.toFixed(2) + '%');

// Get stored ROIC
const stored = database.prepare(`
  SELECT roic
  FROM calculated_metrics
  WHERE company_id = ?
    AND fiscal_date_ending = '2024-09-30'
    AND period_type = 'annual'
`).get(apple.id);

console.log('\n6️⃣  COMPARISON:');
console.log('   Calculated ROIC: ' + roic.toFixed(2) + '%');
console.log('   Stored ROIC: ' + (stored?.roic || 'N/A'));
console.log('   Industry Average (web): ~38-52%');
console.log('   Discrepancy: ' + ((stored?.roic || 0) - roic).toFixed(2) + ' percentage points');

console.log('\n' + '='.repeat(70) + '\n');
