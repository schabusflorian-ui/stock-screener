// Get accounts receivable for Nvidia Q3 2023
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

  console.log('🔍 Found company:', company.name, `(${company.symbol})`);
  console.log('');

  // Get Q3 2023 balance sheet data
  // Q3 2023 would typically end around September 30, 2023
  const financials = database.prepare(`
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
      AND fiscal_year = 2023
    ORDER BY fiscal_date_ending DESC
  `).all(company.id);

  if (financials.length === 0) {
    console.log('❌ No 2023 financial data found for Nvidia');
    console.log('');
    console.log('Available years:');
    const years = database.prepare(`
      SELECT DISTINCT fiscal_year, COUNT(*) as count
      FROM financial_data
      WHERE company_id = ?
      GROUP BY fiscal_year
      ORDER BY fiscal_year DESC
    `).all(company.id);
    console.table(years);
    process.exit(1);
  }

  console.log('📊 Available 2023 balance sheet data:');
  console.log('');

  // Find Q3 data
  let q3Data = null;

  for (const record of financials) {
    const data = JSON.parse(record.data);

    // Look for Q3 or fiscal quarter 3
    const isQ3 = record.fiscal_quarter === 3 ||
                 record.fiscal_period === 'Q3' ||
                 (record.fiscal_date_ending && record.fiscal_date_ending.includes('2023'));

    console.log(`📅 ${record.fiscal_date_ending} (${record.period_type}${record.fiscal_period ? ' - ' + record.fiscal_period : ''})`);

    // Look for accounts receivable in various possible field names
    const possibleARFields = [
      'AccountsReceivableNetCurrent',
      'AccountsReceivableNet',
      'ReceivablesNetCurrent',
      'TradeAccountsReceivableNetCurrent',
      'accountsReceivable',
      'AccountsReceivable'
    ];

    let accountsReceivable = null;
    let fieldName = null;

    for (const field of possibleARFields) {
      if (data[field] !== undefined && data[field] !== null) {
        accountsReceivable = data[field];
        fieldName = field;
        break;
      }
    }

    if (accountsReceivable) {
      console.log(`   💰 Accounts Receivable: $${(accountsReceivable / 1000000).toFixed(2)}M`);
      console.log(`   📝 Field name: ${fieldName}`);

      if (isQ3) {
        q3Data = {
          date: record.fiscal_date_ending,
          period: record.fiscal_period,
          ar: accountsReceivable,
          fieldName: fieldName
        };
      }
    } else {
      console.log('   ⚠️  Accounts receivable not found in standard fields');
      // Show available fields
      console.log('   Available fields:', Object.keys(data).slice(0, 10).join(', '), '...');
    }
    console.log('');
  }

  // Summary
  if (q3Data) {
    console.log('═══════════════════════════════════════════════');
    console.log('✅ NVIDIA Q3 2023 ACCOUNTS RECEIVABLE');
    console.log('═══════════════════════════════════════════════');
    console.log(`Date: ${q3Data.date}`);
    console.log(`Period: ${q3Data.period || 'Q3'}`);
    console.log(`Amount: $${(q3Data.ar / 1000000).toFixed(2)} Million`);
    console.log(`Raw value: $${q3Data.ar.toLocaleString()}`);
    console.log(`Field: ${q3Data.fieldName}`);
    console.log('═══════════════════════════════════════════════');
  } else {
    console.log('⚠️  Could not identify Q3 2023 data specifically');
    console.log('Please review the data above for the closest match');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
