// frontend/src/components/icons/icons/ArrowDown.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowDown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon points="12 19 6 13 18 13" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <polyline points="19 12 12 19 5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

ArrowDown.displayName = 'ArrowDown';

export default ArrowDown;
