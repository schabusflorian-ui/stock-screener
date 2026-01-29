// frontend/src/components/icons/icons/ArrowUpRight.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowUpRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - arrow */}
    <line
      x1="7"
      y1="17"
      x2="17"
      y2="7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <polyline
      points="7 7 17 7 17 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ArrowUpRight.displayName = 'ArrowUpRight';
export default ArrowUpRight;
