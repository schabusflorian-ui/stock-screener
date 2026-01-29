// frontend/src/components/icons/icons/History.jsx
import React from 'react';
import Icon from '../Icon';

const History = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M3 3V9H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.05 13C3.27401 15.1962 4.27058 17.2377 5.86278 18.7588C7.45497 20.28 9.54052 21.1805 11.7453 21.3024C13.9501 21.4242 16.1227 20.7592 17.8738 19.4267C19.625 18.0942 20.8369 16.18 21.2964 14.0215C21.756 11.8631 21.4338 9.60875 20.388 7.66247C19.3422 5.71619 17.6406 4.20404 15.5826 3.39368C13.5246 2.58333 11.2456 2.52536 9.14938 3.22976C7.05317 3.93416 5.27796 5.35547 4.14 7.24"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="12 7 12 12 16 14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Icon>
));

History.displayName = 'History';
export default History;
