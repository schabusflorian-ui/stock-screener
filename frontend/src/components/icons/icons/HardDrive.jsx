// frontend/src/components/icons/icons/HardDrive.jsx
import React from 'react';
import Icon from '../Icon';

const HardDrive = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="2" y="12" width="20" height="8" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="22" y1="12" x2="2" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="6" cy="16" r="1" fill="currentColor" />
    <circle cx="10" cy="16" r="1" fill="currentColor" />
  </Icon>
));

HardDrive.displayName = 'HardDrive';

export default HardDrive;
