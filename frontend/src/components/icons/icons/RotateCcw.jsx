// frontend/src/components/icons/icons/RotateCcw.jsx
import React from 'react';
import Icon from '../Icon';

const RotateCcw = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke layer */}
    <path d="M1 4v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

RotateCcw.displayName = 'RotateCcw';

export default RotateCcw;
