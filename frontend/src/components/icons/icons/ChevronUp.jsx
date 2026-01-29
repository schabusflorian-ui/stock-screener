// frontend/src/components/icons/icons/ChevronUp.jsx
import React from 'react';
import Icon from '../Icon';

const ChevronUp = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - chevrons don't use fill */}
    <polyline
      points="18 15 12 9 6 15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ChevronUp.displayName = 'ChevronUp';
export default ChevronUp;
