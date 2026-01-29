// frontend/src/components/icons/icons/Circle.jsx
import React from 'react';
import Icon from '../Icon';

const Circle = React.forwardRef((props, ref) => (
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
  </Icon>
));

Circle.displayName = 'Circle';
export default Circle;
