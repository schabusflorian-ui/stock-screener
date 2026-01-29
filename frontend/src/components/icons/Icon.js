// frontend/src/components/icons/Icon.js
import React from 'react';
import PropTypes from 'prop-types';
import './Icon.css';

/**
 * Base Icon Component
 *
 * Wrapper component that provides consistent sizing and styling
 * for all Prism icons following the design system.
 *
 * Design System Specs:
 * - Style: Duotone (stroke + semi-transparent fill)
 * - Stroke Width: 1.5px
 * - Fill Opacity: 0.3 (0.35 for emphasis)
 * - ViewBox: 24x24
 */
const Icon = React.forwardRef(({
  children,
  size = 24,
  color,
  className = '',
  style = {},
  ...props
}, ref) => {
  // Only set color in style if explicitly provided, otherwise inherit from CSS
  const iconStyle = color ? { color, ...style } : style;

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`prism-icon ${className}`}
      style={iconStyle}
      {...props}
    >
      {children}
    </svg>
  );
});

Icon.displayName = 'Icon';

Icon.propTypes = {
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  color: PropTypes.string,
  className: PropTypes.string,
  style: PropTypes.object
};

export default Icon;
