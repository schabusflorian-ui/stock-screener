// frontend/src/components/icons/icons/Layers.jsx
import React from 'react';
import Icon from '../Icon';

const Layers = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <polygon
      points="12 2 2 7 12 12 22 7 12 2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polygon
      points="12 2 2 7 12 12 22 7 12 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="2 17 12 22 22 17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="2 12 12 17 22 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

Layers.displayName = 'Layers';
export default Layers;
