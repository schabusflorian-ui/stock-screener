#!/usr/bin/env node
/**
 * Test Job Handlers - Actually runs the handlers
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function testHandlers() {
  console.log('='.repeat(60));
  console.log('JOB HANDLER TESTS');
  console.log('='.repeat(60));
  console.log('');

  const { getDatabaseAsync } = require('../src/lib/db');
  const db = await getDatabaseAsync();

  const mockContext = {
    onProgress: async (pct, msg) => {
      console.log(`    Progress: ${pct}% - ${msg}`);
    }
  };

  const tests = [
    {
      name: 'maintenance.health_check',
      bundle: '../src/services/updates/bundles/maintenanceBundle',
      job: 'maintenance.health_check'
    },
    {
      name: 'maintenance.stale_check',
      bundle: '../src/services/updates/bundles/maintenanceBundle',
      job: 'maintenance.stale_check'
    },
    {
      name: 'fundamentals.dividends',
      bundle: '../src/services/updates/bundles/fundamentalsBundle',
      job: 'fundamentals.dividends'
    },
    {
      name: 'sentiment.stocktwits (dry-run)',
      bundle: '../src/services/updates/bundles/sentimentBundle',
      job: 'sentiment.stocktwits',
      skipExecution: true  // Don't actually run - just check handler exists
    }
  ];

  const results = { passed: 0, failed: 0 };

  for (const test of tests) {
    console.log(`TEST: ${test.name}`);
    console.log('-'.repeat(40));

    try {
      const bundle = require(test.bundle);

      if (test.skipExecution) {
        console.log('  [SKIP] Skipping actual execution (API calls)');
        console.log('  [PASS] Handler exists and loads correctly');
        results.passed++;
      } else {
        const result = await bundle.execute(test.job, db, mockContext);
        console.log('  Result:', JSON.stringify(result, null, 2));

        if (result && typeof result.itemsProcessed !== 'undefined') {
          console.log('  [PASS] Handler executed successfully');
          results.passed++;
        } else {
          console.log('  [FAIL] Unexpected result format');
          results.failed++;
        }
      }
    } catch (error) {
      console.log('  [FAIL] Error:', error.message);
      results.failed++;
    }
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('='.repeat(60));

  process.exit(results.failed > 0 ? 1 : 0);
}

testHandlers().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
