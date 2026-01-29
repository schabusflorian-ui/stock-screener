// frontend/src/components/icons/icons/Edit3.jsx
import React from 'react';
import Icon from '../Icon';

const Edit3 = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 20h9" fill="none" />
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M12 20h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

Edit3.displayName = 'Edit3';

export default Edit3;
