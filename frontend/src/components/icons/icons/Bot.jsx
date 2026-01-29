// frontend/src/components/icons/icons/Bot.jsx
import React from 'react';
import Icon from '../Icon';

const Bot = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Fill layer - robot head */}
    <rect
      x="3"
      y="8"
      width="18"
      height="13"
      rx="2"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Stroke layer */}
    <rect
      x="3"
      y="8"
      width="18"
      height="13"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Antenna */}
    <path
      d="M12 2V8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle
      cx="12"
      cy="2"
      r="1"
      fill="currentColor"
    />
    {/* Eyes */}
    <circle
      cx="8"
      cy="14"
      r="2"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle
      cx="16"
      cy="14"
      r="2"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    {/* Ear antennas */}
    <path
      d="M1 12H3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M21 12H23"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Bot.displayName = 'Bot';
export default Bot;
