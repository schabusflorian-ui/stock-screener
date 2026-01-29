// frontend/src/components/icons/icons/X.jsx
import React from 'react';
import Icon from '../Icon';

const X = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - X shape */}
    <line
      x1="18"
      y1="6"
      x2="6"
      y2="18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="6"
      y1="6"
      x2="18"
      y2="18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

X.displayName = 'X';
export default X;
