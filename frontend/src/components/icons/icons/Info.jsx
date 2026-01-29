// frontend/src/components/icons/icons/Info.jsx
import React from 'react';
import Icon from '../Icon';

const Info = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="12"
      cy="12"
      r="10"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="12"
      y1="16"
      x2="12"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle
      cx="12"
      cy="8"
      r="0.5"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
    />
  </Icon>
));

Info.displayName = 'Info';
export default Info;
