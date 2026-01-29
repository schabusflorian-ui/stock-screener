// frontend/src/components/icons/icons/Building2.jsx
import React from 'react';
import Icon from '../Icon';

const Building2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M6 22V3C6 2.44772 6.44772 2 7 2H17C17.5523 2 18 2.44772 18 3V22"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M6 22V3C6 2.44772 6.44772 2 7 2H17C17.5523 2 18 2.44772 18 3V22"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 22H22"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* Windows */}
    <path d="M10 6H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 10H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 14H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    {/* Door */}
    <path
      d="M10 22V18H14V22"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Building2.displayName = 'Building2';
export default Building2;
