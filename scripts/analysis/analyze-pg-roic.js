// analyze-pg-roic.js
const db = require('./src/database');
const database = db.getDatabase();

console.log('\n📊 ANALYZING PROCTER & GAMBLE (PG) - HIGH ROIC INVESTIGATION\n');
console.log('='.repeat(80));

// Get PG's metrics over time
const pgData = database.prepare(`
  SELECT
    m.fiscal_period,
    m.roic,
    m.roe,
    m.net_margin,
    m.debt_to_equity
  FROM calculated_metrics m
  JOIN companies c ON c.id = m.company_id
  WHERE c.symbol = 'PG'
  ORDER BY m.fiscal_period DESC
  LIMIT 5
`).all();

console.log('P&G Metrics Over Time:\n');
console.log('Year       | ROIC    | ROE     | Net Margin | D/E');
console.log('-'.repeat(80));
pgData.forEach(d => {
  console.log(`${d.fiscal_period} | ${(d.roic?.toFixed(1) || 'N/A').padStart(7)} | ${(d.roe?.toFixed(1) || 'N/A').padStart(7)} | ${(d.net_margin?.toFixed(1) || 'N/A').padStart(10)} | ${d.debt_to_equity?.toFixed(2) || 'N/A'}`);
});

// Get the most recent financial statements
console.log('\n\nDetailed Financial Data (Most Recent - 2025-06-30):\n');

const financials = database.prepare(`
  SELECT
    statement_type,
    data
  FROM financial_data
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'PG')
    AND fiscal_date_ending = '2025-06-30'
`).all();

const statements = {};
financials.forEach(f => {
  statements[f.statement_type] = JSON.parse(f.data);
});

if (statements.balance_sheet && statements.income_statement) {
  const bs = statements.balance_sheet;
  const inc = statements.income_statement;

  console.log('BALANCE SHEET:');
  console.log(`  Total Assets:           $${(bs.totalAssets/1e9).toFixed(2)}B`);
  console.log(`  Current Assets:         $${(bs.currentAssets/1e9).toFixed(2)}B`);
  console.log(`  Cash & Equivalents:     $${(bs.cashAndEquivalents/1e9).toFixed(2)}B`);
  console.log(`  Shareholder Equity:     $${(bs.shareholderEquity/1e9).toFixed(2)}B`);
  console.log(`  Total Liabilities:      $${(bs.totalLiabilities/1e9).toFixed(2)}B`);
  console.log(`  Long-term Debt:         $${(bs.longTermDebt/1e9).toFixed(2)}B`);
  console.log(`  Short-term Debt:        $${((bs.shortTermDebt || 0)/1e9).toFixed(2)}B`);

  console.log('\nINCOME STATEMENT:');
  console.log(`  Total Revenue:          $${(inc.totalRevenue/1e9).toFixed(2)}B`);
  console.log(`  Operating Income:       $${(inc.operatingIncome/1e9).toFixed(2)}B`);
  console.log(`  Net Income:             $${(inc.netIncome/1e9).toFixed(2)}B`);
  console.log(`  Income Before Tax:      $${(inc.incomeBeforeTax/1e9).toFixed(2)}B`);
  console.log(`  Income Tax Expense:     $${(inc.incomeTaxExpense/1e9).toFixed(2)}B`);

  // Calculate ROIC components manually
  console.log('\n\nROIC CALCULATION BREAKDOWN:\n');
  console.log('='.repeat(80));

  const taxRate = inc.incomeTaxExpense / inc.incomeBeforeTax;
  const nopat = inc.operatingIncome * (1 - taxRate);
  const totalDebt = (bs.longTermDebt || 0) + (bs.shortTermDebt || 0);
  const investedCapital = totalDebt + bs.shareholderEquity - bs.cashAndEquivalents;

  console.log('Step 1: Calculate NOPAT (Net Operating Profit After Tax)');
  console.log(`  Operating Income:       $${(inc.operatingIncome/1e9).toFixed(2)}B`);
  console.log(`  Tax Rate:               ${(taxRate * 100).toFixed(1)}%`);
  console.log(`  NOPAT:                  $${(nopat/1e9).toFixed(2)}B`);

  console.log('\nStep 2: Calculate Invested Capital');
  console.log(`  Total Debt:             $${(totalDebt/1e9).toFixed(2)}B`);
  console.log(`  + Shareholder Equity:   $${(bs.shareholderEquity/1e9).toFixed(2)}B`);
  console.log(`  - Cash & Equivalents:   $${(bs.cashAndEquivalents/1e9).toFixed(2)}B`);
  console.log(`  = Invested Capital:     $${(investedCapital/1e9).toFixed(2)}B`);

  console.log('\nStep 3: Calculate ROIC');
  const roic = (nopat / investedCapital) * 100;
  console.log(`  ROIC = NOPAT / Invested Capital`);
  console.log(`  ROIC = $${(nopat/1e9).toFixed(2)}B / $${(investedCapital/1e9).toFixed(2)}B`);
  console.log(`  ROIC = ${roic.toFixed(1)}%`);

  console.log('\n\nWHY IS ROIC SO HIGH?\n');
  console.log('='.repeat(80));

  const equityRatio = bs.shareholderEquity / bs.totalAssets;
  const debtRatio = totalDebt / bs.totalAssets;

  console.log('Key Factors:\n');
  console.log(`1. LOW INVESTED CAPITAL: $${(investedCapital/1e9).toFixed(2)}B`);
  console.log(`   - This is MUCH lower than total assets ($${(bs.totalAssets/1e9).toFixed(2)}B)`);
  console.log(`   - Equity is only $${(bs.shareholderEquity/1e9).toFixed(2)}B (${(equityRatio*100).toFixed(1)}% of assets)`);
  console.log(`   - Cash subtracts $${(bs.cashAndEquivalents/1e9).toFixed(2)}B`);

  if (bs.shareholderEquity < 20e9) {
    console.log('\n   ⚠️  VERY SMALL SHAREHOLDER EQUITY!');
    console.log(`   Shareholder Equity is only $${(bs.shareholderEquity/1e9).toFixed(2)}B`);
    console.log('   This makes the denominator tiny → ROIC appears astronomical');
  }

  console.log('\n2. MODERATE DEBT:');
  console.log(`   Total Debt: $${(totalDebt/1e9).toFixed(2)}B (${(debtRatio*100).toFixed(1)}% of assets)`);

  console.log('\n3. STRONG PROFITABILITY:');
  console.log(`   Operating Income: $${(inc.operatingIncome/1e9).toFixed(2)}B`);
  console.log(`   Operating Margin: ${(inc.operatingIncome/inc.totalRevenue*100).toFixed(1)}%`);
  console.log(`   Net Margin: ${(inc.netIncome/inc.totalRevenue*100).toFixed(1)}%`);

  console.log('\n\nEXPLANATION:\n');
  console.log('='.repeat(80));

  if (bs.shareholderEquity < 50e9 && bs.totalAssets > 100e9) {
    console.log('P&G has VERY SMALL shareholder equity relative to assets.');
    console.log('\nThis is likely due to:');
    console.log('  • Heavy share buybacks over many years');
    console.log('  • Large accumulated dividends paid to shareholders');
    console.log('  • Goodwill impairments or asset write-downs');
    console.log('  • Treasury stock repurchases');
    console.log('\nWhen equity is very small (or negative), even normal profits create');
    console.log('astronomical ROIC numbers. This makes ROIC less meaningful as a quality');
    console.log('metric for P&G.');
    console.log('\n✅ Better metrics to evaluate P&G:');
    console.log('   - ROE (Return on Equity)');
    console.log('   - Operating Margin (currently ' + (inc.operatingIncome/inc.totalRevenue*100).toFixed(1) + '%)');
    console.log('   - Free Cash Flow');
    console.log('   - Revenue growth and brand strength');
    console.log('\n📝 Note: This is common for mature companies that return cash to');
    console.log('   shareholders through dividends and buybacks rather than');
    console.log('   retaining earnings. It\'s not necessarily bad - it shows P&G');
    console.log('   is capital-efficient and doesn\'t need much equity to operate.');
  }
}

console.log('\n' + '='.repeat(80) + '\n');
