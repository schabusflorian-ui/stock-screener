// frontend/src/components/icons/icons/BarChart3.jsx
import React from 'react';
import Icon from '../Icon';

const BarChart3 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layers - horizontal bars */}
    <rect
      x="3"
      y="3"
      width="18"
      height="4"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <rect
      x="3"
      y="10"
      width="13"
      height="4"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <rect
      x="3"
      y="17"
      width="8"
      height="4"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layers */}
    <rect
      x="3"
      y="3"
      width="18"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="3"
      y="10"
      width="13"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="3"
      y="17"
      width="8"
      height="4"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

BarChart3.displayName = 'BarChart3';
export default BarChart3;
