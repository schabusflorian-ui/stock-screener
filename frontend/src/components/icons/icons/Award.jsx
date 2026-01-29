// frontend/src/components/icons/icons/Award.jsx
import React from 'react';
import Icon from '../Icon';

const Award = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="12"
      cy="8"
      r="6"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="12"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.477 12.89L17 22L12 19L7 22L8.523 12.89"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Award.displayName = 'Award';
export default Award;
