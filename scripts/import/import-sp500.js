// import-sp500.js
require('dotenv').config();
const fs = require('fs');
const { db } = require('./src/database');
const SECProvider = require('./src/providers/SECProvider');
const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
const CompositeProvider = require('./src/providers/CompositeProvider');
const StockImporter = require('./src/services/stockImporter');

async function importSP500() {
  console.log('\n' + '█'.repeat(70));
  console.log('📊 S&P 500 BULK IMPORT');
  console.log('█'.repeat(70));

  // Load symbols
  let symbols;
  try {
    symbols = JSON.parse(fs.readFileSync('sp500-symbols.json', 'utf8'));
  } catch (error) {
    console.log('\n❌ sp500-symbols.json not found. Run get-sp500-list.js first!\n');
    process.exit(1);
  }

  // Check which companies are already imported
  const existingCompanies = db.prepare('SELECT symbol FROM companies').all();
  const existingSymbols = new Set(existingCompanies.map(c => c.symbol));
  const remainingSymbols = symbols.filter(s => !existingSymbols.has(s));

  console.log(`\n📋 Total companies to import: ${symbols.length}`);
  console.log(`⏱️  Estimated time: ${(symbols.length * 0.2).toFixed(0)} minutes (SEC is fast!)\n`);
  console.log(`📋 ${remainingSymbols.length} companies remaining to import\n`);

  
  // Setup providers
  const composite = new CompositeProvider();
  composite.addProvider(new SECProvider({
    userAgent: 'Stock Analyzer your.email@example.com'
  }));
  composite.addProvider(new AlphaVantageProvider(process.env.ALPHA_VANTAGE_KEY));
  
  const importer = new StockImporter(composite);
  
  // Ask for confirmation
  console.log('⚠️  This will import all S&P 500 companies.');
  console.log('   Press Ctrl+C to cancel, or wait 5 seconds to start...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Import with progress tracking
  const startTime = Date.now();
  const results = await importer.bulkImport(symbols, {
    delayBetweenImports: 150, // 150ms = ~6 per second (respectful to SEC)
    stopOnError: false
  });
  
  const duration = (Date.now() - startTime) / 1000 / 60; // minutes
  
  console.log('\n' + '█'.repeat(70));
  console.log('📊 IMPORT COMPLETE');
  console.log('█'.repeat(70));
  console.log(`✅ Successfully imported: ${results.successful}/${symbols.length}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏱️  Total time: ${duration.toFixed(1)} minutes`);
  console.log(`⚡ Average: ${(duration * 60 / symbols.length).toFixed(1)}s per stock`);
  console.log('█'.repeat(70) + '\n');
  
  // Save results
  fs.writeFileSync(
    'import-results.json',
    JSON.stringify(results, null, 2)
  );
  
  console.log('💾 Results saved to import-results.json\n');
}

importSP500();