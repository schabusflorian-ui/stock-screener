// frontend/src/components/icons/icons/Briefcase.jsx
import React from 'react';
import Icon from '../Icon';

const Briefcase = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect
      x="2"
      y="7"
      width="20"
      height="14"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <rect
      x="2"
      y="7"
      width="20"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 21V5C16 4.46957 15.7893 3.96086 15.4142 3.58579C15.0391 3.21071 14.5304 3 14 3H10C9.46957 3 8.96086 3.21071 8.58579 3.58579C8.21071 3.96086 8 4.46957 8 5V21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 12H22"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Briefcase.displayName = 'Briefcase';
export default Briefcase;
