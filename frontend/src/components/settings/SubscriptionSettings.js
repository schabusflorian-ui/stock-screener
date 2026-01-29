// frontend/src/components/settings/SubscriptionSettings.js
/**
 * SubscriptionSettings Component
 *
 * Shows current subscription status, usage dashboard, and plan management.
 * Integrated into the Settings page as a tab.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Zap,
  Sparkles,
  TrendingUp,
  Calendar,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  Check,
  Award,
  BarChart3,
  Bot,
  Target,
  Activity
} from '../icons';
import { useSubscription } from '../../context/SubscriptionContext';
import { TierBadge } from '../subscription';
import './SubscriptionSettings.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function SubscriptionSettings() {
  const navigate = useNavigate();
  const {
    tier,
    subscription,
    usage,
    limits,
    isGrandfatheredActive,
    grandfatheredDaysRemaining,
    refreshSubscription
  } = useSubscription();

  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState(null);

  // Open Stripe customer portal
  const handleManageBilling = async () => {
    setPortalLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/subscription/portal`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success && data.portalUrl) {
        window.location.href = data.portalUrl;
      } else {
        setError(data.error || 'Failed to open billing portal');
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError('Failed to open billing portal. Please try again.');
    } finally {
      setPortalLoading(false);
    }
  };

  // Get tier display info
  const getTierInfo = () => {
    switch (tier) {
      case 'ultra':
        return {
          name: 'Ultra',
          icon: Zap,
          color: '#8B5CF6',
          description: 'Full quantitative toolkit'
        };
      case 'pro':
        return {
          name: 'Pro',
          icon: Crown,
          color: '#3B82F6',
          description: 'AI-powered research tools'
        };
      default:
        return {
          name: 'Free',
          icon: Sparkles,
          color: '#6B7280',
          description: 'Basic investment tools'
        };
    }
  };

  const tierInfo = getTierInfo();
  const TierIcon = tierInfo.icon;

  // Calculate usage percentages
  const getUsagePercent = (used, limit) => {
    if (limit === -1 || limit === undefined) return 0; // Unlimited
    if (!limit) return 0;
    return Math.min(100, Math.round((used / limit) * 100));
  };

  // Usage metrics to display
  const usageMetrics = [
    {
      key: 'ai_queries',
      label: 'AI Queries',
      icon: Sparkles,
      used: usage?.ai_queries || 0,
      limit: limits?.ai_queries_monthly,
      color: '#7C3AED'
    },
    {
      key: 'prism_reports',
      label: 'PRISM Reports',
      icon: Target,
      used: usage?.prism_reports || 0,
      limit: limits?.prism_reports_monthly,
      color: '#D4AF37'
    },
    {
      key: 'portfolios',
      label: 'Portfolios',
      icon: Activity,
      used: usage?.portfolios || 0,
      limit: limits?.portfolios,
      color: '#3B82F6'
    },
    {
      key: 'agents',
      label: 'Trading Agents',
      icon: Bot,
      used: usage?.agents || 0,
      limit: limits?.agents,
      color: '#059669'
    }
  ];

  return (
    <div className="subscription-settings">
      {/* Current Plan Section */}
      <section className="subscription-section">
        <h2 className="section-title">Current Plan</h2>

        {error && (
          <div className="subscription-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Grandfathered Notice */}
        {isGrandfatheredActive && (
          <div className="grandfathered-notice">
            <Award size={20} />
            <div className="grandfathered-content">
              <strong>Early Adopter Bonus Active</strong>
              <p>
                You have full access to all features for {grandfatheredDaysRemaining} more days.
                After that, you'll transition to your selected plan.
              </p>
            </div>
          </div>
        )}

        <div className="current-plan-card" style={{ '--tier-color': tierInfo.color }}>
          <div className="plan-header">
            <div className="plan-icon" style={{ background: tierInfo.color }}>
              <TierIcon size={24} />
            </div>
            <div className="plan-info">
              <div className="plan-name-row">
                <h3>{tierInfo.name}</h3>
                <TierBadge tier={tier} />
              </div>
              <p className="plan-description">{tierInfo.description}</p>
            </div>
          </div>

          {subscription?.current_period_end && (
            <div className="plan-meta">
              <div className="meta-item">
                <Calendar size={14} />
                <span>
                  {subscription.cancel_at_period_end
                    ? 'Cancels'
                    : 'Renews'} on {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
              </div>
              {subscription.billing_period && (
                <div className="meta-item">
                  <CreditCard size={14} />
                  <span>Billed {subscription.billing_period}</span>
                </div>
              )}
            </div>
          )}

          {subscription?.cancel_at_period_end && (
            <div className="cancellation-notice">
              <AlertTriangle size={16} />
              <span>Your subscription will end on {new Date(subscription.current_period_end).toLocaleDateString()}</span>
            </div>
          )}

          <div className="plan-actions">
            {subscription?.stripe_subscription_id ? (
              <button
                className="action-btn action-btn--manage"
                onClick={handleManageBilling}
                disabled={portalLoading}
              >
                {portalLoading ? 'Opening...' : 'Manage Billing'}
                <ExternalLink size={14} />
              </button>
            ) : null}
            <button
              className="action-btn action-btn--upgrade"
              onClick={() => navigate('/pricing')}
            >
              {tier === 'ultra' ? 'View Plans' : 'Upgrade Plan'}
              <TrendingUp size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Usage Dashboard Section */}
      <section className="subscription-section">
        <h2 className="section-title">
          <BarChart3 size={18} />
          Usage This Period
        </h2>

        <div className="usage-grid">
          {usageMetrics.map((metric) => {
            const Icon = metric.icon;
            const isUnlimited = metric.limit === -1;
            const percent = getUsagePercent(metric.used, metric.limit);
            const isWarning = percent >= 80 && percent < 100;
            const isExceeded = percent >= 100;

            // Skip metrics with 0 limit (not available in tier)
            if (metric.limit === 0) return null;

            return (
              <div
                key={metric.key}
                className={`usage-card ${isWarning ? 'usage-card--warning' : ''} ${isExceeded ? 'usage-card--exceeded' : ''}`}
              >
                <div className="usage-header">
                  <div className="usage-icon" style={{ color: metric.color }}>
                    <Icon size={16} />
                  </div>
                  <span className="usage-label">{metric.label}</span>
                </div>

                <div className="usage-stats">
                  <span className="usage-value">{metric.used}</span>
                  <span className="usage-limit">
                    / {isUnlimited ? '∞' : metric.limit}
                  </span>
                </div>

                {!isUnlimited && (
                  <div className="usage-bar-container">
                    <div
                      className="usage-bar"
                      style={{
                        width: `${percent}%`,
                        background: isExceeded ? '#EF4444' : isWarning ? '#F59E0B' : metric.color
                      }}
                    />
                  </div>
                )}

                {isUnlimited && (
                  <div className="usage-unlimited">
                    <Check size={12} />
                    <span>Unlimited</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="usage-reset-note">
          Usage resets on the 1st of each month (UTC).
        </p>
      </section>

      {/* Plan Features Section */}
      <section className="subscription-section">
        <h2 className="section-title">Your Features</h2>

        <div className="features-grid">
          {getFeaturesByTier(tier).map((feature, index) => (
            <div key={index} className="feature-item">
              <Check size={14} className="feature-check" />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        {tier !== 'ultra' && (
          <div className="upgrade-prompt">
            <Sparkles size={16} />
            <span>
              Upgrade to {tier === 'free' ? 'Pro' : 'Ultra'} to unlock more features
            </span>
            <button onClick={() => navigate('/pricing')}>
              See Plans
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// Get features list by tier
function getFeaturesByTier(tier) {
  const features = {
    free: [
      'Basic stock screener',
      '10 AI queries per month',
      '2 PRISM reports per month',
      '10 watchlist items',
      '1 portfolio',
      'Basic market data'
    ],
    pro: [
      'Advanced stock screener',
      'Unlimited AI queries',
      'Unlimited PRISM reports',
      'Unlimited watchlist items',
      '5 portfolios',
      'AI research agents',
      'SEC filing analyzer',
      'Real-time 13F alerts',
      'Factor analysis',
      'DCF valuation',
      'CSV data export'
    ],
    ultra: [
      'Everything in Pro',
      'Unlimited portfolios',
      'Up to 10 trading agents',
      'Monte Carlo simulation',
      'Backtesting engine',
      'Stress testing',
      'ML signal optimization',
      'API access (coming soon)',
      'Priority support'
    ]
  };

  return features[tier] || features.free;
}
