// frontend/src/components/ui/Section.js
import React from 'react';
import PropTypes from 'prop-types';
import './Section.css';

/**
 * Section Component
 *
 * Semantic section wrapper with consistent title and action styling.
 * Use for grouping related content within a page.
 */
function Section({
  title,
  action,
  children,
  className = '',
  ...props
}) {
  return (
    <section className={`ui-section ${className}`} {...props}>
      {(title || action) && (
        <div className="ui-section__header">
          {title && (
            <h2 className="ui-section__title">{title}</h2>
          )}
          {action && (
            <button
              type="button"
              className="ui-section__action"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
      <div className="ui-section__content">
        {children}
      </div>
    </section>
  );
}

Section.propTypes = {
  title: PropTypes.string,
  action: PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired
  }),
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

export default Section;
