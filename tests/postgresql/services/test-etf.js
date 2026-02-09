// tests/postgresql/services/test-etf.js
/**
 * PostgreSQL conversion tests for ETFService
 */

const { EtfService } = require('../../../src/services/etfService');
const {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function runETFServiceTests() {
  printTestHeader('ETFService');
  const results = new TestResults('ETFService');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service instantiation
  let service;
  await testMethod(results, 'Service instantiation', async () => {
    service = new EtfService();
    if (!service) {
      throw new Error('Failed to create service instance');
    }
  });

  if (!service) {
    console.log('\n⚠️  Cannot continue tests - service instantiation failed');
    return results.summary();
  }

  // Test 3: Get all ETFs
  await testMethodReturns(
    results,
    'getAllEtfs() returns ETF list',
    () => service.getAllEtfs({ limit: 10 }),
    (etfs) => {
      return Array.isArray(etfs) && etfs.length > 0;
    }
  );

  // Test 4: Get ETF by symbol
  await testMethodReturns(
    results,
    'getEtfBySymbol() returns ETF data',
    () => service.getEtfBySymbol('SPY'),
    (etf) => {
      return etf && etf.symbol === 'SPY';
    }
  );

  // Test 5: Get categories
  await testMethodReturns(
    results,
    'getCategories() returns category list',
    () => service.getCategories(),
    (categories) => {
      return Array.isArray(categories) && categories.length > 0;
    }
  );

  // Test 6: Get model portfolios
  await testMethodReturns(
    results,
    'getAllModelPortfolios() returns portfolios',
    () => service.getAllModelPortfolios(),
    (portfolios) => {
      return Array.isArray(portfolios);
    }
  );

  // Test 7: Get specific model portfolio
  await testMethod(results, 'getModelPortfolio() by name', async () => {
    // First get all portfolios
    const portfolios = await service.getAllModelPortfolios();
    if (portfolios.length > 0) {
      const portfolio = await service.getModelPortfolio(portfolios[0].name);
      if (!portfolio) {
        throw new Error('Failed to get model portfolio by name');
      }
    }
  });

  // Test 8: Get ETF holdings
  await testMethod(results, 'getEtfHoldings() returns holdings object', async () => {
    const result = await service.getEtfHoldings('SPY', { limit: 10 });
    if (!result || !Array.isArray(result.holdings)) {
      throw new Error('Expected result object with holdings array');
    }
  });

  // Test 9: Compare ETFs
  await testMethod(results, 'compareEtfs() compares multiple ETFs', async () => {
    const comparison = await service.compareEtfs(['SPY', 'VOO']);
    if (!comparison || !comparison.etfs || !Array.isArray(comparison.etfs)) {
      throw new Error('Expected comparison with etfs array');
    }
  });

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  runETFServiceTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runETFServiceTests };
