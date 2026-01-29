// frontend/src/components/ui/SignalBadge.js
// Shared component for displaying trading signals with consistent styling
// Consolidates duplicated SIGNAL_CONFIG patterns from multiple components

import React from 'react';
import PropTypes from 'prop-types';
import { TrendingUp, TrendingDown, Minus } from '../icons';
import './SignalBadge.css';

// Centralized signal configuration - using bullish/bearish terminology for regulatory compliance
export const SIGNAL_CONFIG = {
  strong_buy:     { color: '#10B981', bg: '#10B98120', label: 'Strong Bullish', icon: TrendingUp, variant: 'strong-bullish' },
  strong_bullish: { color: '#10B981', bg: '#10B98120', label: 'Strong Bullish', icon: TrendingUp, variant: 'strong-bullish' },
  buy:            { color: '#34D399', bg: '#34D39920', label: 'Bullish', icon: TrendingUp, variant: 'bullish' },
  bullish:        { color: '#34D399', bg: '#34D39920', label: 'Bullish', icon: TrendingUp, variant: 'bullish' },
  lean_buy:       { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Bullish', icon: TrendingUp, variant: 'lean-bullish' },
  lean_bullish:   { color: '#6EE7B7', bg: '#6EE7B720', label: 'Lean Bullish', icon: TrendingUp, variant: 'lean-bullish' },
  hold:           { color: '#94A3B8', bg: '#94A3B820', label: 'Neutral', icon: Minus, variant: 'neutral' },
  neutral:        { color: '#94A3B8', bg: '#94A3B820', label: 'Neutral', icon: Minus, variant: 'neutral' },
  lean_sell:      { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Bearish', icon: TrendingDown, variant: 'lean-bearish' },
  lean_bearish:   { color: '#FCA5A5', bg: '#FCA5A520', label: 'Lean Bearish', icon: TrendingDown, variant: 'lean-bearish' },
  sell:           { color: '#F87171', bg: '#F8717120', label: 'Bearish', icon: TrendingDown, variant: 'bearish' },
  bearish:        { color: '#F87171', bg: '#F8717120', label: 'Bearish', icon: TrendingDown, variant: 'bearish' },
  strong_sell:    { color: '#EF4444', bg: '#EF444420', label: 'Strong Bearish', icon: TrendingDown, variant: 'strong-bearish' },
  strong_bearish: { color: '#EF4444', bg: '#EF444420', label: 'Strong Bearish', icon: TrendingDown, variant: 'strong-bearish' },
};

// Default fallback config
const DEFAULT_CONFIG = { color: '#94A3B8', bg: '#94A3B820', label: 'Unknown', icon: Minus, variant: 'neutral' };

/**
 * Get signal configuration by signal type
 * @param {string} signal - Signal type (e.g., 'bullish', 'strong_buy', etc.)
 * @returns {object} Signal configuration with color, bg, label, icon
 */
export function getSignalConfig(signal) {
  if (!signal) return DEFAULT_CONFIG;
  const key = signal.toLowerCase().replace(/-/g, '_');
  return SIGNAL_CONFIG[key] || DEFAULT_CONFIG;
}

/**
 * Get signal color by signal type
 * @param {string} signal - Signal type
 * @returns {string} Color hex code
 */
export function getSignalColor(signal) {
  return getSignalConfig(signal).color;
}

/**
 * Get signal label by signal type
 * @param {string} signal - Signal type
 * @returns {string} Human-readable label
 */
export function getSignalLabel(signal) {
  return getSignalConfig(signal).label;
}

/**
 * SignalBadge Component
 * Displays a trading signal with appropriate color and icon
 */
function SignalBadge({
  signal,
  size = 'md',
  showIcon = true,
  showLabel = true,
  className = '',
  style = {},
  ...props
}) {
  const config = getSignalConfig(signal);
  const IconComponent = config.icon;

  const classes = [
    'signal-badge',
    `signal-badge--${config.variant}`,
    `signal-badge--${size}`,
    className
  ].filter(Boolean).join(' ');

  const badgeStyle = {
    backgroundColor: config.bg,
    color: config.color,
    ...style
  };

  return (
    <span className={classes} style={badgeStyle} {...props}>
      {showIcon && IconComponent && (
        <IconComponent size={size === 'sm' ? 12 : 14} />
      )}
      {showLabel && <span className="signal-badge__label">{config.label}</span>}
    </span>
  );
}

SignalBadge.propTypes = {
  signal: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  showIcon: PropTypes.bool,
  showLabel: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object
};

export default SignalBadge;