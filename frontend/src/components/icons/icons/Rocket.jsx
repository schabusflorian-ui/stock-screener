// frontend/src/components/icons/icons/Rocket.jsx
import React from 'react';
import Icon from '../Icon';

const Rocket = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M4.5 16.5C-1.5 10.5 2 4 9 2C16 4 19.5 10.5 13.5 16.5L11 19L9 21L7 19L4.5 16.5Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M4.5 16.5C-1.5 10.5 2 4 9 2C16 4 19.5 10.5 13.5 16.5L11 19L9 21L7 19L4.5 16.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M6 12L3.5 14.5C2.5 15.5 2.5 17.5 3.5 18.5L5.5 20.5C6.5 21.5 8.5 21.5 9.5 20.5L12 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="10" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M2 22L4 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 22L9 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 17L4 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Rocket.displayName = 'Rocket';

export default Rocket;
