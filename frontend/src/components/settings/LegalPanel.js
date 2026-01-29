import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Shield, Cookie, AlertTriangle, IconButton } from '../icons';
import './LegalPanel.css';

const LegalPanel = () => {
  return (
    <div className="legal-panel">
      <div className="legal-panel-header">
        <h2>Legal & Privacy</h2>
        <p className="legal-panel-subtitle">
          Important legal information and privacy policies
        </p>
      </div>

      <div className="legal-cards">
        {/* Financial Disclaimer */}
        <Link to="/legal/disclaimer" className="legal-card disclaimer-card">
          <IconButton icon={AlertTriangle} colorScheme="risk" size="small" className="legal-card-icon-btn" />
          <div className="legal-card-content">
            <h3>Financial Disclaimer</h3>
            <p>
              Important: This platform does NOT provide financial advice. Read our
              investment risk disclaimer.
            </p>
            <span className="legal-card-link">Read Disclaimer →</span>
          </div>
        </Link>

        {/* Terms of Service */}
        <Link to="/legal/terms" className="legal-card">
          <IconButton icon={FileText} colorScheme="analytics" size="small" className="legal-card-icon-btn" />
          <div className="legal-card-content">
            <h3>Terms of Service</h3>
            <p>
              Rules and guidelines for using this platform. Personal,
              non-commercial use only.
            </p>
            <span className="legal-card-link">Read Terms →</span>
          </div>
        </Link>

        {/* Privacy Policy */}
        <Link to="/legal/privacy" className="legal-card">
          <IconButton icon={Shield} colorScheme="ai" size="small" className="legal-card-icon-btn" />
          <div className="legal-card-content">
            <h3>Privacy Policy</h3>
            <p>
              How we collect, use, and protect your data. GDPR and CCPA
              compliant.
            </p>
            <span className="legal-card-link">Read Privacy Policy →</span>
          </div>
        </Link>

        {/* Cookie Policy */}
        <Link to="/legal/cookies" className="legal-card">
          <IconButton icon={Cookie} colorScheme="portfolio" size="small" className="legal-card-icon-btn" />
          <div className="legal-card-content">
            <h3>Cookie Policy</h3>
            <p>
              What cookies we use and how you can manage your preferences.
            </p>
            <span className="legal-card-link">Read Cookie Policy →</span>
          </div>
        </Link>
      </div>

      {/* Important Notice */}
      <div className="legal-notice">
        <div className="legal-notice-icon">
          <AlertTriangle size={20} />
        </div>
        <div className="legal-notice-content">
          <h4>Important Notice</h4>
          <p>
            This is a personal research platform shared with friends. It is NOT
            a professional financial service. All information is for educational
            purposes only. You are solely responsible for your investment
            decisions.
          </p>
        </div>
      </div>

      {/* Data & Privacy */}
      <div className="legal-section">
        <h3>Your Data & Privacy</h3>
        <div className="legal-data-info">
          <p>
            We collect minimal data necessary to provide this service. You have
            the right to:
          </p>
          <ul>
            <li>Access your data</li>
            <li>Export your data</li>
            <li>Delete your account</li>
            <li>Manage cookie preferences</li>
          </ul>
          <p className="legal-data-note">
            For data requests or privacy concerns, use the support panel or
            contact through the in-app feedback system.
          </p>
        </div>
      </div>

      {/* Last Updated */}
      <div className="legal-footer">
        <p>Legal documents last updated: January 13, 2026</p>
      </div>
    </div>
  );
};

export default LegalPanel;
