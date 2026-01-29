#!/usr/bin/env node
/**
 * Flag Inactive Companies
 *
 * This script identifies and flags companies that are likely inactive/delisted:
 * 1. Companies with no financial data in the last 3 years
 * 2. Companies that only have CIK identifiers (no ticker symbol)
 *
 * Usage: node scripts/flag-inactive-companies.js [--dry-run]
 */

const db = require('../src/database');

const STALE_DATA_YEARS = 3; // Companies with no data in last N years are considered inactive

async function flagInactiveCompanies(dryRun = false) {
  const database = db.getDatabase();

  console.log('\n=== Flagging Inactive Companies ===\n');

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - STALE_DATA_YEARS);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  console.log(`Cutoff date: ${cutoffDateStr} (${STALE_DATA_YEARS} years ago)\n`);

  // Find companies with stale data (no recent financial data)
  const staleCompanies = database.prepare(`
    SELECT
      c.id,
      c.symbol,
      c.name,
      c.is_active,
      MAX(m.fiscal_period) as latest_period
    FROM companies c
    LEFT JOIN calculated_metrics m ON c.id = m.company_id
    GROUP BY c.id
    HAVING latest_period IS NULL OR latest_period < ?
  `).all(cutoffDateStr);

  console.log(`Found ${staleCompanies.length} companies with stale/missing data\n`);

  // Find CIK-only companies
  const cikOnlyCompanies = database.prepare(`
    SELECT id, symbol, name, is_active
    FROM companies
    WHERE symbol LIKE 'CIK_%'
  `).all();

  console.log(`Found ${cikOnlyCompanies.length} CIK-only companies (no ticker symbol)\n`);

  // Combine both lists (some may overlap)
  const allInactiveIds = new Set();

  staleCompanies.forEach(c => allInactiveIds.add(c.id));
  cikOnlyCompanies.forEach(c => allInactiveIds.add(c.id));

  const totalToFlag = allInactiveIds.size;

  // Count currently active
  const currentlyActive = database.prepare(`
    SELECT COUNT(*) as count FROM companies WHERE is_active = 1
  `).get().count;

  console.log('Summary:');
  console.log(`  - Currently marked active: ${currentlyActive}`);
  console.log(`  - Companies with stale data (>${STALE_DATA_YEARS}y old): ${staleCompanies.length}`);
  console.log(`  - CIK-only companies: ${cikOnlyCompanies.length}`);
  console.log(`  - Total to flag as inactive: ${totalToFlag}\n`);

  if (dryRun) {
    console.log('DRY RUN - No changes made\n');

    // Show sample of what would be flagged
    console.log('Sample of companies to flag (first 20):');
    const sample = [...allInactiveIds].slice(0, 20);
    const sampleData = database.prepare(`
      SELECT c.symbol, c.name, MAX(m.fiscal_period) as latest_period
      FROM companies c
      LEFT JOIN calculated_metrics m ON c.id = m.company_id
      WHERE c.id IN (${sample.join(',')})
      GROUP BY c.id
    `).all();

    sampleData.forEach(c => {
      const reason = c.symbol.startsWith('CIK_') ? 'CIK-only' : 'stale data';
      console.log(`  ${c.symbol.padEnd(20)} | ${(c.name || 'N/A').substring(0, 30).padEnd(30)} | ${c.latest_period || 'no data'} | ${reason}`);
    });

    return { flagged: 0, dryRun: true };
  }

  // Actually flag the companies
  console.log('Flagging companies as inactive...');

  const updateStmt = database.prepare(`
    UPDATE companies SET is_active = 0, last_updated = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const flagTransaction = database.transaction((ids) => {
    let count = 0;
    for (const id of ids) {
      updateStmt.run(id);
      count++;
    }
    return count;
  });

  const flaggedCount = flagTransaction([...allInactiveIds]);

  console.log(`\n✅ Flagged ${flaggedCount} companies as inactive\n`);

  // Show new counts
  const newActiveCount = database.prepare(`
    SELECT COUNT(*) as count FROM companies WHERE is_active = 1
  `).get().count;

  const newInactiveCount = database.prepare(`
    SELECT COUNT(*) as count FROM companies WHERE is_active = 0
  `).get().count;

  console.log('New status:');
  console.log(`  - Active companies: ${newActiveCount}`);
  console.log(`  - Inactive companies: ${newInactiveCount}`);

  return { flagged: flaggedCount, dryRun: false };
}

// Also create a function to re-activate companies if they get new data
function reactivateWithNewData() {
  const database = db.getDatabase();

  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  // Find inactive companies that now have recent data
  const toReactivate = database.prepare(`
    SELECT DISTINCT c.id, c.symbol
    FROM companies c
    JOIN calculated_metrics m ON c.id = m.company_id
    WHERE c.is_active = 0
      AND m.fiscal_period >= ?
      AND c.symbol NOT LIKE 'CIK_%'
  `).all(cutoffDateStr);

  if (toReactivate.length === 0) {
    console.log('No inactive companies with recent data to reactivate');
    return 0;
  }

  console.log(`Found ${toReactivate.length} companies to reactivate`);

  const updateStmt = database.prepare(`
    UPDATE companies SET is_active = 1, last_updated = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const reactivateTransaction = database.transaction((companies) => {
    let count = 0;
    for (const c of companies) {
      updateStmt.run(c.id);
      count++;
    }
    return count;
  });

  const reactivatedCount = reactivateTransaction(toReactivate);
  console.log(`✅ Reactivated ${reactivatedCount} companies`);

  return reactivatedCount;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  }

  flagInactiveCompanies(dryRun)
    .then(result => {
      if (!result.dryRun && result.flagged > 0) {
        console.log('\n--- Checking for reactivations ---');
        reactivateWithNewData();
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { flagInactiveCompanies, reactivateWithNewData };
