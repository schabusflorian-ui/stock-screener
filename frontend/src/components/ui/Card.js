// frontend/src/components/ui/Card.js
import React from 'react';
import PropTypes from 'prop-types';
import './Card.css';

/**
 * Card Component
 *
 * A versatile card container following the design system.
 *
 * Variants:
 * - base: Standard card with border
 * - elevated: Card with shadow, no border
 * - interactive: Hoverable card with transition effects
 * - glass: Glassmorphism effect
 *
 * Padding:
 * - sm: 12px (var(--space-3))
 * - md: 16px (var(--space-4))
 * - lg: 24px (var(--space-6))
 * - none: No padding
 */
function Card({
  variant = 'base',
  padding = 'lg',
  className = '',
  onClick,
  children,
  ...props
}) {
  const classes = [
    'ui-card',
    `ui-card--${variant}`,
    padding !== 'none' && `ui-card--padding-${padding}`,
    onClick && 'ui-card--clickable',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} onClick={onClick} {...props}>
      {children}
    </div>
  );
}

Card.propTypes = {
  variant: PropTypes.oneOf(['base', 'elevated', 'interactive', 'glass']),
  padding: PropTypes.oneOf(['sm', 'md', 'lg', 'none']),
  className: PropTypes.string,
  onClick: PropTypes.func,
  children: PropTypes.node.isRequired
};

// Card Header subcomponent
function CardHeader({ className = '', children, ...props }) {
  return (
    <div className={`ui-card__header ${className}`} {...props}>
      {children}
    </div>
  );
}

CardHeader.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Card Title subcomponent
function CardTitle({ as: Component = 'h3', className = '', children, ...props }) {
  return (
    <Component className={`ui-card__title ${className}`} {...props}>
      {children}
    </Component>
  );
}

CardTitle.propTypes = {
  as: PropTypes.oneOf(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Card Description subcomponent
function CardDescription({ className = '', children, ...props }) {
  return (
    <p className={`ui-card__description ${className}`} {...props}>
      {children}
    </p>
  );
}

CardDescription.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Card Content subcomponent
function CardContent({ className = '', children, ...props }) {
  return (
    <div className={`ui-card__content ${className}`} {...props}>
      {children}
    </div>
  );
}

CardContent.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Card Footer subcomponent
function CardFooter({ className = '', children, ...props }) {
  return (
    <div className={`ui-card__footer ${className}`} {...props}>
      {children}
    </div>
  );
}

CardFooter.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node.isRequired
};

// Attach subcomponents to Card
Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
