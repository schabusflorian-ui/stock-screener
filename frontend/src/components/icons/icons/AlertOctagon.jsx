// frontend/src/components/icons/icons/AlertOctagon.jsx
import React from 'react';
import Icon from '../Icon';

const AlertOctagon = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon
      points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polygon
      points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="12"
      y1="8"
      x2="12"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle
      cx="12"
      cy="16"
      r="0.5"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
    />
  </Icon>
));

AlertOctagon.displayName = 'AlertOctagon';
export default AlertOctagon;
