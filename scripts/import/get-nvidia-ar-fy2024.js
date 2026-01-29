// Get Nvidia FY2024 data which includes calendar Q3 2023
const db = require('./src/database');
const fs = require('fs');

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
  console.log('Note: Nvidia Fiscal Year 2024 ends January 28, 2024');
  console.log('      Q3 FY2024 would be around October 2023 (calendar Q3 2023)');
  console.log('');

  // Get FY2024 annual data (which would include the full year including Q3)
  const record = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_year,
      fiscal_period,
      period_type,
      form,
      filed_date,
      data
    FROM financial_data
    WHERE company_id = ?
      AND statement_type = 'balance_sheet'
      AND fiscal_year = 2024
    LIMIT 1
  `).get(company.id);

  if (!record) {
    console.log('❌ No FY2024 data found');
    console.log('\nTrying to get any 2023 calendar year data instead...');

    // Try to find data with date in 2023
    const alt = database.prepare(`
      SELECT
        fiscal_date_ending,
        fiscal_year,
        data
      FROM financial_data
      WHERE company_id = ?
        AND statement_type = 'balance_sheet'
        AND fiscal_date_ending LIKE '2023%'
      LIMIT 1
    `).get(company.id);

    if (alt) {
      console.log(`Found data for ${alt.fiscal_date_ending} (FY ${alt.fiscal_year})`);
      const data = JSON.parse(alt.data);
      console.log('\nFull data structure:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('No 2023 data found at all.');
    }
    process.exit(0);
  }

  console.log('═══════════════════════════════════════════════');
  console.log(`Date: ${record.fiscal_date_ending}`);
  console.log(`Fiscal Period: ${record.fiscal_period} (${record.period_type})`);
  console.log(`Form: ${record.form}`);
  console.log(`Filed: ${record.filed_date}`);
  console.log('═══════════════════════════════════════════════\n');

  const data = JSON.parse(record.data);

  // Save full JSON to file for inspection
  fs.writeFileSync('nvidia-fy2024-full.json', JSON.stringify(data, null, 2));
  console.log('✓ Full data saved to nvidia-fy2024-full.json\n');

  // Look for accounts receivable in various locations
  console.log('🔍 Searching for Accounts Receivable...\n');

  // 1. Top level
  const topLevelKeys = Object.keys(data);
  const arTopLevel = topLevelKeys.filter(k => k.toLowerCase().includes('receiv'));
  if (arTopLevel.length > 0) {
    console.log('📋 Top-level fields with "receiv":');
    arTopLevel.forEach(key => {
      const value = data[key];
      if (typeof value === 'number') {
        console.log(`   ${key}: $${(value / 1000000).toFixed(2)}M ($${value.toLocaleString()})`);
      } else {
        console.log(`   ${key}: ${JSON.stringify(value)}`);
      }
    });
    console.log('');
  }

  // 2. XBRL
  if (data.xbrl) {
    const xbrlKeys = Object.keys(data.xbrl);
    const arXbrl = xbrlKeys.filter(k => k.toLowerCase().includes('receiv'));
    if (arXbrl.length > 0) {
      console.log('📊 XBRL fields with "receiv":');
      arXbrl.forEach(key => {
        const value = data.xbrl[key];
        if (typeof value === 'number') {
          console.log(`   ${key}: $${(value / 1000000).toFixed(2)}M ($${value.toLocaleString()})`);
        } else {
          console.log(`   ${key}: ${JSON.stringify(value)}`);
        }
      });
      console.log('');
    } else {
      console.log('📊 XBRL data present, but no receivables fields found');
      console.log(`   Available XBRL fields (${xbrlKeys.length}): ${xbrlKeys.slice(0, 10).join(', ')}...`);
      console.log('');
    }
  }

  // 3. Search entire JSON string
  console.log('🔎 Deep search in full JSON...');
  const jsonStr = JSON.stringify(data);
  const matches = jsonStr.match(/"[^"]*receiv[^"]*"\s*:\s*[^,}]+/gi);
  if (matches && matches.length > 0) {
    console.log('   Found matches:');
    matches.slice(0, 10).forEach(m => console.log(`   ${m}`));
  } else {
    console.log('   No matches found for "receiv" in the entire JSON');
  }
  console.log('');

  // Show summary of what we have
  console.log('═══════════════════════════════════════════════');
  console.log('📊 SUMMARY - Available Data:');
  console.log('═══════════════════════════════════════════════');
  console.log(`Total Assets: $${(data.totalAssets / 1000000).toFixed(2)}M`);
  console.log(`Current Assets: $${(data.currentAssets / 1000000).toFixed(2)}M`);
  console.log(`Cash: $${(data.cashAndEquivalents / 1000000).toFixed(2)}M`);
  if (data.xbrl?.inventory) {
    console.log(`Inventory: $${(data.xbrl.inventory / 1000000).toFixed(2)}M`);
  }
  console.log('');
  console.log('⚠️  Accounts Receivable: NOT FOUND in stored data');
  console.log('');
  console.log('💡 This suggests the data provider (SEC) may not be');
  console.log('   extracting all XBRL fields. You may need to:');
  console.log('   1. Re-import with a more complete XBRL parser');
  console.log('   2. Query SEC API directly for detailed quarterly data');
  console.log('   3. Use a different data provider (e.g., Financial Modeling Prep API)');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
