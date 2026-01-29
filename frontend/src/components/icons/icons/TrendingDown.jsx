// frontend/src/components/icons/icons/TrendingDown.jsx
import React from 'react';
import Icon from '../Icon';

const TrendingDown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - area under line */}
    <path
      d="M23 18L13.5 8.5L8.5 13.5L1 6V4H23V18Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polyline
      points="23 18 13.5 8.5 8.5 13.5 1 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="17 18 23 18 23 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

TrendingDown.displayName = 'TrendingDown';
export default TrendingDown;
