/**
 * Subscription Components
 *
 * Components for managing premium features and subscription UX.
 */

// Main gating component
export { default as FeatureGate, useFeatureGate } from './FeatureGate';

// Overlay for blurred preview content
export { default as LockedOverlay } from './LockedOverlay';

// Compact locked indicator for inline premium data
export { default as LockedIndicator } from './LockedIndicator';

// Inline upgrade cards
export { default as UpgradePrompt } from './UpgradePrompt';

// Global upgrade modal (add to App.js)
export { default as UpgradeModal } from './UpgradeModal';

// Tier badge and indicators
export { default as TierBadge, TierIndicator, UpgradeBadge } from './TierBadge';

// Usage tracking displays
export { default as UsageIndicator, UsageBar, UsageCounter } from './UsageIndicator';
