// frontend/src/components/icons/icons/XCircle.jsx
import React from 'react';
import Icon from '../Icon';

const XCircle = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="12"
      cy="12"
      r="10"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="15"
      y1="9"
      x2="9"
      y2="15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="9"
      y1="9"
      x2="15"
      y2="15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

XCircle.displayName = 'XCircle';
export default XCircle;
