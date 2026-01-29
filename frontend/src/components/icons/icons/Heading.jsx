// frontend/src/components/icons/icons/Heading.jsx
import React from 'react';
import Icon from '../Icon';

const Heading = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <path d="M6 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M6 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M18 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Heading.displayName = 'Heading';

export default Heading;
