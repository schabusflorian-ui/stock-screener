// frontend/src/components/ui/Grid.js
import React from 'react';
import PropTypes from 'prop-types';
import './Grid.css';

/**
 * Grid Component
 *
 * Responsive grid layout with standard column configurations.
 * Automatically adjusts columns based on screen size.
 *
 * Columns:
 * - 1: Single column
 * - 2: 2 columns on md+, 1 on mobile
 * - 3: 3 columns on lg+, 2 on md, 1 on mobile
 * - 4: 4 columns on lg+, 2 on md, 1 on mobile
 * - 5: 5 columns on lg+, 3 on md, 2 on mobile
 * - 6: 6 columns on lg+, 3 on md, 2 on mobile
 *
 * Gap:
 * - sm: 12px (var(--space-3))
 * - md: 16px (var(--space-4))
 * - lg: 24px (var(--space-6))
 */
function Grid({
  cols = 3,
  gap = 'md',
  className = '',
  children,
  ...props
}) {
  const classes = [
    'ui-grid',
    `ui-grid--cols-${cols}`,
    `ui-grid--gap-${gap}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

Grid.propTypes = {
  cols: PropTypes.oneOf([1, 2, 3, 4, 5, 6]),
  gap: PropTypes.oneOf(['sm', 'md', 'lg']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

export default Grid;
