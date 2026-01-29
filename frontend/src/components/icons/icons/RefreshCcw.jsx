// frontend/src/components/icons/icons/RefreshCcw.jsx
import React from 'react';
import Icon from '../Icon';

const RefreshCcw = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M3 4V10H9"
      fill="currentColor"
      fillOpacity="0.3"
    />
    <path
      d="M21 20V14H15"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <polyline
      points="1 4 1 10 7 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <polyline
      points="23 20 23 14 17 14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M20.49 9C19.9828 7.56678 19.1209 6.28503 17.9845 5.27542C16.8482 4.26581 15.4745 3.56133 13.9917 3.22426C12.509 2.8872 10.9652 2.92863 9.50481 3.34473C8.04437 3.76083 6.7146 4.53785 5.64 5.6L1 10M23 14L18.36 18.4C17.2854 19.4621 15.9556 20.2392 14.4952 20.6553C13.0348 21.0714 11.491 21.1128 10.0083 20.7757C8.52547 20.4387 7.15179 19.7342 6.01547 18.7246C4.87915 17.715 4.01719 16.4332 3.51 15"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

RefreshCcw.displayName = 'RefreshCcw';
export default RefreshCcw;
