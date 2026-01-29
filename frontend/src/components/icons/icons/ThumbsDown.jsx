// frontend/src/components/icons/icons/ThumbsDown.jsx
import React from 'react';
import Icon from '../Icon';

const ThumbsDown = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path
      d="M10 15V19C10 19.7956 10.3161 20.5587 10.8787 21.1213C11.4413 21.6839 12.2044 22 13 22L17 14V2H5.72C5.23766 1.99454 4.76963 2.16359 4.40212 2.47599C4.03461 2.78839 3.79232 3.22309 3.72 3.7L2.34 12.7C2.29651 12.9866 2.31583 13.2793 2.39666 13.5577C2.47749 13.8362 2.6179 14.0937 2.80814 14.3125C2.99839 14.5313 3.23385 14.7061 3.49842 14.8248C3.76298 14.9435 4.05009 15.0033 4.34 15H10Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M10 15V19C10 19.7956 10.3161 20.5587 10.8787 21.1213C11.4413 21.6839 12.2044 22 13 22L17 14V2H5.72C5.23766 1.99454 4.76963 2.16359 4.40212 2.47599C4.03461 2.78839 3.79232 3.22309 3.72 3.7L2.34 12.7C2.29651 12.9866 2.31583 13.2793 2.39666 13.5577C2.47749 13.8362 2.6179 14.0937 2.80814 14.3125C2.99839 14.5313 3.23385 14.7061 3.49842 14.8248C3.76298 14.9435 4.05009 15.0033 4.34 15H10Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 14H20C20.5304 14 21.0391 13.7893 21.4142 13.4142C21.7893 13.0391 22 12.5304 22 12V4C22 3.46957 21.7893 2.96086 21.4142 2.58579C21.0391 2.21071 20.5304 2 20 2H17"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

ThumbsDown.displayName = 'ThumbsDown';
export default ThumbsDown;
