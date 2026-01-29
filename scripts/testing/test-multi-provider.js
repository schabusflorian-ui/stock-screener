require('dotenv').config();
const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
const SECProvider = require('./src/providers/SECProvider');
const CompositeProvider = require('./src/providers/CompositeProvider');

console.log('\n🔀 TESTING MULTI-PROVIDER SYSTEM\n');
console.log('='.repeat(60));

const composite = new CompositeProvider();

// Add providers (lower priority number = used first)
composite.addProvider(new SECProvider({
  userAgent: 'Stock Analyzer your.email@example.com',
  priority: 10  // Use SEC first for financials
}));

composite.addProvider(new AlphaVantageProvider(process.env.ALPHA_VANTAGE_KEY, {
  priority: 20  // Use Alpha for prices/international
}));

(async () => {
  try {
    // Test: Get Apple data
    console.log('\n📊 Fetching Apple (should use SEC)...\n');
    const data = await composite.fetchAllData('AAPL');
    
    console.log('✅ Results:');
    console.log(`   Company: ${data.overview.name}`);
    console.log(`   Source: ${data.overview._source}`);
    console.log(`   Annual periods: ${data.balanceSheet.annual.length}`);
    console.log(`   Latest revenue: $${(data.incomeStatement.annual[0].totalRevenue / 1e9).toFixed(2)}B`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ MULTI-PROVIDER WORKS!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
})();