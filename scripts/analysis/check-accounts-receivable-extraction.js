// Check if AccountsReceivable is in SEC data but not being extracted
const SECProvider = require('./src/providers/SECProvider');

async function main() {
  const provider = new SECProvider();

  try {
    console.log('🔍 Checking if AccountsReceivable is available in SEC data...\n');

    // Get raw company facts
    const facts = await provider.getCompanyFacts('NVDA');
    const usGaap = facts.facts['us-gaap'];

    // Check for accounts receivable tags
    const possibleARTags = [
      'AccountsReceivableNetCurrent',
      'AccountsReceivableNet',
      'ReceivablesNetCurrent',
      'AccountsReceivableCurrent'
    ];

    console.log('═══════════════════════════════════════════════');
    console.log('CHECKING SEC XBRL DATA FOR ACCOUNTS RECEIVABLE');
    console.log('═══════════════════════════════════════════════\n');

    let found = false;
    for (const tag of possibleARTags) {
      if (usGaap[tag]) {
        console.log(`✅ Found: ${tag}`);
        found = true;

        const usdData = usGaap[tag].units.USD;
        console.log(`   Total entries: ${usdData.length}`);

        // Find Q3 2023
        const q3_2023 = usdData.find(d =>
          d.end === '2023-10-29' && d.form === '10-Q'
        );

        if (q3_2023) {
          console.log(`   ✅ Q3 2023 EXISTS in raw SEC data!`);
          console.log(`      Date: ${q3_2023.end}`);
          console.log(`      Form: ${q3_2023.form}`);
          console.log(`      Value: $${(q3_2023.val / 1e6).toFixed(2)}M`);
          console.log(`      Filed: ${q3_2023.filed}`);
        }

        console.log('');
      }
    }

    if (!found) {
      console.log('❌ No standard AccountsReceivable tags found\n');
      console.log('Available tags with "Receiv":');
      const receivTags = Object.keys(usGaap).filter(k =>
        k.toLowerCase().includes('receiv')
      );
      receivTags.forEach(tag => console.log(`   - ${tag}`));
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('NOW CHECK: What SECProvider extracts...\n');

    // Get balance sheet (what provider extracts)
    const balanceSheet = await provider.getBalanceSheet('NVDA');

    // Find Q3 2023 in quarterly data
    const q3Report = balanceSheet.quarterly.find(q =>
      q.fiscalDateEnding === '2023-10-29'
    );

    if (q3Report) {
      console.log('✅ Q3 2023 found in provider output');
      console.log(`   Date: ${q3Report.fiscalDateEnding}`);
      console.log(`   Form: ${q3Report.form}`);
      console.log(`   Total Assets: $${(q3Report.totalAssets / 1e9).toFixed(2)}B`);

      console.log('\n   📦 XBRL object contents:');
      const xbrlKeys = Object.keys(q3Report.xbrl || {});
      console.log(`   Fields extracted: ${xbrlKeys.length}`);
      xbrlKeys.forEach(key => {
        const val = q3Report.xbrl[key];
        if (typeof val === 'number') {
          console.log(`      ${key}: $${(val / 1e6).toFixed(2)}M`);
        } else {
          console.log(`      ${key}: ${val}`);
        }
      });

      // Check for AR
      const hasAR = xbrlKeys.some(k => k.toLowerCase().includes('receiv'));
      if (hasAR) {
        console.log('\n   ✅ AccountsReceivable IS in extracted XBRL!');
      } else {
        console.log('\n   ❌ AccountsReceivable NOT in extracted XBRL');
        console.log('   💡 SECProvider.extractBalanceSheetData() needs to add AR mapping');
      }
    } else {
      console.log('❌ Q3 2023 not found in provider output (but exists in raw data!)');
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('📋 SUMMARY:');
    console.log('═══════════════════════════════════════════════');
    if (found) {
      console.log('✅ AccountsReceivable exists in SEC raw data');
    }
    if (q3Report) {
      console.log('✅ Q3 2023 exists in provider quarterly output');
    } else {
      console.log('❌ Q3 2023 NOT in provider quarterly output');
    }

    const hasARinXBRL = q3Report && Object.keys(q3Report.xbrl || {}).some(k =>
      k.toLowerCase().includes('receiv')
    );

    if (hasARinXBRL) {
      console.log('✅ AccountsReceivable IS extracted to XBRL object');
    } else {
      console.log('❌ AccountsReceivable NOT extracted to XBRL object');
      console.log('\n🔧 TWO ISSUES TO FIX:');
      console.log('   1. SECProvider.js - Add AR to extractBalanceSheetData() mappings');
      console.log('   2. stockImporter.js - Store quarterly data');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
