// frontend/src/components/icons/icons/ArrowLeft.jsx
import React from 'react';
import Icon from '../Icon';

const ArrowLeft = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 5L5 12L12 19" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path
      d="M19 12H5M5 12L12 19M5 12L12 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ArrowLeft.displayName = 'ArrowLeft';

export default ArrowLeft;
