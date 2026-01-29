// frontend/src/components/icons/icons/ArrowUpDown.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowUpDown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="9" y="6" width="6" height="12" rx="1" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <path d="M7 15l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M7 9l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

ArrowUpDown.displayName = 'ArrowUpDown';

export default ArrowUpDown;
