// frontend/src/components/icons/icons/PrismSparkle.jsx
// Official Prism AI Icon - Bold 4-point sparkle, static display
// Used ONLY for AI-specific elements: chat, agents, insights
import React from 'react';
import Icon from '../Icon';

const PrismSparkle = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Bold 4-point star - fills the viewbox edge to edge */}
    <path
      d="M12 0L15 9L24 12L15 15L12 24L9 15L0 12L9 9L12 0Z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
));

PrismSparkle.displayName = 'PrismSparkle';
export default PrismSparkle;
