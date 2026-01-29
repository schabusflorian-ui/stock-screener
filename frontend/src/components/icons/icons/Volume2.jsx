// frontend/src/components/icons/icons/Volume2.jsx
import React from 'react';
import Icon from '../Icon';

const Volume2 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M11 5L6 9H2v6h4l5 4V5z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19.07 4.93a10 10 0 010 14.14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Volume2.displayName = 'Volume2';

export default Volume2;
