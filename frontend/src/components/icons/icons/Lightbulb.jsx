// frontend/src/components/icons/icons/Lightbulb.jsx
import React from 'react';
import Icon from '../Icon';

const Lightbulb = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M9 18H15V21C15 21.5523 14.5523 22 14 22H10C9.44772 22 9 21.5523 9 21V18Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <path
      d="M9 18C9 14 6 13 6 9C6 5.68629 8.68629 3 12 3C15.3137 3 18 5.68629 18 9C18 13 15 14 15 18"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M9 18H15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M10 22H14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M9 18C9 14 6 13 6 9C6 5.68629 8.68629 3 12 3C15.3137 3 18 5.68629 18 9C18 13 15 14 15 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Lightbulb.displayName = 'Lightbulb';
export default Lightbulb;
