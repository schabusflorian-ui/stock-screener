// frontend/src/components/icons/icons/MoreVertical.jsx
import React from 'react';
import Icon from '../Icon';

const MoreVertical = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Three vertical dots */}
    <circle cx="12" cy="5" r="1.5" fill="currentColor" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <circle cx="12" cy="19" r="1.5" fill="currentColor" />
  </Icon>
));

MoreVertical.displayName = 'MoreVertical';

export default MoreVertical;
