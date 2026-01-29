// frontend/src/components/icons/icons/CheckCheck.jsx
import React from 'react';
import Icon from '../Icon';

const CheckCheck = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="6" width="18" height="12" rx="2" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer - double checkmark */}
    <path d="M18 6l-9 9-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M22 10l-9 9-1-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

CheckCheck.displayName = 'CheckCheck';

export default CheckCheck;
