// frontend/src/components/icons/icons/Banknote.jsx
import React from 'react';
import Icon from '../Icon';

const Banknote = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="2" y="6" width="20" height="12" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M6 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M18 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Icon>
));

Banknote.displayName = 'Banknote';

export default Banknote;
