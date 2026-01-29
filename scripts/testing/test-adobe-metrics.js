// Test Adobe metrics calculation with the fixed grouping logic
const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');

const database = db.getDatabase();
const calculator = new MetricCalculator();

function mergeFinancialStatements(financials) {
  // Group by fiscal period (fiscal_year + fiscal_quarter + period_type)
  const periods = new Map();

  for (const f of financials) {
    const periodKey = `${f.fiscal_year}_${f.fiscal_quarter || 'FY'}_${f.period_type}`;

    if (!periods.has(periodKey)) {
      const periodType = f.period_type || 'annual';

      periods.set(periodKey, {
        fiscalDateEnding: f.fiscal_date_ending,
        fiscalYear: f.fiscal_year,
        fiscalQuarter: f.fiscal_quarter,
        periodType: periodType,
        balance_sheet: null,
        income_statement: null,
        cash_flow: null,
        dates: []
      });
    }

    const data = JSON.parse(f.data);
    const period = periods.get(periodKey);
    period.dates.push(f.fiscal_date_ending);

    if (f.statement_type === 'balance_sheet') {
      period.balance_sheet = data;
      period.fiscalDateEnding = f.fiscal_date_ending;
    } else if (f.statement_type === 'income_statement') {
      period.income_statement = data;
      if (!period.balance_sheet) {
        period.fiscalDateEnding = f.fiscal_date_ending;
      }
    } else if (f.statement_type === 'cash_flow') {
      period.cash_flow = data;
      if (!period.balance_sheet && !period.income_statement) {
        period.fiscalDateEnding = f.fiscal_date_ending;
      }
    }
  }

  return Array.from(periods.values());
}

console.log('\n📊 Testing Adobe Metrics Calculation\n');
console.log('='.repeat(60));

// Get Adobe (company_id = 43)
const financials = database.prepare(`
  SELECT
    fiscal_date_ending,
    fiscal_year,
    fiscal_period as fiscal_quarter,
    period_type,
    statement_type,
    data
  FROM financial_data
  WHERE company_id = 43
    AND fiscal_date_ending >= '2024-01-01'
  ORDER BY fiscal_date_ending DESC
`).all();

console.log(`\nFound ${financials.length} financial statements\n`);

// Show grouping
const periods = mergeFinancialStatements(financials);

console.log('Periods after grouping:\n');
for (const period of periods) {
  const hasAll = period.balance_sheet && period.income_statement && period.cash_flow;
  const metrics = hasAll ? calculator.calculateAllMetrics(period, null, null, null) : null;
  const roic = metrics ? metrics.roic : 'N/A';

  console.log(`  ${period.fiscalYear} ${period.fiscalQuarter} (${period.periodType})`);
  console.log(`    Date: ${period.fiscalDateEnding}`);
  console.log(`    Dates in period: ${period.dates.join(', ')}`);
  console.log(`    Balance Sheet: ${period.balance_sheet ? '✓' : '✗'}`);
  console.log(`    Income Statement: ${period.income_statement ? '✓' : '✗'}`);
  console.log(`    Cash Flow: ${period.cash_flow ? '✓' : '✗'}`);
  console.log(`    ROIC: ${roic}`);
  console.log('');
}

console.log('='.repeat(60));
