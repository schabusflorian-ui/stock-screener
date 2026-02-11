// src/database-migrations/019-add-tracked-subreddits-region-postgres.js
// Add region column to tracked_subreddits for redditFetcher (region = $1 OR region = 'global')

async function migrate(db) {
  console.log('🐘 Adding region column to tracked_subreddits (Postgres)...');

  const hasColumn = await db.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracked_subreddits' AND column_name = 'region'
  `);
  if (hasColumn.rows.length > 0) {
    console.log('⏭️  region column already exists');
    return;
  }

  await db.query(`
    ALTER TABLE tracked_subreddits
    ADD COLUMN region TEXT DEFAULT 'global'
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tracked_subreddits_region
    ON tracked_subreddits(region) WHERE is_active = 1
  `);
  await db.query(`
    UPDATE tracked_subreddits SET region = 'global' WHERE region IS NULL
  `);

  console.log('✅ tracked_subreddits.region added.');
}

module.exports = migrate;
