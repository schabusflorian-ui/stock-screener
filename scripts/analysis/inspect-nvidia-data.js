// Inspect Nvidia data structure
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

  // Get all balance sheet data to see what's available
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
    ORDER BY fiscal_date_ending DESC
    LIMIT 5
  `).all(company.id);

  console.log(`Found ${financials.length} balance sheet records\n`);

  for (const record of financials) {
    console.log('═══════════════════════════════════════════════');
    console.log(`Date: ${record.fiscal_date_ending}`);
    console.log(`Year: ${record.fiscal_year}, Quarter: ${record.fiscal_quarter || 'N/A'}`);
    console.log(`Period: ${record.period_type}${record.fiscal_period ? ' - ' + record.fiscal_period : ''}`);
    console.log(`Form: ${record.form || 'N/A'}`);
    console.log('');

    const data = JSON.parse(record.data);

    // Show all fields
    console.log('Available fields:');
    const fields = Object.keys(data);
    fields.forEach((field, index) => {
      const value = data[field];
      const displayValue = typeof value === 'number' ?
        `$${(value / 1000000).toFixed(2)}M` :
        (typeof value === 'string' && value.length > 50 ? value.substring(0, 50) + '...' : value);
      console.log(`  ${field}: ${displayValue}`);
    });

    // Look for receivables
    console.log('\n🔍 Searching for receivables-related fields:');
    const receivableFields = fields.filter(f =>
      f.toLowerCase().includes('receiv') ||
      f.toLowerCase().includes('account') && f.toLowerCase().includes('receiv')
    );

    if (receivableFields.length > 0) {
      receivableFields.forEach(field => {
        const value = data[field];
        console.log(`  ✓ ${field}: ${typeof value === 'number' ? '$' + (value / 1000000).toFixed(2) + 'M' : value}`);
      });
    } else {
      console.log('  No receivables fields found');
    }

    console.log('');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
