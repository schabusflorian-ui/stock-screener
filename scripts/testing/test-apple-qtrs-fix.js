#!/usr/bin/env node
// test-apple-qtrs-fix.js
// Test the qtrs filtering fix with Apple's 2024 data

const SECBulkImporterUnified = require('./src/bulk-import/importSECBulkUnified');
const db = require('./src/database');

async function testAppleImport() {
  console.log('\n🧪 TESTING QTRS FILTERING FIX - APPLE 2024\n');
  console.log('='.repeat(60));

  const database = db.getDatabase();
  const importer = new SECBulkImporterUnified();

  // First, check current Apple 2024 balance sheet
  console.log('\n📋 BEFORE FIX - Apple 2024 Balance Sheet:');
  console.log('-'.repeat(60));

  const before = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_period,
      form,
      LENGTH(data) as data_size,
      total_assets,
      shareholder_equity
    FROM financial_data
    WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
      AND statement_type = 'balance_sheet'
      AND fiscal_date_ending LIKE '2024%'
    ORDER BY fiscal_date_ending DESC
  `).all();

  for (const row of before) {
    console.log(`${row.fiscal_date_ending} | ${row.fiscal_period || 'N/A'} | ${row.form} | Size: ${row.data_size} bytes`);
    console.log(`  Total Assets: ${row.total_assets || 'NULL'}`);
    console.log(`  Shareholder Equity: ${row.shareholder_equity || 'NULL'}`);

    // Parse JSON to see what's in there
    const fullRow = database.prepare(`
      SELECT data FROM financial_data
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
        AND statement_type = 'balance_sheet'
        AND fiscal_date_ending = ?
    `).get(row.fiscal_date_ending);

    const data = JSON.parse(fullRow.data);
    const keys = Object.keys(data);
    console.log(`  Fields: ${keys.length} total`);
    console.log(`  Sample: ${keys.slice(0, 5).join(', ')}...`);
    console.log();
  }

  // Re-import just 2024 Q4 to test the fix
  console.log('\n🔄 RE-IMPORTING 2024Q4 with qtrs filtering fix...\n');

  const result = await importer.importQuarter(2024, 4);

  if (!result.success) {
    console.error('❌ Import failed:', result.error);
    return;
  }

  // Check Apple 2024 balance sheet after fix
  console.log('\n📋 AFTER FIX - Apple 2024 Balance Sheet:');
  console.log('-'.repeat(60));

  const after = database.prepare(`
    SELECT
      fiscal_date_ending,
      fiscal_period,
      form,
      LENGTH(data) as data_size,
      total_assets,
      shareholder_equity
    FROM financial_data
    WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
      AND statement_type = 'balance_sheet'
      AND fiscal_date_ending LIKE '2024%'
    ORDER BY fiscal_date_ending DESC
  `).all();

  for (const row of after) {
    console.log(`${row.fiscal_date_ending} | ${row.fiscal_period || 'N/A'} | ${row.form} | Size: ${row.data_size} bytes`);
    console.log(`  Total Assets: ${row.total_assets || 'NULL'}`);
    console.log(`  Shareholder Equity: ${row.shareholder_equity || 'NULL'}`);

    // Parse JSON to see what's in there
    const fullRow = database.prepare(`
      SELECT data FROM financial_data
      WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
        AND statement_type = 'balance_sheet'
        AND fiscal_date_ending = ?
    `).get(row.fiscal_date_ending);

    const data = JSON.parse(fullRow.data);
    const keys = Object.keys(data);
    console.log(`  Fields: ${keys.length} total`);
    console.log(`  Sample: ${keys.slice(0, 5).join(', ')}...`);

    // Check for specific balance sheet items
    const hasAssets = data.Assets || data.totalAssets || data.assets;
    const hasEquity = data.StockholdersEquity || data.shareholderEquity || data.equity;
    const hasLiabilities = data.Liabilities || data.totalLiabilities || data.liabilities;

    console.log(`  ✓ Has Assets: ${!!hasAssets ? 'YES' : 'NO'}`);
    console.log(`  ✓ Has Equity: ${!!hasEquity ? 'YES' : 'NO'}`);
    console.log(`  ✓ Has Liabilities: ${!!hasLiabilities ? 'YES' : 'NO'}`);
    console.log();
  }

  // Compare before and after
  console.log('\n📊 COMPARISON:');
  console.log('='.repeat(60));

  const beforeCount = before.filter(r => r.total_assets != null).length;
  const afterCount = after.filter(r => r.total_assets != null).length;

  console.log(`Before: ${beforeCount}/${before.length} periods had total_assets`);
  console.log(`After:  ${afterCount}/${after.length} periods have total_assets`);

  if (afterCount > beforeCount) {
    console.log('\n✅ SUCCESS! More balance sheet data captured after fix.');
  } else if (afterCount === beforeCount && afterCount === after.length) {
    console.log('\n✅ PERFECT! All periods now have complete balance sheet data.');
  } else {
    console.log('\n⚠️  WARNING: Fix may not be working as expected.');
  }

  console.log('\n' + '='.repeat(60));
}

testAppleImport().catch(console.error);
