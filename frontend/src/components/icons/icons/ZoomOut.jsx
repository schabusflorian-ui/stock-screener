// frontend/src/components/icons/icons/ZoomOut.jsx
import React from 'react';
import Icon from '../Icon';

const ZoomOut = React.forwardRef((props, ref) => (
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

ZoomOut.displayName = 'ZoomOut';
export default ZoomOut;
