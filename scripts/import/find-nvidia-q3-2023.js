// Find Nvidia Q3 2023 data
const db = require('./src/database');

const database = db.getDatabase();

try {
  // Get Nvidia company
  const company = database.prepare(
    'SELECT id, symbol, name FROM companies WHERE symbol = ? COLLATE NOCASE'
  ).get('NVDA');

  if (!company) {
    console.log('❌ Nvidia (NVDA) not found in database');
    process.exit(1);
  }

  console.log('🔍 Company:', company.name, `(${company.symbol})`);
  console.log('');
  console.log('Note: Nvidia fiscal year ends in January, so:');
  console.log('  - FY 2024 ends Jan 28, 2024 (calendar Q4 2023/Q1 2024)');
  console.log('  - Q3 FY 2024 would be around Oct 29, 2023 (calendar Q3 2023)');
  console.log('');

  // Get all available data to understand what we have
  console.log('📊 All available balance sheet data:');
  const allData = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_year,
      fiscal_quarter,
      fiscal_period,
      period_type,
      form,
      filed_date
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'balance_sheet'
    ORDER BY fiscal_date_ending DESC
  `).all(company.id);

  console.table(allData);
  console.log('');

  // Look for data around Q3 2023 (calendar year) or Q3 FY2024
  console.log('🔍 Looking for Q3 2023 data (fiscal or calendar)...');

  const q3Candidates = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_year,
      fiscal_quarter,
      fiscal_period,
      period_type,
      form,
      data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'balance_sheet'
      AND (
        (fiscal_date_ending BETWEEN '2023-07-01' AND '2023-11-30')
        OR (fiscal_quarter = 3 AND fiscal_year IN (2023, 2024))
        OR fiscal_period = 'Q3'
      )
    ORDER BY fiscal_date_ending DESC
  `).all(company.id);

  if (q3Candidates.length === 0) {
    console.log('❌ No Q3 2023 data found');
    console.log('');
    console.log('💡 Available quarterly data:');
    const quarterly = database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        fiscal_quarter,
        fiscal_period,
        period_type
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
        AND period_type = 'quarterly'
      ORDER BY fiscal_date_ending DESC
      LIMIT 10
    `).all(company.id);
    console.table(quarterly);
  } else {
    console.log(`✓ Found ${q3Candidates.length} potential Q3 2023 record(s):\n`);

    for (const record of q3Candidates) {
      console.log('═══════════════════════════════════════════════');
      console.log(`Date: ${record.fiscal_date_ending}`);
      console.log(`Fiscal Year: ${record.fiscal_year}, Quarter: ${record.fiscal_quarter || 'N/A'}`);
      console.log(`Period: ${record.fiscal_period || 'N/A'} (${record.period_type})`);
      console.log(`Form: ${record.form || 'N/A'}`);

      const data = JSON.parse(record.data);

      // Look for accounts receivable in the full JSON
      console.log('\n📋 Looking for Accounts Receivable...');

      // Check all possible locations
      const fullDataStr = JSON.stringify(data, null, 2);
      const receivableMatches = fullDataStr.match(/receiv[^"]*":([^,}]+)/gi);

      if (receivableMatches) {
        console.log('✓ Found receivable-related fields:');
        receivableMatches.forEach(match => console.log(`   ${match}`));
      }

      // Check if there's detailed XBRL with receivables
      if (data.xbrl) {
        const xbrlKeys = Object.keys(data.xbrl);
        const arKey = xbrlKeys.find(k =>
          k.toLowerCase().includes('accountsreceivable') ||
          k.toLowerCase().includes('receivable')
        );

        if (arKey) {
          console.log(`\n💰 Accounts Receivable found in XBRL.${arKey}:`);
          console.log(`   Value: $${(data.xbrl[arKey] / 1000000).toFixed(2)}M`);
          console.log(`   Raw: $${data.xbrl[arKey].toLocaleString()}`);
        } else {
          console.log('\n   Available XBRL fields:', xbrlKeys.join(', '));
        }
      }

      // Check extracted fields
      if (data.accountsReceivable || data.AccountsReceivable || data.accountsReceivableNet) {
        const ar = data.accountsReceivable || data.AccountsReceivable || data.accountsReceivableNet;
        console.log(`\n💰 Accounts Receivable (top-level):`);
        console.log(`   Value: $${(ar / 1000000).toFixed(2)}M`);
        console.log(`   Raw: $${ar.toLocaleString()}`);
      }

      console.log('\n');
    }
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
