// frontend/src/components/icons/icons/Calculator.jsx
import React from 'react';
import Icon from '../Icon';

const Calculator = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect x="4" y="2" width="16" height="20" rx="2" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <rect x="8" y="6" width="8" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <line x1="8" y1="14" x2="8.01" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="14" x2="12.01" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="14" x2="16.01" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="18" x2="8.01" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="18" x2="12.01" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="18" x2="16.01" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Icon>
));

Calculator.displayName = 'Calculator';

export default Calculator;
