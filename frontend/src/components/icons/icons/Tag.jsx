// frontend/src/components/icons/icons/Tag.jsx
import React from 'react';
import Icon from '../Icon';

const Tag = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 2l9 9-7.5 7.5a2.12 2.12 0 01-3 0L2 10V2h10z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="7" cy="7" r="1.5" fill="currentColor" />
  </Icon>
));

Tag.displayName = 'Tag';

export default Tag;
