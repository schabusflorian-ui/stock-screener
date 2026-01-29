// frontend/src/components/icons/icons/BookOpen.jsx
import React from 'react';
import Icon from '../Icon';

const BookOpen = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - left page */}
    <path
      d="M2 3H9C10.0609 3 11.0783 3.42143 11.8284 4.17157C12.5786 4.92172 13 5.93913 13 7V21C13 20.2044 12.6839 19.4413 12.1213 18.8787C11.5587 18.3161 10.7956 18 10 18H2V3Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Fill layer - right page */}
    <path
      d="M22 3H15C13.9391 3 12.9217 3.42143 12.1716 4.17157C11.4214 4.92172 11 5.93913 11 7V21C11 20.2044 11.3161 19.4413 11.8787 18.8787C12.4413 18.3161 13.2044 18 14 18H22V3Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <path
      d="M2 3H9C10.0609 3 11.0783 3.42143 11.8284 4.17157C12.5786 4.92172 13 5.93913 13 7V21C13 20.2044 12.6839 19.4413 12.1213 18.8787C11.5587 18.3161 10.7956 18 10 18H2V3Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22 3H15C13.9391 3 12.9217 3.42143 12.1716 4.17157C11.4214 4.92172 11 5.93913 11 7V21C11 20.2044 11.3161 19.4413 11.8787 18.8787C12.4413 18.3161 13.2044 18 14 18H22V3Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

BookOpen.displayName = 'BookOpen';
export default BookOpen;
