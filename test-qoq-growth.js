// Test QoQ growth calculations
const db = require('./src/database').getDatabase();
const MetricCalculator = require('./src/services/metricCalculator');
const SchemaManager = require('./src/utils/schemaManager');

const calculator = new MetricCalculator();
const schemaManager = new SchemaManager();

// Test AAPL quarterly
const company = db.prepare('SELECT id FROM companies WHERE symbol = ?').get('AAPL');
const financials = db.prepare(`
  SELECT fiscal_date_ending, fiscal_year, fiscal_period as fiscal_quarter,
         period_type, statement_type, data
  FROM financial_data
  WHERE company_id = ? AND period_type = 'quarterly'
  ORDER BY fiscal_date_ending DESC
  LIMIT 15
`).all(company.id);

// Group by period
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

console.log('Testing QoQ Growth Calculations for AAPL\n');
console.log('=' .repeat(60));

// Calculate for first 5 quarterly periods
let count = 0;
for (const [date, periodData] of periods) {
  if (count >= 5) break;

  const context = {
    companyId: company.id,
    fiscalDate: periodData.fiscalDateEnding,
    periodType: periodData.periodType
  };

  const metrics = calculator.calculateAllMetrics(periodData, null, null, context, null);

  console.log(`\nAAPL ${date}:`);
  console.log(`  Revenue Growth YoY:     ${metrics.revenue_growth_yoy !== null ? metrics.revenue_growth_yoy.toFixed(1) + '%' : 'null'}`);
  console.log(`  Revenue Growth QoQ:     ${metrics.revenue_growth_qoq !== null ? metrics.revenue_growth_qoq.toFixed(1) + '%' : 'null'}`);
  console.log(`  Earnings Growth YoY:    ${metrics.earnings_growth_yoy !== null ? metrics.earnings_growth_yoy.toFixed(1) + '%' : 'null'}`);
  console.log(`  Earnings Growth QoQ:    ${metrics.earnings_growth_qoq !== null ? metrics.earnings_growth_qoq.toFixed(1) + '%' : 'null'}`);

  // Save to DB
  schemaManager.insertOrUpdateMetrics(company.id, date, periodData.fiscalYear, metrics, 'quarterly');
  count++;
}

console.log('\n' + '=' .repeat(60));
console.log('\nDone! QoQ metrics calculated and stored.');
