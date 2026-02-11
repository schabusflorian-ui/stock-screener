// src/database-migrations/008-add-subscription-tables-postgres.js
// Subscription system: subscription_tiers, user_subscriptions, usage_tracking, subscription_events

async function migrate(db) {
  console.log('🐘 Creating subscription tables (Postgres)...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscription_tiers (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      description TEXT,
      price_monthly_cents INTEGER NOT NULL DEFAULT 0,
      price_yearly_cents INTEGER,
      limits JSONB NOT NULL DEFAULT '{}',
      features JSONB NOT NULL DEFAULT '{}',
      badge_color TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      tier_id INTEGER NOT NULL REFERENCES subscription_tiers(id),
      status TEXT NOT NULL DEFAULT 'active',
      billing_period TEXT DEFAULT 'monthly',
      current_period_start TIMESTAMP NOT NULL,
      current_period_end TIMESTAMP NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      trial_ends_at TIMESTAMP,
      cancelled_at TIMESTAMP,
      cancel_at_period_end INTEGER DEFAULT 0,
      cancellation_reason TEXT,
      grandfathered_from TEXT,
      grandfathered_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON user_subscriptions(tier_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period_end ON user_subscriptions(current_period_end)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      usage_type TEXT NOT NULL,
      period_start DATE NOT NULL,
      period_type TEXT DEFAULT 'monthly',
      usage_count INTEGER DEFAULT 0,
      last_usage_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, usage_type, period_start, period_type)
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking(user_id, period_start DESC)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_usage_tracking_type ON usage_tracking(usage_type, period_start)');

  await db.query(`
    CREATE TABLE IF NOT EXISTS subscription_events (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      previous_tier_id INTEGER REFERENCES subscription_tiers(id),
      new_tier_id INTEGER REFERENCES subscription_tiers(id),
      reason TEXT,
      metadata TEXT,
      amount_cents INTEGER,
      currency TEXT DEFAULT 'USD',
      stripe_event_id TEXT UNIQUE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.query('CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id, created_at DESC)');

  // Ensure name has a unique constraint for ON CONFLICT (name) — table may exist from partial run without UNIQUE
  try {
    await db.query('ALTER TABLE subscription_tiers ADD CONSTRAINT subscription_tiers_name_key UNIQUE (name)');
  } catch (e) {
    if (e.code !== '42710') throw e; // 42710 = duplicate_object (constraint already exists)
  }

  const tiers = [
    ['free', 'Free', 'Get started with essential investment research tools', 0, 0, { ai_queries_monthly: 10, prism_reports_monthly: 2, watchlist_stocks: 10, portfolios: 1, alerts: 5, agents: 0 }, { basic_screener: true, advanced_screener: false, ai_research_agents: false, paper_trading_bots: false, factor_analysis: false }, '#6B7280', 1],
    ['pro', 'Pro', 'Full AI-powered research toolkit', 500, 4800, { ai_queries_monthly: 200, prism_reports_monthly: 20, watchlist_stocks: -1, portfolios: 5, alerts: 50, agents: 5 }, { basic_screener: true, advanced_screener: true, ai_research_agents: true, paper_trading_bots: true, factor_analysis: true }, '#3B82F6', 2],
    ['ultra', 'Ultra', 'Full quantitative toolkit', 2000, 19200, { ai_queries_monthly: -1, prism_reports_monthly: -1, watchlist_stocks: -1, portfolios: -1, alerts: -1, agents: 10 }, { basic_screener: true, advanced_screener: true, ai_research_agents: true, paper_trading_bots: true, factor_analysis: true, ml_optimization: true, monte_carlo: true, backtesting: true }, '#8B5CF6', 3]
  ];
  for (const [name, display_name, description, price_monthly_cents, price_yearly_cents, limits, features, badge_color, sort_order] of tiers) {
    await db.query(
      `INSERT INTO subscription_tiers (name, display_name, description, price_monthly_cents, price_yearly_cents, limits, features, badge_color, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (name) DO NOTHING`,
      [name, display_name, description, price_monthly_cents, price_yearly_cents, JSON.stringify(limits), JSON.stringify(features), badge_color, sort_order]
    );
  }

  console.log('✅ Subscription tables ready.');
}

module.exports = migrate;
