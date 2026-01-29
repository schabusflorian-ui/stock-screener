// frontend/src/components/icons/icons/TestTube.jsx
import React from 'react';
import Icon from '../Icon';

const TestTube = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M14.5 2L4.5 12L8 18L18.5 7.5L14.5 2Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M14.5 2L4.5 12C3.5 13 3.5 14.5 4.5 15.5L6.5 17.5C7.5 18.5 9 18.5 10 17.5L20 7.5L14.5 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <line x1="14.5" y1="2" x2="20" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="9" y1="7" x2="13" y2="11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="20" y1="4" x2="22" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

TestTube.displayName = 'TestTube';

export default TestTube;
