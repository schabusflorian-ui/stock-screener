// tests/postgresql/services/test-currency.js
/**
 * PostgreSQL conversion tests for CurrencyService
 * Status: ✅ PASSING
 */

const currencyService = require('../../../src/services/currencyService');
const {
  TestResults,
  testMethod,
  testMethodReturns,
  testDatabaseConnection,
  printTestHeader
} = require('../testUtils');

async function runCurrencyServiceTests() {
  printTestHeader('CurrencyService');
  const results = new TestResults('CurrencyService');

  // Test 1: Database connection
  await testDatabaseConnection(results);

  // Test 2: Get current rates
  await testMethodReturns(
    results,
    'getCurrentRates() returns rate object',
    () => currencyService.getCurrentRates(),
    (rates) => {
      return rates && typeof rates === 'object' && Object.keys(rates).length > 0;
    }
  );

  // Test 3: Convert currency
  await testMethodReturns(
    results,
    'convert() EUR to USD',
    () => currencyService.convert(100, 'EUR', 'USD'),
    (result) => {
      return typeof result === 'number' && result > 0;
    }
  );

  // Test 4: Convert to USD
  await testMethodReturns(
    results,
    'toUSD() GBP to USD',
    () => currencyService.toUSD(100, 'GBP'),
    (result) => {
      return typeof result === 'number' && result > 0;
    }
  );

  // Test 5: Get currency info
  await testMethod(results, 'getCurrencyInfo() for EUR', async () => {
    const info = currencyService.getCurrencyInfo('EUR');
    if (!info || !info.symbol || !info.name) {
      throw new Error('Currency info missing required fields');
    }
    if (info.symbol !== '€' || info.name !== 'Euro') {
      throw new Error(`Unexpected EUR info: ${JSON.stringify(info)}`);
    }
  });

  // Test 6: Handle null/undefined gracefully
  await testMethod(results, 'Handle null currency code', async () => {
    const info = currencyService.getCurrencyInfo(null);
    if (!info || info.symbol !== null) {
      throw new Error('Should handle null gracefully');
    }
  });

  // Test 7: Get historical rate (if data exists)
  await testMethod(results, 'getHistoricalRate()', async () => {
    try {
      const rate = await currencyService.getHistoricalRate('EUR', 'USD', '2024-01-01');
      // May return null if no data, which is ok
      if (rate !== null && (typeof rate !== 'number' || rate <= 0)) {
        throw new Error(`Invalid historical rate: ${rate}`);
      }
    } catch (err) {
      // Historical rate may not exist, which is ok for this test
      if (!err.message.includes('not found')) {
        throw err;
      }
    }
  });

  // Test 8: Store historical rate
  await testMethod(results, 'storeHistoricalRate()', async () => {
    const testDate = '2024-01-15';
    const testRate = 1.0923;

    await currencyService.storeHistoricalRate('EUR', 'USD', testDate, testRate);

    // Verify it was stored
    const stored = await currencyService.getHistoricalRate('EUR', 'USD', testDate);
    if (stored === null) {
      throw new Error('Historical rate was not stored');
    }
    if (Math.abs(stored - testRate) > 0.0001) {
      throw new Error(`Stored rate ${stored} does not match ${testRate}`);
    }
  });

  // Test 9: Get company currency
  await testMethod(results, 'getCompanyCurrency()', async () => {
    try {
      // Try with a real company (may not exist in test DB)
      const currency = await currencyService.getCompanyCurrency('AAPL');
      if (currency && typeof currency !== 'string') {
        throw new Error(`Invalid currency type: ${typeof currency}`);
      }
    } catch (err) {
      // Company may not exist, which is ok
      if (!err.message.includes('not found')) {
        throw err;
      }
    }
  });

  return results.summary();
}

// Run if executed directly
if (require.main === module) {
  runCurrencyServiceTests()
    .then(summary => {
      process.exit(summary.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Test runner error:', err);
      process.exit(1);
    });
}

module.exports = { runCurrencyServiceTests };
