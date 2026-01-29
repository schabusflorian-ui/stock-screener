// frontend/src/components/icons/icons/Cpu.jsx
import React from 'react';
import Icon from '../Icon';

const Cpu = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="9" y1="1" x2="9" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="15" y1="1" x2="15" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="9" y1="20" x2="9" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="15" y1="20" x2="15" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="9" x2="23" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="14" x2="23" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="1" y1="9" x2="4" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="1" y1="14" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Cpu.displayName = 'Cpu';

export default Cpu;
