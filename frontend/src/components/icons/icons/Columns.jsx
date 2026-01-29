// frontend/src/components/icons/icons/Columns.jsx
import React from 'react';
import Icon from '../Icon';

const Columns = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" />
  </Icon>
));

Columns.displayName = 'Columns';
export default Columns;
