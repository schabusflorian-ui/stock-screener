// Compare ROIC calculation methodologies
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 ROIC METHODOLOGY COMPARISON - Apple FY 2024\n');
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

// Parse income statement values
const operatingIncome = parseFloat(income.operatingIncome) || 0;
const netIncome = parseFloat(income.netIncome) || 0;
const taxExpense = parseFloat(income.incomeTaxExpense) || 0;

// Calculate NOPAT (same for both methods)
const incomeBeforeTax = netIncome + taxExpense;
const taxRate = incomeBeforeTax > 0 ? taxExpense / incomeBeforeTax : 0;
const nopat = operatingIncome * (1 - taxRate);

console.log('\n1️⃣  NOPAT CALCULATION (Same for both methods):');
console.log('   Operating Income: $' + (operatingIncome/1e9).toFixed(2) + 'B');
console.log('   Tax Rate: ' + (taxRate * 100).toFixed(2) + '%');
console.log('   NOPAT: $' + (nopat/1e9).toFixed(2) + 'B');

// Parse balance sheet values
const totalAssets = parseFloat(balance.totalAssets) || 0;
const totalLiabilities = parseFloat(balance.totalLiabilities) || 0;
const equity = parseFloat(balance.shareholderEquity) || 0;
const longTermDebt = parseFloat(balance.longTermDebt) || 0;
const shortTermDebt = parseFloat(balance.shortTermDebt) || 0;
const cash = parseFloat(balance.cashAndEquivalents) || parseFloat(balance.cashAndCashEquivalents) || 0;
const accountsPayable = parseFloat(balance.accountsPayable) || parseFloat(balance.currentAccountsPayable) || 0;
const accruedExpenses = parseFloat(balance.accruedExpenses) || parseFloat(balance.accruedLiabilities) || 0;
const currentLiabilities = parseFloat(balance.currentLiabilities) || parseFloat(balance.totalCurrentLiabilities) || 0;

console.log('\n2️⃣  BALANCE SHEET DATA:');
console.log('   Total Assets: $' + (totalAssets/1e9).toFixed(2) + 'B');
console.log('   Total Liabilities: $' + (totalLiabilities/1e9).toFixed(2) + 'B');
console.log('   Shareholder Equity: $' + (equity/1e9).toFixed(2) + 'B');
console.log('   Long-term Debt: $' + (longTermDebt/1e9).toFixed(2) + 'B');
console.log('   Short-term Debt: $' + (shortTermDebt/1e9).toFixed(2) + 'B');
console.log('   Cash & Equivalents: $' + (cash/1e9).toFixed(2) + 'B');
console.log('   Current Liabilities: $' + (currentLiabilities/1e9).toFixed(2) + 'B');
console.log('   Accounts Payable: $' + (accountsPayable/1e9).toFixed(2) + 'B');
console.log('   Accrued Expenses: $' + (accruedExpenses/1e9).toFixed(2) + 'B');

// METHOD 1: Our Current Formula
// IC = Total Debt + Equity - Cash
console.log('\n3️⃣  METHOD 1: Our Current Formula');
console.log('   IC = Total Debt + Equity - Cash');
const totalDebt = longTermDebt + shortTermDebt;
const investedCapital1 = totalDebt + equity - cash;
console.log('   IC = $' + (totalDebt/1e9).toFixed(2) + 'B + $' + (equity/1e9).toFixed(2) + 'B - $' + (cash/1e9).toFixed(2) + 'B');
console.log('   IC = $' + (investedCapital1/1e9).toFixed(2) + 'B');
const roic1 = (nopat / investedCapital1) * 100;
console.log('   ROIC = ' + roic1.toFixed(2) + '%');

// METHOD 2: GuruFocus Formula
// IC = Total Assets - Accounts Payable - Excess Cash
console.log('\n4️⃣  METHOD 2: GuruFocus Formula');
console.log('   IC = Total Assets - Current Liabilities');
const investedCapital2 = totalAssets - currentLiabilities;
console.log('   IC = $' + (totalAssets/1e9).toFixed(2) + 'B - $' + (currentLiabilities/1e9).toFixed(2) + 'B');
console.log('   IC = $' + (investedCapital2/1e9).toFixed(2) + 'B');
const roic2 = (nopat / investedCapital2) * 100;
console.log('   ROIC = ' + roic2.toFixed(2) + '%');

// METHOD 3: Alternative (Total Assets - Non-interest bearing liabilities)
console.log('\n5️⃣  METHOD 3: Assets minus Non-debt Current Liabilities');
console.log('   IC = Total Assets - (Current Liabilities - Short-term Debt)');
const nonDebtCurrentLiab = currentLiabilities - shortTermDebt;
const investedCapital3 = totalAssets - nonDebtCurrentLiab;
console.log('   IC = $' + (totalAssets/1e9).toFixed(2) + 'B - ($' + (currentLiabilities/1e9).toFixed(2) + 'B - $' + (shortTermDebt/1e9).toFixed(2) + 'B)');
console.log('   IC = $' + (investedCapital3/1e9).toFixed(2) + 'B');
const roic3 = (nopat / investedCapital3) * 100;
console.log('   ROIC = ' + roic3.toFixed(2) + '%');

console.log('\n6️⃣  COMPARISON:');
console.log('   Our Method (Debt+Equity-Cash): ROIC = ' + roic1.toFixed(2) + '%');
console.log('   GuruFocus Method (Assets-CL): ROIC = ' + roic2.toFixed(2) + '%');
console.log('   Alternative Method: ROIC = ' + roic3.toFixed(2) + '%');
console.log('   GuruFocus Published: 38.29% (TTM)');
console.log('   Industry Range: 38-52%');

console.log('\n7️⃣  KEY INSIGHT:');
const icDiff = investedCapital2 - investedCapital1;
console.log('   GuruFocus IC is $' + (icDiff/1e9).toFixed(2) + 'B larger');
console.log('   This explains why their ROIC is lower!');
console.log('   Ratio: ' + (investedCapital2/investedCapital1).toFixed(2) + 'x');

console.log('\n' + '='.repeat(70) + '\n');
