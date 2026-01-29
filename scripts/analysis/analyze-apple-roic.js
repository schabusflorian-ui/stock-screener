// Analyze Apple's ROIC calculation with detailed breakdown
const db = require('./src/database');
const database = db.getDatabase();

// Get Apple company_id
const apple = database.prepare(`
  SELECT id FROM companies WHERE symbol = 'AAPL'
`).get();

if (!apple) {
  console.log('Apple not found');
  process.exit(0);
}

// Get most recent quarterly data
const financials = database.prepare(`
  SELECT
    fiscal_period,
    fiscal_year,
    period_type,
    statement_type,
    data
  FROM financial_data
  WHERE company_id = ?
    AND period_type = 'quarterly'
    AND fiscal_period = 'Q3'
    AND fiscal_year = 2024
  ORDER BY fiscal_period DESC
`).all(apple.id);

console.log('\n📊 Apple Q3 2024 ROIC Breakdown\n');
console.log('='.repeat(60));

// Parse financial statements
let income = null;
let balance = null;
let cashFlow = null;

for (const f of financials) {
  const data = JSON.parse(f.data);
  if (f.statement_type === 'income_statement') income = data;
  if (f.statement_type === 'balance_sheet') balance = data;
  if (f.statement_type === 'cash_flow') cashFlow = data;
}

if (!income || !balance) {
  console.log('Missing financial statements');
  process.exit(0);
}

// Parse values
const operatingIncome = parseFloat(income.operatingIncome || income.OperatingIncomeLoss) || 0;
const netIncome = parseFloat(income.netIncome || income.NetIncomeLoss) || 0;
const taxExpense = parseFloat(income.incomeTaxExpense || income.IncomeTaxExpenseBenefit) || 0;
const revenue = parseFloat(income.revenue || income.Revenue) || 0;

const equity = parseFloat(balance.shareholderEquity || balance.StockholdersEquity) || 0;
const longTermDebt = parseFloat(balance.longTermDebt || balance.LongTermDebt) || 0;
const shortTermDebt = parseFloat(balance.shortTermDebt || balance.ShortTermDebt) || 0;
const cash = parseFloat(balance.cashAndEquivalents || balance.CashAndCashEquivalentsAtCarryingValue) || 0;
const totalAssets = parseFloat(balance.totalAssets || balance.Assets) || 0;
const totalLiabilities = parseFloat(balance.totalLiabilities || balance.Liabilities) || 0;

console.log('\n1️⃣  INCOME STATEMENT (in millions):');
console.log('   Revenue: $' + (revenue/1e6).toFixed(0) + 'M');
console.log('   Operating Income: $' + (operatingIncome/1e6).toFixed(0) + 'M');
console.log('   Net Income: $' + (netIncome/1e6).toFixed(0) + 'M');
console.log('   Tax Expense: $' + (taxExpense/1e6).toFixed(0) + 'M');

// Calculate tax rate and NOPAT
const incomeBeforeTax = netIncome + taxExpense;
const taxRate = incomeBeforeTax !== 0 ? taxExpense / incomeBeforeTax : 0;
const nopat = operatingIncome * (1 - taxRate);

console.log('\n2️⃣  TAX CALCULATION:');
console.log('   Income Before Tax: $' + (incomeBeforeTax/1e6).toFixed(0) + 'M');
console.log('   Tax Rate: ' + (taxRate * 100).toFixed(1) + '%');
console.log('   NOPAT = Operating Income × (1 - Tax Rate)');
console.log('   NOPAT = $' + (operatingIncome/1e6).toFixed(0) + 'M × ' + ((1-taxRate)*100).toFixed(1) + '%');
console.log('   NOPAT = $' + (nopat/1e6).toFixed(0) + 'M');

console.log('\n3️⃣  BALANCE SHEET (in billions):');
console.log('   Total Assets: $' + (totalAssets/1e9).toFixed(1) + 'B');
console.log('   Total Liabilities: $' + (totalLiabilities/1e9).toFixed(1) + 'B');
console.log('   Shareholder Equity: $' + (equity/1e9).toFixed(1) + 'B');
console.log('   L + E = $' + ((totalLiabilities + equity)/1e9).toFixed(1) + 'B');
console.log('   Difference from Assets: $' + ((totalLiabilities + equity - totalAssets)/1e9).toFixed(1) + 'B');
console.log('\n   Long-term Debt: $' + (longTermDebt/1e9).toFixed(1) + 'B');
console.log('   Short-term Debt: $' + (shortTermDebt/1e9).toFixed(1) + 'B');
console.log('   Total Debt: $' + ((longTermDebt + shortTermDebt)/1e9).toFixed(1) + 'B');
console.log('   Cash: $' + (cash/1e9).toFixed(1) + 'B');

console.log('\n4️⃣  INVESTED CAPITAL CALCULATION:');
const totalDebt = longTermDebt + shortTermDebt;
const investedCapital = totalDebt + equity - cash;
console.log('   Invested Capital = Debt + Equity - Cash');
console.log('   IC = $' + (totalDebt/1e9).toFixed(1) + 'B + $' + (equity/1e9).toFixed(1) + 'B - $' + (cash/1e9).toFixed(1) + 'B');
console.log('   IC = $' + (investedCapital/1e9).toFixed(1) + 'B');

console.log('\n5️⃣  ROIC CALCULATION:');
const roic = investedCapital > 0 ? (nopat / investedCapital) * 100 : 0;
console.log('   ROIC = NOPAT / Invested Capital');
console.log('   ROIC = $' + (nopat/1e6).toFixed(0) + 'M / $' + (investedCapital/1e9).toFixed(1) + 'B');
console.log('   ROIC = $' + (nopat/1e9).toFixed(3) + 'B / $' + (investedCapital/1e9).toFixed(1) + 'B');
console.log('   ROIC = ' + roic.toFixed(1) + '%');

console.log('\n6️⃣  OTHER KEY METRICS:');
const roe = equity > 0 ? (netIncome / equity) * 100 : 0;
const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
console.log('   ROE (Net Income / Equity): ' + roe.toFixed(1) + '%');
console.log('   Operating Margin: ' + operatingMargin.toFixed(1) + '%');
console.log('   Net Margin: ' + netMargin.toFixed(1) + '%');

// Get stored ROIC from calculated_metrics
const storedMetrics = database.prepare(`
  SELECT roic, roe, operating_margin
  FROM calculated_metrics
  WHERE company_id = ?
    AND fiscal_period LIKE '2024-09-%'
    AND period_type = 'quarterly'
  LIMIT 1
`).get(apple.id);

if (storedMetrics) {
  console.log('\n7️⃣  STORED METRICS (for comparison):');
  console.log('   Stored ROIC: ' + (storedMetrics.roic || 'NULL'));
  console.log('   Stored ROE: ' + (storedMetrics.roe || 'NULL'));
  console.log('   Stored Operating Margin: ' + (storedMetrics.operating_margin || 'NULL'));
}

console.log('\n' + '='.repeat(60));
console.log('');
