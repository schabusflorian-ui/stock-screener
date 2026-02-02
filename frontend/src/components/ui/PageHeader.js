// frontend/src/components/ui/PageHeader.js
import React from 'react';
import PropTypes from 'prop-types';
import './PageHeader.css';

/**
 * PageHeader Component
 *
 * Consistent page header with title, subtitle, icon, and action buttons.
 * Used at the top of every page for consistent layout.
 *
 * Props:
 * - icon: A component to render as the page icon (e.g., PrismSparkle)
 * - iconColorScheme: 'default' | 'ai' - Use 'ai' for AI-powered pages (violet styling)
 * - children: Extra content to render below the main header (e.g., regime indicators)
 */
function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconColorScheme = 'default',
  actions,
  breadcrumbs,
  children,
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
          <h1 className="ui-page-header__title">
            {Icon && (
              <span className={`ui-page-header__icon ${iconColorScheme === 'ai' ? 'ui-page-header__icon--ai' : ''}`}>
                <Icon size={24} />
              </span>
            )}
            {title}
          </h1>
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

      {children && (
        <div className="ui-page-header__extra">
          {children}
        </div>
      )}
    </header>
  );
}

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.elementType,
  iconColorScheme: PropTypes.oneOf(['default', 'ai']),
  actions: PropTypes.node,
  breadcrumbs: PropTypes.node,
  children: PropTypes.node,
  className: PropTypes.string
};

export default PageHeader;
