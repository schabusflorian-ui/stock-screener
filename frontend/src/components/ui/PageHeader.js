// frontend/src/components/ui/PageHeader.js
import React from 'react';
import PropTypes from 'prop-types';
import './PageHeader.css';

/**
 * PageHeader Component
 *
 * Consistent page header with title, subtitle, and action buttons.
 * Used at the top of every page for consistent layout.
 */
function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className = '',
  ...props
}) {
  return (
    <header className={`ui-page-header ${className}`} {...props}>
      {breadcrumbs && (
        <nav className="ui-page-header__breadcrumbs">
          {breadcrumbs}
        </nav>
      )}

      <div className="ui-page-header__main">
        <div className="ui-page-header__text">
          <h1 className="ui-page-header__title">{title}</h1>
          {subtitle && (
            <p className="ui-page-header__subtitle">{subtitle}</p>
          )}
        </div>

        {actions && (
          <div className="ui-page-header__actions">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
  breadcrumbs: PropTypes.node,
  className: PropTypes.string
};

export default PageHeader;
