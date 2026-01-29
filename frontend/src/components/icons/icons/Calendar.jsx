// frontend/src/components/icons/icons/Calendar.jsx
import React from 'react';
import Icon from '../Icon';

const Calendar = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <rect
      x="3"
      y="4"
      width="18"
      height="18"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <rect
      x="3"
      y="4"
      width="18"
      height="18"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Calendar.displayName = 'Calendar';
export default Calendar;
