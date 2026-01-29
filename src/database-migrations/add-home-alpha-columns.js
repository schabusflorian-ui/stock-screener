// src/database-migrations/add-home-alpha-columns.js
// Adds home index alpha columns to price_metrics for dual benchmark comparison

const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();

  try {
    // Get existing columns
    const columns = db.prepare('PRAGMA table_info(price_metrics)').all();
    const existingColumns = new Set(columns.map(c => c.name));

    // Columns to add for home index alpha
    const newColumns = [
      { name: 'home_benchmark', type: 'TEXT', comment: 'Home index code (e.g., DAX, FTSE)' },
      { name: 'alpha_1d_home', type: 'REAL', comment: '1-day alpha vs home index' },
      { name: 'alpha_1w_home', type: 'REAL', comment: '1-week alpha vs home index' },
      { name: 'alpha_1m_home', type: 'REAL', comment: '1-month alpha vs home index' },
      { name: 'alpha_3m_home', type: 'REAL', comment: '3-month alpha vs home index' },
      { name: 'alpha_6m_home', type: 'REAL', comment: '6-month alpha vs home index' },
      { name: 'alpha_1y_home', type: 'REAL', comment: '1-year alpha vs home index' },
      { name: 'alpha_ytd_home', type: 'REAL', comment: 'YTD alpha vs home index' },
    ];

    let addedCount = 0;

    for (const col of newColumns) {
      if (!existingColumns.has(col.name)) {
        console.log(`  Adding column: ${col.name} (${col.type}) -- ${col.comment}`);
        db.exec(`ALTER TABLE price_metrics ADD COLUMN ${col.name} ${col.type}`);
        addedCount++;
      } else {
        console.log(`  Column ${col.name} already exists, skipping`);
      }
    }

    // Create index on home_benchmark for faster queries
    const indexExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='index' AND name='idx_price_metrics_home_benchmark'
    `).get();

    if (!indexExists) {
      console.log('  Creating index on home_benchmark');
      db.exec('CREATE INDEX idx_price_metrics_home_benchmark ON price_metrics(home_benchmark)');
    }

    console.log(`\nMigration complete: ${addedCount} columns added`);

    // Show sample of current alpha data
    const sample = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(alpha_1y) as has_spy_alpha,
        COUNT(alpha_1y_home) as has_home_alpha
      FROM price_metrics
    `).get();

    console.log('\nCurrent alpha data:');
    console.log(`  Total records: ${sample.total}`);
    console.log(`  With SPY alpha: ${sample.has_spy_alpha}`);
    console.log(`  With home alpha: ${sample.has_home_alpha}`);
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
