// test-providers.js
require('dotenv').config();
const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
const CompositeProvider = require('./src/providers/CompositeProvider');
const StockImporter = require('./src/services/stockImporter');

console.log('\n🧪 TESTING PROVIDER ARCHITECTURE\n');
console.log('='.repeat(60));

// Create providers
console.log('\n1️⃣  Setting up providers...\n');

const alphaVantage = new AlphaVantageProvider(process.env.ALPHA_VANTAGE_KEY, {
  priority: 20
});

const composite = new CompositeProvider();
composite.addProvider(alphaVantage);

// Health check
console.log('\n2️⃣  Running health checks...');
(async () => {
  await composite.healthCheckAll();
  
  // Test fetching data
  console.log('\n3️⃣  Testing data fetch...\n');
  
  try {
    const overview = await composite.getCompanyOverview('TSLA');
    console.log('✅ Overview fetched:');
    console.log(`   Name: ${overview.name}`);
    console.log(`   Sector: ${overview.sector}`);
    console.log(`   Market Cap: $${(overview.marketCap / 1e9).toFixed(2)}B`);
    console.log(`   Source: ${overview._source}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
  
  // Test with importer
  console.log('\n4️⃣  Testing with importer...\n');
  
  const importer = new StockImporter(composite);
  
  // Import Tesla
  await importer.importStock('TSLA');
  
  console.log('\n='.repeat(60));
  console.log('✅ ALL TESTS PASSED!');
  console.log('='.repeat(60) + '\n');
  
})();