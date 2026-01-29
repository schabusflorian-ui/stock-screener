// frontend/src/components/icons/icons/Search.jsx
import React from 'react';
import Icon from '../Icon';

const Search = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle
      cx="11"
      cy="11"
      r="7"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <circle
      cx="11"
      cy="11"
      r="7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 21L16.5 16.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
));

Search.displayName = 'Search';
export default Search;
