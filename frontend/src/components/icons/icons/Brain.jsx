// frontend/src/components/icons/icons/Brain.jsx
import React from 'react';
import Icon from '../Icon';

const Brain = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - brain shape */}
    <path
      d="M9.5 2C8.17 2 7 2.85 6.59 4.09C5.17 4.43 4.04 5.56 3.7 6.98C3.26 7.39 3 7.96 3 8.5C3 9.04 3.26 9.61 3.7 10.02C3.04 10.56 2.63 11.37 2.63 12.25C2.63 13.13 3.04 13.94 3.7 14.48C3.26 14.89 3 15.46 3 16C3 17.1 3.9 18 5 18C5 19.1 5.9 20 7 20C7 21.1 7.9 22 9 22H15C16.1 22 17 21.1 17 20C18.1 20 19 19.1 19 18C20.1 18 21 17.1 21 16C21 15.46 20.74 14.89 20.3 14.48C20.96 13.94 21.37 13.13 21.37 12.25C21.37 11.37 20.96 10.56 20.3 10.02C20.74 9.61 21 9.04 21 8.5C21 7.96 20.74 7.39 20.3 6.98C19.96 5.56 18.83 4.43 17.41 4.09C17 2.85 15.83 2 14.5 2C13.67 2 12.93 2.35 12.39 2.88"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M9.5 2C8.17 2 7 2.85 6.59 4.09C5.17 4.43 4.04 5.56 3.7 6.98C3.26 7.39 3 7.96 3 8.5C3 9.04 3.26 9.61 3.7 10.02C3.04 10.56 2.63 11.37 2.63 12.25C2.63 13.13 3.04 13.94 3.7 14.48C3.26 14.89 3 15.46 3 16C3 17.1 3.9 18 5 18C5 19.1 5.9 20 7 20C7 21.1 7.9 22 9 22H15C16.1 22 17 21.1 17 20C18.1 20 19 19.1 19 18C20.1 18 21 17.1 21 16C21 15.46 20.74 14.89 20.3 14.48C20.96 13.94 21.37 13.13 21.37 12.25C21.37 11.37 20.96 10.56 20.3 10.02C20.74 9.61 21 9.04 21 8.5C21 7.96 20.74 7.39 20.3 6.98C19.96 5.56 18.83 4.43 17.41 4.09C17 2.85 15.83 2 14.5 2C13.67 2 12.93 2.35 12.39 2.88"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 2C11.07 2 10.26 2.53 9.83 3.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M12 22V13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 8H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 8H17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 12H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 12H17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Brain.displayName = 'Brain';
export default Brain;
