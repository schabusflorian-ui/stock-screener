// inspect-sec-data.js
const SECProvider = require('./src/providers/SECProvider');

const sec = new SECProvider({
  userAgent: 'Stock Analyzer your.email@example.com'
});

async function inspectCompany(symbol) {
  console.log('\n' + '='.repeat(70));
  console.log(`🔍 INSPECTING SEC DATA: ${symbol}`);
  console.log('='.repeat(70));
  
  try {
    // Get raw company facts
    const facts = await sec.getCompanyFacts(symbol);
    const usGaap = facts.facts['us-gaap'];
    
    // Analyze what data we have
    console.log('\n📊 AVAILABLE XBRL CONCEPTS:');
    console.log(`   Total concepts: ${Object.keys(usGaap).length}`);
    
    // Check key concepts
    const keyConcepts = [
      'Assets',
      'Liabilities',
      'StockholdersEquity',
      'Revenues',
      'NetIncomeLoss',
      'OperatingIncomeLoss',
      'NetCashProvidedByUsedInOperatingActivities',
      'PaymentsToAcquirePropertyPlantAndEquipment'
    ];
    
    console.log('\n🔑 KEY CONCEPTS STATUS:');
    for (const concept of keyConcepts) {
      const exists = usGaap[concept] ? '✅' : '❌';
      const dataPoints = usGaap[concept]?.units?.USD?.length || 0;
      console.log(`   ${exists} ${concept}: ${dataPoints} data points`);
    }
    
    // Pick one concept to inspect deeply
    const sampleConcept = 'Assets';
    if (usGaap[sampleConcept]) {
      console.log(`\n📋 DETAILED INSPECTION: ${sampleConcept}`);
      const data = usGaap[sampleConcept].units.USD;
      
      console.log(`   Total data points: ${data.length}`);
      
      // Group by form type
      const byForm = {};
      data.forEach(item => {
        byForm[item.form] = (byForm[item.form] || 0) + 1;
      });
      
      console.log('\n   By Form Type:');
      Object.entries(byForm).forEach(([form, count]) => {
        console.log(`     ${form}: ${count} filings`);
      });
      
      // Group by fiscal period
      const byPeriod = {};
      data.forEach(item => {
        byPeriod[item.fp] = (byPeriod[item.fp] || 0) + 1;
      });
      
      console.log('\n   By Fiscal Period:');
      Object.entries(byPeriod).forEach(([period, count]) => {
        console.log(`     ${period}: ${count} entries`);
      });
      
      // Show sample annual data (10-K only)
      console.log('\n   📄 SAMPLE 10-K ANNUAL DATA (last 5):');
      const annualData = data
        .filter(item => item.form === '10-K' && item.fp === 'FY')
        .sort((a, b) => b.end.localeCompare(a.end))
        .slice(0, 5);
      
      annualData.forEach(item => {
        console.log(`     ${item.end} (FY ${item.fy}): $${(item.val / 1e9).toFixed(2)}B`);
        console.log(`       Filed: ${item.filed}, Form: ${item.form}, Accession: ${item.accn}`);
      });
      
      // Show sample quarterly data (10-Q only)
      console.log('\n   📄 SAMPLE 10-Q QUARTERLY DATA (last 5):');
      const quarterlyData = data
        .filter(item => item.form === '10-Q' && item.fp !== 'FY')
        .sort((a, b) => b.end.localeCompare(a.end))
        .slice(0, 5);
      
      quarterlyData.forEach(item => {
        console.log(`     ${item.end} (${item.fp} ${item.fy}): $${(item.val / 1e9).toFixed(2)}B`);
        console.log(`       Filed: ${item.filed}, Form: ${item.form}`);
      });
    }
    
    // Check for data inconsistencies
    console.log('\n⚠️  POTENTIAL ISSUES:');
    
    // Issue 1: Multiple entries for same period
    if (usGaap['Assets']) {
      const assets = usGaap['Assets'].units.USD;
      const periods = new Map();
      
      assets.forEach(item => {
        const key = `${item.end}-${item.fp}`;
        periods.set(key, (periods.get(key) || 0) + 1);
      });
      
      const duplicates = Array.from(periods.entries()).filter(([_, count]) => count > 1);
      if (duplicates.length > 0) {
        console.log(`   ⚠️  Found ${duplicates.length} periods with multiple entries`);
        console.log('   Examples:');
        duplicates.slice(0, 3).forEach(([period, count]) => {
          console.log(`     ${period}: ${count} entries`);
        });
      } else {
        console.log('   ✅ No duplicate periods found');
      }
    }
    
    // Issue 2: Missing concepts
    const missingConcepts = keyConcepts.filter(c => !usGaap[c]);
    if (missingConcepts.length > 0) {
      console.log(`   ⚠️  Missing ${missingConcepts.length} key concepts:`);
      missingConcepts.forEach(c => console.log(`     - ${c}`));
    }
    
    // Get all form types used
    console.log('\n📋 ALL FORM TYPES IN DATA:');
    const allForms = new Set();
    Object.values(usGaap).forEach(concept => {
      if (concept.units?.USD) {
        concept.units.USD.forEach(item => allForms.add(item.form));
      }
    });
    console.log(`   ${Array.from(allForms).join(', ')}`);
    
    console.log('\n' + '='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test with multiple companies
async function inspectMultiple(symbols) {
  for (const symbol of symbols) {
    await inspectCompany(symbol);
    await new Promise(resolve => setTimeout(resolve, 200)); // Rate limit
  }
  
  console.log('\n💡 KEY FINDINGS:');
  console.log('   1. Only use 10-K (annual) and 10-Q (quarterly) forms');
  console.log('   2. Filter by fp=FY for annual, fp=Q1/Q2/Q3/Q4 for quarterly');
  console.log('   3. Some periods may have multiple entries (amendments)');
  console.log('   4. Take the LATEST filing (most recent "filed" date) for each period\n');
}

// Run inspection
(async () => {
  const testSymbols = ['AAPL', 'MSFT', 'GOOGL'];
  await inspectMultiple(testSymbols);
})();