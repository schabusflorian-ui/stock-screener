// src/database-migrations/016-add-agent-recommendations-postgres.js
// agent_recommendations + daily_analyses for orchestrator and agent services

async function migrate(db) {
  console.log('🐘 Creating agent recommendations tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_recommendations (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      date TEXT NOT NULL,

      action TEXT NOT NULL CHECK (action IN ('strong_buy', 'buy', 'hold', 'sell', 'strong_sell')),
      score REAL,
      raw_score REAL,
      confidence REAL,
      position_size REAL,
      suggested_shares INTEGER,
      suggested_value REAL,

      reasoning TEXT,
      signals TEXT,

      regime_at_time TEXT,
      price_at_time REAL,
      portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL,

      was_executed INTEGER DEFAULT 0,
      executed_at TIMESTAMP,
      execution_price REAL,

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_rec_company ON agent_recommendations(company_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_rec_date ON agent_recommendations(date DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_rec_portfolio ON agent_recommendations(portfolio_id)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_analyses (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      date TEXT NOT NULL,

      regime TEXT,
      regime_confidence REAL,
      regime_description TEXT,
      opportunities_count INTEGER DEFAULT 0,
      opportunities TEXT,
      recommendations_count INTEGER DEFAULT 0,
      recommendations TEXT,
      executed_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      blocked_count INTEGER DEFAULT 0,
      summary TEXT,
      execution_time_ms INTEGER,
      errors TEXT,

      created_at TIMESTAMP DEFAULT NOW(),

      UNIQUE(portfolio_id, date)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_daily_analyses_portfolio ON daily_analyses(portfolio_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_daily_analyses_date ON daily_analyses(date DESC)');

  console.log('✅ Agent recommendations tables ready.');
}

module.exports = migrate;
