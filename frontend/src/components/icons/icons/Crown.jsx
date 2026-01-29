// frontend/src/components/icons/icons/Crown.jsx
import React from 'react';
import Icon from '../Icon';

const Crown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M2 17L4 7L8 11L12 4L16 11L20 7L22 17H2Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M2 17L4 7L8 11L12 4L16 11L20 7L22 17H2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2 17H22V20C22 20.2652 21.8946 20.5196 21.7071 20.7071C21.5196 20.8946 21.2652 21 21 21H3C2.73478 21 2.48043 20.8946 2.29289 20.7071C2.10536 20.5196 2 20.2652 2 20V17Z"
      fill="currentColor"
      fillOpacity="0.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Crown.displayName = 'Crown';
export default Crown;
