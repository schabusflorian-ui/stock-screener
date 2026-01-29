// test-sec-provider.js
const SECProvider = require('./src/providers/SECProvider');

console.log('\n🧪 TESTING SEC EDGAR PROVIDER (FIXED)\n');
console.log('='.repeat(60));

// IMPORTANT: Include your email in the User-Agent
const sec = new SECProvider({
  userAgent: 'StockAnalyzer/1.0 schabus.florian@gmail.com'
});

(async () => {
  try {
    // Test 1: Overview
    console.log('\n1️⃣  Testing Company Overview (Apple)...\n');
    const overview = await sec.getCompanyOverview('AAPL');
    console.log('✅ Company Overview:');
    console.log(`   Name: ${overview.name}`);
    console.log(`   CIK: ${overview.cik}`);
    console.log(`   Sector: ${overview.sector}`);
    console.log(`   Industry: ${overview.industry}`);
    console.log(`   Source: ${overview._source}`);
    
    // Test 2: Balance Sheet
    console.log('\n2️⃣  Testing Balance Sheet...\n');
    const balanceSheet = await sec.getBalanceSheet('AAPL');
    console.log('✅ Balance Sheet:');
    console.log(`   Annual Periods: ${balanceSheet.annual.length}`);
    console.log(`   Quarterly Periods: ${balanceSheet.quarterly.length}`);
    
    if (balanceSheet.annual.length > 0) {
      const latest = balanceSheet.annual[0];
      console.log(`\n   Latest Annual (${latest.fiscalDateEnding}):`);
      console.log(`   - Total Assets: $${(latest.totalAssets / 1e9).toFixed(2)}B`);
      console.log(`   - Shareholder Equity: $${(latest.shareholderEquity / 1e9).toFixed(2)}B`);
      console.log(`   - Cash: $${(latest.cashAndEquivalents / 1e9).toFixed(2)}B`);
    }
    
    // Test 3: Income Statement
    console.log('\n3️⃣  Testing Income Statement...\n');
    const incomeStatement = await sec.getIncomeStatement('AAPL');
    console.log('✅ Income Statement:');
    console.log(`   Annual Periods: ${incomeStatement.annual.length}`);
    
    if (incomeStatement.annual.length > 0) {
      const latest = incomeStatement.annual[0];
      console.log(`\n   Latest Annual (${latest.fiscalDateEnding}):`);
      console.log(`   - Revenue: $${(latest.totalRevenue / 1e9).toFixed(2)}B`);
      console.log(`   - Net Income: $${(latest.netIncome / 1e9).toFixed(2)}B`);
      console.log(`   - Operating Income: $${(latest.operatingIncome / 1e9).toFixed(2)}B`);
    }
    
    // Test 4: Cash Flow
    console.log('\n4️⃣  Testing Cash Flow...\n');
    const cashFlow = await sec.getCashFlow('AAPL');
    console.log('✅ Cash Flow:');
    console.log(`   Annual Periods: ${cashFlow.annual.length}`);
    
    if (cashFlow.annual.length > 0) {
      const latest = cashFlow.annual[0];
      const fcf = latest.operatingCashflow - latest.capitalExpenditures;
      console.log(`\n   Latest Annual (${latest.fiscalDateEnding}):`);
      console.log(`   - Operating Cash Flow: $${(latest.operatingCashflow / 1e9).toFixed(2)}B`);
      console.log(`   - CapEx: $${(latest.capitalExpenditures / 1e9).toFixed(2)}B`);
      console.log(`   - Free Cash Flow: $${(fcf / 1e9).toFixed(2)}B`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60) + '\n');
    
    // Stats
    const stats = sec.getStats();
    console.log('📊 Provider Stats:');
    console.log(`   Cache size: ${stats.cacheSize}`);
    console.log(`   CIK cache: ${stats.cikCacheSize}`);
    console.log(`   Tickers cached: ${stats.tickersCached}`);
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error('\nFull error:');
    console.error(error);
    process.exit(1);
  }
})();