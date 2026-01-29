// frontend/src/components/icons/icons/Newspaper.jsx
import React from 'react';
import Icon from '../Icon';

const Newspaper = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V4C20 3.46957 19.7893 2.96086 19.4142 2.58579C19.0391 2.21071 18.5304 2 18 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V22Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V4C20 3.46957 19.7893 2.96086 19.4142 2.58579C19.0391 2.21071 18.5304 2 18 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V22Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 10H20V22H4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="8" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="14" x2="12" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Newspaper.displayName = 'Newspaper';
export default Newspaper;
