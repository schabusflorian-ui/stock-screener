// frontend/src/components/icons/icons/Menu.jsx
import React from 'react';
import Icon from '../Icon';

const Menu = React.forwardRef((props, ref) => (
  <Icon ref={ref} {...props}>
    {/* Stroke only - menu lines */}
    <line
      x1="3"
      y1="6"
      x2="21"
      y2="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="12"
      x2="21"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <line
      x1="3"
      y1="18"
      x2="21"
      y2="18"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
));

Menu.displayName = 'Menu';
export default Menu;
