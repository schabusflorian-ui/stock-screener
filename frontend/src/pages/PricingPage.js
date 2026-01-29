/**
 * PricingPage
 *
 * Displays subscription tiers and pricing.
 * Allows users to upgrade or manage their subscription.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSubscription } from '../context/SubscriptionContext';
import { Icon } from '../components/icons';
import { TierBadge } from '../components/subscription';
import './PricingPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function PricingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    tier: currentTier,
    subscription,
    isGrandfatheredActive,
    grandfatheredDaysRemaining,
    refreshSubscription
  } = useSubscription();

  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState(null);

  // Check for cancelled param
  const cancelled = new URLSearchParams(location.search).get('cancelled');

  // Fetch tiers from API
  useEffect(() => {
    async function fetchTiers() {
      try {
        const response = await fetch(`${API_BASE}/api/subscription/tiers`, {
          credentials: 'include'
        });
        const data = await response.json();

        if (data.success) {
          setTiers(data.tiers);
        }
      } catch (err) {
        console.error('Failed to fetch tiers:', err);
        // Use fallback tier data
        setTiers(FALLBACK_TIERS);
      } finally {
        setLoading(false);
      }
    }

    fetchTiers();
  }, []);

  // Handle checkout
  const handleCheckout = async (tierName) => {
    if (tierName === 'free' || tierName === currentTier) {
      return;
    }

    setCheckoutLoading(tierName);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/subscription/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tierName,
          billingPeriod
        })
      });

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        // Redirect to Stripe Checkout
        window.location.href = data.checkoutUrl;
      } else {
        setError(data.error || 'Failed to start checkout');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError('Failed to start checkout. Please try again.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  // Handle manage subscription
  const handleManageSubscription = async () => {
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
    }
  };

  // Get price for tier
  const getPrice = (tier) => {
    if (billingPeriod === 'yearly') {
      return tier.priceYearly ? Math.round(tier.priceYearly / 12) : 0;
    }
    return tier.priceMonthly || 0;
  };

  // Get annual savings
  const getAnnualSavings = (tier) => {
    if (!tier.priceMonthly || !tier.priceYearly) return 0;
    const monthlyTotal = tier.priceMonthly * 12;
    return Math.round(((monthlyTotal - tier.priceYearly) / monthlyTotal) * 100);
  };

  const displayTiers = tiers.length > 0 ? tiers : FALLBACK_TIERS;

  return (
    <div className="pricing-page">
      <div className="pricing-page__header">
        <h1>Choose Your Plan</h1>
        <p>Unlock the full power of AI-assisted investing</p>

        {cancelled && (
          <div className="pricing-page__cancelled">
            <Icon name="info" size={16} />
            Checkout was cancelled. You can try again anytime.
          </div>
        )}

        {isGrandfatheredActive && (
          <div className="pricing-page__grandfathered">
            <Icon name="gift" size={16} />
            <div>
              <strong>Early Adopter Bonus</strong>
              <span>You have {grandfatheredDaysRemaining} days of full access remaining</span>
            </div>
          </div>
        )}

        <div className="pricing-page__toggle">
          <button
            className={billingPeriod === 'monthly' ? 'active' : ''}
            onClick={() => setBillingPeriod('monthly')}
          >
            Monthly
          </button>
          <button
            className={billingPeriod === 'yearly' ? 'active' : ''}
            onClick={() => setBillingPeriod('yearly')}
          >
            Yearly
            <span className="pricing-page__toggle-badge">Save 20%</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="pricing-page__error">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      <div className="pricing-page__tiers">
        {displayTiers.map((tier) => {
          const isCurrent = tier.name === currentTier;
          const price = getPrice(tier);
          const savings = getAnnualSavings(tier);
          const isPopular = tier.name === 'pro';

          return (
            <div
              key={tier.name}
              className={`pricing-tier ${isCurrent ? 'pricing-tier--current' : ''} ${isPopular ? 'pricing-tier--popular' : ''}`}
            >
              {isPopular && (
                <div className="pricing-tier__popular-badge">Most Popular</div>
              )}

              <div className="pricing-tier__header">
                <div className="pricing-tier__name-row">
                  <h2>{tier.displayName}</h2>
                  {isCurrent && <TierBadge tier={tier.name} size="small" />}
                </div>
                <p className="pricing-tier__description">{tier.description}</p>
              </div>

              <div className="pricing-tier__pricing">
                <div className="pricing-tier__price">
                  <span className="pricing-tier__currency">$</span>
                  <span className="pricing-tier__amount">{price}</span>
                  <span className="pricing-tier__period">/mo</span>
                </div>
                {billingPeriod === 'yearly' && savings > 0 && (
                  <div className="pricing-tier__savings">
                    Save {savings}% annually
                  </div>
                )}
                {billingPeriod === 'yearly' && tier.priceYearly && (
                  <div className="pricing-tier__billed">
                    Billed ${tier.priceYearly} yearly
                  </div>
                )}
              </div>

              <div className="pricing-tier__cta">
                {isCurrent ? (
                  subscription?.stripe_subscription_id ? (
                    <button
                      className="pricing-tier__btn pricing-tier__btn--manage"
                      onClick={handleManageSubscription}
                    >
                      Manage Subscription
                    </button>
                  ) : (
                    <button className="pricing-tier__btn pricing-tier__btn--current" disabled>
                      Current Plan
                    </button>
                  )
                ) : tier.name === 'free' ? (
                  <button className="pricing-tier__btn pricing-tier__btn--free" disabled>
                    Free Forever
                  </button>
                ) : (
                  <button
                    className={`pricing-tier__btn pricing-tier__btn--upgrade ${isPopular ? 'pricing-tier__btn--popular' : ''}`}
                    onClick={() => handleCheckout(tier.name)}
                    disabled={checkoutLoading === tier.name}
                  >
                    {checkoutLoading === tier.name ? (
                      <>
                        <span className="pricing-tier__spinner" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Icon name="zap" size={16} />
                        Upgrade to {tier.displayName}
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="pricing-tier__features">
                <h3>
                  {tier.name === 'free' ? 'Includes:' :
                   tier.name === 'pro' ? 'Everything in Free, plus:' :
                   'Everything in Pro, plus:'}
                </h3>
                <ul>
                  {getFeatureList(tier).map((feature, index) => (
                    <li key={index}>
                      <Icon name="check" size={14} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {tier.limits && (
                <div className="pricing-tier__limits">
                  <h4>Usage Limits</h4>
                  <div className="pricing-tier__limits-grid">
                    {formatLimits(tier.limits).map((limit, index) => (
                      <div key={index} className="pricing-tier__limit">
                        <span className="pricing-tier__limit-value">{limit.value}</span>
                        <span className="pricing-tier__limit-label">{limit.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pricing-page__faq">
        <h2>Frequently Asked Questions</h2>
        <div className="pricing-page__faq-grid">
          {FAQ_ITEMS.map((item, index) => (
            <div key={index} className="pricing-faq-item">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="pricing-page__footer">
        <p>
          Questions about pricing?{' '}
          <a href="mailto:support@prism.app">Contact us</a>
        </p>
      </div>
    </div>
  );
}

// Feature list per tier
function getFeatureList(tier) {
  const features = {
    free: [
      'Basic stock screener',
      '10 watchlist items',
      '10 AI queries per month',
      '2 Prism reports per month',
      '1 portfolio',
      'Basic market data'
    ],
    pro: [
      '200 AI queries per month',
      '20 Prism reports per month',
      'Unlimited watchlists',
      '5 portfolios',
      'Advanced stock screener',
      'AI research agents',
      'SEC filing analyzer',
      'Real-time 13F alerts',
      'Factor analysis',
      'CSV data export'
    ],
    ultra: [
      'Unlimited AI queries',
      'Unlimited Prism reports',
      'Unlimited portfolios',
      'Paper trading bots (10)',
      'Monte Carlo simulation',
      'Backtesting engine',
      'Stress testing',
      'ML signal optimization',
      'Priority support'
    ]
  };

  return features[tier.name] || [];
}

// Format limits for display
function formatLimits(limits) {
  const result = [];

  if (limits.ai_queries_monthly !== undefined) {
    result.push({
      value: limits.ai_queries_monthly === -1 ? 'Unlimited' : limits.ai_queries_monthly,
      label: 'AI Queries/mo'
    });
  }

  if (limits.prism_reports_monthly !== undefined) {
    result.push({
      value: limits.prism_reports_monthly === -1 ? 'Unlimited' : limits.prism_reports_monthly,
      label: 'Prism Reports/mo'
    });
  }

  if (limits.portfolios !== undefined) {
    result.push({
      value: limits.portfolios === -1 ? 'Unlimited' : limits.portfolios,
      label: 'Portfolios'
    });
  }

  if (limits.agents !== undefined && limits.agents !== 0) {
    result.push({
      value: limits.agents === -1 ? 'Unlimited' : limits.agents,
      label: 'Trading Agents'
    });
  }

  return result;
}

// Fallback tier data if API fails
const FALLBACK_TIERS = [
  {
    name: 'free',
    displayName: 'Free',
    description: 'Basic investment tools',
    priceMonthly: 0,
    priceYearly: 0,
    limits: {
      ai_queries_monthly: 10,
      prism_reports_monthly: 2,
      watchlist_stocks: 10,
      portfolios: 1,
      agents: 0
    }
  },
  {
    name: 'pro',
    displayName: 'Pro',
    description: 'Full AI research toolkit',
    priceMonthly: 5,
    priceYearly: 48,
    limits: {
      ai_queries_monthly: 200,
      prism_reports_monthly: 20,
      watchlist_stocks: -1,
      portfolios: 5,
      agents: 0
    }
  },
  {
    name: 'ultra',
    displayName: 'Ultra',
    description: 'Quantitative powerhouse',
    priceMonthly: 20,
    priceYearly: 192,
    limits: {
      ai_queries_monthly: -1,
      prism_reports_monthly: -1,
      watchlist_stocks: -1,
      portfolios: -1,
      agents: 10
    }
  }
];

// FAQ items
const FAQ_ITEMS = [
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes! You can cancel your subscription at any time. You\'ll continue to have access until the end of your current billing period.'
  },
  {
    question: 'What happens to my data if I downgrade?',
    answer: 'Your data is always preserved. If you exceed limits after downgrading, excess items become read-only but are never deleted.'
  },
  {
    question: 'Is there a free trial?',
    answer: 'All users get 90 days of full access as early adopters. After that, you can continue with the free tier or upgrade.'
  },
  {
    question: 'Can I switch between monthly and annual?',
    answer: 'Yes! You can switch at any time. When switching to annual, you\'ll receive a prorated credit for your remaining monthly subscription.'
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit cards through Stripe. Your payment information is securely handled and never stored on our servers.'
  },
  {
    question: 'Do you offer refunds?',
    answer: 'We offer a 14-day money-back guarantee on all paid plans. If you\'re not satisfied, contact us for a full refund.'
  }
];
