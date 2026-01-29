// frontend/src/components/subscription/LockedIndicator.jsx
// Simple inline locked indicator for premium features embedded in other pages

import React from 'react';
import { PrismSparkle, Lock, Crown, Zap } from '../icons';
import { useSubscription } from '../../context/SubscriptionContext';
import './LockedIndicator.css';

/**
 * LockedIndicator - A compact locked state for premium data
 *
 * Variants:
 * - 'badge': Small badge with lock icon (default)
 * - 'card': Card-sized locked state with blur effect
 * - 'inline': Minimal inline text with lock
 *
 * @param {string} feature - Feature name for tier lookup
 * @param {string} variant - Display variant
 * @param {string} message - Optional custom message
 * @param {function} onClick - Optional click handler (defaults to upgrade prompt)
 */
export function LockedIndicator({
  feature,
  variant = 'badge',
  message,
  onClick,
  className = ''
}) {
  const { promptUpgrade, featureRequiredTier } = useSubscription();
  const requiredTier = featureRequiredTier[feature] || 'pro';

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    } else {
      promptUpgrade({
        feature,
        reason: message || `This feature requires a ${requiredTier} subscription`
      });
    }
  };

  const TierIcon = requiredTier === 'ultra' ? Zap : Crown;

  if (variant === 'card') {
    return (
      <div className={`locked-indicator locked-indicator--card locked-indicator--${requiredTier} ${className}`} onClick={handleClick}>
        <div className="locked-indicator__blur" />
        <div className="locked-indicator__content">
          <div className={`locked-indicator__icon locked-indicator__icon--${requiredTier}`}>
            <PrismSparkle size={22} />
          </div>
          <span className={`locked-indicator__tier locked-indicator__tier--${requiredTier}`}>
            <TierIcon size={10} />
            {requiredTier.toUpperCase()}
          </span>
          <span className="locked-indicator__text">{message || 'Upgrade to unlock'}</span>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className={`locked-indicator locked-indicator--inline locked-indicator--${requiredTier} ${className}`} onClick={handleClick}>
        <PrismSparkle size={12} />
        <span>{requiredTier}</span>
      </span>
    );
  }

  // Default: badge variant
  return (
    <button
      className={`locked-indicator locked-indicator--badge locked-indicator--${requiredTier} ${className}`}
      onClick={handleClick}
      title={`Requires ${requiredTier} subscription`}
    >
      <PrismSparkle size={14} />
    </button>
  );
}

export default LockedIndicator;
