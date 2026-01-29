// frontend/src/components/icons/icons/LineChart.jsx
import React from 'react';
import Icon from '../Icon';

const LineChart = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - chart area */}
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer - frame */}
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Chart line */}
    <polyline
      points="7 14 10 10 13 13 17 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

LineChart.displayName = 'LineChart';
export default LineChart;
