// frontend/src/components/icons/icons/Grid3X3.jsx
import React from 'react';
import Icon from '../Icon';

const Grid3X3 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer - outer rectangle and grid lines */}
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5" />
    <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="1.5" />
    <line x1="9" y1="3" x2="9" y2="21" stroke="currentColor" strokeWidth="1.5" />
    <line x1="15" y1="3" x2="15" y2="21" stroke="currentColor" strokeWidth="1.5" />
  </Icon>
));

Grid3X3.displayName = 'Grid3X3';

export default Grid3X3;
