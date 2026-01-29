/**
 * PricingSuccess Page
 *
 * Shown after successful Stripe checkout.
 * Confirms subscription and welcomes user to their new tier.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSubscription } from '../context/SubscriptionContext';
import { Icon } from '../components/icons';
import './PricingSuccess.css';

export default function PricingSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSubscription, tier, getTierInfo } = useSubscription();
  const [loading, setLoading] = useState(true);

  const sessionId = searchParams.get('session_id');

  // Refresh subscription data after successful checkout
  useEffect(() => {
    async function handleSuccess() {
      // Give Stripe webhook a moment to process
      await new Promise(resolve => setTimeout(resolve, 1500));
      await refreshSubscription();
      setLoading(false);
    }

    if (sessionId) {
      handleSuccess();
    } else {
      setLoading(false);
    }
  }, [sessionId, refreshSubscription]);

  const tierInfo = getTierInfo(tier);

  if (loading) {
    return (
      <div className="pricing-success pricing-success--loading">
        <div className="pricing-success__spinner" />
        <p>Confirming your subscription...</p>
      </div>
    );
  }

  return (
    <div className="pricing-success">
      <div className="pricing-success__card">
        <div className="pricing-success__icon">
          <Icon name="check-circle" size={48} />
        </div>

        <h1>Welcome to {tierInfo.name}!</h1>

        <p className="pricing-success__message">
          Your subscription is now active. You have full access to all{' '}
          {tier === 'ultra' ? 'Ultra' : 'Pro'} features.
        </p>

        <div className="pricing-success__features">
          <h3>What's unlocked:</h3>
          <ul>
            {getUnlockedFeatures(tier).map((feature, index) => (
              <li key={index}>
                <Icon name="check" size={14} />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pricing-success__actions">
          <button
            className="pricing-success__btn pricing-success__btn--primary"
            onClick={() => navigate('/')}
          >
            <Icon name="home" size={18} />
            Go to Dashboard
          </button>

          <button
            className="pricing-success__btn pricing-success__btn--secondary"
            onClick={() => navigate('/settings')}
          >
            Manage Subscription
          </button>
        </div>

        <p className="pricing-success__help">
          Questions? <a href="mailto:support@prism.app">Contact support</a>
        </p>
      </div>

      {/* Confetti effect */}
      <div className="pricing-success__confetti">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="pricing-success__confetti-piece"
            style={{
              '--x': Math.random(),
              '--y': Math.random(),
              '--rotation': Math.random() * 360,
              '--delay': Math.random() * 2,
              '--color': ['#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b'][Math.floor(Math.random() * 4)]
            }}
          />
        ))}
      </div>
    </div>
  );
}

function getUnlockedFeatures(tier) {
  if (tier === 'ultra') {
    return [
      'Unlimited AI queries & Prism reports',
      'Paper trading bots with automation',
      'Monte Carlo simulations',
      'Backtesting engine',
      'Stress testing scenarios',
      'ML signal optimization'
    ];
  }

  // Pro tier
  return [
    '200 AI queries per month',
    '20 Prism reports per month',
    'Advanced stock screener',
    'AI research agents',
    'SEC filing analyzer',
    'Real-time 13F alerts'
  ];
}
