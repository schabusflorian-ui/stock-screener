// frontend/src/components/icons/IconButton.jsx
// Prism Design System - Interactive Icon Button Component
// Implements hover states from prism-icons-pastel-hover.jsx

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { iconColors, getIconColors } from './iconColors';
import './IconButton.css';

/**
 * IconButton - Interactive icon button with hover state transitions
 *
 * Default state: Solid color background, white icon
 * Hover state: Pastel background, dark icon, border appears
 *
 * @example
 * // Basic usage
 * <IconButton icon={Brain} label="AI" colorScheme="ai" />
 *
 * // Custom colors
 * <IconButton icon={Star} color="#D4AF37" pastel="#FEF3C7" darkColor="#B45309" />
 *
 * // Circle variant
 * <IconButton icon={Bell} colorScheme="alerts" variant="circle" />
 */
const IconButton = ({
  icon: Icon,
  label,
  // Color options - use colorScheme OR individual color props
  colorScheme,
  color,
  pastel,
  darkColor,
  // Size and variant
  size = 'medium',
  variant = 'square',
  // Interaction
  onClick,
  disabled = false,
  // Additional styling
  className = '',
  style = {},
  // Show label below icon
  showLabel = false
}) => {
  const [isHovered, setHovered] = useState(false);

  // Size configurations
  const sizes = {
    small: { box: 48, icon: 24, radius: 12, labelSize: 11 },
    medium: { box: 64, icon: 28, radius: 16, labelSize: 12 },
    large: { box: 72, icon: 32, radius: 18, labelSize: 13 }
  };

  // Get colors from scheme or use provided colors
  const colors = colorScheme
    ? iconColors[colorScheme] || iconColors.default
    : {
        color: color || iconColors.default.color,
        pastel: pastel || iconColors.default.pastel,
        dark: darkColor || iconColors.default.dark
      };

  const sizeConfig = sizes[size] || sizes.medium;
  const isActive = isHovered && !disabled;

  const buttonStyle = {
    width: sizeConfig.box,
    height: sizeConfig.box,
    borderRadius: variant === 'circle' ? '50%' : sizeConfig.radius,
    background: isActive ? colors.pastel : colors.color,
    border: isActive ? `2px solid ${colors.color}` : '2px solid transparent',
    color: isActive ? colors.dark : '#FFFFFF',
    boxShadow: isActive
      ? `0 12px 32px ${colors.color}35`
      : `0 8px 24px ${colors.color}40`,
    transform: isActive ? 'translateY(-4px)' : 'translateY(0)',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style
  };

  const labelStyle = {
    color: isActive ? colors.dark : '#64748B',
    fontSize: sizeConfig.labelSize,
    fontWeight: 500,
    marginTop: 8
  };

  return (
    <div
      className={`prism-icon-button-wrapper ${className}`}
      style={{ textAlign: 'center' }}
    >
      <button
        type="button"
        className="prism-icon-button"
        style={buttonStyle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
      >
        <Icon size={sizeConfig.icon} />
      </button>
      {showLabel && label && (
        <span className="prism-icon-button-label" style={labelStyle}>
          {label}
        </span>
      )}
    </div>
  );
};

IconButton.propTypes = {
  /** The icon component to render */
  icon: PropTypes.elementType.isRequired,
  /** Accessible label for the button */
  label: PropTypes.string,
  /** Predefined color scheme from iconColors */
  colorScheme: PropTypes.oneOf([
    'analytics', 'risk', 'ai', 'growth', 'decline',
    'watchlist', 'alerts', 'portfolio', 'brand', 'navigation', 'default'
  ]),
  /** Custom solid color (default state) */
  color: PropTypes.string,
  /** Custom pastel color (hover state background) */
  pastel: PropTypes.string,
  /** Custom dark color (hover state icon/text) */
  darkColor: PropTypes.string,
  /** Button size */
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  /** Button shape variant */
  variant: PropTypes.oneOf(['square', 'circle']),
  /** Click handler */
  onClick: PropTypes.func,
  /** Disabled state */
  disabled: PropTypes.bool,
  /** Additional CSS class */
  className: PropTypes.string,
  /** Additional inline styles */
  style: PropTypes.object,
  /** Show label below icon */
  showLabel: PropTypes.bool
};

/**
 * IconButtonGroup - Horizontal group of icon buttons
 */
export const IconButtonGroup = ({ children, gap = 24, className = '' }) => (
  <div
    className={`prism-icon-button-group ${className}`}
    style={{
      display: 'flex',
      gap,
      justifyContent: 'center',
      flexWrap: 'wrap'
    }}
  >
    {children}
  </div>
);

IconButtonGroup.propTypes = {
  children: PropTypes.node.isRequired,
  gap: PropTypes.number,
  className: PropTypes.string
};

export default IconButton;
