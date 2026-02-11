// src/database-migrations/006-backfill-historical-company-ids.js
// Backfill investment_decisions.company_id from companies.symbol so outcome calculation can run.
// Outcome data (return_1y, etc.) is populated by POST /api/historical/calculate-outcomes or scheduler.

async function migrate(db) {
  console.log('🐘 Backfilling investment_decisions.company_id from companies.symbol...');

  const r = await db.query(`
    UPDATE investment_decisions d
    SET company_id = c.id, updated_at = NOW()
    FROM companies c
    WHERE d.symbol = c.symbol AND d.company_id IS NULL
  `);
  const updated = r.rowCount ?? 0;
  console.log(`   Updated ${updated} decisions with company_id`);
  console.log('✅ Backfill complete. Run outcome calculation (API or scheduler) to populate return_1y.');
}

module.exports = migrate;
