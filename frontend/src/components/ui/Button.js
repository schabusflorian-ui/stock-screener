// frontend/src/components/ui/Button.js
import React from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from '../icons';
import './Button.css';

/**
 * Button Component - Prism Design System
 *
 * Consistent button styling following the Prism design system.
 *
 * Variants:
 * - primary: Navy background (#0F172A), white text
 * - secondary: White background with border
 * - gold: Premium gold gradient for CTAs
 * - ghost: Transparent, text only
 * - danger: Red for destructive actions
 *
 * Sizes:
 * - sm: Compact buttons (6px 12px, 12px font)
 * - md: Standard buttons (10px 20px, 14px font)
 * - lg: Large buttons (14px 28px, 16px font)
 */
function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  iconPosition = 'left',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    loading && 'ui-button--loading',
    disabled && 'ui-button--disabled',
    className
  ].filter(Boolean).join(' ');

  const isDisabled = disabled || loading;

  return (
    <button className={classes} disabled={isDisabled} {...props}>
      {loading && (
        <Loader2 className="ui-button__spinner" size={16} />
      )}
      {!loading && Icon && iconPosition === 'left' && (
        <Icon className="ui-button__icon" size={16} />
      )}
      {children && <span className="ui-button__text">{children}</span>}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon className="ui-button__icon" size={16} />
      )}
    </button>
  );
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'gold', 'ghost', 'danger']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  icon: PropTypes.elementType,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string,
  children: PropTypes.node
};

export default Button;
