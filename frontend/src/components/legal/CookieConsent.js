import React, { useState, useEffect } from 'react';
import { hasConsentDecision, getConsent, saveConsent } from '../../lib/cookies';
import './CookieConsent.css';

/**
 * Cookie Consent Banner Component
 * Displays GDPR/CCPA compliant cookie consent interface
 */
const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true,  // Always true, can't be changed
    functional: false,
    analytics: false,
  });

  useEffect(() => {
    // Check if user has already made a consent decision
    if (!hasConsentDecision()) {
      setShowBanner(true);
    } else {
      // Load existing preferences
      const existingConsent = getConsent();
      if (existingConsent) {
        setPreferences({
          essential: true,
          functional: existingConsent.functional || false,
          analytics: existingConsent.analytics || false,
        });
      }
    }
  }, []);

  const handleSavePreferences = (acceptAll = false) => {
    const newPrefs = acceptAll
      ? { essential: true, functional: true, analytics: true }
      : preferences;

    saveConsent(newPrefs);
    setShowBanner(false);
    setShowPreferences(false);
  };

  const handleEssentialOnly = () => {
    saveConsent({
      essential: true,
      functional: false,
      analytics: false,
    });
    setShowBanner(false);
    setShowPreferences(false);
  };

  const togglePreference = (key) => {
    if (key === 'essential') return; // Can't toggle essential
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!showBanner) return null;

  return (
    <div className="cookie-consent-overlay">
      <div className="cookie-consent-banner">
        <div className="cookie-consent-content">
          {/* Main Banner */}
          {!showPreferences ? (
            <>
              <div className="cookie-consent-text">
                <h3>🍪 Cookie Preferences</h3>
                <p>
                  We use cookies to improve your experience. Essential cookies are required
                  for the site to function. You can choose to enable optional cookies for
                  analytics and enhanced features.{' '}
                  <a
                    href="/legal/cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cookie-learn-more"
                  >
                    Learn more
                  </a>
                </p>
              </div>

              <div className="cookie-consent-actions">
                <button
                  onClick={() => setShowPreferences(true)}
                  className="cookie-btn cookie-btn-secondary"
                >
                  Customize
                </button>
                <button
                  onClick={handleEssentialOnly}
                  className="cookie-btn cookie-btn-secondary"
                >
                  Essential Only
                </button>
                <button
                  onClick={() => handleSavePreferences(true)}
                  className="cookie-btn cookie-btn-primary"
                >
                  Accept All
                </button>
              </div>
            </>
          ) : (
            /* Preferences Panel */
            <>
              <div className="cookie-preferences-header">
                <h3>Customize Cookie Preferences</h3>
                <button
                  onClick={() => setShowPreferences(false)}
                  className="cookie-back-btn"
                  aria-label="Go back"
                >
                  ← Back
                </button>
              </div>

              <div className="cookie-preferences-list">
                {/* Essential Cookies */}
                <div className="cookie-preference-item">
                  <div className="cookie-preference-header">
                    <label className="cookie-preference-label">
                      <input
                        type="checkbox"
                        checked={preferences.essential}
                        disabled
                        className="cookie-checkbox"
                      />
                      <div className="cookie-preference-info">
                        <span className="cookie-preference-name">
                          Essential Cookies
                          <span className="cookie-required-badge">Required</span>
                        </span>
                        <p className="cookie-preference-description">
                          Necessary for authentication, security, and basic functionality.
                          These cannot be disabled.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="cookie-preference-examples">
                    <small>Examples: session_id, csrf_token, auth_token</small>
                  </div>
                </div>

                {/* Functional Cookies */}
                <div className="cookie-preference-item">
                  <div className="cookie-preference-header">
                    <label className="cookie-preference-label">
                      <input
                        type="checkbox"
                        checked={preferences.functional}
                        onChange={() => togglePreference('functional')}
                        className="cookie-checkbox"
                      />
                      <div className="cookie-preference-info">
                        <span className="cookie-preference-name">
                          Functional Cookies
                          <span className="cookie-optional-badge">Optional</span>
                        </span>
                        <p className="cookie-preference-description">
                          Remember your preferences (theme, language, layout) and provide
                          enhanced features like recently viewed stocks.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="cookie-preference-examples">
                    <small>Examples: theme, last_viewed_stocks, chart_preferences</small>
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="cookie-preference-item">
                  <div className="cookie-preference-header">
                    <label className="cookie-preference-label">
                      <input
                        type="checkbox"
                        checked={preferences.analytics}
                        onChange={() => togglePreference('analytics')}
                        className="cookie-checkbox"
                      />
                      <div className="cookie-preference-info">
                        <span className="cookie-preference-name">
                          Analytics Cookies
                          <span className="cookie-optional-badge">Optional</span>
                        </span>
                        <p className="cookie-preference-description">
                          Help us understand how you use the platform so we can improve it.
                          Data is anonymized and never shared.
                        </p>
                      </div>
                    </label>
                  </div>
                  <div className="cookie-preference-examples">
                    <small>Examples: _ga (Google Analytics), performance_metrics</small>
                  </div>
                </div>
              </div>

              <div className="cookie-preferences-footer">
                <button
                  onClick={() => handleSavePreferences(false)}
                  className="cookie-btn cookie-btn-primary cookie-btn-full"
                >
                  Save My Preferences
                </button>
                <p className="cookie-preferences-note">
                  You can change these settings anytime in Settings → Privacy
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
