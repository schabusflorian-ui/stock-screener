// frontend/src/components/ui/Callout.js
import React from 'react';
import PropTypes from 'prop-types';
import { Info, CheckCircle, AlertTriangle, XCircle } from '../icons';
import './Callout.css';

/**
 * Callout Component
 *
 * Alert/notification component for highlighting important information.
 *
 * Types:
 * - info: General information (blue)
 * - success: Positive feedback (green)
 * - warning: Warning messages (amber)
 * - error: Error messages (red)
 */
const icons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle
};

function Callout({
  type = 'info',
  title,
  children,
  className = '',
  onDismiss,
  ...props
}) {
  const Icon = icons[type];

  return (
    <div className={`ui-callout ui-callout--${type} ${className}`} {...props}>
      <Icon className="ui-callout__icon" size={20} />
      <div className="ui-callout__content">
        {title && <div className="ui-callout__title">{title}</div>}
        <div className="ui-callout__text">{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          className="ui-callout__dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <XCircle size={16} />
        </button>
      )}
    </div>
  );
}

Callout.propTypes = {
  type: PropTypes.oneOf(['info', 'success', 'warning', 'error']),
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  onDismiss: PropTypes.func
};

export default Callout;
