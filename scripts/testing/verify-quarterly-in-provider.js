// Verify that SEC Provider returns quarterly data (but importer doesn't store it)
const SECProvider = require('./src/providers/SECProvider');

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('VERIFYING SEC PROVIDER RETURNS QUARTERLY DATA');
  console.log('═══════════════════════════════════════════════\n');

  const provider = new SECProvider();

  try {
    // Fetch balance sheet for Nvidia
    console.log('📊 Fetching NVDA balance sheet data from SEC...\n');
    const balanceSheet = await provider.getBalanceSheet('NVDA');

    console.log('✅ Data received from SEC Provider\n');
    console.log('═══════════════════════════════════════════════');
    console.log('📈 ANNUAL DATA:');
    console.log('═══════════════════════════════════════════════');
    console.log(`Count: ${balanceSheet.annual.length} reports`);
    if (balanceSheet.annual.length > 0) {
      console.log('Sample (most recent):');
      const recent = balanceSheet.annual[0];
      console.log(`  Date: ${recent.fiscalDateEnding}`);
      console.log(`  Form: ${recent.form}`);
      console.log(`  Fiscal Period: ${recent.fiscalPeriod}`);
      console.log(`  Total Assets: $${(recent.totalAssets / 1e9).toFixed(2)}B`);
      console.log(`  XBRL Fields: ${Object.keys(recent.xbrl || {}).length}`);

      // Check for accounts receivable
      if (recent.xbrl?.accountsReceivable) {
        console.log(`  ✓ Accounts Receivable in XBRL: $${(recent.xbrl.accountsReceivable / 1e6).toFixed(2)}M`);
      } else {
        console.log(`  ⚠️  Accounts Receivable not in XBRL object`);
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 QUARTERLY DATA:');
    console.log('═══════════════════════════════════════════════');
    console.log(`Count: ${balanceSheet.quarterly.length} reports`);

    if (balanceSheet.quarterly.length > 0) {
      console.log('✅ QUARTERLY DATA EXISTS!\n');
      console.log('Sample quarterly reports:');
      balanceSheet.quarterly.slice(0, 5).forEach((q, i) => {
        console.log(`\n  ${i + 1}. ${q.fiscalDateEnding} (${q.fiscalPeriod})`);
        console.log(`     Form: ${q.form}`);
        console.log(`     Filed: ${q.filed}`);
        console.log(`     Total Assets: $${(q.totalAssets / 1e9).toFixed(2)}B`);
        console.log(`     XBRL Fields: ${Object.keys(q.xbrl || {}).length}`);

        // Check for Q3 2023
        if (q.fiscalDateEnding === '2023-10-29') {
          console.log('     🎯 THIS IS Q3 2023!');

          // Check XBRL for accounts receivable
          if (q.xbrl) {
            const xbrlKeys = Object.keys(q.xbrl);
            console.log(`     XBRL fields available: ${xbrlKeys.join(', ')}`);

            // Look for receivables
            const arKeys = xbrlKeys.filter(k => k.toLowerCase().includes('receiv'));
            if (arKeys.length > 0) {
              console.log(`     ✓ Receivables fields: ${arKeys.join(', ')}`);
              arKeys.forEach(key => {
                console.log(`       ${key}: $${(q.xbrl[key] / 1e6).toFixed(2)}M`);
              });
            } else {
              console.log('     ⚠️  No receivables in XBRL object');
            }
          }
        }
      });
    } else {
      console.log('❌ NO QUARTERLY DATA RETURNED');
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('🔍 DIAGNOSIS:');
    console.log('═══════════════════════════════════════════════');

    if (balanceSheet.quarterly.length > 0) {
      console.log('✅ SEC Provider DOES return quarterly data');
      console.log('❌ Stock Importer is NOT storing it');
      console.log('\n💡 Fix Required:');
      console.log('   Update src/services/stockImporter.js line 172-257');
      console.log('   Add loops to store quarterly data alongside annual data');
    } else {
      console.log('❌ SEC Provider is not returning quarterly data');
      console.log('   This would be unexpected - check SECProvider.js');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
