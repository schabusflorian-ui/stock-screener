/**
 * LockedOverlay Component
 *
 * Semi-transparent overlay with blur effect for premium content.
 * Shows upgrade CTA with feature benefits.
 */

import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { PrismSparkle, Crown, Zap, Check } from '../icons';
import './LockedOverlay.css';

export default function LockedOverlay({
  feature,
  requiredTier = 'pro',
  title,
  description,
  benefits,
  className = ''
}) {
  const { promptUpgrade, getTierInfo, tier } = useSubscription();

  const tierInfo = getTierInfo(requiredTier);
  const currentTierInfo = getTierInfo(tier);

  // Default title based on feature
  const displayTitle = title || getFeatureTitle(feature);
  const displayDescription = description || getFeatureDescription(feature);

  const handleUpgradeClick = () => {
    promptUpgrade({
      feature,
      requiredTier,
      source: 'locked_overlay'
    });
  };

  return (
    <div className={`locked-overlay locked-overlay--${requiredTier} ${className}`}>
      <div className={`locked-overlay__backdrop locked-overlay__backdrop--${requiredTier}`} />

      <div className="locked-overlay__content">
        <div className={`locked-overlay__icon locked-overlay__icon--${requiredTier}`}>
          <PrismSparkle size={28} />
        </div>

        <div className={`locked-overlay__badge locked-overlay__badge--${requiredTier}`}>
          {requiredTier === 'ultra' && <Zap size={12} />}
          {requiredTier === 'pro' && <Crown size={12} />}
          {tierInfo.name} Feature
        </div>

        <h3 className="locked-overlay__title">{displayTitle}</h3>

        {displayDescription && (
          <p className="locked-overlay__description">{displayDescription}</p>
        )}

        {benefits && benefits.length > 0 && (
          <ul className="locked-overlay__benefits">
            {benefits.map((benefit, index) => (
              <li key={index}>
                <Check size={14} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          className={`locked-overlay__cta locked-overlay__cta--${requiredTier}`}
          onClick={handleUpgradeClick}
        >
          <PrismSparkle size={16} />
          Upgrade to {tierInfo.name}
        </button>

        <p className="locked-overlay__current">
          Currently on <span style={{ color: currentTierInfo.color }}>{currentTierInfo.name}</span>
        </p>
      </div>
    </div>
  );
}

// Feature title mapping
function getFeatureTitle(feature) {
  const titles = {
    backtesting: 'Backtesting Engine',
    monte_carlo: 'Monte Carlo Simulation',
    stress_testing: 'Stress Testing',
    paper_trading_bots: 'Paper Trading Bots',
    ml_optimization: 'ML Optimization',
    advanced_screener: 'Advanced Screener',
    ai_research_agents: 'AI Research Agents',
    filing_analyzer: 'Filing Analyzer',
    realtime_13f: 'Real-time 13F Alerts',
    factor_analysis: 'Factor Analysis',
    data_export: 'Data Export'
  };
  return titles[feature] || 'Premium Feature';
}

// Feature description mapping
function getFeatureDescription(feature) {
  const descriptions = {
    backtesting: 'Test your strategies against historical data with detailed analytics.',
    monte_carlo: 'Run thousands of simulations to understand portfolio risk.',
    stress_testing: 'See how your portfolio performs in market crash scenarios.',
    paper_trading_bots: 'Automate your strategies with paper trading agents.',
    ml_optimization: 'Use machine learning to optimize your trading signals.',
    advanced_screener: 'Filter stocks with advanced metrics and custom criteria.',
    ai_research_agents: 'Get AI-powered research and analysis on any company.',
    filing_analyzer: 'Analyze 10-K, 10-Q filings with AI assistance.',
    realtime_13f: 'Get instant alerts when institutional investors file 13F reports.',
    factor_analysis: 'Decompose returns by factor exposure.',
    data_export: 'Export your data to CSV for external analysis.'
  };
  return descriptions[feature] || 'Unlock this feature with a subscription upgrade.';
}
