// frontend/src/components/icons/icons/ArrowUp.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowUp = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 19V5" fill="none" />
    <polygon points="12 5 6 11 18 11" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="12" y1="19" x2="12" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <polyline points="5 12 12 5 19 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

ArrowUp.displayName = 'ArrowUp';

export default ArrowUp;
