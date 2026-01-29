// frontend/src/components/icons/icons/Gift.jsx
import React from 'react';
import Icon from '../Icon';

const Gift = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - gift box body */}
    <rect
      x="3"
      y="8"
      width="18"
      height="13"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer - gift box */}
    <rect
      x="3"
      y="8"
      width="18"
      height="13"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Lid */}
    <path
      d="M2 8C2 6.89543 2.89543 6 4 6H20C21.1046 6 22 6.89543 22 8H2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Vertical ribbon */}
    <line
      x1="12"
      y1="6"
      x2="12"
      y2="21"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    {/* Horizontal ribbon */}
    <line
      x1="3"
      y1="12"
      x2="21"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    {/* Bow left */}
    <path
      d="M12 6C12 6 9 3 7 3C5 3 4 4 4 5C4 6 5 6 7 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Bow right */}
    <path
      d="M12 6C12 6 15 3 17 3C19 3 20 4 20 5C20 6 19 6 17 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Gift.displayName = 'Gift';
export default Gift;
