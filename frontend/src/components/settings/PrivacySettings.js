import React, { useState, useEffect } from 'react';
import { getConsent, saveConsent, hasConsentDecision } from '../../lib/cookies';
import './PrivacySettings.css';

/**
 * Privacy Settings Component
 * Allows users to manage their privacy preferences and GDPR rights
 */
const PrivacySettings = () => {
  const [cookiePreferences, setCookiePreferences] = useState({
    essential: true,
    functional: false,
    analytics: false,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    // Load current cookie preferences
    const consent = getConsent();
    if (consent) {
      setPreferences({
        essential: true,
        functional: consent.functional || false,
        analytics: consent.analytics || false,
      });
    }
  }, []);

  const handleSavePreferences = () => {
    saveConsent(preferences);
    // Show success message
    alert('Cookie preferences saved successfully!');
  };

  const handleExportData = async () => {
    try {
      const response = await fetch('/api/gdpr/export', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert('Your data has been exported successfully!');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again or contact support.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      alert('Please type "DELETE MY ACCOUNT" to confirm');
      return;
    }

    if (!window.confirm('Are you absolutely sure? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);

      const response = await fetch('/api/gdpr/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation: 'DELETE MY ACCOUNT',
          reason: deletionReason
        }),
      });

      if (response.ok) {
        alert('Your account has been deleted. You will be logged out.');
        window.location.href = '/';
      } else {
        const data = await response.json();
        alert(`Error: ${data.message || 'Failed to delete account'}`);
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('An error occurred. Please try again or contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="privacy-settings">
      <h2>Privacy & Data Management</h2>

      {/* Cookie Preferences */}
      <div className="privacy-section">
        <h3>Cookie Preferences</h3>
        <p className="section-description">
          Manage how we use cookies and similar technologies to track your activity.
        </p>

        <div className="preference-options">
          <label className="preference-option">
            <input
              type="checkbox"
              checked={true}
              disabled
              className="preference-checkbox"
            />
            <div className="preference-info">
              <span className="preference-name">
                Essential Cookies
                <span className="preference-badge required">Required</span>
              </span>
              <p className="preference-description">
                Necessary for authentication and basic functionality. Cannot be disabled.
              </p>
            </div>
          </label>

          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.functional}
              onChange={() => togglePreference('functional')}
              className="preference-checkbox"
            />
            <div className="preference-info">
              <span className="preference-name">Functional Cookies</span>
              <p className="preference-description">
                Remember your preferences (theme, layout) and recently viewed items
              </p>
            </div>
          </label>

          <label className="preference-item">
            <input
              type="checkbox"
              checked={preferences.analytics}
              onChange={() => togglePreference('analytics')}
              className="preference-checkbox"
            />
            <div className="preference-info">
              <span className="preference-name">Analytics Cookies</span>
              <p className="preference-description">
                Help us understand how you use the platform to improve it. Data is anonymized.
              </p>
            </div>
          </label>
        </div>

        <h3>Data Management</h3>

        <div className="privacy-section">
          <h4>Export Your Data</h4>
          <p>Download all your data in a portable JSON format (GDPR compliant).</p>
          <button
            onClick={handleExportData}
            className="privacy-btn privacy-btn-secondary"
            disabled={exportLoading}
          >
            {exportLoading ? 'Exporting...' : 'Download My Data'}
          </button>
          {exportMessage && (
            <p className={`privacy-message ${exportError ? 'error' : 'success'}`}>
              {exportMessage}
            </p>
          )}
        </div>

        {/* Data Summary */}
        <div className="privacy-section">
          <h3>Your Data Summary</h3>
          <p>See what data we have about you:</p>
          <button
            onClick={handleViewDataSummary}
            className="privacy-btn-secondary"
            disabled={loading}
          >
            View Data Summary
          </button>

          {dataSummary && (
            <div className="data-summary">
              <h4>Your Data Summary</h4>
              <div className="data-summary-grid">
                <div className="data-summary-item">
                  <span className="data-count">{dataSummary.dataCategories?.watchlists || 0}</span>
                  <span className="data-label">Watchlists</span>
                </div>
                <div className="data-summary-item">
                  <span className="data-count">{dataSummary.dataCategories.portfolios}</span>
                  <span className="data-label">Portfolios</span>
                </div>
                <div className="data-summary-item">
                  <span className="data-category">Alerts</span>
                  <span className="data-count">{dataSummary.dataCategories.alerts}</span>
                </div>
                <div className="data-summary-item">
                  <span className="data-label">Queries</span>
                  <span className="data-value">{dataSummary.dataCategories.queries}</span>
                </div>
              </div>
            </div>

            {/* Your Rights */}
            <div className="privacy-card">
              <h3>Your Rights</h3>
              <p>Under GDPR and CCPA, you have the following rights:</p>
              <ul>
                {summary.yourRights.map((right, index) => (
                  <li key={index}>{right}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p>Loading privacy information...</p>
        )}
      </div>
    );
  }

  return (
    <div className="privacy-settings">
      <h2>Privacy & Data</h2>

      {/* Cookie Preferences */}
      <div className="privacy-section">
        <h3>Cookie Preferences</h3>
        <p className="section-description">
          Manage how we use cookies and similar technologies. Essential cookies are always active.
        </p>

        <div className="cookie-preferences">
          <div className="cookie-option">
            <label className="cookie-label">
              <input
                type="checkbox"
                checked={true}
                disabled
                className="cookie-checkbox"
              />
              <div className="cookie-info">
                <span className="cookie-name">Essential Cookies</span>
                <span className="cookie-badge required">Required</span>
                <p className="cookie-description">
                  Necessary for authentication, security, and basic functionality.
                </p>
              </div>
            </label>
          </div>

          <div className="cookie-option">
            <label className="cookie-label">
              <input
                type="checkbox"
                checked={cookiePreferences.functional}
                onChange={() => handleCookieToggle('functional')}
                className="cookie-checkbox"
              />
              <div className="cookie-info">
                <span className="cookie-name">Functional Cookies</span>
                <span className="cookie-badge optional">Optional</span>
                <p className="cookie-description">
                  Remember your preferences (theme, language, layout) and provide enhanced features.
                </p>
              </div>
            </label>
          </div>

          <div className="cookie-option">
            <label className="cookie-label">
              <input
                type="checkbox"
                checked={cookiePreferences.analytics}
                onChange={() => handleCookieToggle('analytics')}
                className="cookie-checkbox"
              />
              <div className="cookie-info">
                <span className="cookie-name">Analytics Cookies</span>
                <span className="cookie-badge optional">Optional</span>
                <p className="cookie-description">
                  Help us understand usage patterns to improve the platform. Data is anonymized.
                </p>
              </div>
            </label>
          </div>
        </div>

        <button onClick={handleSaveCookies} className="save-button">
          Save Cookie Preferences
        </button>
      </div>

      {/* Data Export */}
      <div className="privacy-section">
        <h3>Export Your Data</h3>
        <p className="section-description">
          Download a copy of all your data in JSON format (GDPR Article 20).
        </p>
        <button
          onClick={handleExportData}
          disabled={isExporting}
          className="action-button export-button"
        >
          {isExporting ? 'Exporting...' : 'Download My Data'}
        </button>
      </div>

      {/* Data Summary */}
      <div className="privacy-section">
        <h3>What Data We Have</h3>
        <p className="section-description">
          View a summary of the personal data we store about you.
        </p>
        <button
          onClick={() => setShowDataSummary(!showDataSummary)}
          className="action-button"
        >
          {showDataSummary ? 'Hide' : 'Show'} Data Summary
        </button>
      </div>

      {/* Delete Account */}
      <div className="privacy-section danger-section">
        <h3>Delete Account</h3>
        <p className="section-description">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="action-button delete-button"
          >
            Delete My Account
          </button>
        ) : (
          <div className="delete-confirmation">
            <p className="warning-text">
              ⚠️ This will permanently delete your account, watchlists, portfolios, alerts, and all other data.
              This action cannot be undone.
            </p>
            <input
              type="text"
              placeholder='Type "DELETE MY ACCOUNT" to confirm'
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="confirmation-input"
            />
            <div className="delete-actions">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmation('');
                }}
                className="action-button cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== 'DELETE MY ACCOUNT' || isDeleting}
                className="action-button delete-button-confirm"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message Display */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default PrivacySettings;
