// frontend/src/components/icons/icons/List.jsx
import React from 'react';
import Icon from '../Icon';

const List = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - bullets */}
    <circle cx="4" cy="6" r="1.5" fill="currentColor" fillOpacity="0.3" />
    <circle cx="4" cy="12" r="1.5" fill="currentColor" fillOpacity="0.3" />
    <circle cx="4" cy="18" r="1.5" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="8" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

List.displayName = 'List';

export default List;
