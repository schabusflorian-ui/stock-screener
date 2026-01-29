// frontend/src/components/icons/icons/Timer.jsx
import React from 'react';
import Icon from '../Icon';

const Timer = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="12" cy="14" r="8" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <circle cx="12" cy="14" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M12 14V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 2h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M17.5 8.5L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Timer.displayName = 'Timer';

export default Timer;
