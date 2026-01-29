// frontend/src/components/icons/icons/Monitor.jsx
import React from 'react';
import Icon from '../Icon';

const Monitor = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="2" y="3" width="20" height="14" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Monitor.displayName = 'Monitor';

export default Monitor;
