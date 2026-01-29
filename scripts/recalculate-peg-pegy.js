/**
 * Script to recalculate PEG and PEGY ratios for all companies
 * Run with: node scripts/recalculate-peg-pegy.js
 */

const db = require('../src/database');

async function recalculatePegPegy() {
  const database = db.getDatabase();

  console.log('\n📊 Recalculating PEG and PEGY ratios for all companies...\n');

  // Get all companies with calculated metrics, joining with dividend_metrics for yield
  const companies = database.prepare(`
    SELECT DISTINCT
      cm.company_id,
      c.symbol,
      cm.pe_ratio,
      cm.earnings_growth_yoy,
      COALESCE(cm.dividend_yield, dm.dividend_yield) as dividend_yield,
      cm.fiscal_period
    FROM calculated_metrics cm
    JOIN companies c ON cm.company_id = c.id
    LEFT JOIN dividend_metrics dm ON dm.company_id = cm.company_id
    WHERE cm.pe_ratio IS NOT NULL
      AND cm.earnings_growth_yoy IS NOT NULL
      AND cm.earnings_growth_yoy > 0
    ORDER BY c.symbol, cm.fiscal_period DESC
  `).all();

  console.log(`Found ${companies.length} metric records with P/E and positive earnings growth\n`);

  // Prepare update statement
  const updateStmt = database.prepare(`
    UPDATE calculated_metrics
    SET peg_ratio = ?, pegy_ratio = ?
    WHERE company_id = ? AND fiscal_period = ?
  `);

  let updated = 0;
  let pegCount = 0;
  let pegyCount = 0;

  // Process in transaction for speed
  const updateAll = database.transaction(() => {
    for (const row of companies) {
      const { company_id, symbol, pe_ratio, earnings_growth_yoy, dividend_yield, fiscal_period } = row;

      // Calculate PEG
      const pegRatio = pe_ratio / earnings_growth_yoy;

      // Calculate PEGY (if dividend yield exists)
      let pegyRatio = null;
      if (dividend_yield && dividend_yield > 0) {
        const growthPlusYield = earnings_growth_yoy + dividend_yield;
        if (growthPlusYield > 0) {
          pegyRatio = pe_ratio / growthPlusYield;
        }
      }

      // Clamp values to reasonable bounds
      const clampedPeg = Math.min(Math.max(pegRatio, 0), 20);
      const clampedPegy = pegyRatio ? Math.min(Math.max(pegyRatio, 0), 20) : null;

      updateStmt.run(clampedPeg, clampedPegy, company_id, fiscal_period);
      updated++;

      if (clampedPeg !== null) pegCount++;
      if (clampedPegy !== null) pegyCount++;
    }
  });

  updateAll();

  console.log(`✅ Updated ${updated} records`);
  console.log(`   - PEG ratios calculated: ${pegCount}`);
  console.log(`   - PEGY ratios calculated: ${pegyCount}`);

  // Show sample results
  console.log('\n📈 Sample results (AAPL):');
  const sample = database.prepare(`
    SELECT
      fiscal_period,
      pe_ratio,
      earnings_growth_yoy,
      dividend_yield,
      peg_ratio,
      pegy_ratio
    FROM calculated_metrics
    WHERE company_id = (SELECT id FROM companies WHERE symbol = 'AAPL')
    ORDER BY fiscal_period DESC
    LIMIT 5
  `).all();

  console.table(sample);

  // Summary statistics
  const stats = database.prepare(`
    SELECT
      COUNT(*) as total_metrics,
      COUNT(peg_ratio) as has_peg,
      COUNT(pegy_ratio) as has_pegy,
      ROUND(AVG(peg_ratio), 2) as avg_peg,
      ROUND(AVG(pegy_ratio), 2) as avg_pegy
    FROM calculated_metrics
    WHERE peg_ratio IS NOT NULL
  `).get();

  console.log('\n📊 Summary statistics:');
  console.table([stats]);

  console.log('\n✅ Done!\n');
}

recalculatePegPegy().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
