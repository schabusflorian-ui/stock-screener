import React from 'react';
import { Link } from 'react-router-dom';
import './LegalPageLayout.css';

/**
 * Legal Page Layout Component
 * Provides consistent layout for all legal documents
 */
const LegalPageLayout = ({ title, lastUpdated, children }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="legal-page">
      <div className="legal-container">
        {/* Header */}
        <div className="legal-header">
          <Link to="/" className="legal-back-link">
            ← Back to App
          </Link>
          <h1 className="legal-title">{title}</h1>
          <p className="legal-last-updated">
            Last updated: {formatDate(lastUpdated)}
          </p>
        </div>

        {/* Content */}
        <div className="legal-content">
          {children}
        </div>

        {/* Legal Navigation */}
        <div className="legal-navigation">
          <h3 className="legal-nav-title">Legal Documents</h3>
          <div className="legal-nav-links">
            <Link
              to="/legal/terms"
              className="legal-nav-link"
            >
              Terms of Service
            </Link>
            <Link
              to="/legal/privacy"
              className="legal-nav-link"
            >
              Privacy Policy
            </Link>
            <Link
              to="/legal/disclaimer"
              className="legal-nav-link"
            >
              Investment Disclaimer
            </Link>
            <Link
              to="/legal/cookies"
              className="legal-nav-link"
            >
              Cookie Policy
            </Link>
          </div>
        </div>

        {/* Contact Section */}
        <div className="legal-contact">
          <p className="legal-contact-text">
            Questions about our legal policies?{' '}
            <a href="mailto:legal@investmentresearchplatform.com" className="legal-contact-link">
              Contact our legal team
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LegalPageLayout;
