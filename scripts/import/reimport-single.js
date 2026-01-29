// reimport-single.js - Reimport a single company to test fixes
require('dotenv').config();
const SECProvider = require('./src/providers/SECProvider');
const CompositeProvider = require('./src/providers/CompositeProvider');
const StockImporter = require('./src/services/stockImporter');

async function reimportSingle(symbol) {
  console.log(`\n📊 RE-IMPORTING ${symbol}\n`);
  console.log('='.repeat(70));

  const composite = new CompositeProvider();
  composite.addProvider(new SECProvider({
    userAgent: 'Stock Analyzer test@example.com'
  }));

  const importer = new StockImporter(composite);

  try {
    console.log(`\nImporting ${symbol}...`);
    const result = await importer.importStock(symbol);

    if (result.success) {
      console.log(`\n✅ Successfully reimported ${symbol}`);
      console.log(`   Company: ${result.company.name}`);
      console.log(`   Periods imported: ${result.periodsImported}`);
    } else {
      console.log(`\n❌ Failed to reimport ${symbol}`);
      console.log(`   Error: ${result.error}`);
    }
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

// Get symbol from command line or default to PG
const symbol = process.argv[2] || 'PG';
reimportSingle(symbol);
