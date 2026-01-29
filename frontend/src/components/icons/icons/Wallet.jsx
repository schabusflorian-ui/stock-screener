// frontend/src/components/icons/icons/Wallet.jsx
import React from 'react';
import Icon from '../Icon';

const Wallet = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - wallet body */}
    <path
      d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 14C16 14.5523 16.4477 15 17 15C17.5523 15 18 14.5523 18 14C18 13.4477 17.5523 13 17 13C16.4477 13 16 13.4477 16 14Z"
      fill="currentColor"
    />
    <path
      d="M22 9V7C22 5.89543 21.1046 5 20 5H6C4.89543 5 4 4.10457 4 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 3H18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Wallet.displayName = 'Wallet';
export default Wallet;
