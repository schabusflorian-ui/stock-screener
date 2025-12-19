const db = require('./src/database');
const MetricCalculator = require('./src/services/metricCalculator');

const database = db.getDatabase();
const calculator = new MetricCalculator();

// Get AAPL data exactly like calculate-all-metrics.js does
const company = { id: database.prepare("SELECT id FROM companies WHERE symbol = 'AAPL'").get().id, symbol: 'AAPL' };

const financials = database.prepare(`
  SELECT
    fiscal_date_ending,
    fiscal_year,
    fiscal_period as fiscal_quarter,
    period_type,
    statement_type,
    data
  FROM financial_data
  WHERE company_id = ?
  ORDER BY fiscal_date_ending DESC
`).all(company.id);

console.log('Found', financials.length, 'financial records');

// Create period map like the script
function mergeFinancialStatements(financials) {
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

const periods = mergeFinancialStatements(financials);
console.log('Created', periods.length, 'period entries');

// Find annual periods
const annualPeriods = periods.filter(p => p.periodType === 'annual');
console.log('');
console.log('Annual periods found:', annualPeriods.length);
for (const p of annualPeriods.slice(0, 10)) {
  const hasAll = p.balance_sheet && p.income_statement && p.cash_flow;
  console.log(`  FY${p.fiscalYear} (${p.fiscalQuarter || 'null'}): BS=${!!p.balance_sheet}, IS=${!!p.income_statement}, CF=${!!p.cash_flow}, Complete=${hasAll}`);
}
