// Inspect Nvidia XBRL data for accounts receivable
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

  // Get 2023 fiscal year data (ends Jan 29, 2023) and quarterly data
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
      AND (fiscal_year = 2023 OR fiscal_date_ending LIKE '2023%')
    ORDER BY fiscal_date_ending
  `).all(company.id);

  if (financials.length === 0) {
    console.log('❌ No 2023 data found');
    console.log('\nLet me show all available dates:');
    const allDates = database.prepare(`
      SELECT DISTINCT fiscal_date_ending, fiscal_year, fiscal_period, period_type
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
      ORDER BY fiscal_date_ending DESC
    `).all(company.id);
    console.table(allDates);
    process.exit(1);
  }

  console.log(`Found ${financials.length} records for 2023:\n`);

  for (const record of financials) {
    console.log('═══════════════════════════════════════════════');
    console.log(`Date: ${record.fiscal_date_ending}`);
    console.log(`Fiscal Period: ${record.fiscal_period || 'N/A'} (${record.period_type})`);
    console.log(`Form: ${record.form || 'N/A'}`);
    console.log('');

    const data = JSON.parse(record.data);

    if (data.xbrl) {
      console.log('📊 XBRL Data Available - Looking for receivables...');

      // Get all XBRL keys
      const xbrlKeys = Object.keys(data.xbrl);
      console.log(`   Total XBRL fields: ${xbrlKeys.length}`);

      // Search for receivables
      const receivableKeys = xbrlKeys.filter(key =>
        key.toLowerCase().includes('receiv')
      );

      if (receivableKeys.length > 0) {
        console.log('\n   💰 Receivables found:');
        receivableKeys.forEach(key => {
          const value = data.xbrl[key];
          if (typeof value === 'object' && value !== null) {
            console.log(`\n   ${key}:`);
            Object.entries(value).forEach(([subKey, subValue]) => {
              if (typeof subValue === 'number') {
                console.log(`      ${subKey}: $${(subValue / 1000000).toFixed(2)}M`);
              } else {
                console.log(`      ${subKey}: ${subValue}`);
              }
            });
          } else if (typeof value === 'number') {
            console.log(`   ${key}: $${(value / 1000000).toFixed(2)}M`);
          } else {
            console.log(`   ${key}: ${value}`);
          }
        });
      } else {
        console.log('   ⚠️  No receivables found in XBRL data');
        console.log('\n   Sample XBRL keys (first 20):');
        xbrlKeys.slice(0, 20).forEach(key => {
          console.log(`      - ${key}`);
        });
      }
    } else {
      console.log('❌ No XBRL data in this record');
    }

    console.log('');
  }

  // Also check if there's quarterly data by looking for Q3
  console.log('\n🔍 Looking for Q3 2023 specifically (Oct 2023)...');
  const q3Data = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_period,
      period_type,
      data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'balance_sheet'
      AND fiscal_date_ending LIKE '2023-10%'
  `).all(company.id);

  if (q3Data.length > 0) {
    console.log(`✓ Found ${q3Data.length} Q3 2023 record(s)`);
  } else {
    console.log('ℹ️  No October 2023 data found. Nvidia fiscal year may differ from calendar year.');
    console.log('   (Nvidia fiscal year typically ends in January)');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
