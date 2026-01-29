// frontend/src/components/icons/icons/BarChart2.jsx
import React from 'react';
import Icon from '../Icon';

const BarChart2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layers - bars */}
    <rect
      x="18"
      y="3"
      width="4"
      height="18"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <rect
      x="10"
      y="8"
      width="4"
      height="13"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <rect
      x="2"
      y="13"
      width="4"
      height="8"
      rx="1"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layers */}
    <rect
      x="18"
      y="3"
      width="4"
      height="18"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="10"
      y="8"
      width="4"
      height="13"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <rect
      x="2"
      y="13"
      width="4"
      height="8"
      rx="1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

BarChart2.displayName = 'BarChart2';
export default BarChart2;
