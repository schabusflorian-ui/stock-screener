// frontend/src/components/icons/icons/Italic.jsx
import React from 'react';
import Icon from '../Icon';

const Italic = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke layer - italic is typically just strokes */}
    <line x1="19" y1="4" x2="10" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="20" x2="5" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="15" y1="4" x2="9" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

Italic.displayName = 'Italic';

export default Italic;
