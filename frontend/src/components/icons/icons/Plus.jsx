// frontend/src/components/icons/icons/Plus.jsx
import React from 'react';
import Icon from '../Icon';

const Plus = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - plus shape */}
    <line
      x1="12"
      y1="5"
      x2="12"
      y2="19"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
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

Plus.displayName = 'Plus';
export default Plus;
