// compare-providers.js
require('dotenv').config();
const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
const SECProvider = require('./src/providers/SECProvider');

const symbol = 'AAPL';

console.log('\n📊 COMPARING SEC vs ALPHA VANTAGE\n');
console.log('='.repeat(60));

(async () => {
  try {
    // Create both providers
    const sec = new SECProvider();
    const alpha = new AlphaVantageProvider(process.env.ALPHA_VANTAGE_KEY);
    
    // Get balance sheets from both
    console.log('\n1️⃣  Fetching balance sheets...\n');
    
    const secBS = await sec.getBalanceSheet(symbol);
    const alphaBS = await alpha.getBalanceSheet(symbol);
    
    // Compare latest annual data
    const secLatest = secBS.annual[0];
    const alphaLatest = alphaBS.annual[0];
    
    console.log('📊 COMPARISON (Latest Annual):');
    console.log('');
    console.log('Metric                    | SEC EDGAR              | Alpha Vantage          | Diff');
    console.log('-'.repeat(90));
    
    const metrics = [
      { name: 'Fiscal Date', sec: secLatest.fiscalDateEnding, alpha: alphaLatest.fiscalDateEnding },
      { name: 'Total Assets', sec: secLatest.totalAssets, alpha: alphaLatest.totalAssets },
      { name: 'Current Assets', sec: secLatest.currentAssets, alpha: alphaLatest.currentAssets },
      { name: 'Cash', sec: secLatest.cashAndEquivalents, alpha: alphaLatest.cashAndEquivalents },
      { name: 'Total Liabilities', sec: secLatest.totalLiabilities, alpha: alphaLatest.totalLiabilities },
      { name: 'Shareholder Equity', sec: secLatest.shareholderEquity, alpha: alphaLatest.shareholderEquity }
    ];
    
    for (const metric of metrics) {
      const secVal = typeof metric.sec === 'number' ? `$${(metric.sec / 1e9).toFixed(2)}B` : metric.sec;
      const alphaVal = typeof metric.alpha === 'number' ? `$${(metric.alpha / 1e9).toFixed(2)}B` : metric.alpha;
      const diff = typeof metric.sec === 'number' ? 
        `${(((metric.alpha - metric.sec) / metric.sec) * 100).toFixed(2)}%` : 
        (metric.sec === metric.alpha ? '✓ Match' : '✗ Different');
      
      console.log(
        `${metric.name.padEnd(25)} | ${secVal.padEnd(22)} | ${alphaVal.padEnd(22)} | ${diff}`
      );
    }
    
    console.log('');
    console.log('📈 HISTORICAL DATA:');
    console.log(`   SEC: ${secBS.annual.length} annual periods (${secBS.annual[secBS.annual.length - 1].fiscalDateEnding} - ${secBS.annual[0].fiscalDateEnding})`);
    console.log(`   Alpha: ${alphaBS.annual.length} annual periods (${alphaBS.annual[alphaBS.annual.length - 1].fiscalDateEnding} - ${alphaBS.annual[0].fiscalDateEnding})`);
    
    console.log('\n' + '='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();