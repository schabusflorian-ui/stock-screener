// frontend/src/components/icons/icons/ToggleLeft.jsx
import React from 'react';
import Icon from '../Icon';

const ToggleLeft = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="1" y="5" width="22" height="14" rx="7" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <rect x="1" y="5" width="22" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="7" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

ToggleLeft.displayName = 'ToggleLeft';

export default ToggleLeft;
