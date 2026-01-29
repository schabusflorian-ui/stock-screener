// frontend/src/components/icons/icons/Mail.jsx
import React from 'react';
import Icon from '../Icon';

const Mail = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <polyline points="22 6 12 13 2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

Mail.displayName = 'Mail';

export default Mail;
