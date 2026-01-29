// frontend/src/components/icons/icons/LayoutGrid.jsx
import React from 'react';
import Icon from '../Icon';

const LayoutGrid = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

LayoutGrid.displayName = 'LayoutGrid';

export default LayoutGrid;
