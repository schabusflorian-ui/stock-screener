// frontend/src/components/icons/icons/Minus.jsx
import React from 'react';
import Icon from '../Icon';

const Minus = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - minus line */}
    <line
      x1="5"
      y1="12"
      x2="19"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Minus.displayName = 'Minus';
export default Minus;
