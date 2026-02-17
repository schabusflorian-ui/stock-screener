#!/usr/bin/env node
/**
 * Test All Update Jobs
 * Manually triggers each job handler to verify they work correctly
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// All jobs to test, grouped by bundle
const ALL_JOBS = [
  // Maintenance (quick, good for testing)
  { bundle: 'maintenanceBundle', jobs: ['maintenance.health_check', 'maintenance.stale_check'] },

  // Fundamentals
  { bundle: 'fundamentalsBundle', jobs: ['fundamentals.dividends'] },

  // Portfolio (new)
  { bundle: 'portfolioBundle', jobs: ['portfolio.liquidity', 'portfolio.snapshots'] },

  // EU (new)
  { bundle: 'euBundle', jobs: ['eu.indices', 'eu.prices', 'eu.sync'] },

  // Sentiment (may hit rate limits)
  { bundle: 'sentimentBundle', jobs: ['sentiment.trending'] },

  // Market
  { bundle: 'marketBundle', jobs: ['market.sectors'] },

  // ETF
  { bundle: 'etfBundle', jobs: ['etf.tier1'] },

  // SEC
  { bundle: 'secBundle', jobs: ['sec.filings'] },

  // Analytics
  { bundle: 'analyticsBundle', jobs: ['analytics.market_indicators'] },
];

// Jobs to skip (too slow, require external APIs, or destructive)
const SKIP_JOBS = [
  'maintenance.cleanup',      // Deletes data
  'maintenance.vacuum',       // Long-running
  'maintenance.backup',       // Requires pg_dump
  'maintenance.integrity',    // Long-running
  'fundamentals.quarterly',   // External API
  'fundamentals.metrics',     // Long-running
  'fundamentals.ratios',      // Long-running
  'sentiment.reddit',         // External API
  'sentiment.stocktwits',     // External API, rate limits
  'eu.xbrl_import',          // Very long-running
  'prices.daily',            // External API
  'prices.backfill',         // Very long-running
  'prices.intraday',         // External API
  'prices.index',            // External API
  'etf.holdings',            // Long-running
  'etf.holdings_static',     // Long-running
  'etf.tier2',               // Long-running
  'etf.promotion',           // Modifies data
  'sec.13f',                 // Long-running
  'sec.insider',             // External API
  'knowledge.full',          // Very long-running
  'knowledge.incremental',   // Long-running
  'analytics.factors',       // Long-running
  'analytics.outcomes',      // Long-running
  'analytics.factor_context', // Long-running
  'analytics.investor_styles', // Long-running
  'analytics.track_records', // Long-running
  'analytics.pattern_matching', // Long-running
  'ipo.sync_trading_companies', // Modifies data
  'ipo.check_status',        // External API
  'market.indices',          // External API
  'market.calendar',         // External API
];

async function runAllTests() {
  console.log('='.repeat(70));
  console.log('UPDATE JOB MANUAL TEST RUNNER');
  console.log('='.repeat(70));
  console.log('');

  const { getDatabaseAsync } = require('../src/lib/db');
  const db = await getDatabaseAsync();

  const results = {
    passed: [],
    failed: [],
    skipped: []
  };

  const mockContext = {
    onProgress: async (pct, msg) => {
      process.stdout.write(`\r    Progress: ${pct.toString().padStart(3)}% - ${msg.substring(0, 50).padEnd(50)}`);
    }
  };

  for (const bundleGroup of ALL_JOBS) {
    const bundlePath = `../src/services/updates/bundles/${bundleGroup.bundle}`;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`BUNDLE: ${bundleGroup.bundle}`);
    console.log(`${'─'.repeat(70)}`);

    let bundle;
    try {
      bundle = require(bundlePath);
    } catch (error) {
      console.log(`  [ERROR] Could not load bundle: ${error.message}`);
      bundleGroup.jobs.forEach(j => results.failed.push({ job: j, error: 'Bundle load failed' }));
      continue;
    }

    for (const jobKey of bundleGroup.jobs) {
      console.log(`\n  JOB: ${jobKey}`);

      if (SKIP_JOBS.includes(jobKey)) {
        console.log(`    [SKIP] Job is in skip list (external API/long-running/destructive)`);
        results.skipped.push({ job: jobKey, reason: 'In skip list' });
        continue;
      }

      const startTime = Date.now();

      try {
        const result = await bundle.execute(jobKey, db, mockContext);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(''); // New line after progress

        if (result) {
          const status = result.metadata?.skipped ? 'SKIP' : 'PASS';
          console.log(`    [${status}] Completed in ${elapsed}s`);
          console.log(`           Total: ${result.itemsTotal || 0}, Processed: ${result.itemsProcessed || 0}, Updated: ${result.itemsUpdated || 0}, Failed: ${result.itemsFailed || 0}`);

          if (result.metadata?.skipped) {
            results.skipped.push({ job: jobKey, reason: result.metadata.reason, elapsed });
          } else {
            results.passed.push({ job: jobKey, result, elapsed });
          }
        } else {
          console.log(`    [WARN] No result returned`);
          results.passed.push({ job: jobKey, result: null, elapsed });
        }
      } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(''); // New line after progress
        console.log(`    [FAIL] Error after ${elapsed}s: ${error.message}`);
        results.failed.push({ job: jobKey, error: error.message, elapsed });
      }
    }
  }

  // Summary
  console.log('\n');
  console.log('='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Passed:  ${results.passed.length}`);
  console.log(`  Failed:  ${results.failed.length}`);
  console.log(`  Skipped: ${results.skipped.length}`);
  console.log('');

  if (results.passed.length > 0) {
    console.log('PASSED:');
    results.passed.forEach(r => {
      const updated = r.result?.itemsUpdated || 0;
      console.log(`  ✓ ${r.job} (${r.elapsed}s, ${updated} updated)`);
    });
    console.log('');
  }

  if (results.failed.length > 0) {
    console.log('FAILED:');
    results.failed.forEach(r => {
      console.log(`  ✗ ${r.job}: ${r.error}`);
    });
    console.log('');
  }

  if (results.skipped.length > 0) {
    console.log('SKIPPED:');
    results.skipped.forEach(r => {
      console.log(`  - ${r.job}: ${r.reason}`);
    });
    console.log('');
  }

  return results.failed.length > 0 ? 1 : 0;
}

// Run
runAllTests()
  .then(code => {
    console.log(`Exit code: ${code}`);
    process.exit(code);
  })
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
