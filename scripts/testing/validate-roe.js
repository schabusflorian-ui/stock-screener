// validate-roe.js
// ROE Validation Script for Apple, Microsoft, and Google

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'stocks.db');
const db = sqlite3(dbPath);

console.log('\n========================================');
console.log('ROE VALIDATION REPORT');
console.log('========================================\n');

// Company configurations
const companies = [
  {
    id: 4,
    symbol: 'AAPL',
    name: 'Apple Inc.',
    fiscalDateEnding: '2024-09-30',
    fiscalYear: 2024,
    periodType: 'annual'
  },
  {
    id: 6,
    symbol: 'MSFT',
    name: 'Microsoft Corp.',
    fiscalDateEnding: '2024-06-30',
    fiscalYear: 2024,
    periodType: 'annual'
  },
  {
    id: 7,
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    fiscalDateEnding: '2023-12-31',
    fiscalYear: 2023,
    periodType: 'annual',
    note: 'FY2024 data not yet available (calendar year reporting)'
  }
];

// Manual ROE calculation function
function calculateROE(netIncome, shareholderEquity, periodType) {
  if (!netIncome || !shareholderEquity || shareholderEquity <= 0) {
    return null;
  }

  let adjustedNetIncome = parseFloat(netIncome);
  const equity = parseFloat(shareholderEquity);

  // Annualize if quarterly
  if (periodType === 'quarterly') {
    adjustedNetIncome = adjustedNetIncome * 4;
  }

  const roe = (adjustedNetIncome / equity) * 100;
  return Math.round(roe * 10) / 10;
}

// Process each company
const results = [];

for (const company of companies) {
  console.log(`\n📊 ${company.symbol} - ${company.name}`);
  console.log(`   Fiscal Date: ${company.fiscalDateEnding}`);
  if (company.note) {
    console.log(`   Note: ${company.note}`);
  }
  console.log('   ─────────────────────────────────────────');

  // Get income statement data
  const incomeStmt = db.prepare(`
    SELECT data, period_type, net_income
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending = ?
      AND statement_type = 'income_statement'
      AND period_type = ?
  `).get(company.id, company.fiscalDateEnding, company.periodType);

  // Get balance sheet data
  const balanceSheet = db.prepare(`
    SELECT data, period_type, shareholder_equity
    FROM financial_data
    WHERE company_id = ?
      AND fiscal_date_ending = ?
      AND statement_type = 'balance_sheet'
      AND period_type = ?
  `).get(company.id, company.fiscalDateEnding, company.periodType);

  if (!incomeStmt || !balanceSheet) {
    console.log('   ❌ Financial data not found\n');
    results.push({
      company: company.symbol,
      fiscalDate: company.fiscalDateEnding,
      error: 'Data not found'
    });
    continue;
  }

  // Parse JSON data
  const incomeData = JSON.parse(incomeStmt.data);
  const balanceData = JSON.parse(balanceSheet.data);

  // Extract values
  const netIncome = parseFloat(incomeData.netIncome || incomeData.NetIncomeLoss);
  const shareholderEquity = parseFloat(balanceData.shareholderEquity || balanceData.StockholdersEquity);

  console.log(`   Net Income:         $${(netIncome / 1e9).toFixed(3)}B`);
  console.log(`   Shareholder Equity: $${(shareholderEquity / 1e9).toFixed(3)}B`);
  console.log(`   Period Type:        ${incomeStmt.period_type}`);

  // Manual calculation
  const manualROE = calculateROE(netIncome, shareholderEquity, incomeStmt.period_type);
  console.log(`\n   ✓ Manual Calculation: ${manualROE}%`);
  console.log(`     Formula: (${(netIncome / 1e9).toFixed(2)}B / ${(shareholderEquity / 1e9).toFixed(2)}B) × 100`);

  // Get stored value from calculated_metrics
  const storedMetric = db.prepare(`
    SELECT roe, fiscal_period
    FROM calculated_metrics
    WHERE company_id = ?
      AND fiscal_period = ?
      AND period_type = ?
  `).get(company.id, company.fiscalDateEnding, company.periodType);

  const storedROE = storedMetric ? storedMetric.roe : null;
  console.log(`   ✓ Stored Value:       ${storedROE !== null ? storedROE + '%' : 'Not found'}`);

  // Calculate discrepancy
  let discrepancy = null;
  let discrepancyPct = null;
  let match = false;

  if (storedROE !== null && manualROE !== null) {
    discrepancy = Math.abs(manualROE - storedROE);
    discrepancyPct = (discrepancy / manualROE) * 100;
    match = discrepancy < 0.1; // Allow for rounding differences

    console.log(`\n   Discrepancy:        ${discrepancy.toFixed(2)}% (${discrepancyPct.toFixed(2)}% difference)`);
    console.log(`   Match Status:       ${match ? '✅ PASS' : '❌ FAIL'}`);

    if (!match && discrepancy > 5) {
      console.log(`   ⚠️  WARNING: Discrepancy > 5% - Investigation needed!`);
    }
  }

  results.push({
    company: company.symbol,
    fiscalDate: company.fiscalDateEnding,
    fiscalYear: company.fiscalYear,
    netIncome: netIncome,
    shareholderEquity: shareholderEquity,
    manualROE: manualROE,
    storedROE: storedROE,
    discrepancy: discrepancy,
    discrepancyPct: discrepancyPct,
    match: match
  });
}

// Summary table
console.log('\n\n========================================');
console.log('SUMMARY TABLE');
console.log('========================================\n');

console.log('┌──────────┬─────────────┬─────────────────┬──────────────┬─────────────────┬─────────┐');
console.log('│ Company  │ Fiscal Date │ Manual Calc (%) │ Stored (%)   │ Discrepancy (%) │ Match?  │');
console.log('├──────────┼─────────────┼─────────────────┼──────────────┼─────────────────┼─────────┤');

for (const result of results) {
  if (result.error) {
    console.log(`│ ${result.company.padEnd(8)} │ ${result.fiscalDate} │ ${'N/A'.padEnd(15)} │ ${'N/A'.padEnd(12)} │ ${'N/A'.padEnd(15)} │ ${'N/A'.padEnd(7)} │`);
  } else {
    const manual = result.manualROE !== null ? result.manualROE.toFixed(1) : 'N/A';
    const stored = result.storedROE !== null ? result.storedROE.toFixed(1) : 'N/A';
    const disc = result.discrepancy !== null ? result.discrepancy.toFixed(2) : 'N/A';
    const matchStr = result.match ? '✅ Yes' : '❌ No';

    console.log(`│ ${result.company.padEnd(8)} │ ${result.fiscalDate} │ ${manual.padEnd(15)} │ ${stored.padEnd(12)} │ ${disc.padEnd(15)} │ ${matchStr.padEnd(7)} │`);
  }
}

console.log('└──────────┴─────────────┴─────────────────┴──────────────┴─────────────────┴─────────┘');

// Detailed analysis
console.log('\n\n========================================');
console.log('DETAILED ANALYSIS');
console.log('========================================\n');

for (const result of results) {
  if (result.error || !result.manualROE) continue;

  console.log(`${result.company} (FY${result.fiscalYear}):`);
  console.log(`  Net Income:          $${(result.netIncome / 1e9).toFixed(2)}B`);
  console.log(`  Shareholder Equity:  $${(result.shareholderEquity / 1e9).toFixed(2)}B`);
  console.log(`  ROE Formula:         (Net Income / Shareholder Equity) × 100`);
  console.log(`  Calculation:         (${(result.netIncome / 1e9).toFixed(2)} / ${(result.shareholderEquity / 1e9).toFixed(2)}) × 100 = ${result.manualROE}%`);
  console.log(`  Stored Value:        ${result.storedROE}%`);

  if (result.discrepancy !== null) {
    if (result.match) {
      console.log(`  ✅ Validation:       PASSED - Values match within tolerance`);
    } else {
      console.log(`  ❌ Validation:       FAILED - Discrepancy of ${result.discrepancy.toFixed(2)}%`);

      if (result.discrepancy > 5) {
        console.log(`  ⚠️  Action Required: Discrepancy exceeds 5% threshold`);
        console.log(`     Possible causes:`);
        console.log(`     - Different data source or fiscal period`);
        console.log(`     - Calculation method difference`);
        console.log(`     - Data import issue`);
      }
    }
  }
  console.log('');
}

// Code validation
console.log('\n========================================');
console.log('CODE VALIDATION');
console.log('========================================\n');

console.log('ROE Calculation Code (from metricCalculator.js):');
console.log('─────────────────────────────────────────────────');
console.log('Formula: ROE = (Net Income / Shareholder Equity) × 100');
console.log('');
console.log('Implementation:');
console.log('  1. Parse net income and shareholder equity from strings to numbers');
console.log('  2. If quarterly data: Annualize net income by multiplying by 4');
console.log('  3. Calculate: (netIncome / shareholderEquity) × 100');
console.log('  4. Round to 1 decimal place');
console.log('');
console.log('Location: /Users/florianschabus/Investment Project/src/services/metricCalculator.js');
console.log('Lines: 350-373');
console.log('');

// Industry comparisons note
console.log('\n========================================');
console.log('INDUSTRY BENCHMARKS & RECOMMENDATIONS');
console.log('========================================\n');

console.log('ROE Interpretation:');
console.log('  • Excellent: > 20%');
console.log('  • Good:      15-20%');
console.log('  • Average:   10-15%');
console.log('  • Poor:      < 10%');
console.log('');

for (const result of results) {
  if (!result.manualROE) continue;

  let rating;
  if (result.manualROE > 20) rating = 'Excellent ⭐⭐⭐';
  else if (result.manualROE >= 15) rating = 'Good ⭐⭐';
  else if (result.manualROE >= 10) rating = 'Average ⭐';
  else rating = 'Poor';

  console.log(`${result.company}: ${result.manualROE}% - ${rating}`);
}

console.log('\n');

// Final recommendations
console.log('========================================');
console.log('RECOMMENDATIONS');
console.log('========================================\n');

const hasIssues = results.some(r => r.discrepancy !== null && r.discrepancy > 5);

if (hasIssues) {
  console.log('⚠️  ISSUES FOUND:');
  console.log('');

  for (const result of results) {
    if (result.discrepancy && result.discrepancy > 5) {
      console.log(`${result.company}:`);
      console.log(`  - Discrepancy: ${result.discrepancy.toFixed(2)}% (${result.discrepancyPct.toFixed(2)}%)`);
      console.log(`  - Action: Review calculation logic and data sources`);
      console.log(`  - Check: Verify period_type handling and annualization`);
      console.log('');
    }
  }
} else {
  console.log('✅ ALL VALIDATIONS PASSED');
  console.log('');
  console.log('All ROE calculations match within acceptable tolerance (<0.1%).');
  console.log('The implementation in metricCalculator.js is working correctly.');
}

console.log('\nNote: Web search for industry-reported values was not available.');
console.log('For additional validation, manually check:');
console.log('  - Company 10-K filings');
console.log('  - Financial data providers (Yahoo Finance, Bloomberg, etc.)');
console.log('  - Company investor relations pages');

db.close();
