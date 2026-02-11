// src/database-migrations/015-add-recommendation-outcomes-postgres.js
// recommendation_outcomes, pending_executions, portfolio execution columns

async function migrate(db) {
  console.log('🐘 Creating recommendation outcomes tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS recommendation_outcomes (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,

      action TEXT NOT NULL,
      signal_score REAL,
      confidence REAL,
      regime TEXT,
      signal_breakdown TEXT,

      recommended_at TIMESTAMP NOT NULL,
      price_at_recommendation REAL,

      return_1d REAL,
      return_5d REAL,
      return_21d REAL,
      return_63d REAL,
      benchmark_return_1d REAL,
      benchmark_return_5d REAL,
      benchmark_return_21d REAL,
      benchmark_return_63d REAL,
      alpha_1d REAL,
      alpha_5d REAL,
      alpha_21d REAL,
      alpha_63d REAL,

      outcome TEXT DEFAULT 'PENDING',
      outcome_updated_at TIMESTAMP,

      was_executed INTEGER DEFAULT 0,
      executed_at TIMESTAMP,
      executed_price REAL,
      original_recommendation_id INTEGER,

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_rec_outcomes_portfolio ON recommendation_outcomes(portfolio_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_rec_outcomes_symbol ON recommendation_outcomes(symbol)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_rec_outcomes_recommended ON recommendation_outcomes(recommended_at DESC)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_executions (
      id SERIAL PRIMARY KEY,
      portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      recommendation_outcome_id INTEGER REFERENCES recommendation_outcomes(id) ON DELETE SET NULL,

      symbol TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      shares REAL,
      estimated_price REAL,
      estimated_value REAL,
      signal_score REAL,
      confidence REAL,
      regime TEXT,
      position_pct REAL,

      status TEXT DEFAULT 'pending',
      decided_at TIMESTAMP,
      decided_by TEXT,
      rejection_reason TEXT,
      executed_at TIMESTAMP,
      executed_price REAL,
      executed_shares REAL,
      expires_at TIMESTAMP,

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_pending_exec_portfolio ON pending_executions(portfolio_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_pending_exec_status ON pending_executions(status)');

  const cols = ['auto_execute', 'execution_threshold', 'max_auto_position_pct', 'require_confirmation', 'auto_execute_actions'];
  const defs = [
    'INTEGER DEFAULT 0',
    'REAL DEFAULT 0.3',
    'REAL DEFAULT 0.05',
    'INTEGER DEFAULT 1',
    "TEXT DEFAULT 'buy,sell'"
  ];
  for (let i = 0; i < cols.length; i++) {
    const name = cols[i];
    const r = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'portfolios' AND column_name = $1`,
      [name]
    );
    if (!r.rows || r.rows.length === 0) {
      await db.query(`ALTER TABLE portfolios ADD COLUMN ${name} ${defs[i]}`);
    }
  }

  console.log('✅ Recommendation outcomes tables ready.');
}

module.exports = migrate;
