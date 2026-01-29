// frontend/src/components/icons/icons/ChevronDown.jsx
import React from 'react';
import Icon from '../Icon';

const ChevronDown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - chevrons don't use fill */}
    <polyline
      points="6 9 12 15 18 9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

ChevronDown.displayName = 'ChevronDown';
export default ChevronDown;
