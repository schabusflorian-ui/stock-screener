// frontend/src/components/icons/icons/LifeBuoy.jsx
import React from 'react';
import Icon from '../Icon';

const LifeBuoy = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - inner and outer circles */}
    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.15" />
    <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

LifeBuoy.displayName = 'LifeBuoy';

export default LifeBuoy;
