#!/usr/bin/env node
// scripts/run-calculate-outcomes.js
// Run outcome calculation for investment_decisions (return_1y, alpha_1y, etc.).
// Use: node scripts/run-calculate-outcomes.js [limit] [minDaysOld]
// From project root.

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

const { getDatabaseAsync } = require('../src/lib/db');
const { getHistoricalIntelligence } = require('../src/services/historical');

const limit = parseInt(process.argv[2], 10) || 2000;
const minDaysOld = parseInt(process.argv[3], 10) || 365;

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 RUN OUTCOME CALCULATION');
  console.log('='.repeat(60));
  console.log(`  limit: ${limit}, minDaysOld: ${minDaysOld}\n`);

  const db = await getDatabaseAsync();
  if (!db) {
    console.error('Database not available.');
    process.exit(1);
  }

  const isPostgres = db.type === 'postgres';

  // Bulk backfill company_id from symbol (so more decisions get outcomes)
  if (isPostgres) {
    try {
      const r = await db.query(`
        UPDATE investment_decisions d
        SET company_id = c.id, updated_at = NOW()
        FROM companies c
        WHERE d.symbol = c.symbol AND d.company_id IS NULL
      `);
      const updated = r.rowCount ?? 0;
      if (updated > 0) console.log(`  Backfilled company_id for ${updated} decisions.\n`);
    } catch (e) {
      console.warn('  Backfill company_id (non-fatal):', e.message);
    }
  }

  const his = getHistoricalIntelligence();
  const result = await his.calculateAllOutcomes({
    limit,
    minDaysOld,
    verbose: true
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Result:', result);
  console.log('='.repeat(60) + '\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
