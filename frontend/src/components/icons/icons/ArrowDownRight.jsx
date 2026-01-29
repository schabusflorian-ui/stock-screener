// frontend/src/components/icons/icons/ArrowDownRight.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowDownRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - arrow */}
    <line
      x1="7"
      y1="7"
      x2="17"
      y2="17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <polyline
      points="17 7 17 17 7 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ArrowDownRight.displayName = 'ArrowDownRight';
export default ArrowDownRight;
