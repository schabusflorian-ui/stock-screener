// frontend/src/components/icons/icons/FileSpreadsheet.jsx
import React from 'react';
import Icon from '../Icon';

const FileSpreadsheet = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* Grid lines */}
    <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="8" y1="17" x2="16" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="10" y1="11" x2="10" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="14" y1="11" x2="14" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
));

FileSpreadsheet.displayName = 'FileSpreadsheet';

export default FileSpreadsheet;
