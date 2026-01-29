const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
/**
 * Fix trading_agents strategy_type constraint
 *
 * SQLite doesn't support ALTER TABLE to modify CHECK constraints,
 * so we need to recreate the table with the new constraint.
 */

const dbPath = path.join(__dirname, '../../data/stocks.db');

function migrate() {
  const db = getDb();

  console.log('Migrating trading_agents table to allow new strategy types...\n');

  try {
    // Disable foreign key checks during migration
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');

    // 1. Check if migration is needed
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trading_agents'").get();

    if (!tableInfo) {
      console.log('trading_agents table does not exist, skipping migration');
      db.exec('ROLLBACK');
      return;
    }

    // Check if new types are already allowed
    if (tableInfo.sql.includes("'single'") || !tableInfo.sql.includes('CHECK')) {
      console.log('Table already has updated constraint or no constraint, skipping');
      db.exec('ROLLBACK');
      return;
    }

    console.log('Current table schema includes restrictive CHECK constraint');
    console.log('Creating backup and updating constraint...\n');

    // 2. Get current column info
    const columns = db.prepare('PRAGMA table_info(trading_agents)').all();
    const columnNames = columns.map(c => c.name).join(', ');

    // 3. Create new table with updated constraint
    const newSchema = tableInfo.sql
      .replace('trading_agents', 'trading_agents_new')
      .replace(
        "CHECK (strategy_type IN ('technical', 'fundamental', 'sentiment', 'hybrid', 'custom'))",
        "CHECK (strategy_type IN ('technical', 'fundamental', 'sentiment', 'hybrid', 'custom', 'single', 'multi', 'regime_switching'))"
      );

    console.log('Creating new table with updated constraint...');
    db.exec(newSchema);

    // 4. Copy data
    console.log('Copying data to new table...');
    db.exec(`INSERT INTO trading_agents_new (${columnNames}) SELECT ${columnNames} FROM trading_agents`);

    // 5. Get indexes
    const indexes = db.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type='index' AND tbl_name='trading_agents' AND sql IS NOT NULL
    `).all();

    // 6. Drop old table
    console.log('Dropping old table...');
    db.exec('DROP TABLE trading_agents');

    // 7. Rename new table
    console.log('Renaming new table...');
    db.exec('ALTER TABLE trading_agents_new RENAME TO trading_agents');

    // 8. Recreate indexes
    for (const idx of indexes) {
      if (idx.sql) {
        console.log(`Recreating index: ${idx.sql.substring(0, 50)}...`);
        db.exec(idx.sql);
      }
    }

    db.exec('COMMIT');

    // Re-enable foreign key checks
    db.pragma('foreign_keys = ON');

    console.log('\n✅ Migration completed successfully!');
    console.log('   trading_agents table now supports: technical, fundamental, sentiment, hybrid, custom, single, multi, regime_switching');

    // Verify
    const newTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trading_agents'").get();
    console.log('\nNew constraint:', newTableInfo.sql.match(/CHECK \(strategy_type[^)]+\)/)?.[0] || 'No CHECK found');

  } catch (err) {
    console.error('Migration failed:', err.message);
    db.exec('ROLLBACK');
    throw err;
  } finally {
  }
}

// Run migration
if (require.main === module) {
  migrate();
}

module.exports = { migrate };
