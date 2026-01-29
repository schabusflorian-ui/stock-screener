// frontend/src/components/icons/icons/AlertTriangle.jsx
import React from 'react';
import Icon from '../Icon';

const AlertTriangle = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M10.29 3.86L1.82 18C1.64 18.32 1.55 18.68 1.55 19.05C1.56 19.42 1.66 19.78 1.85 20.09C2.04 20.4 2.31 20.66 2.64 20.83C2.96 21.01 3.33 21.1 3.7 21.09H20.64C21.01 21.1 21.38 21.01 21.7 20.83C22.03 20.66 22.3 20.4 22.49 20.09C22.68 19.78 22.78 19.42 22.79 19.05C22.79 18.68 22.7 18.32 22.52 18L14.05 3.86C13.85 3.56 13.59 3.32 13.27 3.15C12.96 2.98 12.6 2.89 12.24 2.89C11.87 2.89 11.52 2.98 11.2 3.15C10.89 3.32 10.62 3.56 10.43 3.86"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M10.29 3.86L1.82 18C1.64 18.32 1.55 18.68 1.55 19.05C1.56 19.42 1.66 19.78 1.85 20.09C2.04 20.4 2.31 20.66 2.64 20.83C2.96 21.01 3.33 21.1 3.7 21.09H20.64C21.01 21.1 21.38 21.01 21.7 20.83C22.03 20.66 22.3 20.4 22.49 20.09C22.68 19.78 22.78 19.42 22.79 19.05C22.79 18.68 22.7 18.32 22.52 18L14.05 3.86C13.85 3.56 13.59 3.32 13.27 3.15C12.96 2.98 12.6 2.89 12.24 2.89C11.87 2.89 11.52 2.98 11.2 3.15C10.89 3.32 10.62 3.56 10.43 3.86"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="12"
      y1="9"
      x2="12"
      y2="13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle
      cx="12"
      cy="17"
      r="0.5"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
    />
  </Icon>
));

AlertTriangle.displayName = 'AlertTriangle';
export default AlertTriangle;
