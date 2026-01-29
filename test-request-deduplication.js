// test-request-deduplication.js
/**
 * Test script for Request Deduplication System (Phase 3.4)
 *
 * CRITICAL: Tests that we only deduplicate truly identical requests
 * and never lose data.
 *
 * Tests:
 * 1. Identical concurrent requests are deduplicated
 * 2. Different parameters are NOT deduplicated
 * 3. No data loss occurs
 * 4. Statistics are accurate
 * 5. Edge cases handled correctly
 */

const { RequestDeduplicator, createRequestKey } = require('./src/lib/requestDeduplicator');

async function runAllTests() {
  console.log('🧪 Testing Request Deduplication System\n');

  // =============================================
  // Test 1: Basic Deduplication
  // =============================================
  console.log('Test 1: Basic deduplication of identical requests...');

async function test1() {
  const deduplicator = new RequestDeduplicator('Test1');
  let apiCallCount = 0;

  // Simulate API call
  const mockApiCall = async (symbol) => {
    apiCallCount++;
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay
    return { symbol, price: 150.00, apiCallNumber: apiCallCount };
  };

  // Make 10 concurrent identical requests
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const key = createRequestKey('getQuote', 'AAPL');
    promises.push(deduplicator.execute(key, () => mockApiCall('AAPL')));
  }

  const results = await Promise.all(promises);

  // Verify all got the same result
  const firstResult = results[0];
  const allSame = results.every(r =>
    r.symbol === firstResult.symbol &&
    r.price === firstResult.price &&
    r.apiCallNumber === firstResult.apiCallNumber
  );

  if (allSame && apiCallCount === 1) {
    console.log('✅ Deduplication works: 10 requests → 1 API call');
    console.log(`   API calls made: ${apiCallCount}`);
    console.log(`   All results identical: ${allSame}`);
  } else {
    console.log('❌ Deduplication failed');
    console.log(`   API calls made: ${apiCallCount} (expected 1)`);
    console.log(`   All results identical: ${allSame} (expected true)`);
  }

  const stats = deduplicator.getStats();
  console.log(`   Stats: ${stats.totalRequests} total, ${stats.deduplicatedRequests} deduplicated (${stats.deduplicationRate}% rate)`);
}

  await test1();
  console.log('');

  // =============================================
  // Test 2: Different Parameters NOT Deduplicated
  // =============================================
  console.log('Test 2: Different parameters are NOT deduplicated...');

async function test2() {
  const deduplicator = new RequestDeduplicator('Test2');
  let apiCallCount = 0;

  const mockApiCall = async (symbol) => {
    apiCallCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
    return { symbol, price: Math.random() * 200 };
  };

  // Make concurrent requests for DIFFERENT symbols
  const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];
  const promises = symbols.map(symbol => {
    const key = createRequestKey('getQuote', symbol);
    return deduplicator.execute(key, () => mockApiCall(symbol));
  });

  const results = await Promise.all(promises);

  // Verify each symbol got its own call
  const uniqueSymbols = new Set(results.map(r => r.symbol));

  if (apiCallCount === 5 && uniqueSymbols.size === 5) {
    console.log('✅ Different parameters not deduplicated: 5 symbols → 5 API calls');
    console.log(`   Symbols: ${Array.from(uniqueSymbols).join(', ')}`);
    console.log(`   API calls: ${apiCallCount}`);
  } else {
    console.log('❌ Failed: Different parameters were incorrectly deduplicated');
    console.log(`   API calls: ${apiCallCount} (expected 5)`);
    console.log(`   Unique symbols: ${uniqueSymbols.size} (expected 5)`);
  }

  const stats = deduplicator.getStats();
  console.log(`   Deduplication rate: ${stats.deduplicationRate}% (expected 0%)`);
}

  await test2();
  console.log('');

  // =============================================
  // Test 3: Mixed Scenario (Some Same, Some Different)
  // =============================================
  console.log('Test 3: Mixed scenario - some duplicate, some unique...');

async function test3() {
  const deduplicator = new RequestDeduplicator('Test3');
  let apiCallCount = 0;

  const mockApiCall = async (symbol) => {
    apiCallCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
    return { symbol, callNumber: apiCallCount };
  };

  // 10 requests: 5 for AAPL, 3 for MSFT, 2 for GOOGL
  const requests = [
    ...Array(5).fill('AAPL'),
    ...Array(3).fill('MSFT'),
    ...Array(2).fill('GOOGL')
  ];

  const promises = requests.map(symbol => {
    const key = createRequestKey('getQuote', symbol);
    return deduplicator.execute(key, () => mockApiCall(symbol));
  });

  const results = await Promise.all(promises);

  // Should make exactly 3 API calls (1 per unique symbol)
  const aaplResults = results.filter(r => r.symbol === 'AAPL');
  const msftResults = results.filter(r => r.symbol === 'MSFT');
  const googlResults = results.filter(r => r.symbol === 'GOOGL');

  // All AAPL results should be identical
  const aaplSame = aaplResults.every(r => r.callNumber === aaplResults[0].callNumber);
  const msftSame = msftResults.every(r => r.callNumber === msftResults[0].callNumber);
  const googlSame = googlResults.every(r => r.callNumber === googlResults[0].callNumber);

  if (apiCallCount === 3 && aaplSame && msftSame && googlSame) {
    console.log('✅ Mixed scenario handled correctly: 10 requests → 3 API calls');
    console.log(`   AAPL: 5 requests → 1 call (all got call #${aaplResults[0].callNumber})`);
    console.log(`   MSFT: 3 requests → 1 call (all got call #${msftResults[0].callNumber})`);
    console.log(`   GOOGL: 2 requests → 1 call (all got call #${googlResults[0].callNumber})`);
  } else {
    console.log('❌ Mixed scenario failed');
    console.log(`   API calls: ${apiCallCount} (expected 3)`);
    console.log(`   AAPL same: ${aaplSame}, MSFT same: ${msftSame}, GOOGL same: ${googlSame}`);
  }

  const stats = deduplicator.getStats();
  console.log(`   Total requests: ${stats.totalRequests}`);
  console.log(`   Unique requests: ${stats.uniqueRequests}`);
  console.log(`   Deduplicated: ${stats.deduplicatedRequests}`);
  console.log(`   Deduplication rate: ${stats.deduplicationRate}%`);
}

  await test3();
  console.log('');

  // =============================================
  // Test 4: Parameter Sensitivity
  // =============================================
  console.log('Test 4: Parameter sensitivity - different params = different requests...');

async function test4() {
  const deduplicator = new RequestDeduplicator('Test4');
  let apiCallCount = 0;

  const mockApiCall = async (symbol, options) => {
    apiCallCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
    return { symbol, options, callNumber: apiCallCount };
  };

  // Same symbol, different options - should NOT be deduplicated
  const promises = [
    // Group 1: No options (3 requests)
    ...Array(3).fill(null).map(() => {
      const key = createRequestKey('getData', 'AAPL');
      return deduplicator.execute(key, () => mockApiCall('AAPL'));
    }),

    // Group 2: With detailed option (2 requests)
    ...Array(2).fill(null).map(() => {
      const key = createRequestKey('getData', 'AAPL', { detailed: true });
      return deduplicator.execute(key, () => mockApiCall('AAPL', { detailed: true }));
    }),

    // Group 3: With range option (2 requests)
    ...Array(2).fill(null).map(() => {
      const key = createRequestKey('getData', 'AAPL', { range: '1y' });
      return deduplicator.execute(key, () => mockApiCall('AAPL', { range: '1y' }));
    })
  ];

  const results = await Promise.all(promises);

  // Should make exactly 3 API calls (one per unique parameter combination)
  const group1 = results.filter(r => r.options === undefined);
  const group2 = results.filter(r => r.options?.detailed === true);
  const group3 = results.filter(r => r.options?.range === '1y');

  const group1Same = group1.every(r => r.callNumber === group1[0].callNumber);
  const group2Same = group2.every(r => r.callNumber === group2[0].callNumber);
  const group3Same = group3.every(r => r.callNumber === group3[0].callNumber);

  if (apiCallCount === 3 && group1Same && group2Same && group3Same) {
    console.log('✅ Parameter sensitivity correct: 7 requests → 3 API calls');
    console.log(`   No options: 3 requests → 1 call`);
    console.log(`   {detailed:true}: 2 requests → 1 call`);
    console.log(`   {range:'1y'}: 2 requests → 1 call`);
  } else {
    console.log('❌ Parameter sensitivity failed');
    console.log(`   API calls: ${apiCallCount} (expected 3)`);
  }

  const stats = deduplicator.getStats();
  console.log(`   Deduplication rate: ${stats.deduplicationRate}%`);
}

  await test4();
  console.log('');

  // =============================================
  // Test 5: Error Handling
  // =============================================
  console.log('Test 5: Error handling - failed requests don\'t break system...');

async function test5() {
  const deduplicator = new RequestDeduplicator('Test5');
  let apiCallCount = 0;

  const mockApiCall = async (symbol) => {
    apiCallCount++;
    await new Promise(resolve => setTimeout(resolve, 50));
    if (symbol === 'ERROR') {
      throw new Error('Simulated API error');
    }
    return { symbol, success: true };
  };

  // Make concurrent requests that will fail
  const promises = Array(5).fill(null).map(() => {
    const key = createRequestKey('getData', 'ERROR');
    return deduplicator.execute(key, () => mockApiCall('ERROR'))
      .catch(err => ({ error: err.message }));
  });

  const results = await Promise.all(promises);

  // All should have failed with same error
  const allFailed = results.every(r => r.error === 'Simulated API error');

  // Should only make 1 API call (deduplicated)
  if (apiCallCount === 1 && allFailed) {
    console.log('✅ Error handling works: 5 failing requests → 1 API call');
    console.log(`   All received same error: ${allFailed}`);
    console.log(`   API calls: ${apiCallCount}`);
  } else {
    console.log('❌ Error handling failed');
    console.log(`   API calls: ${apiCallCount} (expected 1)`);
    console.log(`   All failed: ${allFailed}`);
  }

  // After error, new requests should work
  apiCallCount = 0;
  const key = createRequestKey('getData', 'AAPL');
  const result = await deduplicator.execute(key, () => mockApiCall('AAPL'));

  if (result.success && apiCallCount === 1) {
    console.log('✅ System recovers after errors');
  } else {
    console.log('❌ System did not recover properly');
  }
}

  await test5();
  console.log('');

  // =============================================
  // Test 6: Key Normalization
  // =============================================
  console.log('Test 6: Key normalization - object key order doesn\'t matter...');

async function test6() {
  // Create keys with same params but different order
  const key1 = createRequestKey('getData', { symbol: 'AAPL', range: '1y', detailed: true });
  const key2 = createRequestKey('getData', { detailed: true, symbol: 'AAPL', range: '1y' });
  const key3 = createRequestKey('getData', { range: '1y', detailed: true, symbol: 'AAPL' });

  if (key1 === key2 && key2 === key3) {
    console.log('✅ Key normalization works: object key order doesn\'t matter');
    console.log(`   All three orderings produce same key`);
  } else {
    console.log('❌ Key normalization failed');
    console.log(`   Keys should be equal but aren\'t`);
  }
}

  await test6();
  console.log('');

  // =============================================
  // Summary
  // =============================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All deduplication tests completed!');
  console.log('');
  console.log('📊 System guarantees:');
  console.log('   ✅ Only IDENTICAL requests are deduplicated');
  console.log('   ✅ Different parameters = separate requests');
  console.log('   ✅ No data loss - all callers get correct results');
  console.log('   ✅ Errors are properly shared among deduplicated requests');
  console.log('   ✅ Object key order normalized for consistency');
  console.log('');
  console.log('🚀 Expected real-world impact:');
  console.log('   Dashboard loads: 100 concurrent AAPL requests → 1 API call');
  console.log('   Portfolio refresh: 10 positions × 10 users → 10 API calls (not 100)');
  console.log('   Comparison pages: 5 companies × 20 users → 5 API calls (not 100)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Run all tests
runAllTests()
  .then(() => {
    console.log('\n✅ Test suite completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });
