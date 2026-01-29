import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from '../icons';
import './Footer.css';

/**
 * Footer Component
 * Displays legal disclaimer and links to legal documents
 */
const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="footer-container">
        {/* Disclaimer Section */}
        <div className="footer-disclaimer">
          <p className="disclaimer-text">
            <strong><AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Disclaimer:</strong> Investment Research Platform provides information for
            educational purposes only and does not constitute financial advice. All investments
            involve risk. Past performance is not indicative of future results. AI-generated
            insights may contain errors. Always consult qualified professionals before making
            investment decisions.
          </p>
        </div>

        {/* Navigation Links */}
        <div className="footer-content">
          {/* Legal Links */}
          <div className="footer-section">
            <h4 className="footer-section-title">Legal</h4>
            <div className="footer-links">
              <Link to="/legal/terms" className="footer-link">
                Terms of Service
              </Link>
              <Link to="/legal/privacy" className="footer-link">
                Privacy Policy
              </Link>
              <Link to="/legal/disclaimer" className="footer-link">
                Investment Disclaimer
              </Link>
              <Link to="/legal/cookies" className="footer-link">
                Cookie Policy
              </Link>
            </div>
          </div>

          {/* Support Links */}
          <div className="footer-section">
            <h4 className="footer-section-title">Support</h4>
            <div className="footer-links">
              <a
                href="mailto:support@investmentresearchplatform.com"
                className="footer-link"
              >
                Contact Support
              </a>
              <Link to="/help" className="footer-link">
                Help Center
              </Link>
              <Link to="/faq" className="footer-link">
                FAQ
              </Link>
            </div>
          </div>

          {/* Company Links */}
          <div className="footer-section">
            <h4 className="footer-section-title">Company</h4>
            <div className="footer-links">
              <Link to="/about" className="footer-link">
                About Us
              </Link>
              <a
                href="https://github.com/yourusername/investment-platform"
                target="_blank"
                rel="noopener noreferrer"
                className="footer-link"
              >
                GitHub
              </a>
              <a
                href="mailto:feedback@investmentresearchplatform.com"
                className="footer-link"
              >
                Send Feedback
              </a>
            </div>
          </div>

          {/* Resources */}
          <div className="footer-section">
            <h4 className="footer-section-title">Resources</h4>
            <div className="footer-links">
              <Link to="/docs" className="footer-link">
                Documentation
              </Link>
              <Link to="/api" className="footer-link">
                API Reference
              </Link>
              <Link to="/changelog" className="footer-link">
                Changelog
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            {/* Copyright */}
            <div className="footer-copyright">
              <p>© {currentYear} Investment Research Platform. All rights reserved.</p>
            </div>

            {/* Data Sources Attribution */}
            <div className="footer-attribution">
              <p className="attribution-text">
                Market data provided by Alpha Vantage, Financial Modeling Prep, Yahoo Finance,
                SEC EDGAR, and ESMA. Data may be delayed.
              </p>
            </div>

            {/* Quick Legal Links */}
            <div className="footer-quick-links">
              <Link to="/legal/privacy" className="footer-quick-link">Privacy</Link>
              <span className="footer-separator">•</span>
              <Link to="/legal/terms" className="footer-quick-link">Terms</Link>
              <span className="footer-separator">•</span>
              <Link to="/legal/cookies" className="footer-quick-link">Cookies</Link>
            </div>
          </div>
        </div>

        {/* Regulatory Notices */}
        <div className="footer-regulatory">
          <p className="regulatory-text">
            <strong>Important Regulatory Information:</strong> This platform is not registered
            as a broker-dealer, investment advisor, or financial planner. We do not provide
            personalized investment recommendations. Securities offered through authorized
            broker-dealers only. Check with your local securities regulator before investing.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
