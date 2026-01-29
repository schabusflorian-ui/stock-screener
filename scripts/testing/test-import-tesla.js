// import-tesla.js
require('dotenv').config();
const SECProvider = require('./src/providers/SECProvider');
const AlphaVantageProvider = require('./src/providers/AlphaVantageProvider');
const CompositeProvider = require('./src/providers/CompositeProvider');
const StockImporter = require('./src/services/stockImporter');

const composite = new CompositeProvider();
composite.addProvider(new SECProvider({
  userAgent: 'Stock Analyzer your.email@example.com'
}));
composite.addProvider(new AlphaVantageProvider(process.env.ALPHA_VANTAGE_KEY));

const importer = new StockImporter(composite);

(async () => {
  await importer.importStock('TSLA');
})();