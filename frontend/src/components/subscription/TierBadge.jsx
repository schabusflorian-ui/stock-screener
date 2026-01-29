/**
 * TierBadge Component
 *
 * Small badge showing user's current subscription tier.
 * Can be used in header, profile, or anywhere tier needs display.
 */

import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { Icon } from '../icons';
import './TierBadge.css';

export default function TierBadge({
  tier: tierProp,
  size = 'default',
  showIcon = true,
  showLabel = true,
  onClick,
  className = ''
}) {
  const { tier: contextTier, getTierInfo, isGrandfatheredActive, grandfatheredDaysRemaining } = useSubscription();

  const tier = tierProp || contextTier;
  const tierInfo = getTierInfo(tier);

  const sizeClass = `tier-badge--${size}`;
  const clickableClass = onClick ? 'tier-badge--clickable' : '';

  return (
    <div
      className={`tier-badge ${sizeClass} ${clickableClass} ${className}`}
      style={{ '--tier-color': tierInfo.color }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {showIcon && tierInfo.icon && (
        <Icon
          name={tierInfo.icon}
          size={size === 'small' ? 12 : size === 'large' ? 18 : 14}
        />
      )}

      {showLabel && (
        <span className="tier-badge__label">{tierInfo.name}</span>
      )}

      {isGrandfatheredActive && grandfatheredDaysRemaining > 0 && grandfatheredDaysRemaining <= 30 && (
        <span className="tier-badge__grandfathered" title={`${grandfatheredDaysRemaining} days left of full access`}>
          {grandfatheredDaysRemaining}d
        </span>
      )}
    </div>
  );
}

/**
 * TierIndicator - Simple tier indicator dot
 */
export function TierIndicator({ tier: tierProp, className = '' }) {
  const { tier: contextTier, getTierInfo } = useSubscription();
  const tier = tierProp || contextTier;
  const tierInfo = getTierInfo(tier);

  return (
    <span
      className={`tier-indicator ${className}`}
      style={{ backgroundColor: tierInfo.color }}
      title={`${tierInfo.name} tier`}
    />
  );
}

/**
 * UpgradeBadge - Badge that prompts upgrade
 */
export function UpgradeBadge({
  targetTier = 'pro',
  label,
  onClick,
  className = ''
}) {
  const { getTierInfo, promptUpgrade } = useSubscription();
  const tierInfo = getTierInfo(targetTier);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      promptUpgrade({ requiredTier: targetTier, source: 'upgrade_badge' });
    }
  };

  return (
    <button
      className={`upgrade-badge ${className}`}
      style={{ '--tier-color': tierInfo.color }}
      onClick={handleClick}
    >
      <Icon name="zap" size={12} />
      <span>{label || `Upgrade to ${tierInfo.name}`}</span>
    </button>
  );
}
