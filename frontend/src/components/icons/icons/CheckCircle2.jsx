// frontend/src/components/icons/icons/CheckCircle2.jsx
// Same as CheckCircle but with different styling
import React from 'react';
import Icon from '../Icon';

const CheckCircle2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

CheckCircle2.displayName = 'CheckCircle2';

export default CheckCircle2;
