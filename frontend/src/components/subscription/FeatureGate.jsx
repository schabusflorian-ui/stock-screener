/**
 * FeatureGate Component
 *
 * Wraps content that requires a specific subscription tier.
 * Shows different UI based on access:
 * - Has access: renders children normally
 * - No access + showPreview: shows blurred preview with upgrade overlay
 * - No access + no preview: shows upgrade prompt card
 */

import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import LockedOverlay from './LockedOverlay';
import UpgradePrompt from './UpgradePrompt';
import './FeatureGate.css';

export default function FeatureGate({
  feature,              // Feature name to check (e.g., 'backtesting')
  requiredTier,         // Alternative: specify tier directly ('pro' or 'ultra')
  children,             // Content to show when user has access
  fallback,             // Custom fallback content
  showPreview = false,  // Show blurred preview of content
  previewHeight,        // Max height for preview (e.g., '200px', '50%')
  title,                // Feature title for upgrade prompt
  description,          // Feature description for upgrade prompt
  benefit,              // Key benefit for upgrade prompt
  compact = false,      // Use compact upgrade prompt
  className = ''
}) {
  const { hasFeature, hasTierAccess, tier, featureRequiredTier, isGrandfatheredActive } = useSubscription();

  // Determine required tier
  const effectiveRequiredTier = requiredTier || featureRequiredTier[feature] || 'pro';

  // Check access
  const hasAccess = feature
    ? hasFeature(feature) || isGrandfatheredActive
    : hasTierAccess(effectiveRequiredTier) || isGrandfatheredActive;

  // User has access - render children
  if (hasAccess) {
    return <>{children}</>;
  }

  // Custom fallback provided
  if (fallback) {
    return fallback;
  }

  // Show blurred preview with overlay
  if (showPreview && children) {
    return (
      <div className={`feature-gate feature-gate--preview ${className}`}>
        <div
          className="feature-gate__preview-content"
          style={previewHeight ? { maxHeight: previewHeight } : undefined}
        >
          {children}
        </div>
        <LockedOverlay
          feature={feature}
          requiredTier={effectiveRequiredTier}
          title={title}
          description={description}
        />
      </div>
    );
  }

  // Show upgrade prompt card
  return (
    <div className={`feature-gate feature-gate--locked ${className}`}>
      <UpgradePrompt
        feature={feature}
        requiredTier={effectiveRequiredTier}
        title={title}
        description={description}
        benefit={benefit}
        compact={compact}
      />
    </div>
  );
}

/**
 * Hook version for conditional logic
 */
export function useFeatureGate(feature) {
  const { hasFeature, tier, featureRequiredTier, promptUpgrade, isGrandfatheredActive } = useSubscription();
  const requiredTier = featureRequiredTier[feature];
  const hasAccess = hasFeature(feature) || isGrandfatheredActive;

  return {
    hasAccess,
    currentTier: tier,
    requiredTier,
    needsUpgrade: !hasAccess && requiredTier,
    checkAndPrompt: () => {
      if (!hasAccess) {
        promptUpgrade({
          feature,
          requiredTier,
          reason: `This feature requires a ${requiredTier} subscription`
        });
        return false;
      }
      return true;
    }
  };
}
