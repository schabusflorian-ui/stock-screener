#!/usr/bin/env node
// test-apple-roic.js
// Test ROIC calculation for Apple 2024 after qtrs fix

const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');
const SchemaManager = require('./src/utils/schemaManager');

const database = db.getDatabase();
const calculator = new MetricCalculator();
const schemaManager = new SchemaManager(database);

console.log('\n🧮 TESTING ROIC CALCULATION - APPLE 2024\n');
console.log('='.repeat(60));

// Get Apple's company ID
const apple = database.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');

if (!apple) {
  console.error('❌ Apple not found in database');
  process.exit(1);
}

// Get 2024 fiscal year end financial statements
const financials = database.prepare(`
  SELECT
    fiscal_date_ending,
    fiscal_year,
    fiscal_period,
    period_type,
    statement_type,
    data,
    total_assets,
    shareholder_equity,
    total_revenue,
    net_income,
    operating_income,
    operating_cashflow
  FROM financial_data
  WHERE company_id = ?
    AND fiscal_date_ending = '2024-09-30'
  ORDER BY statement_type
`).all(apple.id);

console.log(`\nFound ${financials.length} financial statements for 2024-09-30:\n`);

// Group by statement type
const statements = {
  balance_sheet: null,
  income_statement: null,
  cash_flow: null
};

for (const f of financials) {
  console.log(`${f.statement_type.toUpperCase()}:`);
  console.log(`  Period: ${f.fiscal_period} ${f.period_type}`);

  if (f.statement_type === 'balance_sheet') {
    console.log(`  Total Assets: $${(f.total_assets / 1e9).toFixed(2)}B`);
    console.log(`  Shareholder Equity: $${(f.shareholder_equity / 1e9).toFixed(2)}B`);
  } else if (f.statement_type === 'income_statement') {
    console.log(`  Total Revenue: $${(f.total_revenue / 1e9).toFixed(2)}B`);
    console.log(`  Net Income: $${(f.net_income / 1e9).toFixed(2)}B`);
    console.log(`  Operating Income: $${(f.operating_income / 1e9).toFixed(2)}B`);
  } else if (f.statement_type === 'cash_flow') {
    console.log(`  Operating Cash Flow: $${(f.operating_cashflow / 1e9).toFixed(2)}B`);
  }

  statements[f.statement_type] = JSON.parse(f.data);
  console.log();
}

// Check if we have all three statements
const hasAll = statements.balance_sheet && statements.income_statement && statements.cash_flow;

if (!hasAll) {
  console.error('❌ Missing statements. Cannot calculate ROIC.');
  console.log('Available:', Object.keys(statements).filter(k => statements[k] !== null));
  process.exit(1);
}

// Create period data for calculator
const periodData = {
  fiscalDateEnding: '2024-09-30',
  fiscalYear: 2024,
  fiscalQuarter: 'FY',
  periodType: 'annual',
  balance_sheet: statements.balance_sheet,
  income_statement: statements.income_statement,
  cash_flow: statements.cash_flow
};

// Calculate metrics
console.log('📊 CALCULATING METRICS...\n');
console.log('='.repeat(60));

try {
  const context = {
    companyId: apple.id,
    fiscalDate: '2024-09-30',
    periodType: 'annual'
  };

  const metrics = calculator.calculateAllMetrics(
    periodData,
    null, // marketCap
    null, // currentPrice
    context
  );

  console.log('\n✅ CALCULATED METRICS:\n');
  console.log(`ROIC: ${metrics.roic ? metrics.roic.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROCE: ${metrics.roce ? metrics.roce.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROE: ${metrics.roe ? metrics.roe.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROA: ${metrics.roa ? metrics.roa.toFixed(2) + '%' : 'NULL'}`);
  console.log(`\nDebt to Equity: ${metrics.debtToEquity ? metrics.debtToEquity.toFixed(2) : 'NULL'}`);
  console.log(`Quick Ratio: ${metrics.quickRatio ? metrics.quickRatio.toFixed(2) : 'NULL'}`);
  console.log(`Current Ratio: ${metrics.currentRatio ? metrics.currentRatio.toFixed(2) : 'NULL'}`);

  // Save to database
  console.log('\n💾 SAVING TO DATABASE...\n');

  schemaManager.insertOrUpdateMetrics(
    apple.id,
    '2024-09-30',
    2024,
    metrics,
    'annual'
  );

  console.log('✅ Metrics saved successfully!\n');

  // Verify in database
  const saved = database.prepare(`
    SELECT roic, roce, roe, roa, debt_to_equity, quick_ratio, current_ratio
    FROM calculated_metrics
    WHERE company_id = ? AND fiscal_period = '2024-09-30' AND period_type = 'annual'
  `).get(apple.id);

  console.log('📋 VERIFIED FROM DATABASE:\n');
  console.log(`ROIC: ${saved.roic ? saved.roic.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROCE: ${saved.roce ? saved.roce.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROE: ${saved.roe ? saved.roe.toFixed(2) + '%' : 'NULL'}`);
  console.log(`ROA: ${saved.roa ? saved.roa.toFixed(2) + '%' : 'NULL'}`);
  console.log(`\nDebt to Equity: ${saved.debt_to_equity ? saved.debt_to_equity.toFixed(2) : 'NULL'}`);
  console.log(`Quick Ratio: ${saved.quick_ratio ? saved.quick_ratio.toFixed(2) : 'NULL'}`);
  console.log(`Current Ratio: ${saved.current_ratio ? saved.current_ratio.toFixed(2) : 'NULL'}`);

  if (saved.roic && saved.roic > 0) {
    console.log('\n\n🎉 SUCCESS! ROIC is now calculated for Apple 2024!\n');
    console.log('The qtrs filtering fix is working correctly.\n');
  } else {
    console.log('\n\n⚠️  ROIC is still NULL. Further investigation needed.\n');
  }

} catch (error) {
  console.error('❌ Error calculating metrics:', error.message);
  console.error(error.stack);
  process.exit(1);
}

console.log('='.repeat(60));
