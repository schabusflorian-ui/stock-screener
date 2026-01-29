// frontend/src/components/icons/icons/TrendingUp.jsx
import React from 'react';
import Icon from '../Icon';

const TrendingUp = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - area under line */}
    <path
      d="M23 6L13.5 15.5L8.5 10.5L1 18V20H23V6Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polyline
      points="23 6 13.5 15.5 8.5 10.5 1 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="17 6 23 6 23 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

TrendingUp.displayName = 'TrendingUp';
export default TrendingUp;
