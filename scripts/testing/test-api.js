// test-api.js
require('dotenv').config();
const AlphaVantageService = require('./src/services/alphaVantageService');

const api = new AlphaVantageService(process.env.ALPHA_VANTAGE_KEY);

(async () => {
  try {
    // Fetch all data for Microsoft
    const data = await api.fetchAllData('MSFT');
    
    console.log('\n📊 Microsoft Data Summary:');
    console.log('   Company:', data.overview.name);
    console.log('   Market Cap:', `$${(data.overview.marketCap / 1e9).toFixed(2)}B`);
    console.log('   Annual Reports:', data.balanceSheet.annual.length);
    console.log('   Latest Fiscal Year:', data.balanceSheet.annual[0].fiscalDateEnding);
    
    console.log('\n💰 Latest Financial Data:');
    const latest = data.incomeStatement.annual[0];
    console.log('   Revenue:', `$${(latest.totalRevenue / 1e9).toFixed(2)}B`);
    console.log('   Net Income:', `$${(latest.netIncome / 1e9).toFixed(2)}B`);
    console.log('   Gross Margin:', `${((latest.grossProfit / latest.totalRevenue) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
})();