// frontend/src/components/ui/EmptyState.js
import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import './EmptyState.css';

/**
 * EmptyState Component
 *
 * Displays when there's no data to show.
 * Includes optional icon, description, and action button.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
  ...props
}) {
  return (
    <div className={`ui-empty-state ${className}`} {...props}>
      {Icon && (
        <div className="ui-empty-state__icon">
          <Icon size={48} />
        </div>
      )}
      <h3 className="ui-empty-state__title">{title}</h3>
      {description && (
        <p className="ui-empty-state__description">{description}</p>
      )}
      {action && (
        <div className="ui-empty-state__action">
          <Button onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

EmptyState.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  action: PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
  }),
  className: PropTypes.string
};

export default EmptyState;
