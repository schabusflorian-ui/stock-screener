// src/database-migrations/add-user-watchlist-support.js
// Migration: Add user support to watchlist table

const db = require('../database');

async function up() {
  const database = db.getDatabase();

  console.log('Starting migration: Add user support to watchlist...');

  try {
    // Step 1: Create new user_watchlists table
    console.log('Creating user_watchlists table...');
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        company_id INTEGER NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        UNIQUE(user_id, company_id)
      );
    `);

    console.log('Creating indices on user_watchlists...');
    database.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_watchlists_company ON user_watchlists(company_id);
      CREATE INDEX IF NOT EXISTS idx_user_watchlists_added ON user_watchlists(added_at);
    `);

    // Step 2: Migrate existing watchlist data to a special 'legacy' user
    const existingWatchlist = database.prepare('SELECT * FROM watchlist').all();

    if (existingWatchlist.length > 0) {
      console.log(`Migrating ${existingWatchlist.length} existing watchlist items to legacy user...`);

      const insertStmt = database.prepare(`
        INSERT OR IGNORE INTO user_watchlists (user_id, company_id, added_at, notes)
        VALUES ('legacy', ?, ?, ?)
      `);

      const transaction = database.transaction(() => {
        for (const item of existingWatchlist) {
          insertStmt.run(item.company_id, item.added_at, item.notes);
        }
      });

      transaction();
      console.log('Migration of existing data complete.');
    } else {
      console.log('No existing watchlist data to migrate.');
    }

    // Step 3: Keep old watchlist table for backward compatibility
    // Don't drop it - let services gradually migrate
    console.log('Keeping old watchlist table for backward compatibility.');

    console.log('✅ Migration complete!');
    console.log('');
    console.log('Notes:');
    console.log('- New table: user_watchlists (with user_id support)');
    console.log('- Old table: watchlist (still exists for backward compatibility)');
    console.log('- Existing data migrated to user_id="legacy"');
    console.log('- Update your APIs to use user_watchlists table');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function down() {
  const database = db.getDatabase();

  console.log('Rolling back migration...');

  try {
    // Drop new table
    database.exec('DROP TABLE IF EXISTS user_watchlists;');

    console.log('✅ Rollback complete.');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  up()
    .then(() => {
      console.log('Migration successful!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { up, down };
