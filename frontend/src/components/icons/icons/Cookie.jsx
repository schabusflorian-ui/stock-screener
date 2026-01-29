// frontend/src/components/icons/icons/Cookie.jsx
import React from 'react';
import Icon from '../Icon';

const Cookie = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M12 2a10 10 0 1010 10 4 4 0 01-5-5 4 4 0 01-5-5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="8" cy="8" r="1" fill="currentColor" />
    <circle cx="14" cy="14" r="1" fill="currentColor" />
    <circle cx="8" cy="14" r="1" fill="currentColor" />
    <circle cx="12" cy="10" r="1" fill="currentColor" />
    <circle cx="16" cy="8" r="1" fill="currentColor" />
  </Icon>
));

Cookie.displayName = 'Cookie';

export default Cookie;
