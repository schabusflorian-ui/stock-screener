// validate-fcf.js - Manual FCF Validation Script

const db = require('./src/database');
const database = db.getDatabase();

console.log('\n=== FREE CASH FLOW VALIDATION REPORT ===\n');

// Helper function to parse and format numbers
function formatNum(num) {
  if (!num) return 'N/A';
  const billions = num / 1e9;
  return `$${billions.toFixed(2)}B`;
}

// Companies to validate
const companies = [
  { id: 4, symbol: 'AAPL', name: 'Apple Inc.', fy: 2024, fy_end: '2024-09-30' },
  { id: 6, symbol: 'MSFT', name: 'Microsoft Corp.', fy: 2024, fy_end: '2024-06-30' },
  { id: 8, symbol: 'AMZN', name: 'Amazon.com Inc.', fy: 2023, fy_end: '2023-12-31' }
];

companies.forEach(company => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${company.symbol} - ${company.name}`);
  console.log(`Fiscal Year ${company.fy} ending ${company.fy_end}`);
  console.log('='.repeat(80));

  // Get cash flow data
  const cashFlowData = database.prepare(`
    SELECT fiscal_date_ending, period_type, operating_cashflow, capital_expenditures, data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'cash_flow'
      AND fiscal_date_ending = ?
      AND period_type = 'annual'
  `).get(company.id, company.fy_end);

  if (cashFlowData) {
    const ocf = parseFloat(cashFlowData.operating_cashflow) || 0;
    const capex = parseFloat(cashFlowData.capital_expenditures) || 0;

    console.log('\n--- SOURCE DATA (from financial_data table) ---');
    console.log(`Operating Cash Flow:  ${formatNum(ocf)}`);
    console.log(`Capital Expenditures: ${formatNum(capex)}`);
    console.log(`CapEx is stored as:   ${capex > 0 ? 'POSITIVE' : 'NEGATIVE'}`);

    // Manual calculation - Method 1: Direct subtraction
    const fcf_method1 = ocf - capex;
    console.log('\n--- MANUAL CALCULATION - Method 1 (OCF - CapEx as stored) ---');
    console.log(`FCF = ${formatNum(ocf)} - ${formatNum(capex)}`);
    console.log(`FCF = ${formatNum(fcf_method1)}`);

    // Manual calculation - Method 2: Use absolute value of CapEx
    const fcf_method2 = ocf - Math.abs(capex);
    console.log('\n--- MANUAL CALCULATION - Method 2 (OCF - |CapEx|) ---');
    console.log(`FCF = ${formatNum(ocf)} - ${formatNum(Math.abs(capex))}`);
    console.log(`FCF = ${formatNum(fcf_method2)}`);

    // Parse JSON data to see raw values
    const data = JSON.parse(cashFlowData.data);
    console.log('\n--- RAW JSON DATA ---');
    console.log(`operatingCashFlow: ${data.operatingCashFlow || data.NetCashProvidedByUsedInOperatingActivities}`);
    console.log(`capitalExpenditures: ${data.capitalExpenditures || data.PaymentsToAcquirePropertyPlantAndEquipment || data.PaymentsToAcquireProductiveAssets}`);
  }

  // Get stored calculated FCF
  const calculatedMetrics = database.prepare(`
    SELECT fiscal_period, fcf, fcf_margin, fcf_yield
    FROM calculated_metrics
    WHERE company_id = ?
      AND fiscal_period = ?
      AND (period_type = 'annual' OR period_type IS NULL)
  `).get(company.id, company.fy_end);

  if (calculatedMetrics) {
    console.log('\n--- STORED CALCULATED METRICS ---');
    console.log(`FCF (stored):   ${formatNum(calculatedMetrics.fcf)}`);
    console.log(`FCF Margin:     ${calculatedMetrics.fcf_margin}%`);
    console.log(`FCF Yield:      ${calculatedMetrics.fcf_yield}%`);

    // Compare
    if (cashFlowData) {
      const ocf = parseFloat(cashFlowData.operating_cashflow) || 0;
      const capex = parseFloat(cashFlowData.capital_expenditures) || 0;
      const expected_fcf = ocf - Math.abs(capex);
      const stored_fcf = calculatedMetrics.fcf;
      const difference = stored_fcf - expected_fcf;

      console.log('\n--- VALIDATION ---');
      console.log(`Expected FCF:   ${formatNum(expected_fcf)}`);
      console.log(`Stored FCF:     ${formatNum(stored_fcf)}`);
      console.log(`Difference:     ${formatNum(difference)}`);
      console.log(`Match:          ${Math.abs(difference) < 1000 ? '✅ YES' : '❌ NO'}`);
    }
  } else {
    console.log('\n❌ No calculated metrics found');
  }

  // Check quarterly data for annualization
  const quarterlyData = database.prepare(`
    SELECT fiscal_date_ending, fiscal_quarter, operating_cashflow, capital_expenditures
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'cash_flow'
      AND period_type = 'quarterly'
      AND fiscal_year = ?
    ORDER BY fiscal_date_ending
  `).all(company.id, company.fy);

  if (quarterlyData.length > 0) {
    console.log('\n--- QUARTERLY DATA ---');
    let total_ocf = 0;
    let total_capex = 0;
    quarterlyData.forEach(q => {
      const ocf = parseFloat(q.operating_cashflow) || 0;
      const capex = parseFloat(q.capital_expenditures) || 0;
      total_ocf += ocf;
      total_capex += capex;
      console.log(`Q${q.fiscal_quarter} (${q.fiscal_date_ending}): OCF=${formatNum(ocf)}, CapEx=${formatNum(capex)}`);
    });
    console.log(`Total from quarters: OCF=${formatNum(total_ocf)}, CapEx=${formatNum(total_capex)}`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('SUMMARY OF calculateFCF() METHOD FROM metricCalculator.js');
console.log('='.repeat(80));
console.log(`
The calculateFCF() method:
1. Parses operatingCashflow as float
2. Takes Math.abs() of capitalExpenditures (ensures positive)
3. Calculates: FCF = Operating Cash Flow - |CapEx|
4. If period_type === 'quarterly': Multiplies FCF by 4 for annualization

POTENTIAL ISSUE:
- If CapEx is already stored as POSITIVE in the database
- And we take Math.abs(positive_number) = positive_number
- Then FCF = OCF - CapEx ✅ Correct

- If CapEx is stored as NEGATIVE in the database
- And we take Math.abs(negative_number) = positive_number
- Then FCF = OCF - CapEx ✅ Also Correct

The Math.abs() ensures CapEx is always treated as a positive outflow.
`);

console.log('\n=== END OF REPORT ===\n');
