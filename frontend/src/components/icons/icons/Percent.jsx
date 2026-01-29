// frontend/src/components/icons/icons/Percent.jsx
import React from 'react';
import Icon from '../Icon';

const Percent = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layers */}
    <circle
      cx="6.5"
      cy="6.5"
      r="2.5"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <circle
      cx="17.5"
      cy="17.5"
      r="2.5"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <line
      x1="19"
      y1="5"
      x2="5"
      y2="19"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle
      cx="6.5"
      cy="6.5"
      r="2.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="17.5"
      cy="17.5"
      r="2.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Percent.displayName = 'Percent';
export default Percent;
