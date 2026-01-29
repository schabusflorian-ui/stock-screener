// frontend/src/components/ui/Badge.js
import React from 'react';
import PropTypes from 'prop-types';
import './Badge.css';

/**
 * Badge Component - Prism Design System
 *
 * Small status indicators for labels and tags.
 *
 * Variants:
 * - neutral: Gray/default (bg: #F1F5F9, color: #64748B)
 * - success: Green/positive (bg: #D1FAE5, color: #059669)
 * - warning: Yellow/caution (bg: #FEF3C7, color: #D97706)
 * - danger: Red/error (bg: #FEE2E2, color: #DC2626)
 * - info: Blue/informational (bg: #DBEAFE, color: #2563EB)
 * - gold: Premium/accent
 * - navy: Primary brand
 */
function Badge({
  variant = 'neutral',
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
  variant: PropTypes.oneOf(['neutral', 'success', 'warning', 'danger', 'info', 'gold', 'navy']),
  size: PropTypes.oneOf(['sm', 'md']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

export default Badge;
