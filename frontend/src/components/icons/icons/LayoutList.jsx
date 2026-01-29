// frontend/src/components/icons/icons/LayoutList.jsx
import React from 'react';
import Icon from '../Icon';

const LayoutList = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="3" y="15" width="6" height="6" rx="1" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="3" y="15" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="13" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="17" x2="21" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="21" x2="18" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

LayoutList.displayName = 'LayoutList';

export default LayoutList;
