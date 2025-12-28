// frontend/src/components/ui/Badge.js
import React from 'react';
import PropTypes from 'prop-types';
import './Badge.css';

/**
 * Badge Component
 *
 * Small status indicators for labels and tags.
 *
 * Variants:
 * - gray: Neutral/default
 * - blue: Information
 * - green: Success/positive
 * - red: Error/negative
 * - yellow: Warning
 * - purple: Special/brand
 */
function Badge({
  variant = 'gray',
  size = 'md',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'ui-badge',
    `ui-badge--${variant}`,
    `ui-badge--${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
}

Badge.propTypes = {
  variant: PropTypes.oneOf(['gray', 'blue', 'green', 'red', 'yellow', 'purple']),
  size: PropTypes.oneOf(['sm', 'md']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

export default Badge;
