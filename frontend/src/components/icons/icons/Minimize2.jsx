// frontend/src/components/icons/icons/Minimize2.jsx
import React from 'react';
import Icon from '../Icon';

const Minimize2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - minimize arrows (opposite of Maximize2) */}
    <polyline
      points="4 14 10 14 10 20"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="20 10 14 10 14 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <line
      x1="14"
      y1="10"
      x2="21"
      y2="3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="21"
      x2="10"
      y2="14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Minimize2.displayName = 'Minimize2';
export default Minimize2;
