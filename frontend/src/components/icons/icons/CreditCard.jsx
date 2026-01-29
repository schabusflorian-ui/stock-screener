// frontend/src/components/icons/icons/CreditCard.jsx
import React from 'react';
import Icon from '../Icon';

const CreditCard = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - card body */}
    <rect
      x="2"
      y="5"
      width="20"
      height="14"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer - card outline */}
    <rect
      x="2"
      y="5"
      width="20"
      height="14"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Magnetic stripe */}
    <line
      x1="2"
      y1="10"
      x2="22"
      y2="10"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    {/* Card details line */}
    <line
      x1="6"
      y1="15"
      x2="10"
      y2="15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

CreditCard.displayName = 'CreditCard';
export default CreditCard;
