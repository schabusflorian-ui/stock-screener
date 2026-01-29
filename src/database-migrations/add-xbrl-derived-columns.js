// src/database-migrations/add-xbrl-derived-columns.js
// Adds derived metric columns to xbrl_fundamental_metrics for better EU/UK coverage

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

  try {
    // Get existing columns
    const columns = db.prepare('PRAGMA table_info(xbrl_fundamental_metrics)').all();
    const existingColumns = new Set(columns.map(c => c.name));

    // Columns to add for derived metrics
    const newColumns = [
      { name: 'roce', type: 'REAL', comment: 'Return on Capital Employed' },
      { name: 'equity_multiplier', type: 'REAL', comment: 'Total Assets / Total Equity (DuPont component)' },
      { name: 'dupont_roe', type: 'REAL', comment: 'DuPont ROE = Net Margin x Asset Turnover x Equity Multiplier' },
      { name: 'distribution_costs', type: 'REAL', comment: 'Distribution/selling costs (IFRS)' },
      { name: 'admin_expenses', type: 'REAL', comment: 'Administrative expenses (IFRS)' },
      { name: 'quick_ratio', type: 'REAL', comment: '(Current Assets - Inventory) / Current Liabilities' },
    ];

    let addedCount = 0;

    for (const col of newColumns) {
      if (!existingColumns.has(col.name)) {
        console.log(`  Adding column: ${col.name} (${col.type}) -- ${col.comment}`);
        db.exec(`ALTER TABLE xbrl_fundamental_metrics ADD COLUMN ${col.name} ${col.type}`);
        addedCount++;
      } else {
        console.log(`  Column ${col.name} already exists, skipping`);
      }
    }

    // Create indices for commonly queried columns
    const indicesToCreate = [
      { name: 'idx_xbrl_metrics_roce', column: 'roce' },
      { name: 'idx_xbrl_metrics_equity_multiplier', column: 'equity_multiplier' },
    ];

    for (const idx of indicesToCreate) {
      const indexExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND name=?
      `).get(idx.name);

      if (!indexExists) {
        console.log(`  Creating index: ${idx.name}`);
        db.exec(`CREATE INDEX ${idx.name} ON xbrl_fundamental_metrics(${idx.column})`);
      }
    }

    console.log(`\nMigration complete: ${addedCount} columns added`);

    // Show current coverage stats
    const coverage = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(ebitda) as has_ebitda,
        COUNT(roce) as has_roce,
        COUNT(equity_multiplier) as has_equity_multiplier,
        COUNT(dupont_roe) as has_dupont_roe,
        COUNT(quick_ratio) as has_quick_ratio
      FROM xbrl_fundamental_metrics
    `).get();

    console.log('\nCurrent coverage in xbrl_fundamental_metrics:');
    console.log(`  Total records: ${coverage.total}`);
    console.log(`  EBITDA: ${coverage.has_ebitda} (${(coverage.has_ebitda / coverage.total * 100).toFixed(1)}%)`);
    console.log(`  ROCE: ${coverage.has_roce} (${(coverage.has_roce / coverage.total * 100).toFixed(1)}%)`);
    console.log(`  Equity Multiplier: ${coverage.has_equity_multiplier} (${(coverage.has_equity_multiplier / coverage.total * 100).toFixed(1)}%)`);
    console.log(`  DuPont ROE: ${coverage.has_dupont_roe} (${(coverage.has_dupont_roe / coverage.total * 100).toFixed(1)}%)`);
    console.log(`  Quick Ratio: ${coverage.has_quick_ratio} (${(coverage.has_quick_ratio / coverage.total * 100).toFixed(1)}%)`);
    return true;

  } catch (error) {
    console.error('Migration failed:', error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
