// frontend/src/components/icons/icons/Database.jsx
import React from 'react';
import Icon from '../Icon';

const Database = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <ellipse
      cx="12"
      cy="5"
      rx="9"
      ry="3"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <ellipse
      cx="12"
      cy="5"
      rx="9"
      ry="3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 12C21 13.66 17 15 12 15C7 15 3 13.66 3 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 5V19C3 20.66 7 22 12 22C17 22 21 20.66 21 19V5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Database.displayName = 'Database';
export default Database;
