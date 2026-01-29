// frontend/src/components/icons/icons/Maximize2.jsx
import React from 'react';
import Icon from '../Icon';

const Maximize2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - expand arrows */}
    <polyline
      points="15 3 21 3 21 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="9 21 3 21 3 15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <line
      x1="21"
      y1="3"
      x2="14"
      y2="10"
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

Maximize2.displayName = 'Maximize2';
export default Maximize2;
