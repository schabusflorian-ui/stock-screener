/**
 * ActivitySummary Component
 *
 * Shows users their own activity/usage stats for transparency.
 * Displayed in settings to build trust through openness about data collection.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Activity,
  Eye,
  TrendingUp,
  RefreshCw,
  Download,
  Shield,
  ExternalLink
} from '../icons';
import api from '../../services/api';
import './ActivitySummary.css';

const ActivitySummary = () => {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get('/analytics/user/summary');
      setData(response.data.data);
    } catch (err) {
      console.error('Failed to fetch activity summary:', err);
      setError('Failed to load activity data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownloadData = useCallback(async () => {
    try {
      // In production, this would trigger a data export
      alert('Your data export will be emailed to you within 24 hours.');
    } catch (err) {
      console.error('Failed to request data export:', err);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="activity-summary activity-summary--loading">
        <RefreshCw className="spinning" size={24} />
        <span>Loading your activity...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="activity-summary activity-summary--error">
        <span>{error}</span>
        <button onClick={fetchData}>Retry</button>
      </div>
    );
  }

  return (
    <div className="activity-summary">
      <div className="activity-summary__header">
        <div className="activity-summary__title">
          <BarChart3 size={20} />
          <h3>Your Activity</h3>
        </div>
        <span className="activity-summary__period">{data?.period || 'This month'}</span>
      </div>

      <div className="activity-summary__stats">
        <div className="activity-summary__stat">
          <TrendingUp size={20} className="activity-summary__stat-icon" />
          <div className="activity-summary__stat-content">
            <span className="activity-summary__stat-value">
              {data?.metrics?.analysesRun ?? 0}
            </span>
            <span className="activity-summary__stat-label">Analyses run</span>
          </div>
        </div>

        <div className="activity-summary__stat">
          <Eye size={20} className="activity-summary__stat-icon" />
          <div className="activity-summary__stat-content">
            <span className="activity-summary__stat-value">
              {data?.metrics?.pageViews ?? 0}
            </span>
            <span className="activity-summary__stat-label">Pages viewed</span>
          </div>
        </div>

        <div className="activity-summary__stat">
          <Activity size={20} className="activity-summary__stat-icon" />
          <div className="activity-summary__stat-content">
            <span className="activity-summary__stat-value">
              {data?.metrics?.sessions ?? 0}
            </span>
            <span className="activity-summary__stat-label">Sessions</span>
          </div>
        </div>
      </div>

      {data?.topFeatures && data.topFeatures.length > 0 && (
        <div className="activity-summary__features">
          <h4>Your most-used features:</h4>
          <ol className="activity-summary__feature-list">
            {data.topFeatures.slice(0, 5).map((feature, index) => (
              <li key={index} className="activity-summary__feature-item">
                <span className="activity-summary__feature-name">
                  {formatFeatureName(feature.feature)}
                </span>
                <span className="activity-summary__feature-count">
                  {feature.count} {feature.count === 1 ? 'time' : 'times'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="activity-summary__privacy">
        <Shield size={16} />
        <div className="activity-summary__privacy-content">
          <p>
            We track basic usage to improve the platform.
            <strong> We never track your actual portfolio data or financial information.</strong>
          </p>
          <div className="activity-summary__privacy-actions">
            <a href="/settings/privacy" className="activity-summary__link">
              View Privacy Policy
              <ExternalLink size={12} />
            </a>
            <button
              className="activity-summary__link"
              onClick={handleDownloadData}
            >
              <Download size={12} />
              Download My Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper to format feature names nicely
function formatFeatureName(name) {
  if (!name) return 'Unknown';

  return name
    .replace(/feature_|_used|_completed/g, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default ActivitySummary;
