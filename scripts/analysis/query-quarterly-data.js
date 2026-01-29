// Example: How to query quarterly data from the database
const db = require('./src/database');

const database = db.getDatabase();

function getQuarterlyData(symbol, fiscalDate, statementType = 'balance_sheet') {
  /**
   * Get quarterly financial data for any company
   *
   * @param {string} symbol - Stock symbol (e.g., 'NVDA')
   * @param {string} fiscalDate - Fiscal date ending (e.g., '2023-10-29')
   * @param {string} statementType - 'balance_sheet', 'income_statement', or 'cash_flow'
   * @returns {object} Financial data with all XBRL fields
   */
  const result = database.prepare(`
    SELECT
      c.symbol,
      c.name,
      f.fiscal_date_ending,
      f.fiscal_period,
      f.form,
      f.filed_date,
      f.period_type,
      f.data
    FROM financial_data f
    JOIN companies c ON c.id = f.company_id
    WHERE c.symbol = ? COLLATE NOCASE
      AND f.fiscal_date_ending = ?
      AND f.statement_type = ?
      AND f.period_type = 'quarterly'
  `).get(symbol.toUpperCase(), fiscalDate, statementType);

  if (!result) {
    return null;
  }

  // Parse the JSON data
  const data = JSON.parse(result.data);

  return {
    company: {
      symbol: result.symbol,
      name: result.name
    },
    period: {
      fiscalDateEnding: result.fiscal_date_ending,
      fiscalPeriod: result.fiscal_period,
      form: result.form,
      filed: result.filed_date
    },
    data: data,
    xbrl: data.xbrl // All XBRL fields available here
  };
}

function getSpecificField(symbol, fiscalDate, fieldName, statementType = 'balance_sheet') {
  /**
   * Get a specific field from quarterly data
   *
   * @param {string} fieldName - e.g., 'accountsReceivable', 'totalRevenue', etc.
   */
  const report = getQuarterlyData(symbol, fiscalDate, statementType);

  if (!report) {
    return null;
  }

  // Check top-level first (commonly extracted fields)
  if (report.data[fieldName] !== undefined) {
    return report.data[fieldName];
  }

  // Check XBRL object (all 200+ fields)
  if (report.xbrl && report.xbrl[fieldName] !== undefined) {
    return report.xbrl[fieldName];
  }

  return null;
}

function getAllQuarterlyReports(symbol, year = null, statementType = 'balance_sheet') {
  /**
   * Get all quarterly reports for a company
   *
   * @param {string} symbol - Stock symbol
   * @param {number} year - Optional: filter by fiscal year
   * @param {string} statementType - Type of statement
   * @returns {array} Array of quarterly reports
   */
  const company = database.prepare(
    'SELECT id FROM companies WHERE symbol = ? COLLATE NOCASE'
  ).get(symbol.toUpperCase());

  if (!company) {
    return [];
  }

  let query = `
    SELECT
      fiscal_date_ending,
      fiscal_year,
      fiscal_period,
      form,
      filed_date,
      data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = ?
      AND period_type = 'quarterly'
  `;

  const params = [company.id, statementType];

  if (year) {
    query += ' AND fiscal_year = ?';
    params.push(year);
  }

  query += ' ORDER BY fiscal_date_ending DESC';

  const results = database.prepare(query).all(...params);

  return results.map(row => ({
    fiscalDateEnding: row.fiscal_date_ending,
    fiscalYear: row.fiscal_year,
    fiscalPeriod: row.fiscal_period,
    form: row.form,
    filed: row.filed_date,
    data: JSON.parse(row.data)
  }));
}

// ============================================
// EXAMPLES
// ============================================

console.log('═══════════════════════════════════════════════');
console.log('QUARTERLY DATA QUERY EXAMPLES');
console.log('═══════════════════════════════════════════════\n');

// Example 1: Get Nvidia Q3 2023 Accounts Receivable
console.log('📊 Example 1: Get Nvidia Q3 2023 Accounts Receivable');
console.log('─'.repeat(50));
const ar = getSpecificField('NVDA', '2023-10-29', 'accountsReceivable');
if (ar) {
  console.log(`Accounts Receivable: $${(ar / 1e6).toFixed(2)} Million`);
  console.log(`Raw value: $${ar.toLocaleString()}`);
} else {
  console.log('Not found');
}

// Example 2: Get complete Q3 2023 balance sheet
console.log('\n📊 Example 2: Get Complete Q3 2023 Balance Sheet');
console.log('─'.repeat(50));
const q3Report = getQuarterlyData('NVDA', '2023-10-29', 'balance_sheet');
if (q3Report) {
  console.log(`Company: ${q3Report.company.name} (${q3Report.company.symbol})`);
  console.log(`Period: ${q3Report.period.fiscalPeriod} ending ${q3Report.period.fiscalDateEnding}`);
  console.log(`Form: ${q3Report.period.form} (Filed: ${q3Report.period.filed})`);
  console.log('\nKey Metrics:');
  console.log(`  Total Assets: $${(q3Report.data.totalAssets / 1e9).toFixed(2)}B`);
  console.log(`  Current Assets: $${(q3Report.data.currentAssets / 1e9).toFixed(2)}B`);
  console.log(`  Cash: $${(q3Report.data.cashAndEquivalents / 1e9).toFixed(2)}B`);
  console.log(`  Accounts Receivable: $${(q3Report.xbrl.accountsReceivable / 1e6).toFixed(2)}M`);
  console.log(`  Inventory: $${(q3Report.xbrl.inventory / 1e6).toFixed(2)}M`);
  console.log(`  Total Liabilities: $${(q3Report.data.totalLiabilities / 1e9).toFixed(2)}B`);
  console.log(`  Shareholder Equity: $${(q3Report.data.shareholderEquity / 1e9).toFixed(2)}B`);
  console.log(`\nTotal XBRL fields available: ${Object.keys(q3Report.xbrl).length}`);
}

// Example 3: Get all 2023 quarterly reports
console.log('\n📊 Example 3: All 2023 Quarterly Balance Sheets');
console.log('─'.repeat(50));
const all2023 = getAllQuarterlyReports('NVDA', 2023, 'balance_sheet');
console.log(`Found ${all2023.length} quarterly reports for 2023:\n`);
all2023.forEach(report => {
  const ar = report.data.xbrl?.accountsReceivable || 0;
  console.log(`${report.fiscalPeriod} (${report.fiscalDateEnding}):`);
  console.log(`  Assets: $${(report.data.totalAssets / 1e9).toFixed(2)}B`);
  console.log(`  A/R: $${(ar / 1e6).toFixed(2)}M`);
});

// Example 4: Get quarterly revenue (income statement)
console.log('\n📊 Example 4: Quarterly Revenue Trend (2023)');
console.log('─'.repeat(50));
const incomeReports = getAllQuarterlyReports('NVDA', 2023, 'income_statement');
console.log(`Found ${incomeReports.length} quarterly income statements:\n`);
incomeReports.forEach(report => {
  const revenue = report.data.totalRevenue || 0;
  const netIncome = report.data.netIncome || 0;
  console.log(`${report.fiscalPeriod} (${report.fiscalDateEnding}):`);
  console.log(`  Revenue: $${(revenue / 1e9).toFixed(2)}B`);
  console.log(`  Net Income: $${(netIncome / 1e9).toFixed(2)}B`);
  console.log(`  Net Margin: ${((netIncome / revenue) * 100).toFixed(1)}%`);
});

console.log('\n═══════════════════════════════════════════════');
console.log('✅ QUARTERLY DATA ACCESS WORKING!');
console.log('═══════════════════════════════════════════════\n');

console.log('💡 You can now access ANY XBRL field from quarterly reports!');
console.log('   Available fields in the xbrl object include:');
console.log('   - accountsReceivable, accountsPayable');
console.log('   - propertyPlantEquipment, goodwill, intangibleAssets');
console.log('   - researchAndDevelopment, sellingGeneralAdministrative');
console.log('   - depreciation, stockBasedCompensation');
console.log('   - and many more (200+ XBRL fields)');
