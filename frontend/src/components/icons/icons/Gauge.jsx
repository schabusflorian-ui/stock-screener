// frontend/src/components/icons/icons/Gauge.jsx
import React from 'react';
import Icon from '../Icon';

const Gauge = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 12m-9 0a9 9 0 1 0 18 0" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M4.5 16.5L6 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19.5 16.5L18 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.6 5.6l1.4 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M17 7l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Gauge.displayName = 'Gauge';

export default Gauge;
