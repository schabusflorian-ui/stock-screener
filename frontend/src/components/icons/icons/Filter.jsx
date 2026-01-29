// frontend/src/components/icons/icons/Filter.jsx
import React from 'react';
import Icon from '../Icon';

const Filter = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon
      points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polygon
      points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Filter.displayName = 'Filter';
export default Filter;
