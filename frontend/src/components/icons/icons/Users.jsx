// frontend/src/components/icons/icons/Users.jsx
import React from 'react';
import Icon from '../Icon';

const Users = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - main person head */}
    <circle
      cx="9"
      cy="7"
      r="4"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Fill layer - main person body */}
    <path
      d="M17 21C17 17.6863 13.4183 15 9 15C4.58172 15 1 17.6863 1 21"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer - main person */}
    <circle
      cx="9"
      cy="7"
      r="4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 21C17 17.6863 13.4183 15 9 15C4.58172 15 1 17.6863 1 21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Second person */}
    <path
      d="M23 21C23 18.2386 20.7614 16 18 16C17.0807 16 16.2189 16.2447 15.4789 16.67"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="18"
      cy="8"
      r="3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Users.displayName = 'Users';
export default Users;
