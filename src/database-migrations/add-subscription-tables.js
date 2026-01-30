const { getDb, tableExists, columnExists, safeAddColumn } = require('./_migrationHelper');

const db = getDb();
/**
 * Database Migration: Subscription Tables
 *
 * Creates the subscription system tables:
 * - subscription_tiers: Tier definitions (free, pro, ultra)
 * - user_subscriptions: User's active subscription
 * - usage_tracking: Monthly usage counters
 * - subscription_events: Audit log for billing events
 */

const crypto = require('crypto');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/stocks.db');

function run() {
  const db = getDb();

  console.log('Starting subscription tables migration...');

  db.exec('BEGIN TRANSACTION');

  try {
    // 1. Create subscription_tiers table
    console.log('  Creating subscription_tiers table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscription_tiers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        price_monthly_cents INTEGER NOT NULL DEFAULT 0,
        price_yearly_cents INTEGER,
        limits TEXT NOT NULL DEFAULT '{}',
        features TEXT NOT NULL DEFAULT '{}',
        badge_color TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Create user_subscriptions table
    console.log('  Creating user_subscriptions table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        tier_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        billing_period TEXT DEFAULT 'monthly',
        current_period_start DATETIME NOT NULL,
        current_period_end DATETIME NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        trial_ends_at DATETIME,
        cancelled_at DATETIME,
        cancel_at_period_end INTEGER DEFAULT 0,
        cancellation_reason TEXT,
        grandfathered_from TEXT,
        grandfathered_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (tier_id) REFERENCES subscription_tiers(id)
      )
    `);

    // 3. Create usage_tracking table
    console.log('  Creating usage_tracking table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        usage_type TEXT NOT NULL,
        period_start DATE NOT NULL,
        period_type TEXT DEFAULT 'monthly',
        usage_count INTEGER DEFAULT 0,
        last_usage_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, usage_type, period_start, period_type),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 4. Create subscription_events table (audit log)
    console.log('  Creating subscription_events table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        previous_tier_id INTEGER,
        new_tier_id INTEGER,
        reason TEXT,
        metadata TEXT,
        amount_cents INTEGER,
        currency TEXT DEFAULT 'USD',
        stripe_event_id TEXT UNIQUE,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (previous_tier_id) REFERENCES subscription_tiers(id),
        FOREIGN KEY (new_tier_id) REFERENCES subscription_tiers(id)
      )
    `);

    // 5. Create indexes
    console.log('  Creating indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON user_subscriptions(tier_id);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_period_end ON user_subscriptions(current_period_end);
      CREATE INDEX IF NOT EXISTS idx_user_subscriptions_grandfathered ON user_subscriptions(grandfathered_expires_at);
      CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking(user_id, period_start DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_tracking_type ON usage_tracking(usage_type, period_start);
      CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe ON subscription_events(stripe_event_id);
    `);

    // 6. Seed tier data
    console.log('  Seeding subscription tiers...');

    const insertTier = db.prepare(`
      INSERT OR IGNORE INTO subscription_tiers
      (name, display_name, description, price_monthly_cents, price_yearly_cents, limits, features, badge_color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Free tier
    insertTier.run(
      'free',
      'Free',
      'Get started with essential investment research tools',
      0,
      0,
      JSON.stringify({
        ai_queries_monthly: 10,
        prism_reports_monthly: 2,
        watchlist_stocks: 10,
        portfolios: 1,
        alerts: 5,
        agents: 0,
        backtest_runs_monthly: 0,
        monte_carlo_runs_monthly: 0,
        stress_tests_monthly: 0,
        api_calls_daily: 0
      }),
      JSON.stringify({
        basic_screener: true,
        advanced_screener: false,
        ai_research_agents: false,
        filing_analyzer: false,
        realtime_13f: false,
        paper_trading_bots: false,
        ml_optimization: false,
        monte_carlo: false,
        stress_testing: false,
        backtesting: false,
        factor_analysis: false,
        data_export: false,
        api_access: false,
        priority_support: false
      }),
      '#6B7280',
      1
    );

    // Pro tier
    insertTier.run(
      'pro',
      'Pro',
      'Full AI-powered research toolkit',
      500,  // $5.00
      4800, // $48.00/year (20% discount)
      JSON.stringify({
        ai_queries_monthly: 200,
        prism_reports_monthly: 20,
        watchlist_stocks: -1,  // unlimited
        portfolios: 5,
        alerts: 50,
        agents: 5,  // Pro users can create up to 5 agents
        backtest_runs_monthly: 0,
        monte_carlo_runs_monthly: 0,
        stress_tests_monthly: 0,
        api_calls_daily: 0
      }),
      JSON.stringify({
        basic_screener: true,
        advanced_screener: true,
        ai_research_agents: true,
        filing_analyzer: true,
        realtime_13f: true,
        paper_trading_bots: true,  // Moved from Ultra - all AI features are Pro
        ml_optimization: false,
        monte_carlo: false,
        stress_testing: false,
        backtesting: false,
        factor_analysis: true,
        data_export: true,
        api_access: false,
        priority_support: false
      }),
      '#3B82F6',
      2
    );

    // Ultra tier
    insertTier.run(
      'ultra',
      'Ultra',
      'Full quantitative toolkit with bots and simulations',
      2000,  // $20.00
      19200, // $192.00/year (20% discount)
      JSON.stringify({
        ai_queries_monthly: -1,  // unlimited
        prism_reports_monthly: -1,
        watchlist_stocks: -1,
        portfolios: -1,
        alerts: -1,
        agents: 10,
        backtest_runs_monthly: -1,
        monte_carlo_runs_monthly: -1,
        stress_tests_monthly: -1,
        api_calls_daily: 0  // API access deferred to v2
      }),
      JSON.stringify({
        basic_screener: true,
        advanced_screener: true,
        ai_research_agents: true,
        filing_analyzer: true,
        realtime_13f: true,
        paper_trading_bots: true,
        ml_optimization: true,
        monte_carlo: true,
        stress_testing: true,
        backtesting: true,
        factor_analysis: true,
        data_export: true,
        api_access: false,  // Deferred to v2
        priority_support: true
      }),
      '#8B5CF6',
      3
    );

    db.exec('COMMIT');
    console.log('Subscription tables migration completed successfully!');

  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
  }
}

// Run migration if executed directly
if (require.main === module) {
  run();
}

module.exports = { run };
