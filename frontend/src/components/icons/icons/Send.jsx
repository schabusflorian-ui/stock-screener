// frontend/src/components/icons/icons/Send.jsx
import React from 'react';
import Icon from '../Icon';

const Send = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M22 2L11 13"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <path
      d="M22 2L15 22L11 13L2 9L22 2Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M22 2L11 13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 2L15 22L11 13L2 9L22 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Send.displayName = 'Send';
export default Send;
