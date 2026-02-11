// src/database-migrations/022-add-investor-famous-columns-postgres.js
// Add missing columns used by investorService.getInvestorsByStock (root cause of /api/investors/by-stock 500)
// - famous_investors.fund_name (referenced in SELECT; 000 base schema does not have it)
// - investor_holdings.shares_change_pct optional (investorService now computes in SQL; add for consistency)

async function migrate(db) {
  console.log('🐘 Adding missing investor columns (Postgres)...');

  try {
    await db.query(`
      ALTER TABLE famous_investors
      ADD COLUMN IF NOT EXISTS fund_name TEXT
    `);
    console.log('  ✓ famous_investors.fund_name');
  } catch (e) {
    if (e.code !== '42701') throw e; // 42701 = column already exists
    console.log('  - famous_investors.fund_name (already exists)');
  }

  try {
    await db.query(`
      ALTER TABLE investor_holdings
      ADD COLUMN IF NOT EXISTS shares_change_pct REAL
    `);
    console.log('  ✓ investor_holdings.shares_change_pct');
  } catch (e) {
    if (e.code !== '42701') throw e;
    console.log('  - investor_holdings.shares_change_pct (already exists)');
  }

  console.log('✅ Investor columns ready.');
}

module.exports = migrate;
