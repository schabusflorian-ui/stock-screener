// frontend/src/components/icons/icons/Key.jsx
import React from 'react';
import Icon from '../Icon';

const Key = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="7.5" cy="15.5" r="4.5" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path
      d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

Key.displayName = 'Key';

export default Key;
