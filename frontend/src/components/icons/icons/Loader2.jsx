// frontend/src/components/icons/icons/Loader2.jsx
import React from 'react';
import Icon from '../Icon';

const Loader2 = React.forwardRef(({ className = '', ...props }, ref) => (
  <Icon ref={ref} className={`prism-icon--spin ${className}`} {...props}>
    {/* Stroke only - spinner */}
    <path
      d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
  </Icon>
));

Loader2.displayName = 'Loader2';
export default Loader2;
