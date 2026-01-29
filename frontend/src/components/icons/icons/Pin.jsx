// frontend/src/components/icons/icons/Pin.jsx
import React from 'react';
import Icon from '../Icon';

const Pin = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 17v5" fill="none" />
    <path d="M9 11l-6 6" fill="none" />
    <path d="M15 5l6-6" fill="none" />
    <path d="M5 15l5-5 4-1 1-4 5-5-10 10" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5 17L3 15l4-4 1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M9.5 14.5L15 9l1-4 4-4-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="9" y1="15" x2="4.5" y2="19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14.5" y1="9.5" x2="19.5" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Pin.displayName = 'Pin';

export default Pin;
