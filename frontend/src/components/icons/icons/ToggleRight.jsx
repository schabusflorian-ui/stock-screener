// frontend/src/components/icons/icons/ToggleRight.jsx
import React from 'react';
import Icon from '../Icon';

const ToggleRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="1" y="5" width="22" height="14" rx="7" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="1" y="5" width="22" height="14" rx="7" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="17" cy="12" r="4" fill="currentColor" />
  </Icon>
));

ToggleRight.displayName = 'ToggleRight';

export default ToggleRight;
