// frontend/src/components/icons/icons/Receipt.jsx
import React from 'react';
import Icon from '../Icon';

const Receipt = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <line x1="8" y1="8" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="16" x2="12" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Receipt.displayName = 'Receipt';

export default Receipt;
