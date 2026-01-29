import React, { useState, useEffect } from 'react';
import { AlertTriangle } from '../icons';
import { getConsent, saveConsent } from '../../lib/cookies';
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
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // Load current cookie preferences
    const consent = getConsent();
    if (consent) {
      setCookiePreferences({
        essential: true,
        functional: consent.functional || false,
        analytics: consent.analytics || false,
      });
    }
  }, []);

  const handleCookieToggle = (type) => {
    setCookiePreferences(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const handleSaveCookies = () => {
    saveConsent(cookiePreferences);
    setMessage({ type: 'success', text: 'Cookie preferences saved successfully!' });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleExportData = async () => {
    setExportLoading(true);
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

      setMessage({ type: 'success', text: 'Your data has been exported successfully!' });
    } catch (error) {
      console.error('Export failed:', error);
      setMessage({ type: 'error', text: 'Failed to export data. Please try again or contact support.' });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      setMessage({ type: 'error', text: 'Please type "DELETE MY ACCOUNT" to confirm' });
      return;
    }

    if (!window.confirm('Are you absolutely sure? This action cannot be undone.')) {
      return;
    }

    setDeleteLoading(true);
    try {
      const response = await fetch('/api/gdpr/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          confirmation: 'DELETE MY ACCOUNT',
          reason: deleteReason
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Your account has been deleted. You will be logged out.' });
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.message || 'Failed to delete account' });
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      setMessage({ type: 'error', text: 'An error occurred. Please try again or contact support.' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="privacy-settings">
      <h2>Privacy & Data</h2>

      {/* Message Display */}
      {message && (
        <div className={`privacy-message ${message.type}`}>
          {message.text}
        </div>
      )}

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
          disabled={exportLoading}
          className="action-button export-button"
        >
          {exportLoading ? 'Exporting...' : 'Download My Data'}
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
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              This will permanently delete your account, watchlists, portfolios, alerts, and all other data.
              This action cannot be undone.
            </p>
            <textarea
              placeholder="Optional: Tell us why you're leaving"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="reason-input"
              rows={2}
            />
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
                  setDeleteReason('');
                }}
                className="action-button cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmation !== 'DELETE MY ACCOUNT' || deleteLoading}
                className="action-button delete-button-confirm"
              >
                {deleteLoading ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrivacySettings;
