/**
 * Subscription Middleware
 *
 * Middleware functions for subscription-based access control:
 * - requireFeature: Block access to features not in user's tier
 * - checkUsageLimit: Check and track metered usage
 * - checkResourceLimit: Check resource counts (watchlists, portfolios)
 * - attachSubscription: Add subscription info to request
 */

const { getDatabaseAsync } = require('../lib/db');
const { getSubscriptionService, TIER_HIERARCHY } = require('../services/subscriptionService');

/**
 * Check if request is from admin user
 * Admin users bypass all subscription restrictions
 */
function isAdminRequest(req) {
  // Check if admin flag is set by auth middleware
  if (req.isAdmin) return true;

  // Check if user has admin role
  if (req.user?.is_admin) return true;

  // Check against admin emails from environment
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  if (req.user?.email && adminEmails.includes(req.user.email.toLowerCase())) return true;

  // Check for local admin bypass header (dev mode)
  const hasAdminBypass = req.headers['x-admin-bypass'] === 'true';
  if (hasAdminBypass && process.env.ALLOW_DEV_AUTH === 'true') return true;

  return false;
}

/**
 * Map features to their required tier
 */
const FEATURE_TIER_MAP = {
  // Pro features (AI-powered)
  advanced_screener: 'pro',
  ai_research_agents: 'pro',
  filing_analyzer: 'pro',
  realtime_13f: 'pro',
  factor_analysis: 'pro',
  data_export: 'pro',
  prism_reports: 'pro',
  dcf_valuation: 'pro',
  paper_trading_bots: 'pro',  // Moved from ultra - all AI features are Pro
  // Ultra features (quantitative simulations)
  ml_optimization: 'ultra',
  monte_carlo: 'ultra',
  stress_testing: 'ultra',
  backtesting: 'ultra',
  api_access: 'ultra'
};

/**
 * Get required tier for a feature
 */
function getRequiredTierForFeature(featureName) {
  return FEATURE_TIER_MAP[featureName] || 'pro';
}

/**
 * Middleware: Require specific feature access
 *
 * Usage: router.post('/endpoint', requireFeature('backtesting'), handler)
 *
 * @param {string} featureName - Feature to check
 * @param {object} options - Optional settings
 * @param {boolean} options.softBlock - If true, inject warning but allow (default: false)
 * @param {string} options.message - Custom error message
 */
function requireFeature(featureName, options = {}) {
  const {
    softBlock = false,
    message = null
  } = options;

  return async (req, res, next) => {
    // Admin bypasses all feature restrictions
    if (isAdminRequest(req)) {
      req.isAdmin = true;
      return next();
    }

    const userId = req.user?.id;

    // No user = no features (should be caught by requireAuth first)
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const hasAccess = await subscriptionService.hasFeature(userId, featureName);

    if (!hasAccess) {
      const subscription = await subscriptionService.getUserSubscription(userId);
      const requiredTier = getRequiredTierForFeature(featureName);

      if (softBlock) {
        // Inject warning but allow request to proceed
        req.subscriptionWarning = {
          feature: featureName,
          message: message || `This feature works best with ${requiredTier} subscription`,
          upgradeUrl: '/pricing'
        };
        return next();
      }

      return res.status(403).json({
        error: message || `This feature requires a ${requiredTier} subscription`,
        code: 'FEATURE_RESTRICTED',
        feature: featureName,
        currentTier: subscription?.tier_name || 'free',
        requiredTier,
        upgradeUrl: '/pricing'
      });
    }

    next();
  };
}

/**
 * Middleware: Require minimum tier level
 *
 * Usage: router.post('/endpoint', requireTier('pro'), handler)
 *
 * @param {string} minimumTier - Minimum tier required ('free', 'pro', 'ultra')
 */
function requireTier(minimumTier) {
  return async (req, res, next) => {
    // Admin bypasses all tier restrictions
    if (isAdminRequest(req)) {
      req.isAdmin = true;
      req.userTier = 'ultra';
      return next();
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const hasAccess = await subscriptionService.hasTierAccess(userId, minimumTier);

    if (!hasAccess) {
      const subscription = await subscriptionService.getUserSubscription(userId);
      return res.status(403).json({
        error: `This feature requires a ${minimumTier} subscription or higher`,
        code: 'TIER_REQUIRED',
        currentTier: subscription?.tier_name || 'free',
        requiredTier: minimumTier,
        upgradeUrl: '/pricing'
      });
    }

    // Attach subscription to request for downstream use
    req.subscription = await subscriptionService.getUserSubscription(userId);
    req.userTier = req.subscription.tier_name;

    next();
  };
}

/**
 * Middleware: Check and track usage limits
 *
 * Usage: router.post('/ai/query', requireAuth, checkUsageLimit('ai_queries_monthly'), handler)
 *
 * @param {string} usageType - Type of usage to track
 * @param {object} options - Optional settings
 * @param {number} options.increment - How much to increment (default: 1)
 * @param {number} options.warningThreshold - Percentage to warn at (default: 0.8)
 */
function checkUsageLimit(usageType, options = {}) {
  const {
    increment = 1,
    warningThreshold = 0.8
  } = options;

  return async (req, res, next) => {
    // Admin bypasses all usage limits
    if (isAdminRequest(req)) {
      req.isAdmin = true;
      req.usageInfo = {
        type: usageType,
        remaining: -1,
        limit: -1,
        unlimited: true
      };
      return next();
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);

    try {
      const usageCheck = await subscriptionService.checkAndTrackUsage(userId, usageType, increment);

      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: 'Usage limit exceeded',
          code: 'USAGE_LIMIT_EXCEEDED',
          usageType,
          limit: usageCheck.limit,
          remaining: 0,
          resetAt: usageCheck.resetAt,
          upgradeUrl: '/pricing'
        });
      }

      // Add usage info to request for handlers to use
      req.usageInfo = {
        type: usageType,
        remaining: usageCheck.remaining,
        limit: usageCheck.limit,
        unlimited: usageCheck.unlimited
      };

      // Add warning headers if approaching limit (for non-unlimited)
      if (!usageCheck.unlimited && usageCheck.limit > 0) {
        const usedCount = usageCheck.limit - usageCheck.remaining;
        const usageRatio = usedCount / usageCheck.limit;

        if (usageRatio >= warningThreshold) {
          res.set('X-Usage-Warning', `Approaching limit: ${usageCheck.remaining} ${usageType} remaining`);
          res.set('X-Usage-Remaining', String(usageCheck.remaining));
          res.set('X-Usage-Limit', String(usageCheck.limit));

          req.usageWarning = {
            type: usageType,
            remaining: usageCheck.remaining,
            limit: usageCheck.limit,
            percentage: Math.round(usageRatio * 100)
          };
        }
      }

      next();
    } catch (error) {
      console.error('Error checking usage limit:', error);
      // On error, allow the request but log it
      next();
    }
  };
}

/**
 * Middleware: Check resource count limits (watchlist items, portfolios, etc.)
 *
 * Usage: router.post('/watchlist', requireAuth, checkResourceLimit('watchlist_stocks'), handler)
 *
 * @param {string} resourceType - Type of resource to check
 * @param {object} options - Optional settings
 * @param {function} options.countFn - Custom function to count resources
 */
function checkResourceLimit(resourceType, options = {}) {
  const { countFn = null } = options;

  return async (req, res, next) => {
    // Admin bypasses all resource limits
    if (isAdminRequest(req)) {
      req.isAdmin = true;
      req.resourceInfo = {
        type: resourceType,
        current: 0,
        limit: -1,
        remaining: -1
      };
      return next();
    }

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const db = await getDatabaseAsync();
    const subscriptionService = getSubscriptionService(db);
    const limit = await subscriptionService.getLimit(userId, resourceType);

    // -1 = unlimited
    if (limit === -1) {
      return next();
    }

    // Get current count
    let currentCount;
    if (countFn) {
      currentCount = await countFn(req, userId, db);
    } else {
      currentCount = await getDefaultResourceCount(db, userId, resourceType);
    }

    if (currentCount >= limit) {
      const subscription = await subscriptionService.getUserSubscription(userId);
      const readableType = resourceType.replace(/_/g, ' ');

      return res.status(403).json({
        error: `You've reached the maximum ${readableType} for your plan (${limit})`,
        code: 'RESOURCE_LIMIT_EXCEEDED',
        resourceType,
        current: currentCount,
        limit,
        currentTier: subscription?.tier_name || 'free',
        upgradeUrl: '/pricing'
      });
    }

    req.resourceInfo = {
      type: resourceType,
      current: currentCount,
      limit,
      remaining: limit - currentCount
    };

    next();
  };
}

/**
 * Get default resource count from database
 */
async function getDefaultResourceCount(db, userId, resourceType) {
  const queries = {
    watchlist_stocks: 'SELECT COUNT(*) as count FROM user_watchlists WHERE user_id = ?',
    portfolios: 'SELECT COUNT(*) as count FROM portfolios WHERE user_id = ?',
    alerts: 'SELECT COUNT(*) as count FROM user_alerts WHERE user_id = ? AND is_active = 1',
    agents: 'SELECT COUNT(*) as count FROM trading_agents WHERE user_id = ? AND deleted_at IS NULL'
  };

  const query = queries[resourceType];
  if (!query) {
    console.warn(`No query defined for resource type: ${resourceType}`);
    return 0;
  }

  try {
    const result = await db.prepare(query).get(userId);
    return result?.count || 0;
  } catch (error) {
    console.error(`Error counting ${resourceType}:`, error);
    return 0;
  }
}

/**
 * Middleware: Attach subscription info to request (non-blocking)
 *
 * Usage: router.use(attachSubscription)
 */
async function attachSubscription(req, res, next) {
  if (req.user?.id) {
    try {
      const db = await getDatabaseAsync();
      const subscriptionService = getSubscriptionService(db);
      req.subscription = await subscriptionService.getUserSubscription(req.user.id);
      req.userTier = req.subscription?.tier_name || 'free';
    } catch (error) {
      console.error('Error attaching subscription:', error);
      req.subscription = null;
      req.userTier = 'free';
    }
  }
  next();
}

/**
 * Middleware: Optional feature check (attaches info but doesn't block)
 *
 * Useful for endpoints that work differently based on tier
 */
function optionalFeatureCheck(featureName) {
  return async (req, res, next) => {
    if (req.user?.id) {
      const db = await getDatabaseAsync();
      const subscriptionService = getSubscriptionService(db);
      req.hasFeature = req.hasFeature || {};
      req.hasFeature[featureName] = await subscriptionService.hasFeature(req.user.id, featureName);
    }
    next();
  };
}

module.exports = {
  requireFeature,
  requireTier,
  checkUsageLimit,
  checkResourceLimit,
  attachSubscription,
  optionalFeatureCheck,
  getRequiredTierForFeature,
  isAdminRequest,
  FEATURE_TIER_MAP
};
