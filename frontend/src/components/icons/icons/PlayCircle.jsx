// frontend/src/components/icons/icons/PlayCircle.jsx
import React from 'react';
import Icon from '../Icon';

const PlayCircle = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <polygon points="10,8 16,12 10,16" fill="currentColor" />
  </Icon>
));

PlayCircle.displayName = 'PlayCircle';

export default PlayCircle;
