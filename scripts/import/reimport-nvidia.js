// Re-import Nvidia with the new quarterly data support
const SECProvider = require('./src/providers/SECProvider');
const StockImporter = require('./src/services/stockImporter');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('RE-IMPORTING NVIDIA WITH QUARTERLY DATA SUPPORT');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // Initialize provider and importer
    const provider = new SECProvider();
    const importer = new StockImporter(provider);

    console.log('✅ Provider and importer initialized\n');

    // Re-import Nvidia
    const result = await importer.importStock('NVDA');

    if (result.success) {
      console.log('\n✅ IMPORT SUCCESSFUL!');
      console.log('═══════════════════════════════════════════════');
      console.log('📊 Import Statistics:');
      console.log(`   Company ID: ${result.companyId}`);
      console.log(`   Reports Stored: ${result.financialsCount}`);
      console.log(`   Duration: ${result.duration}s`);
      console.log(`   Source: ${result.source}`);
      console.log('═══════════════════════════════════════════════\n');

      // Verify the data
      console.log('🔍 Verifying quarterly data...\n');
      const db = require('./src/database').getDatabase();

      // Count quarterly records
      const quarterlyCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM financial_data
        WHERE company_id = ?
          AND period_type = 'quarterly'
      `).get(result.companyId);

      console.log(`✅ Quarterly records stored: ${quarterlyCount.count}`);

      // Check for Q3 2023
      const q3_2023 = db.prepare(`
        SELECT
          fiscal_date_ending,
          fiscal_period,
          form,
          statement_type
        FROM financial_data
        WHERE company_id = ?
          AND fiscal_date_ending = '2023-10-29'
          AND period_type = 'quarterly'
        ORDER BY statement_type
      `).all(result.companyId);

      if (q3_2023.length > 0) {
        console.log(`✅ Q3 2023 data found: ${q3_2023.length} statements`);
        q3_2023.forEach(record => {
          console.log(`   - ${record.statement_type} (${record.form}, ${record.fiscal_period})`);
        });

        // Get balance sheet and check for accounts receivable
        const balanceSheet = db.prepare(`
          SELECT data
          FROM financial_data
          WHERE company_id = ?
            AND fiscal_date_ending = '2023-10-29'
            AND statement_type = 'balance_sheet'
            AND period_type = 'quarterly'
        `).get(result.companyId);

        if (balanceSheet) {
          const data = JSON.parse(balanceSheet.data);
          console.log('\n📊 Q3 2023 Balance Sheet Data:');
          console.log(`   Total Assets: $${(data.totalAssets / 1e9).toFixed(2)}B`);
          console.log(`   Current Assets: $${(data.currentAssets / 1e9).toFixed(2)}B`);

          // Check for accounts receivable
          if (data.accountsReceivable) {
            console.log(`   ✅ Accounts Receivable: $${(data.accountsReceivable / 1e6).toFixed(2)}M`);
          } else if (data.xbrl?.accountsReceivable) {
            console.log(`   ✅ Accounts Receivable (XBRL): $${(data.xbrl.accountsReceivable / 1e6).toFixed(2)}M`);
          } else {
            console.log('   ⚠️  Accounts Receivable not found in extracted fields');
            console.log(`   Available fields: ${Object.keys(data).join(', ')}`);
            if (data.xbrl) {
              console.log(`   XBRL fields: ${Object.keys(data.xbrl).join(', ')}`);
            }
          }
        }
      } else {
        console.log('❌ Q3 2023 data NOT found');
      }

      console.log('\n═══════════════════════════════════════════════');
      console.log('✅ VERIFICATION COMPLETE');
      console.log('═══════════════════════════════════════════════');

    } else {
      console.log('\n❌ IMPORT FAILED');
      console.log(`Error: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
