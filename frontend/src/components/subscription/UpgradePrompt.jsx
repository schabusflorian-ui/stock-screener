/**
 * UpgradePrompt Component
 *
 * Inline card that prompts users to upgrade.
 * Used when content is completely blocked (no preview).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '../../context/SubscriptionContext';
import { PrismSparkle, Crown, Zap, CheckCircle } from '../icons';
import './UpgradePrompt.css';

export default function UpgradePrompt({
  feature,
  requiredTier = 'pro',
  title,
  description,
  benefit,
  compact = false,
  showPricing = true,
  className = ''
}) {
  const navigate = useNavigate();
  const { getTierInfo, tier, promptUpgrade } = useSubscription();

  const tierInfo = getTierInfo(requiredTier);
  const currentTierInfo = getTierInfo(tier);

  // Default content based on feature
  const displayTitle = title || getFeatureTitle(feature);
  const displayDescription = description || getFeatureDescription(feature);
  const displayBenefit = benefit || getFeatureBenefit(feature);

  const handleUpgradeClick = () => {
    promptUpgrade({
      feature,
      requiredTier,
      source: 'upgrade_prompt'
    });
  };

  const handleViewPricing = () => {
    navigate('/pricing');
  };

  if (compact) {
    return (
      <div className={`upgrade-prompt upgrade-prompt--compact upgrade-prompt--${requiredTier} ${className}`}>
        <div className={`upgrade-prompt__icon-compact upgrade-prompt__icon-compact--${requiredTier}`}>
          <PrismSparkle size={16} />
        </div>
        <div className="upgrade-prompt__text-compact">
          <span className="upgrade-prompt__title-compact">{displayTitle}</span>
          <span className={`upgrade-prompt__tier-compact upgrade-prompt__tier-compact--${requiredTier}`}>
            {requiredTier === 'ultra' ? <Zap size={10} /> : <Crown size={10} />}
            {tierInfo.name}
          </span>
        </div>
        <button
          className={`upgrade-prompt__btn-compact upgrade-prompt__btn-compact--${requiredTier}`}
          onClick={handleUpgradeClick}
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div className={`upgrade-prompt upgrade-prompt--${requiredTier} ${className}`}>
      <div className="upgrade-prompt__header">
        <div className={`upgrade-prompt__icon upgrade-prompt__icon--${requiredTier}`}>
          <PrismSparkle size={28} />
        </div>
        <div className={`upgrade-prompt__badge upgrade-prompt__badge--${requiredTier}`}>
          {requiredTier === 'ultra' ? <Zap size={12} /> : <Crown size={12} />}
          {tierInfo.name}
        </div>
      </div>

      <h3 className="upgrade-prompt__title">{displayTitle}</h3>
      <p className="upgrade-prompt__description">{displayDescription}</p>

      {displayBenefit && (
        <div className="upgrade-prompt__benefit">
          <CheckCircle size={16} />
          <span>{displayBenefit}</span>
        </div>
      )}

      <div className="upgrade-prompt__actions">
        <button
          className={`upgrade-prompt__cta upgrade-prompt__cta--${requiredTier}`}
          onClick={handleUpgradeClick}
        >
          <PrismSparkle size={16} />
          Upgrade to {tierInfo.name}
        </button>

        {showPricing && (
          <button
            className="upgrade-prompt__secondary"
            onClick={handleViewPricing}
          >
            View pricing
          </button>
        )}
      </div>

      <p className="upgrade-prompt__current">
        You're on the <strong className={`upgrade-prompt__current-tier--${tier}`}>{currentTierInfo.name}</strong> plan
      </p>
    </div>
  );
}

// Feature title mapping
function getFeatureTitle(feature) {
  const titles = {
    backtesting: 'Unlock Backtesting',
    monte_carlo: 'Unlock Monte Carlo',
    stress_testing: 'Unlock Stress Testing',
    paper_trading_bots: 'Unlock Trading Bots',
    ml_optimization: 'Unlock ML Optimization',
    advanced_screener: 'Unlock Advanced Screener',
    ai_research_agents: 'Unlock AI Agents',
    filing_analyzer: 'Unlock Filing Analyzer',
    realtime_13f: 'Unlock 13F Alerts',
    factor_analysis: 'Unlock Factor Analysis',
    data_export: 'Unlock Data Export'
  };
  return titles[feature] || 'Unlock This Feature';
}

function getFeatureDescription(feature) {
  const descriptions = {
    backtesting: 'Test your investment strategies against years of historical market data.',
    monte_carlo: 'Run probabilistic simulations to understand your portfolio\'s risk profile.',
    stress_testing: 'See how your portfolio would perform during historical market crashes.',
    paper_trading_bots: 'Create automated trading agents that execute your strategies.',
    ml_optimization: 'Use machine learning to find optimal signal weights and parameters.',
    advanced_screener: 'Filter stocks using advanced metrics, ratios, and custom criteria.',
    ai_research_agents: 'Get comprehensive AI-powered research on any company.',
    filing_analyzer: 'Extract key insights from SEC filings with AI assistance.',
    realtime_13f: 'Get instant notifications when major investors update their positions.',
    factor_analysis: 'Understand your portfolio\'s exposure to market factors.',
    data_export: 'Export your data for use in external tools and spreadsheets.'
  };
  return descriptions[feature] || 'Get access to powerful premium features.';
}

function getFeatureBenefit(feature) {
  const benefits = {
    backtesting: 'Validate strategies before investing real money',
    monte_carlo: 'Make better decisions with probability-based insights',
    stress_testing: 'Build more resilient portfolios',
    paper_trading_bots: 'Test automation without risking capital',
    ml_optimization: 'Improve returns with data-driven optimization',
    advanced_screener: 'Find hidden gems that match your criteria',
    ai_research_agents: 'Save hours on company research',
    filing_analyzer: 'Never miss important filing details',
    realtime_13f: 'Follow smart money in real-time',
    factor_analysis: 'Understand what\'s driving your returns',
    data_export: 'Integrate with your existing workflow'
  };
  return benefits[feature] || null;
}
