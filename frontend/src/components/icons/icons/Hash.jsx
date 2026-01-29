// frontend/src/components/icons/icons/Hash.jsx
import React from 'react';
import Icon from '../Icon';

const Hash = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - hash symbol */}
    <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="3" x2="8" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="16" y1="3" x2="14" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Hash.displayName = 'Hash';
export default Hash;
