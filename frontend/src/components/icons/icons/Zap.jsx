// frontend/src/components/icons/icons/Zap.jsx
import React from 'react';
import Icon from '../Icon';

const Zap = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon
      points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polygon
      points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Zap.displayName = 'Zap';
export default Zap;
