// frontend/src/components/icons/icons/Code.jsx
import React from 'react';
import Icon from '../Icon';

const Code = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="4" y="6" width="16" height="12" rx="2" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <polyline points="16 18 22 12 16 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="8 6 2 12 8 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

Code.displayName = 'Code';

export default Code;
