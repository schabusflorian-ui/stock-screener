// src/services/identifiers/integration.test.js
// Integration test for the full XBRL → LEI → symbol → price resolution flow

const { getDatabaseSync } = require('../../lib/db');
const identifiers = require('./index');
const { DataRouter } = require('../dataRouter');

/**
 * Test the full identifier resolution flow
 * Run with: node src/services/identifiers/integration.test.js
 */
async function runIntegrationTests() {
  const db = getDatabaseSync();
  console.log('='.repeat(60));
  console.log('IDENTIFIER SERVICES INTEGRATION TEST');
  console.log('='.repeat(60));
  console.log();

  const services = identifiers.createServices(db);
  const results = { passed: 0, failed: 0, skipped: 0 };

  // Test 1: Exchange Mapper (no API calls)
  console.log('TEST 1: Exchange Mapper');
  console.log('-'.repeat(40));
  try {
    const testCases = [
      { ticker: 'BP', exchange: 'XLON', expected: 'BP.L' },
      { ticker: 'SAP', exchange: 'XETR', expected: 'SAP.DE' },
      { ticker: 'LVMH', exchange: 'XPAR', expected: 'LVMH.PA' },
      { ticker: 'NESN', exchange: 'XSWX', expected: 'NESN.SW' },
      { ticker: 'AAPL', exchange: 'XNAS', expected: 'AAPL' },
      { ticker: 'ASML', exchange: 'XAMS', expected: 'ASML.AS' },
    ];

    for (const tc of testCases) {
      const result = services.exchange.getYahooSymbol(tc.ticker, tc.exchange);
      const status = result === tc.expected ? '✓' : '✗';
      console.log(`  ${status} ${tc.ticker} on ${tc.exchange} → ${result} (expected: ${tc.expected})`);
      if (result === tc.expected) results.passed++; else results.failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 2: Yahoo Symbol Parser (no API calls)
  console.log('TEST 2: Yahoo Symbol Parser');
  console.log('-'.repeat(40));
  try {
    const testCases = [
      { symbol: 'BP.L', expectedTicker: 'BP', expectedCountry: 'GB' },
      { symbol: 'SAP.DE', expectedTicker: 'SAP', expectedCountry: 'DE' },
      { symbol: 'AAPL', expectedTicker: 'AAPL', expectedCountry: 'US' },
      { symbol: 'NESN.SW', expectedTicker: 'NESN', expectedCountry: 'CH' },
    ];

    for (const tc of testCases) {
      const parsed = services.exchange.parseYahooSymbol(tc.symbol);
      const tickerOk = parsed.ticker === tc.expectedTicker;
      const countryOk = parsed.country === tc.expectedCountry;
      const status = tickerOk && countryOk ? '✓' : '✗';
      console.log(`  ${status} ${tc.symbol} → ticker: ${parsed.ticker}, country: ${parsed.country}`);
      if (tickerOk && countryOk) results.passed++; else results.failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 3: LEI Validation (no API calls)
  console.log('TEST 3: LEI Validation');
  console.log('-'.repeat(40));
  try {
    const testCases = [
      { lei: '213800LH1BZH3DI6G760', name: 'BP PLC', expected: true },
      { lei: '529900ODI3047E2LIV03', name: 'SAP SE', expected: true },
      { lei: 'INVALID', name: 'Invalid LEI', expected: false },
      { lei: '12345678901234567890', name: 'Wrong checksum', expected: false },
    ];

    for (const tc of testCases) {
      const isValid = identifiers.GleifClient.validateLei(tc.lei);
      const status = isValid === tc.expected ? '✓' : '✗';
      console.log(`  ${status} ${tc.name}: ${tc.lei.substring(0, 10)}... → ${isValid}`);
      if (isValid === tc.expected) results.passed++; else results.failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 4: Cache Operations (no API calls)
  console.log('TEST 4: Cache Operations');
  console.log('-'.repeat(40));
  try {
    const testData = { test: true, timestamp: Date.now(), data: { foo: 'bar' } };

    // Write to cache
    services.resolver._setCache('integration_test', 'test-key-1', testData);
    console.log('  ✓ Cache write succeeded');
    results.passed++;

    // Read from cache
    const cached = services.resolver._getCache('integration_test', 'test-key-1');
    if (cached && cached.test === true && cached.data.foo === 'bar') {
      console.log('  ✓ Cache read succeeded with correct data');
      results.passed++;
    } else {
      console.log('  ✗ Cache read failed or data mismatch');
      results.failed++;
    }

    // Clear expired cache
    const cleared = services.resolver.clearExpiredCache();
    console.log(`  ✓ Cleared ${cleared} expired cache entries`);
    results.passed++;
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 5: Company Linker Statistics (no API calls)
  console.log('TEST 5: Company Linker Statistics');
  console.log('-'.repeat(40));
  try {
    const stats = services.linker.getStatistics();
    console.log(`  Total identifiers: ${stats.total}`);
    console.log(`  Linked: ${stats.linked || 0}`);
    console.log(`  Pending: ${stats.pending || 0}`);
    console.log(`  No match: ${stats.no_match || 0}`);
    console.log('  ✓ Statistics retrieved successfully');
    results.passed++;
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 6: European Exchange Coverage
  console.log('TEST 6: European Exchange Coverage');
  console.log('-'.repeat(40));
  try {
    const euExchanges = services.exchange.getEuropeanExchanges();
    const countries = [...new Set(euExchanges.map(e => e.country))];

    console.log(`  Total EU/EEA exchanges: ${euExchanges.length}`);
    console.log(`  Countries covered: ${countries.length}`);
    console.log(`  Countries: ${countries.sort().join(', ')}`);

    if (euExchanges.length >= 25 && countries.length >= 15) {
      console.log('  ✓ Adequate European coverage');
      results.passed++;
    } else {
      console.log('  ✗ Insufficient European coverage');
      results.failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Test 7: GLEIF API (live API call - skippable)
  console.log('TEST 7: GLEIF API - Live Lookup');
  console.log('-'.repeat(40));
  const skipLiveTests = process.env.SKIP_LIVE_TESTS === 'true';

  if (skipLiveTests) {
    console.log('  ⊘ Skipped (SKIP_LIVE_TESTS=true)');
    results.skipped++;
  } else {
    try {
      // BP's LEI
      const lei = '213800LH1BZH3DI6G760';
      console.log(`  Looking up LEI: ${lei}`);

      const record = await services.gleif.getLeiRecord(lei);

      if (record && record.legalName) {
        console.log(`  ✓ Found: ${record.legalName}`);
        console.log(`    Country: ${record.country}`);
        console.log(`    Status: ${record.status}`);
        results.passed++;
      } else {
        console.log('  ✗ No record returned');
        results.failed++;
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      results.failed++;
    }
  }
  console.log();

  // Test 8: OpenFIGI API (live API call - skippable)
  console.log('TEST 8: OpenFIGI API - ISIN Resolution');
  console.log('-'.repeat(40));

  if (skipLiveTests) {
    console.log('  ⊘ Skipped (SKIP_LIVE_TESTS=true)');
    results.skipped++;
  } else {
    try {
      // BP's ISIN
      const isin = 'GB0007980591';
      console.log(`  Resolving ISIN: ${isin}`);

      const figiResults = await services.figi.mapISIN(isin);

      if (figiResults && figiResults.length > 0) {
        console.log(`  ✓ Found ${figiResults.length} listing(s)`);
        for (const listing of figiResults.slice(0, 3)) {
          console.log(`    - ${listing.ticker} on ${listing.exchangeCode} (${listing.currency})`);
        }
        results.passed++;
      } else {
        console.log('  ✗ No listings returned');
        results.failed++;
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      results.failed++;
    }
  }
  console.log();

  // Test 9: Full Resolution Flow (live API calls - skippable)
  console.log('TEST 9: Full LEI → Symbol Resolution');
  console.log('-'.repeat(40));

  if (skipLiveTests) {
    console.log('  ⊘ Skipped (SKIP_LIVE_TESTS=true)');
    results.skipped++;
  } else {
    try {
      // BP's LEI
      const lei = '213800LH1BZH3DI6G760';
      console.log(`  Resolving LEI: ${lei}`);

      const resolution = await services.resolver.resolveFromLEI(lei);

      if (resolution) {
        console.log(`  ✓ Resolved: ${resolution.companyName}`);
        console.log(`    Country: ${resolution.country}`);
        console.log(`    Listings: ${resolution.listings?.length || 0}`);

        if (resolution.primaryListing) {
          console.log(`    Primary: ${resolution.primaryListing.yahooSymbol}`);
        }

        if (resolution.listings?.length > 0) {
          results.passed++;
        } else {
          console.log('  ⚠ No tradeable listings found');
          results.failed++;
        }
      } else {
        console.log('  ✗ Resolution failed');
        results.failed++;
      }
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      results.failed++;
    }
  }
  console.log();

  // Test 10: DataRouter Integration
  console.log('TEST 10: DataRouter Integration');
  console.log('-'.repeat(40));
  try {
    const router = new DataRouter(db, { symbolResolver: services.resolver });

    // Check data availability
    const availability = await router.getDataAvailability('BP.L', 'GB');

    console.log(`  Identifier: ${availability.identifier?.symbol || 'BP.L'}`);
    console.log(`  Country: ${availability.country}`);
    console.log(`  Fundamentals source: ${availability.fundamentalsSource}`);
    console.log(`  XBRL filings: ${availability.capabilities?.xbrlFilings ? 'yes' : 'no'}`);

    if (availability.fundamentalsSource === 'xbrl') {
      console.log('  ✓ UK stock correctly routed to XBRL');
      results.passed++;
    } else {
      console.log('  ✗ Routing mismatch');
      results.failed++;
    }

    // Test US routing
    const usAvailability = await router.getDataAvailability('AAPL', 'US');
    if (usAvailability.fundamentalsSource === 'alphavantage') {
      console.log('  ✓ US stock correctly routed to Alpha Vantage');
      results.passed++;
    } else {
      console.log('  ✗ US routing mismatch');
      results.failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
    results.failed++;
  }
  console.log();

  // Summary
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Passed:  ${results.passed}`);
  console.log(`  Failed:  ${results.failed}`);
  console.log(`  Skipped: ${results.skipped}`);
  console.log();

  if (results.failed === 0) {
    console.log('✅ All tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runIntegrationTests().catch(err => {
    console.error('Integration test error:', err);
    process.exit(1);
  });
}

module.exports = { runIntegrationTests };
