// src/database-migrations/009-add-agent-extras-postgres.js
// Agent tables used by agentService: agent_portfolios, agent_activity_log

async function migrate(db) {
  console.log('🐘 Creating agent extras tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_portfolios (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES trading_agents(id) ON DELETE CASCADE,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      mode TEXT DEFAULT 'paper',
      initial_capital REAL,
      max_position_size_override REAL,
      max_sector_exposure_override REAL,
      auto_execute_override INTEGER,
      is_active INTEGER DEFAULT 1,
      activated_at TIMESTAMP DEFAULT NOW(),
      deactivated_at TIMESTAMP,
      total_trades INTEGER DEFAULT 0,
      winning_trades INTEGER DEFAULT 0,
      total_pnl REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(agent_id, portfolio_id)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_portfolios_agent ON agent_portfolios(agent_id, is_active)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_portfolios_portfolio ON agent_portfolios(portfolio_id)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_activity_log (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES trading_agents(id) ON DELETE CASCADE,
      portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL,
      activity_type TEXT NOT NULL,
      description TEXT,
      details TEXT,
      signal_id INTEGER REFERENCES agent_signals(id) ON DELETE SET NULL,
      trade_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_log(agent_id, created_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_activity_type ON agent_activity_log(activity_type, created_at DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_activity_portfolio ON agent_activity_log(portfolio_id, created_at DESC)');

  const colCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'portfolios' AND column_name = 'agent_id'
  `);
  if (colCheck.rows.length === 0) {
    await db.query('ALTER TABLE portfolios ADD COLUMN agent_id INTEGER REFERENCES trading_agents(id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_portfolios_agent ON portfolios(agent_id)');
  }

  console.log('✅ Agent extras tables ready.');
}

module.exports = migrate;
