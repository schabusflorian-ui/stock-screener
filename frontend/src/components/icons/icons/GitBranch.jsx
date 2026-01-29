// frontend/src/components/icons/icons/GitBranch.jsx
import React from 'react';
import Icon from '../Icon';

const GitBranch = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <circle cx="6" cy="6" r="3" fill="currentColor" fillOpacity="0.3" />
    <circle cx="18" cy="18" r="3" fill="currentColor" fillOpacity="0.3" />
    <circle cx="6" cy="18" r="3" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <line x1="6" y1="9" x2="6" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M6 9c0 3 6 3 6 6s6 3 6 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Icon>
));

GitBranch.displayName = 'GitBranch';

export default GitBranch;
