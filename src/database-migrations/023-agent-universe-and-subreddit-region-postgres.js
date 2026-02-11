// src/database-migrations/023-agent-universe-and-subreddit-region-postgres.js
// - agent_universe: table used by agentScanner for universe_size (fixes "relation agent_universe does not exist")
// - tracked_subreddits.region: column used by redditFetcher (fixes "column region does not exist")

async function migrate(db) {
  console.log('🐘 Creating agent_universe and adding tracked_subreddits.region (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_universe (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES trading_agents(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT,
      added_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(agent_id, company_id)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_universe_agent ON agent_universe(agent_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_universe_company ON agent_universe(company_id)');
  console.log('  ✓ agent_universe table');

  try {
    await db.query(`
      ALTER TABLE tracked_subreddits
      ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'global'
    `);
    console.log('  ✓ tracked_subreddits.region');
  } catch (e) {
    if (e.code !== '42701') throw e;
    console.log('  - tracked_subreddits.region (already exists)');
  }

  console.log('✅ agent_universe and subreddit region ready.');
}

module.exports = migrate;
