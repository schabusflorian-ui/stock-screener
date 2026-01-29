// frontend/src/components/icons/icons/Scale.jsx
import React from 'react';
import Icon from '../Icon';

const Scale = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - pans */}
    <path
      d="M8 9L4 15H12L8 9Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <path
      d="M16 9L12 15H20L16 9Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <line
      x1="12"
      y1="3"
      x2="12"
      y2="21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="6"
      x2="21"
      y2="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M8 6L4 15H12L8 6Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M16 6L12 15H20L16 6Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="6"
      y1="21"
      x2="18"
      y2="21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Scale.displayName = 'Scale';
export default Scale;
