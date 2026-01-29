// frontend/src/components/icons/icons/FlaskConical.jsx
import React from 'react';
import Icon from '../Icon';

const FlaskConical = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M10 2V7.5L4 18H20L14 7.5V2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M10 2V7.5L4 18C3.5 18.9 4.2 20 5.3 20H18.7C19.8 20 20.5 18.9 20 18L14 7.5V2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <line x1="8" y1="2" x2="16" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

FlaskConical.displayName = 'FlaskConical';

export default FlaskConical;
