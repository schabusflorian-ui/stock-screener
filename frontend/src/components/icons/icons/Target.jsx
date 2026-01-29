// frontend/src/components/icons/icons/Target.jsx
import React from 'react';
import Icon from '../Icon';

const Target = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - outer circle */}
    <circle
      cx="12"
      cy="12"
      r="10"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layers - concentric circles */}
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="12"
      r="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="12"
      r="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="currentColor"
    />
  </Icon>
));

Target.displayName = 'Target';
export default Target;
