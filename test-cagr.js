// Test CAGR calculations
const db = require('./src/database').getDatabase();
const MetricCalculator = require('./src/services/metricCalculator');
const SchemaManager = require('./src/utils/schemaManager');

const calculator = new MetricCalculator();
const schemaManager = new SchemaManager();

// Test AAPL annual data
const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');
const financials = db.prepare(`
  SELECT fiscal_date_ending, fiscal_year, period_type, statement_type, data
  FROM financial_data
  WHERE company_id = ? AND period_type = 'annual'
  ORDER BY fiscal_date_ending DESC
  LIMIT 6
`).all(company.id);

// Group by fiscal date
const periods = new Map();
for (const f of financials) {
  const periodKey = f.fiscal_date_ending;
  if (!periods.has(periodKey)) {
    periods.set(periodKey, {
      fiscalDateEnding: f.fiscal_date_ending,
      fiscalYear: f.fiscal_year,
      periodType: f.period_type,
      balance_sheet: null,
      income_statement: null,
      cash_flow: null
    });
  }
  const period = periods.get(periodKey);
  const data = JSON.parse(f.data);
  if (f.statement_type === 'balance_sheet') period.balance_sheet = data;
  else if (f.statement_type === 'income_statement') period.income_statement = data;
  else if (f.statement_type === 'cash_flow') period.cash_flow = data;
}

console.log('Testing CAGR Calculations for AAPL\n');
console.log('='.repeat(60));

// Calculate for first 2 annual periods
let count = 0;
for (const [date, periodData] of periods) {
  if (count >= 2) break;

  const context = {
    companyId: company.id,
    fiscalDate: periodData.fiscalDateEnding,
    periodType: periodData.periodType
  };

  const metrics = calculator.calculateAllMetrics(periodData, null, null, context, null);

  console.log(`\nAAPL FY${periodData.fiscalYear} (${date}):`);
  console.log(`  Revenue Growth YoY:   ${metrics.revenue_growth_yoy !== null ? metrics.revenue_growth_yoy.toFixed(1) + '%' : 'null'}`);
  console.log(`  Revenue CAGR 3Y:      ${metrics.revenue_cagr_3y !== null ? metrics.revenue_cagr_3y.toFixed(1) + '%' : 'null'}`);
  console.log(`  Revenue CAGR 5Y:      ${metrics.revenue_cagr_5y !== null ? metrics.revenue_cagr_5y.toFixed(1) + '%' : 'null'}`);
  console.log(`  Earnings Growth YoY:  ${metrics.earnings_growth_yoy !== null ? metrics.earnings_growth_yoy.toFixed(1) + '%' : 'null'}`);
  console.log(`  Earnings CAGR 3Y:     ${metrics.earnings_cagr_3y !== null ? metrics.earnings_cagr_3y.toFixed(1) + '%' : 'null'}`);
  console.log(`  Earnings CAGR 5Y:     ${metrics.earnings_cagr_5y !== null ? metrics.earnings_cagr_5y.toFixed(1) + '%' : 'null'}`);

  // Save to DB
  schemaManager.insertOrUpdateMetrics(company.id, date, periodData.fiscalYear, metrics, 'annual');
  count++;
}

console.log('\n' + '='.repeat(60));
console.log('\nDone! CAGR metrics calculated and stored.');
