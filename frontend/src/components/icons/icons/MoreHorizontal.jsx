// frontend/src/components/icons/icons/MoreHorizontal.jsx
import React from 'react';
import Icon from '../Icon';

const MoreHorizontal = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="12" cy="12" r="1.5" fill="currentColor" fillOpacity="0.3" />
    <circle cx="5" cy="12" r="1.5" fill="currentColor" fillOpacity="0.3" />
    <circle cx="19" cy="12" r="1.5" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="19" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

MoreHorizontal.displayName = 'MoreHorizontal';

export default MoreHorizontal;
