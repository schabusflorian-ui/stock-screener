// frontend/src/components/icons/icons/LayoutDashboard.jsx
import React from 'react';
import Icon from '../Icon';

const LayoutDashboard = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="3" width="7" height="9" rx="2" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="3" width="7" height="5" rx="2" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="12" width="7" height="9" rx="2" fill="currentColor" fillOpacity="0.3" />
    <rect x="3" y="16" width="7" height="5" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="3" y="3" width="7" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="3" width="7" height="5" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="12" width="7" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="3" y="16" width="7" height="5" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

LayoutDashboard.displayName = 'LayoutDashboard';

export default LayoutDashboard;
