/**
 * Migration: Remap CIK symbols to real tickers
 *
 * Problem: Many holdings are mapped to CIK_XXXXXXXX symbols which have no price data.
 * These companies have real tradeable tickers that DO have price data.
 *
 * This migration updates investor_holdings.company_id to point to the real ticker's
 * company record, enabling price-based return calculations.
 *
 * Mappings applied:
 *   CIK_0000930184 → BHC (Valeant/Bausch Health) - $8.9B
 *   CIK_0001498828 → HHH (Howard Hughes) - $27.7B
 *   CIK_0001649338 → AVGO (Broadcom) - $38.5B
 *   CIK_0000858339 → CZR (Caesars) - $23.3B
 */

const db = require('../database').db;

const CIK_TO_TICKER_MAPPINGS = [
  { cik_symbol: 'CIK_0000930184', real_symbol: 'BHC', name: 'Valeant → Bausch Health' },
  { cik_symbol: 'CIK_0001498828', real_symbol: 'HHH', name: 'Howard Hughes Corp' },
  { cik_symbol: 'CIK_0001649338', real_symbol: 'AVGO', name: 'Broadcom Ltd → Inc' },
  { cik_symbol: 'CIK_0000858339', real_symbol: 'CZR', name: 'Caesars Entertainment' },
];

function runMigration() {
  console.log('🔄 Remapping CIK symbols to real tickers...\n');

  let totalRemapped = 0;

  for (const mapping of CIK_TO_TICKER_MAPPINGS) {
    // Get CIK company ID
    const cikCompany = db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(mapping.cik_symbol);

    if (!cikCompany) {
      console.log(`⚠️  ${mapping.cik_symbol}: CIK company not found, skipping`);
      continue;
    }

    // Get real ticker company ID
    const realCompany = db.prepare(`
      SELECT id FROM companies WHERE symbol = ?
    `).get(mapping.real_symbol);

    if (!realCompany) {
      console.log(`⚠️  ${mapping.real_symbol}: Real ticker not found, skipping`);
      continue;
    }

    // Count holdings to remap
    const holdingsCount = db.prepare(`
      SELECT COUNT(*) as cnt, SUM(market_value)/1e9 as val
      FROM investor_holdings WHERE company_id = ?
    `).get(cikCompany.id);

    // Update holdings to point to real company
    const result = db.prepare(`
      UPDATE investor_holdings
      SET company_id = ?
      WHERE company_id = ?
    `).run(realCompany.id, cikCompany.id);

    console.log(`✅ ${mapping.name}:`);
    console.log(`   ${mapping.cik_symbol} (id=${cikCompany.id}) → ${mapping.real_symbol} (id=${realCompany.id})`);
    console.log(`   Remapped ${result.changes} holdings ($${holdingsCount.val?.toFixed(1)}B)`);

    totalRemapped += result.changes;
  }

  console.log(`\n✅ Total holdings remapped: ${totalRemapped}`);

  // Verify the mappings worked
  console.log('\n📊 Verification - CIK symbols remaining:');
  const remaining = db.prepare(`
    SELECT c.symbol, COUNT(*) as cnt, SUM(h.market_value)/1e9 as val
    FROM investor_holdings h
    JOIN companies c ON h.company_id = c.id
    WHERE c.symbol LIKE 'CIK_%'
    GROUP BY c.symbol
    ORDER BY val DESC
    LIMIT 10
  `).all();

  for (const r of remaining) {
    console.log(`   ${r.symbol}: ${r.cnt} holdings, $${r.val?.toFixed(1)}B`);
  }

  return totalRemapped;
}

// Run if called directly
if (require.main === module) {
  try {
    const count = runMigration();
    console.log(`\n✅ Migration complete: ${count} holdings remapped`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runMigration, CIK_TO_TICKER_MAPPINGS };
