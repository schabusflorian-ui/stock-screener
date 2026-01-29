// frontend/src/components/icons/icons/Play.jsx
import React from 'react';
import Icon from '../Icon';

const Play = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon
      points="5 3 19 12 5 21 5 3"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polygon
      points="5 3 19 12 5 21 5 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Play.displayName = 'Play';
export default Play;
