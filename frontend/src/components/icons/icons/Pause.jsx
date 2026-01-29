// frontend/src/components/icons/icons/Pause.jsx
import React from 'react';
import Icon from '../Icon';

const Pause = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" fillOpacity="0.3" />
    <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="6" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="14" y="4" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

Pause.displayName = 'Pause';

export default Pause;
