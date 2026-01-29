// frontend/src/components/icons/icons/User.jsx
import React from 'react';
import Icon from '../Icon';

const User = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - head */}
    <circle
      cx="12"
      cy="8"
      r="4"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Fill layer - body */}
    <path
      d="M20 21C20 17.6863 16.4183 15 12 15C7.58172 15 4 17.6863 4 21"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="12"
      cy="8"
      r="4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20 21C20 17.6863 16.4183 15 12 15C7.58172 15 4 17.6863 4 21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

User.displayName = 'User';
export default User;
