// scripts/import/import-capital-data.js
// Extract capital allocation data from existing financial_data table

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'stocks.db');
const db = new Database(dbPath);

// Helper to parse numeric values from JSON
function parseNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Extract value from cash flow JSON with multiple field name options
function extractValue(data, ...fieldNames) {
  for (const field of fieldNames) {
    if (data[field] !== undefined && data[field] !== null) {
      return parseNum(data[field]);
    }
  }
  return null;
}

// Calculate fiscal quarter string from date
function getFiscalQuarter(fiscalDateEnding, fiscalPeriod, periodType) {
  if (periodType === 'annual') {
    // For annual, use the year with FY suffix
    const year = fiscalDateEnding.substring(0, 4);
    return `${year}-FY`;
  }

  // For quarterly, use the fiscal period if available
  if (fiscalPeriod && fiscalPeriod.match(/Q[1-4]/)) {
    const year = fiscalDateEnding.substring(0, 4);
    return `${year}-${fiscalPeriod}`;
  }

  // Fallback: calculate quarter from date
  const date = new Date(fiscalDateEnding);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  let quarter;
  if (month <= 3) quarter = 'Q1';
  else if (month <= 6) quarter = 'Q2';
  else if (month <= 9) quarter = 'Q3';
  else quarter = 'Q4';

  return `${year}-${quarter}`;
}

// Prepare upsert statement
const upsertSummary = db.prepare(`
  INSERT INTO capital_allocation_summary (
    company_id, fiscal_quarter,
    operating_cash_flow, free_cash_flow,
    dividends_paid, buybacks_executed, capex,
    acquisitions, debt_repayment, debt_issuance,
    total_shareholder_return, shareholder_yield,
    dividend_pct_of_fcf, buyback_pct_of_fcf, capex_pct_of_revenue,
    dividend_payout_ratio, total_payout_ratio
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(company_id, fiscal_quarter) DO UPDATE SET
    operating_cash_flow = excluded.operating_cash_flow,
    free_cash_flow = excluded.free_cash_flow,
    dividends_paid = excluded.dividends_paid,
    buybacks_executed = excluded.buybacks_executed,
    capex = excluded.capex,
    acquisitions = excluded.acquisitions,
    debt_repayment = excluded.debt_repayment,
    debt_issuance = excluded.debt_issuance,
    total_shareholder_return = excluded.total_shareholder_return,
    shareholder_yield = excluded.shareholder_yield,
    dividend_pct_of_fcf = excluded.dividend_pct_of_fcf,
    buyback_pct_of_fcf = excluded.buyback_pct_of_fcf,
    capex_pct_of_revenue = excluded.capex_pct_of_revenue,
    dividend_payout_ratio = excluded.dividend_payout_ratio,
    total_payout_ratio = excluded.total_payout_ratio,
    updated_at = CURRENT_TIMESTAMP
`);

// Get all companies
const companies = db.prepare('SELECT id, symbol FROM companies').all();
console.log(`Processing ${companies.length} companies...`);

let processed = 0;
let recordsInserted = 0;

// Process in transaction for better performance
const processCompany = db.transaction((company) => {
  // Get cash flow data for company
  const cashFlowData = db.prepare(`
    SELECT
      fd.fiscal_date_ending,
      fd.fiscal_period,
      fd.period_type,
      fd.data
    FROM financial_data fd
    WHERE fd.company_id = ?
      AND fd.statement_type = 'cash_flow'
    ORDER BY fd.fiscal_date_ending DESC
  `).all(company.id);

  if (cashFlowData.length === 0) return 0;

  // Get income statement data for payout ratios
  const incomeData = db.prepare(`
    SELECT
      fd.fiscal_date_ending,
      fd.fiscal_period,
      fd.period_type,
      fd.total_revenue,
      json_extract(fd.data, '$.netIncome') as net_income,
      json_extract(fd.data, '$.NetIncomeLoss') as net_income2
    FROM financial_data fd
    WHERE fd.company_id = ?
      AND fd.statement_type = 'income_statement'
  `).all(company.id);

  // Create lookup map for income data
  const incomeMap = {};
  for (const row of incomeData) {
    const key = `${row.fiscal_date_ending}_${row.period_type}`;
    incomeMap[key] = {
      revenue: parseNum(row.total_revenue),
      netIncome: parseNum(row.net_income) || parseNum(row.net_income2)
    };
  }

  // Get market cap for shareholder yield calculation
  const companyInfo = db.prepare('SELECT market_cap FROM companies WHERE id = ?').get(company.id);
  const marketCap = parseNum(companyInfo?.market_cap);

  let count = 0;

  for (const row of cashFlowData) {
    try {
      const data = JSON.parse(row.data);
      const fiscalQuarter = getFiscalQuarter(row.fiscal_date_ending, row.fiscal_period, row.period_type);

      // Extract values from cash flow statement
      const operatingCashFlow = extractValue(data, 'operatingCashFlow', 'NetCashProvidedByUsedInOperatingActivities');
      const capex = extractValue(data, 'capitalExpenditures', 'PaymentsToAcquirePropertyPlantAndEquipment');
      const dividendsPaid = extractValue(data, 'dividends', 'PaymentsOfDividends');
      const buybacks = extractValue(data, 'stockRepurchase', 'PaymentsForRepurchaseOfCommonStock');
      const debtRepayment = extractValue(data, 'debtRepayment', 'RepaymentsOfLongTermDebt', 'RepaymentsOfDebt');
      const debtIssuance = extractValue(data, 'debtIssuance', 'ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromDebtNetOfIssuanceCosts');
      const acquisitions = extractValue(data, 'acquisitionsNet', 'PaymentsToAcquireBusinessesNetOfCashAcquired');

      // Calculate free cash flow
      let freeCashFlow = null;
      if (operatingCashFlow !== null) {
        freeCashFlow = operatingCashFlow - Math.abs(capex || 0);
      }

      // Total shareholder return (dividends + buybacks)
      let totalShareholderReturn = null;
      if (dividendsPaid !== null || buybacks !== null) {
        totalShareholderReturn = Math.abs(dividendsPaid || 0) + Math.abs(buybacks || 0);
      }

      // Calculate percentages of FCF
      let dividendPctOfFcf = null;
      let buybackPctOfFcf = null;
      if (freeCashFlow && freeCashFlow > 0) {
        if (dividendsPaid !== null) {
          dividendPctOfFcf = (Math.abs(dividendsPaid) / freeCashFlow) * 100;
        }
        if (buybacks !== null) {
          buybackPctOfFcf = (Math.abs(buybacks) / freeCashFlow) * 100;
        }
      }

      // Get income data for this period
      const incomeKey = `${row.fiscal_date_ending}_${row.period_type}`;
      const income = incomeMap[incomeKey] || {};

      // Calculate capex % of revenue
      let capexPctOfRevenue = null;
      if (capex !== null && income.revenue && income.revenue > 0) {
        capexPctOfRevenue = (Math.abs(capex) / income.revenue) * 100;
      }

      // Calculate payout ratios
      let dividendPayoutRatio = null;
      let totalPayoutRatio = null;
      if (income.netIncome && income.netIncome > 0) {
        if (dividendsPaid !== null) {
          dividendPayoutRatio = (Math.abs(dividendsPaid) / income.netIncome) * 100;
        }
        if (totalShareholderReturn !== null) {
          totalPayoutRatio = (totalShareholderReturn / income.netIncome) * 100;
        }
      }

      // Calculate shareholder yield (total return / market cap)
      let shareholderYield = null;
      if (marketCap && marketCap > 0 && totalShareholderReturn !== null) {
        // For annual data, this is the actual yield
        // For quarterly, would need to annualize
        shareholderYield = (totalShareholderReturn / marketCap) * 100;
        if (row.period_type === 'quarterly') {
          shareholderYield *= 4; // Annualize quarterly data
        }
      }

      // Insert/update record
      upsertSummary.run(
        company.id,
        fiscalQuarter,
        operatingCashFlow,
        freeCashFlow,
        dividendsPaid ? Math.abs(dividendsPaid) : null, // Store as positive
        buybacks ? Math.abs(buybacks) : null,           // Store as positive
        capex ? Math.abs(capex) : null,                 // Store as positive
        acquisitions ? Math.abs(acquisitions) : null,
        debtRepayment ? Math.abs(debtRepayment) : null,
        debtIssuance,
        totalShareholderReturn,
        shareholderYield,
        dividendPctOfFcf,
        buybackPctOfFcf,
        capexPctOfRevenue,
        dividendPayoutRatio,
        totalPayoutRatio
      );

      count++;
    } catch (err) {
      // Skip records with parse errors
      continue;
    }
  }

  return count;
});

// Process all companies
for (const company of companies) {
  try {
    const count = processCompany(company);
    recordsInserted += count;
    processed++;

    if (processed % 100 === 0) {
      console.log(`Processed ${processed}/${companies.length} companies, ${recordsInserted} records inserted`);
    }
  } catch (err) {
    console.error(`Error processing ${company.symbol}:`, err.message);
  }
}

console.log(`\nComplete!`);
console.log(`Processed: ${processed} companies`);
console.log(`Records inserted/updated: ${recordsInserted}`);

// Show sample data
console.log('\nSample data for AAPL:');
const sample = db.prepare(`
  SELECT
    fiscal_quarter,
    ROUND(operating_cash_flow/1e9, 1) as ocf_B,
    ROUND(free_cash_flow/1e9, 1) as fcf_B,
    ROUND(dividends_paid/1e9, 1) as div_B,
    ROUND(buybacks_executed/1e9, 1) as buyback_B,
    ROUND(total_shareholder_return/1e9, 1) as total_return_B,
    ROUND(dividend_payout_ratio, 1) as payout_ratio,
    ROUND(dividend_pct_of_fcf, 1) as div_pct_fcf,
    ROUND(buyback_pct_of_fcf, 1) as buyback_pct_fcf
  FROM capital_allocation_summary
  WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
  ORDER BY fiscal_quarter DESC
  LIMIT 10
`).all();

console.table(sample);

db.close();
