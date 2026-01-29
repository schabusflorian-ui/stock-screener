// frontend/src/components/icons/icons/ArrowLeftRight.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowLeftRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - subtle background */}
    <rect x="4" y="8" width="16" height="8" rx="2" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <path d="M8 3L4 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M4 7h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 21l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M20 17H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

ArrowLeftRight.displayName = 'ArrowLeftRight';

export default ArrowLeftRight;
