// frontend/src/components/icons/icons/Sparkles.jsx
// Generic sparkles icon - for non-AI decorative uses
// Same bold style as PrismSparkle for consistency
import React from 'react';
import Icon from '../Icon';

const Sparkles = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Main sparkle - bold 4-point star */}
    <path
      d="M10 1L12 7L18 9L12 11L10 17L8 11L2 9L8 7L10 1Z"
      fill="currentColor"
      stroke="none"
    />
    {/* Small sparkle - top right */}
    <path
      d="M19 4L20 6L22 7L20 8L19 10L18 8L16 7L18 6L19 4Z"
      fill="currentColor"
      stroke="none"
      opacity="0.7"
    />
    {/* Small sparkle - bottom right */}
    <path
      d="M18 16L19 18L21 19L19 20L18 22L17 20L15 19L17 18L18 16Z"
      fill="currentColor"
      stroke="none"
      opacity="0.5"
    />
  </Icon>
));

Sparkles.displayName = 'Sparkles';
export default Sparkles;
