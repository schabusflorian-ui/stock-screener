// frontend/src/components/icons/icons/ChevronLeft.jsx
import React from 'react';
import Icon from '../Icon';

const ChevronLeft = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - chevrons don't use fill */}
    <polyline
      points="15 18 9 12 15 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ChevronLeft.displayName = 'ChevronLeft';
export default ChevronLeft;
