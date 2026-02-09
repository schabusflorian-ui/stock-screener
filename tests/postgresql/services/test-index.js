// tests/postgresql/services/test-index.js
/**
 * PostgreSQL conversion tests for IndexService
 */

const indexService = require('../../../src/services/indexService');
const {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function runIndexServiceTests() {
  printTestHeader('IndexService');
  const results = new TestResults('IndexService');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service availability (singleton)
  await testMethod(results, 'Service available', async () => {
    if (!indexService || typeof indexService.getAllIndices !== 'function') {
      throw new Error('Service not properly exported');
    }
  });

  // Test 3: Get all indices
  await testMethodReturns(
    results,
    'getAllIndices() returns index list',
    () => indexService.getAllIndices(),
    (indices) => {
      return Array.isArray(indices) && indices.length > 0;
    }
  );

  // Test 4: Get index by symbol
  await testMethodReturns(
    results,
    'getIndexBySymbol() returns index data',
    () => indexService.getIndexBySymbol('^GSPC'),
    (index) => {
      return index && index.symbol === '^GSPC';
    }
  );

  // Test 5: Get S&P 500 constituents
  await testMethodReturns(
    results,
    'getSP500Constituents() returns companies',
    () => indexService.getSP500Constituents(),
    (constituents) => {
      return Array.isArray(constituents);
    }
  );

  // Test 6: Get market summary
  await testMethod(results, 'getMarketSummary() returns summary', async () => {
    const summary = await indexService.getMarketSummary();
    if (!summary || !summary.indices || !Array.isArray(summary.indices)) {
      throw new Error('Expected summary with indices array');
    }
  });

  // Test 7: Get constituents
  await testMethod(results, 'getConstituents() returns list', async () => {
    const constituents = await indexService.getConstituents('SPX', { limit: 10 });
    if (constituents !== null && !Array.isArray(constituents)) {
      throw new Error('Expected array of constituents or null');
    }
  });

  // Test 8: Get indices with stats
  await testMethod(results, 'getIndicesWithStats() returns indices', async () => {
    const indices = await indexService.getIndicesWithStats();
    if (!Array.isArray(indices)) {
      throw new Error('Expected array of indices');
    }
  });

  // Test 9: Get price stats
  await testMethod(results, 'getPriceStats() returns statistics', async () => {
    const stats = await indexService.getPriceStats();
    if (!stats) {
      throw new Error('Expected stats object');
    }
  });

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  runIndexServiceTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runIndexServiceTests };
