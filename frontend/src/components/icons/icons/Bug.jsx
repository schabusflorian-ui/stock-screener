// frontend/src/components/icons/icons/Bug.jsx
import React from 'react';
import Icon from '../Icon';

const Bug = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="8" y="6" width="8" height="14" rx="4" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="8" y="6" width="8" height="14" rx="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M9 2L12 5L15 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M3 8H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 8H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 12H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 12H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 16H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 16H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="9" x2="12" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Bug.displayName = 'Bug';

export default Bug;
