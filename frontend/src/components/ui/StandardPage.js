// frontend/src/components/ui/StandardPage.js
import React from 'react';
import PropTypes from 'prop-types';
import PageHeader from './PageHeader';
import './StandardPage.css';

/**
 * StandardPage Component
 *
 * Consistent page layout template with header and content areas.
 * Provides standard spacing, max-width, and responsive padding.
 *
 * Usage:
 *   <StandardPage
 *     title="Dashboard"
 *     subtitle="Overview of your portfolio"
 *     actions={<Button>Add Stock</Button>}
 *   >
 *     <Section title="Holdings">...</Section>
 *     <Section title="Performance">...</Section>
 *   </StandardPage>
 */
function StandardPage({
  title,
  subtitle,
  actions,
  breadcrumbs,
  children,
  className = '',
  ...props
}) {
  return (
    <div className={`ui-standard-page ${className}`} {...props}>
      <div className="ui-standard-page__container">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={actions}
          breadcrumbs={breadcrumbs}
        />
        <div className="ui-standard-page__content">
          {children}
        </div>
      </div>
    </div>
  );
}

StandardPage.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
  breadcrumbs: PropTypes.node,
  children: PropTypes.node.isRequired,
  className: PropTypes.string
};

export default StandardPage;
