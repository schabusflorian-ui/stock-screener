/**
 * Subscription Service
 *
 * Handles all subscription-related business logic:
 * - Tier management (get user tier, check features)
 * - Usage tracking (AI queries, reports, etc.)
 * - Grandfathering logic for early adopters
 * - Cache management for performance (Redis-backed for horizontal scaling)
 */

const { unifiedCache } = require('../lib/redisCache');
const { getDatabaseAsync } = require('../lib/db');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_PREFIX = 'sub:';

// Tier hierarchy for comparison
const TIER_HIERARCHY = {
  free: 0,
  pro: 1,
  ultra: 2
};

class SubscriptionService {
  constructor() {
    // In-memory fallback caches (used when Redis unavailable or for sync methods)
    this._tierCacheFallback = new Map();
    this._userCacheFallback = new Map();
  }

  /**
   * Get all available tiers (for pricing page)
   * Uses Redis cache with in-memory fallback
   */
  async getAllTiersAsync() {
    // Try Redis first
    const cached = await unifiedCache.get(`${CACHE_PREFIX}tiers:all`);
    if (cached) {
      return cached;
    }

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT id, name, display_name, description,
             price_monthly_cents, price_yearly_cents,
             limits, features, badge_color, sort_order
      FROM subscription_tiers
      WHERE is_active = 1
      ORDER BY sort_order ASC
    `);

    // Parse JSON fields
    const parsed = result.rows.map(tier => ({
      ...tier,
      limits: JSON.parse(tier.limits || '{}'),
      features: JSON.parse(tier.features || '{}'),
      priceMonthly: tier.price_monthly_cents / 100,
      priceYearly: tier.price_yearly_cents ? tier.price_yearly_cents / 100 : null
    }));

    // Cache in Redis
    await unifiedCache.set(`${CACHE_PREFIX}tiers:all`, parsed, CACHE_TTL_MS);
    return parsed;
  }

  /**
   * Get all available tiers (async - sync version deprecated)
   */
  async getAllTiers() {
    return this.getAllTiersAsync();
  }

  /**
   * Get tier by name
   */
  async getTierByName(tierName) {
    const tiers = await this.getAllTiers();
    return tiers.find(t => t.name === tierName) || tiers.find(t => t.name === 'free');
  }

  /**
   * Get tier by ID
   */
  async getTierById(tierId) {
    const cached = this._tierCacheFallback.get(`tier_${tierId}`);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT id, name, display_name, description,
             price_monthly_cents, price_yearly_cents,
             limits, features, badge_color
      FROM subscription_tiers
      WHERE id = $1
    `, [tierId]);

    if (!result.rows[0]) return null;

    const tier = result.rows[0];
    const parsed = {
      ...tier,
      limits: JSON.parse(tier.limits || '{}'),
      features: JSON.parse(tier.features || '{}')
    };

    this._tierCacheFallback.set(`tier_${tierId}`, { data: parsed, timestamp: Date.now() });
    return parsed;
  }

  /**
   * Get user's current subscription with tier details (async, Redis-backed)
   * Returns free tier defaults if no subscription exists
   */
  async getUserSubscriptionAsync(userId) {
    if (!userId) {
      return await this.getFreeTierDefaults();
    }

    // Check Redis cache first
    const cached = await unifiedCache.get(`${CACHE_PREFIX}user:${userId}`);
    if (cached) {
      return cached;
    }

    const result = await this._fetchUserSubscription(userId);

    // Cache in Redis
    await unifiedCache.set(`${CACHE_PREFIX}user:${userId}`, result, CACHE_TTL_MS);
    return result;
  }

  /**
   * Get user's current subscription (async - sync version deprecated)
   */
  async getUserSubscription(userId) {
    return this.getUserSubscriptionAsync(userId);
  }

  /**
   * Internal: fetch user subscription from database
   */
  async _fetchUserSubscription(userId) {
    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT
        us.*,
        st.name as tier_name,
        st.display_name as tier_display_name,
        st.limits,
        st.features,
        st.price_monthly_cents,
        st.badge_color
      FROM user_subscriptions us
      JOIN subscription_tiers st ON us.tier_id = st.id
      WHERE us.user_id = $1
    `, [userId]);

    const subscription = result.rows[0];
    let subscriptionResult;

    if (!subscription) {
      // No subscription record - return free tier defaults
      subscriptionResult = await this.getFreeTierDefaults(userId);
    } else {
      // Check if grandfathered period has expired
      const isGrandfatheredActive = subscription.grandfathered_expires_at &&
        new Date(subscription.grandfathered_expires_at) > new Date();

      // Parse JSON fields
      subscriptionResult = {
        ...subscription,
        limits: JSON.parse(subscription.limits || '{}'),
        features: JSON.parse(subscription.features || '{}'),
        isGrandfathered: !!subscription.grandfathered_from,
        isGrandfatheredActive,
        grandfatheredDaysRemaining: isGrandfatheredActive
          ? Math.ceil((new Date(subscription.grandfathered_expires_at) - new Date()) / (1000 * 60 * 60 * 24))
          : 0
      };

      // If grandfathered and active, unlock all features
      if (isGrandfatheredActive) {
        subscriptionResult.effectiveFeatures = this.getAllFeaturesUnlocked();
        subscriptionResult.effectiveLimits = this.getAllLimitsUnlocked();
      } else {
        subscriptionResult.effectiveFeatures = subscriptionResult.features;
        subscriptionResult.effectiveLimits = subscriptionResult.limits;
      }
    }

    return subscriptionResult;
  }

  /**
   * Get free tier defaults for users without subscription
   */
  async getFreeTierDefaults(userId = null) {
    const freeTier = await this.getTierByName('free');
    return {
      user_id: userId,
      tier_id: freeTier?.id || 1,
      tier_name: 'free',
      tier_display_name: 'Free',
      status: 'active',
      limits: freeTier?.limits || {},
      features: freeTier?.features || {},
      effectiveFeatures: freeTier?.features || {},
      effectiveLimits: freeTier?.limits || {},
      badge_color: freeTier?.badge_color || '#6B7280',
      isGrandfathered: false,
      isGrandfatheredActive: false,
      grandfatheredDaysRemaining: 0
    };
  }

  /**
   * Get all features unlocked (for grandfathered users)
   */
  getAllFeaturesUnlocked() {
    return {
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
      api_access: false, // Still deferred
      priority_support: true
    };
  }

  /**
   * Get all limits unlocked (for grandfathered users)
   */
  getAllLimitsUnlocked() {
    return {
      ai_queries_monthly: -1,
      prism_reports_monthly: -1,
      watchlist_stocks: -1,
      portfolios: -1,
      alerts: -1,
      agents: 10,
      backtest_runs_monthly: -1,
      monte_carlo_runs_monthly: -1,
      stress_tests_monthly: -1,
      api_calls_daily: 0
    };
  }

  /**
   * Check if user has access to a specific feature
   */
  async hasFeature(userId, featureName) {
    const subscription = await this.getUserSubscription(userId);
    const features = subscription.effectiveFeatures || subscription.features || {};
    return features[featureName] === true;
  }

  /**
   * Get usage limit for a specific resource
   * Returns -1 for unlimited
   */
  async getLimit(userId, limitName) {
    const subscription = await this.getUserSubscription(userId);
    const limits = subscription.effectiveLimits || subscription.limits || {};
    return limits[limitName] ?? 0;
  }

  /**
   * Check if user's tier is at least the required tier
   */
  async hasTierAccess(userId, requiredTier) {
    const subscription = await this.getUserSubscription(userId);

    // Grandfathered users have full access during grace period
    if (subscription.isGrandfatheredActive) {
      return true;
    }

    const userTierLevel = TIER_HIERARCHY[subscription.tier_name] ?? 0;
    const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 0;
    return userTierLevel >= requiredLevel;
  }

  /**
   * Get current period usage count
   */
  async getCurrentUsage(userId, usageType) {
    const periodStart = this.getCurrentPeriodStart(usageType);
    const periodType = this.getPeriodType(usageType);

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT COALESCE(usage_count, 0) as count
      FROM usage_tracking
      WHERE user_id = $1 AND usage_type = $2 AND period_start = $3 AND period_type = $4
    `, [userId, usageType, periodStart, periodType]);

    return result.rows[0]?.count || 0;
  }

  /**
   * Get all usage stats for a user
   */
  async getAllUsage(userId) {
    const periodStart = this.getCurrentPeriodStart('monthly');

    const database = await getDatabaseAsync();
    const result = await database.query(`
      SELECT usage_type, usage_count, last_usage_at
      FROM usage_tracking
      WHERE user_id = $1 AND period_start = $2
    `, [userId, periodStart]);

    const usage = {};
    for (const row of result.rows) {
      usage[row.usage_type] = {
        count: row.usage_count,
        lastUsedAt: row.last_usage_at
      };
    }

    return usage;
  }

  /**
   * Track usage increment
   */
  async trackUsage(userId, usageType, increment = 1) {
    const periodStart = this.getCurrentPeriodStart(usageType);
    const periodType = this.getPeriodType(usageType);

    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO usage_tracking (user_id, usage_type, period_start, period_type, usage_count, last_usage_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, usage_type, period_start, period_type)
      DO UPDATE SET
        usage_count = usage_count + $6,
        last_usage_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, usageType, periodStart, periodType, increment, increment]);
  }

  /**
   * Check usage limit and track if allowed
   * Returns { allowed, remaining, limit, resetAt }
   */
  async checkAndTrackUsage(userId, usageType, increment = 1) {
    const limit = await this.getLimit(userId, usageType);

    // -1 means unlimited
    if (limit === -1) {
      await this.trackUsage(userId, usageType, increment);
      return {
        allowed: true,
        remaining: -1,
        limit: -1,
        unlimited: true
      };
    }

    // Check current usage
    const currentUsage = await this.getCurrentUsage(userId, usageType);
    const remaining = limit - currentUsage;

    if (remaining < increment) {
      return {
        allowed: false,
        remaining: Math.max(0, remaining),
        limit,
        resetAt: this.getNextResetDate(usageType),
        unlimited: false
      };
    }

    // Track the usage
    await this.trackUsage(userId, usageType, increment);

    return {
      allowed: true,
      remaining: remaining - increment,
      limit,
      unlimited: false
    };
  }

  /**
   * Get period type for usage type
   */
  getPeriodType(usageType) {
    const dailyTypes = ['api_calls_daily'];
    return dailyTypes.includes(usageType) ? 'daily' : 'monthly';
  }

  /**
   * Get current period start date
   */
  getCurrentPeriodStart(usageType) {
    const now = new Date();
    if (this.getPeriodType(usageType) === 'daily') {
      return now.toISOString().split('T')[0];
    }
    // Monthly: first of current month
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  /**
   * Get next reset date for usage type
   */
  getNextResetDate(usageType) {
    const now = new Date();
    if (this.getPeriodType(usageType) === 'daily') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.toISOString();
    }
    // Monthly: first of next month
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth.toISOString();
  }

  /**
   * Create or update user subscription
   */
  async createOrUpdateSubscription(userId, data) {
    const {
      tierId,
      status = 'active',
      billingPeriod = 'monthly',
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodStart,
      currentPeriodEnd,
      grandfatheredFrom,
      grandfatheredExpiresAt
    } = data;

    const database = await getDatabaseAsync();
    const existingResult = await database.query(
      'SELECT id FROM user_subscriptions WHERE user_id = $1',
      [userId]
    );
    const existing = existingResult.rows[0];

    if (existing) {
      await database.query(`
        UPDATE user_subscriptions SET
          tier_id = COALESCE($1, tier_id),
          status = COALESCE($2, status),
          billing_period = COALESCE($3, billing_period),
          stripe_customer_id = COALESCE($4, stripe_customer_id),
          stripe_subscription_id = COALESCE($5, stripe_subscription_id),
          current_period_start = COALESCE($6, current_period_start),
          current_period_end = COALESCE($7, current_period_end),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $8
      `, [
        tierId, status, billingPeriod, stripeCustomerId, stripeSubscriptionId,
        currentPeriodStart, currentPeriodEnd, userId
      ]);
    } else {
      await database.query(`
        INSERT INTO user_subscriptions (
          user_id, tier_id, status, billing_period,
          stripe_customer_id, stripe_subscription_id,
          current_period_start, current_period_end,
          grandfathered_from, grandfathered_expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        userId, tierId, status, billingPeriod,
        stripeCustomerId, stripeSubscriptionId,
        currentPeriodStart || new Date().toISOString(),
        currentPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        grandfatheredFrom, grandfatheredExpiresAt
      ]);
    }

    // Invalidate cache
    await this.invalidateUserCache(userId);

    return await this.getUserSubscription(userId);
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId, reason = null, immediate = false) {
    const database = await getDatabaseAsync();

    await database.query(`
      UPDATE user_subscriptions SET
        cancel_at_period_end = $1,
        cancelled_at = $2,
        cancellation_reason = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
    `, [
      immediate ? 0 : 1,
      immediate ? new Date().toISOString() : null,
      reason,
      userId
    ]);

    // Invalidate cache
    await this.invalidateUserCache(userId);

    // Log event
    await this.logEvent(userId, 'cancelled', { reason, immediate });
  }

  /**
   * Downgrade user to free tier
   */
  async downgradeToFree(userId, reason = null) {
    const freeTier = await this.getTierByName('free');
    const currentSub = await this.getUserSubscription(userId);

    const database = await getDatabaseAsync();
    await database.query(`
      UPDATE user_subscriptions SET
        tier_id = $1,
        status = 'active',
        cancel_at_period_end = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
    `, [freeTier.id, userId]);

    // Log event
    await this.logEvent(userId, 'downgraded', {
      previousTierId: currentSub.tier_id,
      newTierId: freeTier.id,
      reason
    });

    // Invalidate cache
    await this.invalidateUserCache(userId);
  }

  /**
   * Log subscription event
   */
  async logEvent(userId, eventType, data = {}) {
    const {
      previousTierId,
      newTierId,
      reason,
      metadata,
      amountCents,
      stripeEventId,
      ipAddress,
      userAgent
    } = data;

    const database = await getDatabaseAsync();
    await database.query(`
      INSERT INTO subscription_events (
        user_id, event_type, previous_tier_id, new_tier_id,
        reason, metadata, amount_cents, stripe_event_id,
        ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      userId, eventType, previousTierId, newTierId,
      reason, metadata ? JSON.stringify(metadata) : null,
      amountCents, stripeEventId, ipAddress, userAgent
    ]);
  }

  /**
   * Check if Stripe event already processed (idempotency)
   */
  async isEventProcessed(stripeEventId) {
    const database = await getDatabaseAsync();
    const result = await database.query(
      'SELECT id FROM subscription_events WHERE stripe_event_id = $1',
      [stripeEventId]
    );
    return !!result.rows[0];
  }

  /**
   * Invalidate cache for user (both Redis and in-memory)
   */
  async invalidateUserCache(userId) {
    this._userCacheFallback.delete(userId);
    await unifiedCache.delete(`${CACHE_PREFIX}user:${userId}`);
  }

  /**
   * Invalidate cache for user (sync version)
   */
  invalidateUserCacheSync(userId) {
    this._userCacheFallback.delete(userId);
    // Fire and forget Redis delete
    unifiedCache.delete(`${CACHE_PREFIX}user:${userId}`).catch(() => {});
  }

  /**
   * Clear all caches (both Redis and in-memory)
   */
  async clearAllCaches() {
    this._tierCacheFallback.clear();
    this._userCacheFallback.clear();
    await unifiedCache.deletePattern(`${CACHE_PREFIX}*`);
  }

  /**
   * Clear all caches (sync version)
   */
  clearAllCachesSync() {
    this._tierCacheFallback.clear();
    this._userCacheFallback.clear();
    // Fire and forget Redis delete
    unifiedCache.deletePattern(`${CACHE_PREFIX}*`).catch(() => {});
  }
}

// Singleton instance
let instance = null;

function getSubscriptionService() {
  if (!instance) {
    instance = new SubscriptionService();
  }
  return instance;
}

function createSubscriptionService() {
  return new SubscriptionService();
}

module.exports = {
  SubscriptionService,
  getSubscriptionService,
  createSubscriptionService,
  TIER_HIERARCHY
};
