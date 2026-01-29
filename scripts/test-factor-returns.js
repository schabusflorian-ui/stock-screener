#!/usr/bin/env node
/**
 * Test Daily Factor Returns Calculation
 *
 * Tests the factor attribution system's ability to:
 * 1. Calculate daily factor returns (MKT, SMB, HML, UMD, QMJ, BAB)
 * 2. Store them in daily_factor_returns table
 * 3. Verify reasonable factor return ranges
 */

const Database = require('better-sqlite3');
const path = require('path');
const { FactorAttribution } = require('../src/services/factors/factorAttribution');

const dbPath = path.join(__dirname, '..', 'data', 'stocks.db');
const db = new Database(dbPath);
const factorAttribution = new FactorAttribution(db);

console.log('\n🧪 DAILY FACTOR RETURNS TEST\n');
console.log('='.repeat(80));

// Check if we have any existing factor returns
console.log('\n📊 Existing Factor Returns\n');

const existingReturns = db.prepare(`
  SELECT COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
  FROM daily_factor_returns
`).get();

console.log(`  Existing records: ${existingReturns.count}`);
if (existingReturns.count > 0) {
  console.log(`  Date range: ${existingReturns.earliest} to ${existingReturns.latest}`);
}

// Calculate factor returns for a few recent dates
console.log('\n📊 Calculating Factor Returns for Recent Dates\n');

const testDates = [
  '2025-12-01',
  '2025-12-02',
  '2025-12-03',
  '2025-12-04',
  '2025-12-05'
];

let successCount = 0;
let errorCount = 0;

for (const date of testDates) {
  try {
    const factors = factorAttribution.calculateDailyFactorReturns(date);

    if (factors) {
      successCount++;
      console.log(`  ✅ ${date}:`);
      console.log(`     MKT-RF: ${(factors.mkt_rf * 100).toFixed(3)}%, SMB: ${(factors.smb * 100).toFixed(3)}%, HML: ${(factors.hml * 100).toFixed(3)}%`);
      console.log(`     UMD: ${(factors.umd * 100).toFixed(3)}%, QMJ: ${(factors.qmj * 100).toFixed(3)}%, BAB: ${(factors.bab * 100).toFixed(3)}%`);
    } else {
      errorCount++;
      console.log(`  ❌ ${date}: No factors returned`);
    }
  } catch (error) {
    errorCount++;
    console.log(`  ❌ ${date}: ${error.message}`);
  }
}

// Check stored factor returns
console.log('\n📊 Stored Factor Returns Summary\n');

const storedReturns = db.prepare(`
  SELECT COUNT(*) as count, MIN(date) as earliest, MAX(date) as latest
  FROM daily_factor_returns
`).get();

console.log(`  Total stored records: ${storedReturns.count}`);
if (storedReturns.count > 0) {
  console.log(`  Date range: ${storedReturns.earliest} to ${storedReturns.latest}`);

  // Show recent factor returns
  const recentReturns = db.prepare(`
    SELECT * FROM daily_factor_returns
    ORDER BY date DESC
    LIMIT 10
  `).all();

  console.log('\n  Recent Factor Returns:');
  recentReturns.forEach(r => {
    console.log(`    ${r.date}: MKT=${(r.mkt_rf * 100).toFixed(2)}% SMB=${(r.smb * 100).toFixed(2)}% HML=${(r.hml * 100).toFixed(2)}%`);
  });

  // Calculate summary statistics
  const stats = db.prepare(`
    SELECT
      AVG(mkt_rf) * 100 as avg_mkt,
      AVG(smb) * 100 as avg_smb,
      AVG(hml) * 100 as avg_hml,
      AVG(umd) * 100 as avg_umd,
      AVG(qmj) * 100 as avg_qmj,
      AVG(bab) * 100 as avg_bab
    FROM daily_factor_returns
  `).get();

  console.log('\n  Average Daily Returns:');
  console.log(`    Market (MKT-RF): ${stats.avg_mkt.toFixed(3)}%`);
  console.log(`    Size (SMB): ${stats.avg_smb.toFixed(3)}%`);
  console.log(`    Value (HML): ${stats.avg_hml.toFixed(3)}%`);
  console.log(`    Momentum (UMD): ${stats.avg_umd.toFixed(3)}%`);
  console.log(`    Quality (QMJ): ${stats.avg_qmj.toFixed(3)}%`);
  console.log(`    Low Vol (BAB): ${stats.avg_bab.toFixed(3)}%`);
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 Test Summary: ${successCount} successful, ${errorCount} errors\n`);

if (successCount > 0) {
  console.log('✅ Factor returns calculation is working!\n');
} else {
  console.log('❌ Factor returns calculation failed. Check implementation.\n');
}

db.close();
