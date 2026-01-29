// frontend/src/components/icons/icons/ListOrdered.jsx
import React from 'react';
import Icon from '../Icon';

const ListOrdered = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="10" y="5" width="12" height="14" rx="1" fill="currentColor" fillOpacity="0.15" />
    {/* Stroke layer */}
    <line x1="10" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 6h1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M3 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 14h1c.5 0 1 .5 1 1s-.5 1-1 1h-.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M4.5 16c.5 0 1 .5 1 1s-.5 1-1 1H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

ListOrdered.displayName = 'ListOrdered';

export default ListOrdered;
