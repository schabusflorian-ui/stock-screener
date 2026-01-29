// frontend/src/components/icons/icons/Camera.jsx
import React from 'react';
import Icon from '../Icon';

const Camera = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M3 7h2l1.5-2h11L19 7h2a2 2 0 012 2v10a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

Camera.displayName = 'Camera';

export default Camera;
