// tests/postgresql/services/test-screening.js
/**
 * PostgreSQL conversion tests for ScreeningService
 * Status: ✅ Fixed - Tests were passing wrong parameter type (object instead of number)
 */

const ScreeningService = require('../../../src/services/screeningService');
const {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function runScreeningServiceTests() {
  printTestHeader('ScreeningService');
  const results = new TestResults('ScreeningService');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Service instantiation
  let service;
  await testMethod(results, 'Service instantiation', async () => {
    service = new ScreeningService();
    if (!service) {
      throw new Error('Failed to create service instance');
    }
  });

  if (!service) {
    console.log('\n⚠️  Cannot continue tests - service instantiation failed');
    return results.summary();
  }

  // Test 3: Get filter options (should work - no complex queries)
  await testMethodReturns(
    results,
    'getFilterOptions() returns options',
    () => service.getFilterOptions(),
    (options) => {
      return options &&
        options.sectors &&
        options.countries &&
        options.sortableFields;
    }
  );

  // Test 4: Get macro context
  await testMethodReturns(
    results,
    'getMacroContext() returns context',
    () => service.getMacroContext(),
    (context) => {
      return context && typeof context === 'object';
    }
  );

  // Test 5: Buffett Quality screen
  await testMethod(results, 'buffettQuality()', async () => {
    const result = await service.buffettQuality(5);

    if (!result || !Array.isArray(result)) {
      throw new Error('Expected array result');
    }
  });

  // Test 6: Deep Value screen
  await testMethod(results, 'deepValue()', async () => {
    const result = await service.deepValue(5);

    if (!result || !Array.isArray(result)) {
      throw new Error('Expected array result');
    }
  });

  // Test 7: Magic Formula screen
  await testMethod(results, 'magicFormula()', async () => {
    const result = await service.magicFormula(5);

    if (!result || !Array.isArray(result)) {
      throw new Error('Expected array result');
    }
  });

  // Test 8: Basic screen with minimal criteria
  await testMethod(results, 'screen() with minimal criteria', async () => {
    const result = await service.screen({
      minROIC: 15,
      limit: 5
    });

    if (!result || !result.results || !result.total) {
      throw new Error('Expected results object with results and total');
    }
  });

  // Test 9: Screen with market cap filter
  await testMethod(results, 'screen() with market cap filter', async () => {
    const result = await service.screen({
      minMarketCap: 1000000000, // 1B
      limit: 5
    });

    if (!result || !result.results) {
      throw new Error('Expected results object');
    }
  });

  // Test 10: Screen with sector filter
  await testMethod(results, 'screen() with sector filter', async () => {
    const result = await service.screen({
      sectors: ['Technology'],
      limit: 5
    });

    if (!result || !result.results) {
      throw new Error('Expected results object');
    }
  });

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  runScreeningServiceTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runScreeningServiceTests };
