// frontend/src/components/icons/icons/Bold.jsx
import React from 'react';
import Icon from '../Icon';

const Bold = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" fill="currentColor" fillOpacity="0.3" />
    <path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

Bold.displayName = 'Bold';

export default Bold;
