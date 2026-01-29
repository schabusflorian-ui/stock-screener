// frontend/src/components/icons/icons/DollarSign.jsx
import React from 'react';
import Icon from '../Icon';

const DollarSign = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - coin shape */}
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer - circle */}
    <circle
      cx="12"
      cy="12"
      r="9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Dollar sign */}
    <path
      d="M12 6V18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15 8H10.5C9.83696 8 9.20107 8.26339 8.73223 8.73223C8.26339 9.20107 8 9.83696 8 10.5C8 11.163 8.26339 11.7989 8.73223 12.2678C9.20107 12.7366 9.83696 13 10.5 13H13.5C14.163 13 14.7989 13.2634 15.2678 13.7322C15.7366 14.2011 16 14.837 16 15.5C16 16.163 15.7366 16.7989 15.2678 17.2678C14.7989 17.7366 14.163 18 13.5 18H8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

DollarSign.displayName = 'DollarSign';
export default DollarSign;
