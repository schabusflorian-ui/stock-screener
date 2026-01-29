// frontend/src/components/icons/icons/Sliders.jsx
import React from 'react';
import Icon from '../Icon';

const Sliders = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="5" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="15" y="15" width="6" height="4" rx="1" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="4" y1="21" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="4" y1="10" x2="4" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="21" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="8" x2="12" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="21" x2="20" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="12" x2="20" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="1" y1="14" x2="7" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="9" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="17" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Sliders.displayName = 'Sliders';

export default Sliders;
