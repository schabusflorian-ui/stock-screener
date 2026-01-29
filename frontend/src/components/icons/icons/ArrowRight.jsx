// frontend/src/components/icons/icons/ArrowRight.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - arrow */}
    <line
      x1="5"
      y1="12"
      x2="19"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <polyline
      points="12 5 19 12 12 19"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ArrowRight.displayName = 'ArrowRight';
export default ArrowRight;
