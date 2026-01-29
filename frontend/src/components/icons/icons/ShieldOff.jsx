// frontend/src/components/icons/icons/ShieldOff.jsx
import React from 'react';
import Icon from '../Icon';

const ShieldOff = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <path d="M19.69 14a6.9 6.9 0 00.31-2V5l-8-3-3.16 1.18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M4.73 4.73L4 5v7c0 6 8 10 8 10a20.29 20.29 0 005.62-4.38" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

ShieldOff.displayName = 'ShieldOff';

export default ShieldOff;
