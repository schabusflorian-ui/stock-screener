// frontend/src/components/icons/icons/Landmark.jsx
import React from 'react';
import Icon from '../Icon';

const Landmark = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - roof */}
    <path
      d="M3 22H21"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <path
      d="M12 2L22 8.5H2L12 2Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <line x1="3" y1="22" x2="21" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="6" y1="18" x2="6" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="18" x2="10" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="18" x2="14" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="18" y1="18" x2="18" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <polygon
      points="12 2 22 8.5 2 8.5 12 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Landmark.displayName = 'Landmark';
export default Landmark;
