/**
 * Analytics Dashboard Page
 *
 * Admin dashboard for viewing platform analytics, user feedback,
 * and system health metrics.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  RefreshCw,
  ChevronRight,
  Clock,
  Filter,
  Download
} from 'lucide-react';
import api from '../../services/api';
import './AnalyticsDashboard.css';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' }
];

const AnalyticsDashboard = () => {
  const [period, setPeriod] = useState('7d');
  const [summary, setSummary] = useState(null);
  const [features, setFeatures] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [feedbackData, setFeedbackData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [summaryRes, featuresRes, funnelRes, feedbackRes] = await Promise.all([
        api.get('/analytics/admin/summary', { params: { period } }),
        api.get('/analytics/admin/features', { params: { period } }),
        api.get('/analytics/admin/funnel', { params: { period, funnel: 'onboarding' } }),
        api.get('/analytics/admin/feedback', { params: { period } })
      ]);

      setSummary(summaryRes.data.data);
      setFeatures(featuresRes.data.data);
      setFunnel(funnelRes.data.data);
      setFeedbackData(feedbackRes.data.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatChange = (change) => {
    const num = parseFloat(change);
    if (num > 0) return `+${num}%`;
    return `${num}%`;
  };

  const renderMetricCard = (title, value, change, IconComponent, color = 'primary') => (
    <div className={`analytics-metric analytics-metric--${color}`}>
      <div className="analytics-metric__icon">
        <IconComponent size={24} />
      </div>
      <div className="analytics-metric__content">
        <span className="analytics-metric__value">{value ?? '-'}</span>
        <span className="analytics-metric__label">{title}</span>
      </div>
      {change !== undefined && (
        <div className={`analytics-metric__change ${parseFloat(change) >= 0 ? 'positive' : 'negative'}`}>
          {parseFloat(change) >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span>{formatChange(change)}</span>
        </div>
      )}
    </div>
  );

  if (isLoading && !summary) {
    return (
      <div className="analytics-dashboard">
        <div className="analytics-dashboard__loading">
          <RefreshCw className="spinning" size={32} />
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-dashboard">
        <div className="analytics-dashboard__error">
          <AlertTriangle size={32} />
          <p>{error}</p>
          <button onClick={fetchData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <div className="analytics-dashboard__header">
        <div className="analytics-dashboard__title">
          <BarChart3 size={28} />
          <h1>Analytics Dashboard</h1>
        </div>

        <div className="analytics-dashboard__controls">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="analytics-dashboard__period-select"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            className="analytics-dashboard__refresh"
            onClick={fetchData}
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="analytics-dashboard__tabs">
        <button
          className={`analytics-dashboard__tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`analytics-dashboard__tab ${activeTab === 'features' ? 'active' : ''}`}
          onClick={() => setActiveTab('features')}
        >
          Features
        </button>
        <button
          className={`analytics-dashboard__tab ${activeTab === 'funnel' ? 'active' : ''}`}
          onClick={() => setActiveTab('funnel')}
        >
          Funnel
        </button>
        <button
          className={`analytics-dashboard__tab ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          Feedback
        </button>
      </div>

      <div className="analytics-dashboard__content">
        {activeTab === 'overview' && summary && (
          <>
            {/* Key Metrics */}
            <div className="analytics-section">
              <div className="analytics-metrics-grid">
                {renderMetricCard(
                  'Active Users',
                  summary.metrics?.activeUsers?.value ?? 0,
                  summary.metrics?.activeUsers?.change,
                  Users,
                  'primary'
                )}
                {renderMetricCard(
                  'Average Rating',
                  summary.feedback?.averageRating ? `${summary.feedback.averageRating}/5` : '-',
                  undefined,
                  MessageSquare,
                  'success'
                )}
                {renderMetricCard(
                  'Open Issues',
                  summary.feedback?.openIssues ?? 0,
                  undefined,
                  AlertTriangle,
                  summary.feedback?.openIssues > 0 ? 'warning' : 'success'
                )}
                {renderMetricCard(
                  'Total Sessions',
                  summary.metrics?.sessions?.value ?? 0,
                  summary.metrics?.sessions?.change,
                  Activity,
                  'info'
                )}
              </div>
            </div>

            {/* Key Insights */}
            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <Activity size={20} />
                Key Insights This Period
              </h2>
              <div className="analytics-insights">
                {summary.featureUsage?.slice(0, 4).map((feature, index) => (
                  <div key={index} className="analytics-insight">
                    <span className="analytics-insight__bullet" />
                    <span>
                      <strong>{feature.event_name}</strong> used {feature.count} times
                      by {feature.unique_sessions} unique sessions
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Feedback */}
            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <MessageSquare size={20} />
                Recent Feedback
              </h2>
              <div className="analytics-feedback-list">
                {summary.recentFeedback?.length > 0 ? (
                  summary.recentFeedback.map((feedback) => (
                    <div key={feedback.id} className="analytics-feedback-item">
                      <div className="analytics-feedback-item__rating">
                        {getRatingEmoji(feedback.rating)}
                      </div>
                      <div className="analytics-feedback-item__content">
                        <p className="analytics-feedback-item__message">
                          {feedback.message || 'No message'}
                        </p>
                        <span className="analytics-feedback-item__meta">
                          {feedback.feature && <span>{feedback.feature}</span>}
                          <span>{formatTimeAgo(feedback.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="analytics-empty">No recent feedback</p>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'features' && features && (
          <div className="analytics-section">
            <h2 className="analytics-section__title">
              <PieChart size={20} />
              Feature Usage
            </h2>
            <div className="analytics-feature-table">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Usage Count</th>
                    <th>Unique Sessions</th>
                    <th>Satisfaction</th>
                  </tr>
                </thead>
                <tbody>
                  {features.features?.map((feature, index) => (
                    <tr key={index}>
                      <td className="analytics-feature-name">{feature.feature_name}</td>
                      <td>{feature.usage_count}</td>
                      <td>{feature.unique_sessions}</td>
                      <td>
                        {feature.feedback?.satisfaction ? (
                          <span className={`satisfaction ${
                            feature.feedback.satisfaction >= 70 ? 'good' :
                            feature.feedback.satisfaction >= 50 ? 'okay' : 'poor'
                          }`}>
                            {feature.feedback.satisfaction}%
                          </span>
                        ) : (
                          <span className="no-data">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'funnel' && funnel && (
          <div className="analytics-section">
            <h2 className="analytics-section__title">
              <TrendingDown size={20} />
              User Journey Funnel
            </h2>
            <div className="analytics-funnel">
              {funnel.steps?.map((step, index) => (
                <div key={index} className="analytics-funnel-step">
                  <div className="analytics-funnel-step__bar-container">
                    <div
                      className="analytics-funnel-step__bar"
                      style={{ width: `${step.cumulativeConversion}%` }}
                    />
                  </div>
                  <div className="analytics-funnel-step__info">
                    <span className="analytics-funnel-step__name">{step.name}</span>
                    <span className="analytics-funnel-step__count">{step.count}</span>
                    {index > 0 && (
                      <span className={`analytics-funnel-step__conversion ${
                        step.conversionRate >= 70 ? 'good' :
                        step.conversionRate >= 50 ? 'okay' : 'poor'
                      }`}>
                        {step.conversionRate}% conversion
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {funnel.steps && funnel.steps.length > 1 && (
              <div className="analytics-funnel-summary">
                <AlertTriangle size={16} />
                <span>
                  Biggest drop: Step {getBiggestDropStep(funnel.steps)?.name || '-'}
                  ({getBiggestDropStep(funnel.steps)?.dropoffRate || 0}% drop)
                </span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'feedback' && feedbackData && (
          <>
            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <PieChart size={20} />
                Feedback by Sentiment
              </h2>
              <div className="analytics-sentiment-breakdown">
                {feedbackData.bySentiment?.map((item) => (
                  <div key={item.sentiment} className={`analytics-sentiment-item ${item.sentiment}`}>
                    <span className="analytics-sentiment-emoji">
                      {item.sentiment === 'positive' ? '\ud83d\ude0a' :
                       item.sentiment === 'negative' ? '\ud83d\ude1f' : '\ud83d\ude10'}
                    </span>
                    <span className="analytics-sentiment-label">{item.sentiment}</span>
                    <span className="analytics-sentiment-count">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <MessageSquare size={20} />
                Feedback by Category
              </h2>
              <div className="analytics-category-list">
                {feedbackData.byCategory?.map((cat) => (
                  <div key={cat.category} className="analytics-category-item">
                    <span className="analytics-category-name">{cat.category || 'General'}</span>
                    <span className="analytics-category-bar-container">
                      <span
                        className="analytics-category-bar"
                        style={{ width: `${(cat.count / Math.max(...feedbackData.byCategory.map(c => c.count))) * 100}%` }}
                      />
                    </span>
                    <span className="analytics-category-count">{cat.count}</span>
                    {cat.avg_rating && (
                      <span className="analytics-category-rating">
                        {parseFloat(cat.avg_rating).toFixed(1)}/5
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <Clock size={20} />
                Recent Feedback
              </h2>
              <div className="analytics-feedback-table">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Rating</th>
                      <th>Message</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackData.recent?.map((item) => (
                      <tr key={item.id}>
                        <td><span className="feedback-type-badge">{item.feedback_type}</span></td>
                        <td>{item.category || '-'}</td>
                        <td>{item.rating ? `${item.rating}/5` : '-'}</td>
                        <td className="feedback-message-cell">
                          {item.message?.substring(0, 100)}
                          {item.message?.length > 100 ? '...' : ''}
                        </td>
                        <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                        <td>{formatTimeAgo(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Helper functions
function getRatingEmoji(rating) {
  if (!rating) return '\ud83d\ude10';
  if (rating <= 2) return '\ud83d\ude1f';
  if (rating === 3) return '\ud83d\ude10';
  if (rating === 4) return '\ud83d\ude0a';
  return '\ud83e\udd29';
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getBiggestDropStep(steps) {
  if (!steps || steps.length < 2) return null;
  let maxDrop = 0;
  let maxDropStep = null;

  for (let i = 1; i < steps.length; i++) {
    if (steps[i].dropoffRate > maxDrop) {
      maxDrop = steps[i].dropoffRate;
      maxDropStep = steps[i];
    }
  }

  return maxDropStep;
}

export default AnalyticsDashboard;
