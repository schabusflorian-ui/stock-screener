// frontend/src/components/icons/icons/MapPin.jsx
import React from 'react';
import Icon from '../Icon';

const MapPin = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer */}
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="currentColor" fillOpacity="0.3" />
    {/* Stroke layer */}
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </Icon>
));

MapPin.displayName = 'MapPin';

export default MapPin;
