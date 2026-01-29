#!/usr/bin/env node
// src/jobs/recalculatePerformance.js
// CLI tool to recalculate and cache investor performance data

const investorService = require('../services/portfolio/investorService');

const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: node src/jobs/recalculatePerformance.js [options]

Options:
  --all                 Recalculate performance for all investors
  --investor <id>       Recalculate for a specific investor
  --status              Show cache status for all investors
  --verify              Verify cache integrity
  --help                Show this help message

Examples:
  node src/jobs/recalculatePerformance.js --all
  node src/jobs/recalculatePerformance.js --investor 1
  node src/jobs/recalculatePerformance.js --status
`);
}

async function recalculateAll() {
  console.log('📊 Recalculating performance for all investors...\n');

  const startTime = Date.now();
  const results = investorService.recalculateAllPerformance();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n📊 Recalculation Results:');
  console.log(`  Total investors: ${results.total}`);
  console.log(`  ✅ Successfully cached: ${results.success}`);
  console.log(`  ⏭️  No data available: ${results.noData}`);
  console.log(`  ❌ Failed: ${results.failed}`);
  console.log(`  ⏱️  Time: ${elapsed}s`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach(e => {
      console.log(`  - ${e.name} (ID: ${e.investorId}): ${e.error}`);
    });
  }
}

async function recalculateInvestor(investorId) {
  console.log(`📊 Recalculating performance for investor ${investorId}...\n`);

  try {
    const startTime = Date.now();
    const data = investorService.calculateAndCachePerformance(investorId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (data.returns && data.returns.length > 0) {
      console.log(`✅ Cached ${data.returns.length} quarters for investor ${investorId}`);
      if (data.summary) {
        console.log(`   Total Return: ${data.summary.totalReturn?.toFixed(2)}%`);
        console.log(`   Alpha: ${data.summary.alpha?.toFixed(2)}%`);
        console.log(`   Periods: ${data.summary.periodCount}`);
      }
    } else {
      console.log(`⚠️  No data available for investor ${investorId}`);
    }

    console.log(`⏱️  Time: ${elapsed}s`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function showStatus() {
  console.log('📊 Performance Cache Status:\n');

  const status = investorService.getPerformanceCacheStatus();

  const cachedCount = status.filter(s => s.cached_quarters > 0).length;
  const uncachedCount = status.filter(s => s.cached_quarters === 0).length;

  console.log(`Total investors: ${status.length}`);
  console.log(`Cached: ${cachedCount}`);
  console.log(`Uncached: ${uncachedCount}\n`);

  // Table header
  console.log('ID   | Name                           | Quarters | Total Return | Alpha    | Calculated');
  console.log('-----|--------------------------------|----------|--------------|----------|--------------------');

  for (const inv of status) {
    const id = String(inv.id).padEnd(4);
    const name = (inv.name || 'Unknown').substring(0, 30).padEnd(30);
    const quarters = String(inv.cached_quarters || 0).padStart(8);
    const totalReturn = inv.total_return !== null ? `${inv.total_return.toFixed(1)}%`.padStart(12) : '         N/A';
    const alpha = inv.alpha !== null ? `${inv.alpha.toFixed(1)}%`.padStart(8) : '     N/A';
    const calculated = inv.summary_calculated_at ? inv.summary_calculated_at.substring(0, 19) : 'Never';

    console.log(`${id} | ${name} | ${quarters} | ${totalReturn} | ${alpha} | ${calculated}`);
  }
}

function verifyCache() {
  console.log('🔍 Verifying performance cache integrity...\n');

  const status = investorService.getPerformanceCacheStatus();
  let issues = 0;

  for (const inv of status) {
    // Check if cached data matches what would be recalculated
    if (inv.cached_quarters > 0) {
      try {
        const fresh = investorService.getPortfolioReturns(inv.id, { limit: 50 });

        if (fresh.returns && fresh.returns.length !== inv.cached_quarters) {
          console.log(`⚠️  ${inv.name}: Cache has ${inv.cached_quarters} quarters, fresh calc has ${fresh.returns.length}`);
          issues++;
        }
      } catch (e) {
        console.log(`❌ ${inv.name}: Error verifying - ${e.message}`);
        issues++;
      }
    }
  }

  if (issues === 0) {
    console.log('✅ All cached data is valid');
  } else {
    console.log(`\n⚠️  Found ${issues} issues. Run --all to refresh cache.`);
  }
}

// Main
async function main() {
  if (args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  if (args.includes('--all')) {
    await recalculateAll();
  } else if (args.includes('--investor')) {
    const idIndex = args.indexOf('--investor') + 1;
    const investorId = parseInt(args[idIndex]);
    if (isNaN(investorId)) {
      console.error('Error: Invalid investor ID');
      process.exit(1);
    }
    await recalculateInvestor(investorId);
  } else if (args.includes('--status')) {
    showStatus();
  } else if (args.includes('--verify')) {
    verifyCache();
  } else {
    console.error('Error: Unknown option');
    printUsage();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
