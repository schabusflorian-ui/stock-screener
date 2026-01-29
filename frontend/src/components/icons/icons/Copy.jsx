// frontend/src/components/icons/icons/Copy.jsx
import React from 'react';
import Icon from '../Icon';

const Copy = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="9" y="9" width="11" height="11" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

Copy.displayName = 'Copy';

export default Copy;
