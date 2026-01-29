// frontend/src/components/icons/icons/BellOff.jsx
import React from 'react';
import Icon from '../Icon';

const BellOff = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke layer */}
    <path
      d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18.63 13C18.87 14.54 19.5 16 21 17H7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.26 6.26C6.09 6.82 6 7.4 6 8C6 15 3 17 3 17H7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.9052 2 9.85253 2.30251 8.95 2.84"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="1"
      y1="1"
      x2="23"
      y2="23"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

BellOff.displayName = 'BellOff';
export default BellOff;
