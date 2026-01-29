// frontend/src/components/icons/icons/Activity.jsx
import React from 'react';
import Icon from '../Icon';

const Activity = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - activity line */}
    <polyline
      points="22 12 18 12 15 21 9 3 6 12 2 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

Activity.displayName = 'Activity';
export default Activity;
