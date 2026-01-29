// frontend/src/components/icons/icons/ChevronRight.jsx
import React from 'react';
import Icon from '../Icon';

const ChevronRight = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - chevrons don't use fill */}
    <polyline
      points="9 18 15 12 9 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ChevronRight.displayName = 'ChevronRight';
export default ChevronRight;
