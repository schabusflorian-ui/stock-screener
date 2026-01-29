// frontend/src/components/icons/icons/Lock.jsx
import React from 'react';
import Icon from '../Icon';

const Lock = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="11" width="18" height="11" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <circle cx="12" cy="16" r="1.5" fill="currentColor" />
  </Icon>
));

Lock.displayName = 'Lock';

export default Lock;
