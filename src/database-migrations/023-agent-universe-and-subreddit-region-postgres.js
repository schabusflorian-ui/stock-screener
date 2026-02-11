// src/database-migrations/023-agent-universe-and-subreddit-region-postgres.js
// - agent_universe: table used by agentScanner for universe_size (fixes "relation agent_universe does not exist")
// - tracked_subreddits.region: column used by redditFetcher (fixes "column region does not exist")
//
// Root cause fix: Ensure trading_agents has PRIMARY KEY on id before creating agent_universe FK.
// Some deployments may have trading_agents created without PK (e.g. from older schema or different source).

async function migrate(db) {
  console.log('🐘 Creating agent_universe and adding tracked_subreddits.region (Postgres)...');

  // 1. tracked_subreddits.region first (critical for redditFetcher, no deps)
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

  // 2. Ensure trading_agents has PRIMARY KEY on id (root cause fix)
  const pkCheck = await db.query(`
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'trading_agents'
      AND constraint_type = 'PRIMARY KEY'
  `);
  if (pkCheck.rows.length === 0) {
    console.log('  - trading_agents missing PRIMARY KEY, adding...');
    try {
      await db.query(`
        ALTER TABLE trading_agents
        ADD CONSTRAINT trading_agents_pkey PRIMARY KEY (id)
      `);
      console.log('  ✓ trading_agents PRIMARY KEY added');
    } catch (e) {
      console.log('  ⚠ Could not add PK (possible duplicates/null in id):', e.message);
      console.log('  - Will create agent_universe without FK to trading_agents');
    }
  }

  // 3. agent_universe - try with FK, fallback without if PK fix failed or constraint still missing
  const withFk = `
    CREATE TABLE IF NOT EXISTS agent_universe (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES trading_agents(id) ON DELETE CASCADE,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT,
      added_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(agent_id, company_id)
    )
  `;
  const withoutFk = `
    CREATE TABLE IF NOT EXISTS agent_universe (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      symbol TEXT,
      added_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(agent_id, company_id)
    )
  `;
  try {
    await db.query(withFk);
  } catch (e) {
    if (e.message && e.message.includes('no unique constraint matching given keys')) {
      console.log('  - Creating agent_universe without FK (trading_agents.id not unique)');
      await db.query(withoutFk);
    } else {
      throw e;
    }
  }
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_universe_agent ON agent_universe(agent_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_universe_company ON agent_universe(company_id)');
  console.log('  ✓ agent_universe table');

  console.log('✅ agent_universe and subreddit region ready.');
}

module.exports = migrate;
