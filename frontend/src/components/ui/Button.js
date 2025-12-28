// frontend/src/components/ui/Button.js
import React from 'react';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';
import './Button.css';

/**
 * Button Component
 *
 * Consistent button styling following the design system.
 *
 * Variants:
 * - primary: Brand gradient background, white text
 * - secondary: Glass background with border
 * - ghost: Transparent, text only
 * - danger: Red for destructive actions
 *
 * Sizes:
 * - sm: Compact buttons
 * - md: Standard buttons (default)
 * - lg: Large buttons
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
  variant: PropTypes.oneOf(['primary', 'secondary', 'ghost', 'danger']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  icon: PropTypes.elementType,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string,
  children: PropTypes.node
};

export default Button;
