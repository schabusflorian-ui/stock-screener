// frontend/src/components/icons/icons/Check.jsx
import React from 'react';
import Icon from '../Icon';

const Check = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - checkmark */}
    <polyline
      points="20 6 9 17 4 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

Check.displayName = 'Check';
export default Check;
