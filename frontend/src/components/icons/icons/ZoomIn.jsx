// frontend/src/components/icons/icons/ZoomIn.jsx
import React from 'react';
import Icon from '../Icon';

const ZoomIn = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="11"
      cy="11"
      r="8"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="11"
      cy="11"
      r="8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="21"
      y1="21"
      x2="16.65"
      y2="16.65"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="11"
      y1="8"
      x2="11"
      y2="14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="8"
      y1="11"
      x2="14"
      y2="11"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

ZoomIn.displayName = 'ZoomIn';
export default ZoomIn;
