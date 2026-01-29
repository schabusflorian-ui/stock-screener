// import-stocks.js
require('dotenv').config();
const StockImporter = require('./src/services/stockImporter');

const apiKey = process.env.ALPHA_VANTAGE_KEY;

if (!apiKey) {
  console.error('❌ Error: ALPHA_VANTAGE_KEY not found in .env file');
  process.exit(1);
}

const importer = new StockImporter(apiKey);

// List of stocks to import
const stocksToImport = [
  'AAPL',  // Apple
  'MSFT',  // Microsoft
  'GOOGL', // Google
  'AMZN',  // Amazon
  'META'   // Meta (Facebook)
];

// Run the bulk import
(async () => {
  try {
    const results = await importer.bulkImport(stocksToImport);
    
    // Show final stats
    console.log('\n📊 FINAL DATABASE STATS:');
    const stats = importer.getImportStats();
    console.log(`   Companies: ${stats.total_companies}`);
    console.log(`   Financial Reports: ${stats.total_financial_reports}`);
    console.log(`   API Calls: ${stats.total_api_calls}`);
    
    // List all companies
    console.log('\n📈 Imported Companies:');
    const companies = importer.listImportedCompanies();
    companies.forEach(c => {
      console.log(`   ${c.symbol} - ${c.name} (${c.years_of_data} years of data)`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();