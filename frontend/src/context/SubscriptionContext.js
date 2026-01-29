/**
 * Subscription Context
 *
 * Provides subscription state and utilities throughout the app:
 * - Current tier (free, pro, ultra)
 * - Feature access checks
 * - Usage tracking and limits
 * - Grandfathering status
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const SubscriptionContext = createContext(null);

const API_BASE = process.env.REACT_APP_API_URL || '';

// Tier hierarchy for comparisons
const TIER_HIERARCHY = {
  free: 0,
  pro: 1,
  ultra: 2
};

// Feature to tier mapping (for UI hints)
const FEATURE_REQUIRED_TIER = {
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

// Default free tier for unauthenticated users
const DEFAULT_SUBSCRIPTION = {
  tier: 'free',
  displayName: 'Free',
  status: 'active',
  features: {
    basic_screener: true,
    advanced_screener: false,
    ai_research_agents: false,
    filing_analyzer: false,
    realtime_13f: false,
    prism_reports: false,
    dcf_valuation: false,
    paper_trading_bots: false,
    ml_optimization: false,
    monte_carlo: false,
    stress_testing: false,
    backtesting: false,
    factor_analysis: false,
    data_export: false,
    api_access: false
  },
  limits: {
    ai_queries_monthly: 10,
    prism_reports_monthly: 2,
    watchlist_stocks: 10,
    portfolios: 1,
    alerts: 5,
    agents: 0
  },
  isGrandfathered: false,
  isGrandfatheredActive: false,
  grandfatheredDaysRemaining: 0
};

// Admin subscription - full Ultra access with no limits
const ADMIN_SUBSCRIPTION = {
  tier: 'ultra',
  displayName: 'Admin',
  status: 'active',
  features: {
    basic_screener: true,
    advanced_screener: true,
    ai_research_agents: true,
    filing_analyzer: true,
    realtime_13f: true,
    prism_reports: true,
    dcf_valuation: true,
    paper_trading_bots: true,
    ml_optimization: true,
    monte_carlo: true,
    stress_testing: true,
    backtesting: true,
    factor_analysis: true,
    data_export: true,
    api_access: true
  },
  limits: {
    ai_queries_monthly: -1,      // -1 = unlimited
    prism_reports_monthly: -1,
    watchlist_stocks: -1,
    portfolios: -1,
    alerts: -1,
    agents: -1
  },
  isGrandfathered: false,
  isGrandfatheredActive: false,
  grandfatheredDaysRemaining: 0,
  isAdmin: true
};

export function SubscriptionProvider({ children }) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch subscription status
  const fetchSubscription = useCallback(async () => {
    // Admin gets full Ultra access regardless of authentication
    if (isAdmin) {
      setSubscription(ADMIN_SUBSCRIPTION);
      setUsage({});
      setLoading(false);
      return;
    }

    if (!isAuthenticated) {
      setSubscription(DEFAULT_SUBSCRIPTION);
      setUsage({});
      setLoading(false);
      return;
    }

    try {
      // Include admin bypass header if admin
      const headers = {};
      if (localStorage.getItem('adminAccess') === 'true') {
        headers['X-Admin-Bypass'] = 'true';
      }

      const response = await fetch(`${API_BASE}/api/subscription`, {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription');
      }

      const data = await response.json();

      if (data.success) {
        setSubscription(data.subscription);
        setUsage(data.usage || {});
      } else {
        setSubscription(DEFAULT_SUBSCRIPTION);
        setUsage({});
      }

      setError(null);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError(err.message);
      setSubscription(DEFAULT_SUBSCRIPTION);
      setUsage({});
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isAdmin]);

  // Fetch on mount and when auth/admin status changes
  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription, user?.id, isAdmin]);

  // Refresh subscription (e.g., after upgrade)
  const refreshSubscription = useCallback(() => {
    setLoading(true);
    return fetchSubscription();
  }, [fetchSubscription]);

  // Check if user has access to a specific feature
  const hasFeature = useCallback((featureName) => {
    const features = subscription?.features || {};
    return features[featureName] === true;
  }, [subscription]);

  // Check if user's tier meets minimum requirement
  const hasTierAccess = useCallback((requiredTier) => {
    const userTierLevel = TIER_HIERARCHY[subscription?.tier] ?? 0;
    const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 0;
    return userTierLevel >= requiredLevel;
  }, [subscription]);

  // Get usage status for a specific metric
  const getUsageStatus = useCallback((metricName) => {
    const metric = usage[metricName];
    const limit = subscription?.limits?.[metricName];

    if (!metric || limit === undefined) {
      return {
        status: 'unknown',
        current: 0,
        limit: 0,
        remaining: 0,
        unlimited: false,
        percentage: 0
      };
    }

    const current = metric.current || 0;
    const unlimited = limit === -1 || metric.unlimited;
    const remaining = unlimited ? -1 : Math.max(0, limit - current);
    const percentage = unlimited ? 0 : (limit > 0 ? Math.round((current / limit) * 100) : 0);

    let status = 'ok';
    if (!unlimited) {
      if (current >= limit) {
        status = 'exceeded';
      } else if (percentage >= 80) {
        status = 'warning';
      }
    }

    return {
      status,
      current,
      limit,
      remaining,
      unlimited,
      percentage,
      lastUsedAt: metric.lastUsedAt
    };
  }, [usage, subscription]);

  // Check if user can perform an action (feature + usage check)
  const canPerform = useCallback((action) => {
    // Feature check
    const featureName = action;
    if (!hasFeature(featureName) && FEATURE_REQUIRED_TIER[featureName]) {
      return {
        allowed: false,
        reason: `This feature requires a ${FEATURE_REQUIRED_TIER[featureName]} subscription`,
        upgradeRequired: FEATURE_REQUIRED_TIER[featureName]
      };
    }

    // Usage check for metered features
    const usageMapping = {
      askAI: 'ai_queries_monthly',
      generatePrismReport: 'prism_reports_monthly',
      addToWatchlist: 'watchlist_stocks',
      createPortfolio: 'portfolios',
      createAgent: 'agents',
      runBacktest: 'backtest_runs_monthly',
      runMonteCarlo: 'monte_carlo_runs_monthly'
    };

    const usageMetric = usageMapping[action];
    if (usageMetric) {
      const status = getUsageStatus(usageMetric);
      if (status.status === 'exceeded') {
        return {
          allowed: false,
          reason: `You've reached your ${usageMetric.replace(/_/g, ' ')} limit`,
          upgradeRequired: getNextTier(subscription?.tier)
        };
      }
    }

    return { allowed: true };
  }, [hasFeature, getUsageStatus, subscription]);

  // Get tier display info
  const getTierInfo = useCallback((tierName) => {
    const tierInfo = {
      free: {
        name: 'Free',
        color: '#6B7280',
        icon: null,
        description: 'Basic investment tools'
      },
      pro: {
        name: 'Pro',
        color: '#3B82F6',
        icon: 'crown',
        description: 'Full AI research toolkit'
      },
      ultra: {
        name: 'Ultra',
        color: '#8B5CF6',
        icon: 'zap',
        description: 'Quantitative powerhouse'
      }
    };
    return tierInfo[tierName] || tierInfo.free;
  }, []);

  // Get the next tier up for upgrade prompts
  const getNextTier = (currentTier) => {
    if (currentTier === 'free') return 'pro';
    if (currentTier === 'pro') return 'ultra';
    return null;
  };

  // Increment local usage (optimistic update)
  const incrementUsage = useCallback((metricName) => {
    setUsage(prev => {
      const metric = prev[metricName] || { current: 0 };
      return {
        ...prev,
        [metricName]: {
          ...metric,
          current: (metric.current || 0) + 1,
          lastUsedAt: new Date().toISOString()
        }
      };
    });
  }, []);

  // Trigger upgrade modal event
  const promptUpgrade = useCallback((options = {}) => {
    window.dispatchEvent(new CustomEvent('show-upgrade-modal', {
      detail: options
    }));
  }, []);

  // Memoized context value
  const value = useMemo(() => ({
    // Subscription state
    subscription,
    usage,
    loading,
    error,
    tier: subscription?.tier || 'free',
    tierInfo: getTierInfo(subscription?.tier),

    // Booleans for quick checks
    isPro: isAdmin || TIER_HIERARCHY[subscription?.tier] >= TIER_HIERARCHY.pro,
    isUltra: isAdmin || subscription?.tier === 'ultra',
    isFree: !isAdmin && subscription?.tier === 'free',
    isAdmin,

    // Grandfathering
    isGrandfathered: subscription?.isGrandfathered || false,
    isGrandfatheredActive: isAdmin || subscription?.isGrandfatheredActive || false,
    grandfatheredDaysRemaining: subscription?.grandfatheredDaysRemaining || 0,

    // Billing info
    billingPeriod: subscription?.billingPeriod,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,

    // Methods
    hasFeature,
    hasTierAccess,
    getUsageStatus,
    canPerform,
    getTierInfo,
    incrementUsage,
    refreshSubscription,
    promptUpgrade,

    // Feature map for UI
    featureRequiredTier: FEATURE_REQUIRED_TIER
  }), [
    subscription,
    usage,
    loading,
    error,
    isAdmin,
    hasFeature,
    hasTierAccess,
    getUsageStatus,
    canPerform,
    getTierInfo,
    incrementUsage,
    refreshSubscription,
    promptUpgrade
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// Hook to use subscription context
export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// Hook for feature gating (shorthand)
export function useFeature(featureName) {
  const { hasFeature, tier, featureRequiredTier } = useSubscription();
  const hasAccess = hasFeature(featureName);
  const requiredTier = featureRequiredTier[featureName];

  return {
    hasAccess,
    currentTier: tier,
    requiredTier,
    needsUpgrade: !hasAccess && requiredTier
  };
}

// Hook for usage limits (shorthand)
export function useUsageLimit(metricName) {
  const { getUsageStatus, incrementUsage, promptUpgrade } = useSubscription();
  const status = getUsageStatus(metricName);

  const checkAndIncrement = useCallback(() => {
    if (status.status === 'exceeded') {
      promptUpgrade({
        reason: `You've reached your ${metricName.replace(/_/g, ' ')} limit`,
        metric: metricName
      });
      return false;
    }
    incrementUsage(metricName);
    return true;
  }, [status, metricName, incrementUsage, promptUpgrade]);

  return {
    ...status,
    checkAndIncrement
  };
}

export default SubscriptionContext;
