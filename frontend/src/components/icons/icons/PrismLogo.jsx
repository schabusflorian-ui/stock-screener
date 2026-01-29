// frontend/src/components/icons/icons/PrismLogo.jsx
import React from 'react';
import Icon from '../Icon';

/**
 * PRISM Logo Icon
 * A geometric prism shape representing the PRISM brand
 * Features a triangular prism with light refraction effect
 */
const PrismLogo = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Main prism shape - fill */}
    <path
      d="M12 2L3 20H21L12 2Z"
      fill="currentColor"
      fillOpacity="0.3"
    />
    {/* Light refraction effect - inner triangle */}
    <path
      d="M12 6L7 16H17L12 6Z"
      fill="currentColor"
      fillOpacity="0.2"
    />
    {/* Main prism outline */}
    <path
      d="M12 2L3 20H21L12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* Light ray entering prism */}
    <path
      d="M5 8L9 12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* Spectrum rays exiting - gold accent effect */}
    <path
      d="M15 12L19 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 14L20 14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15 16L19 18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

PrismLogo.displayName = 'PrismLogo';
export default PrismLogo;
