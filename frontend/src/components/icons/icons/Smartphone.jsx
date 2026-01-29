// frontend/src/components/icons/icons/Smartphone.jsx
import React from 'react';
import Icon from '../Icon';

const Smartphone = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="5" y="2" width="14" height="20" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="12" y1="18" x2="12.01" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Icon>
));

Smartphone.displayName = 'Smartphone';

export default Smartphone;
