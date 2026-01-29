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
  Download,
  LifeBuoy,
  Bug,
  Lightbulb,
  HelpCircle,
  CheckCircle,
  XCircle,
  Send,
  Eye,
  ChevronDown,
  X
} from '../../components/icons';
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

  // Support ticket state
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportFilter, setSupportFilter] = useState('all');
  const [supportTypeFilter, setSupportTypeFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketResponse, setTicketResponse] = useState('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

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
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in with admin access.');
      } else if (err.response?.status === 403) {
        setError('Admin access required. Make sure ALLOW_DEV_AUTH=true is set in your .env file and you\'ve logged in with the admin code.');
      } else {
        setError('Failed to load analytics data');
      }
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  // Fetch support tickets
  const fetchSupportTickets = useCallback(async () => {
    try {
      const params = { limit: 100 };
      if (supportFilter !== 'all') params.status = supportFilter;
      if (supportTypeFilter !== 'all') params.type = supportTypeFilter;

      const res = await api.get('/feedback/admin/support', { params });
      setSupportTickets(res.data.data?.requests || []);
    } catch (err) {
      console.error('Failed to fetch support tickets:', err);
    }
  }, [supportFilter, supportTypeFilter]);

  // Update ticket status
  const updateTicketStatus = async (ticketId, status) => {
    try {
      await api.patch(`/feedback/admin/support/${ticketId}`, { status });
      fetchSupportTickets();
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket(prev => ({ ...prev, status }));
      }
    } catch (err) {
      console.error('Failed to update ticket status:', err);
    }
  };

  // Submit response to ticket
  const submitTicketResponse = async () => {
    if (!ticketResponse.trim() || !selectedTicket) return;

    setIsSubmittingResponse(true);
    try {
      await api.post(`/feedback/admin/support/${selectedTicket.id}/respond`, {
        message: ticketResponse,
        isInternal: false
      });
      setTicketResponse('');
      // Refresh ticket to show new response
      const res = await api.get(`/feedback/support/${selectedTicket.ticket_number}`);
      setSelectedTicket(res.data.data);
      fetchSupportTickets();
    } catch (err) {
      console.error('Failed to submit response:', err);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch support tickets when tab changes or filters change
  useEffect(() => {
    if (activeTab === 'support') {
      fetchSupportTickets();
    }
  }, [activeTab, fetchSupportTickets]);

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
        <button
          className={`analytics-dashboard__tab ${activeTab === 'support' ? 'active' : ''}`}
          onClick={() => setActiveTab('support')}
        >
          <LifeBuoy size={16} />
          Support
          {supportTickets.filter(t => t.status === 'new').length > 0 && (
            <span className="analytics-dashboard__tab-badge">
              {supportTickets.filter(t => t.status === 'new').length}
            </span>
          )}
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

        {/* Support Tab */}
        {activeTab === 'support' && (
          <>
            {/* Support Stats */}
            <div className="analytics-section">
              <div className="analytics-metrics-grid">
                {renderMetricCard(
                  'Open Tickets',
                  supportTickets.filter(t => t.status === 'new' || t.status === 'in_progress').length,
                  undefined,
                  LifeBuoy,
                  supportTickets.filter(t => t.status === 'new').length > 0 ? 'warning' : 'success'
                )}
                {renderMetricCard(
                  'Bug Reports',
                  supportTickets.filter(t => t.request_type === 'bug').length,
                  undefined,
                  Bug,
                  'warning'
                )}
                {renderMetricCard(
                  'Feature Requests',
                  supportTickets.filter(t => t.request_type === 'feature').length,
                  undefined,
                  Lightbulb,
                  'info'
                )}
                {renderMetricCard(
                  'Questions',
                  supportTickets.filter(t => t.request_type === 'question').length,
                  undefined,
                  HelpCircle,
                  'primary'
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="analytics-section">
              <div className="support-filters">
                <div className="support-filter-group">
                  <label>Status:</label>
                  <select
                    value={supportFilter}
                    onChange={(e) => setSupportFilter(e.target.value)}
                    className="support-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="support-filter-group">
                  <label>Type:</label>
                  <select
                    value={supportTypeFilter}
                    onChange={(e) => setSupportTypeFilter(e.target.value)}
                    className="support-filter-select"
                  >
                    <option value="all">All Types</option>
                    <option value="bug">Bug Reports</option>
                    <option value="feature">Feature Requests</option>
                    <option value="question">Questions</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <button
                  className="support-refresh-btn"
                  onClick={fetchSupportTickets}
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Tickets List */}
            <div className="analytics-section">
              <h2 className="analytics-section__title">
                <LifeBuoy size={20} />
                Support Tickets ({supportTickets.length})
              </h2>

              {supportTickets.length === 0 ? (
                <div className="analytics-empty">
                  <CheckCircle size={32} />
                  <p>No support tickets found</p>
                </div>
              ) : (
                <div className="support-tickets-list">
                  {supportTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={`support-ticket-card ${selectedTicket?.id === ticket.id ? 'selected' : ''}`}
                      onClick={() => setSelectedTicket(ticket)}
                    >
                      <div className="support-ticket-card__header">
                        <span className={`support-ticket-type support-ticket-type--${ticket.request_type}`}>
                          {ticket.request_type === 'bug' && <Bug size={14} />}
                          {ticket.request_type === 'feature' && <Lightbulb size={14} />}
                          {ticket.request_type === 'question' && <HelpCircle size={14} />}
                          {ticket.request_type === 'other' && <MessageSquare size={14} />}
                          {ticket.request_type}
                        </span>
                        <span className={`support-ticket-status support-ticket-status--${ticket.status}`}>
                          {ticket.status === 'new' && 'New'}
                          {ticket.status === 'in_progress' && 'In Progress'}
                          {ticket.status === 'resolved' && 'Resolved'}
                        </span>
                      </div>

                      <div className="support-ticket-card__body">
                        <span className="support-ticket-number">{ticket.ticket_number}</span>
                        <h4 className="support-ticket-subject">{ticket.subject}</h4>
                        <p className="support-ticket-preview">
                          {ticket.description?.substring(0, 120)}
                          {ticket.description?.length > 120 ? '...' : ''}
                        </p>
                      </div>

                      <div className="support-ticket-card__footer">
                        <span className="support-ticket-meta">
                          {ticket.user_email || 'Anonymous'}
                        </span>
                        <span className="support-ticket-time">
                          {formatTimeAgo(ticket.created_at)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ticket Detail Modal */}
            {selectedTicket && (
              <div className="support-ticket-modal-overlay" onClick={() => setSelectedTicket(null)}>
                <div className="support-ticket-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="support-ticket-modal__header">
                    <div className="support-ticket-modal__title-row">
                      <span className={`support-ticket-type support-ticket-type--${selectedTicket.request_type}`}>
                        {selectedTicket.request_type === 'bug' && <Bug size={14} />}
                        {selectedTicket.request_type === 'feature' && <Lightbulb size={14} />}
                        {selectedTicket.request_type === 'question' && <HelpCircle size={14} />}
                        {selectedTicket.request_type === 'other' && <MessageSquare size={14} />}
                        {selectedTicket.request_type}
                      </span>
                      <span className="support-ticket-number">{selectedTicket.ticket_number}</span>
                    </div>
                    <button
                      className="support-ticket-modal__close"
                      onClick={() => setSelectedTicket(null)}
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="support-ticket-modal__body">
                    <h3 className="support-ticket-modal__subject">{selectedTicket.subject}</h3>

                    <div className="support-ticket-modal__meta">
                      <span>From: {selectedTicket.user_email || selectedTicket.email || 'Anonymous'}</span>
                      <span>Created: {new Date(selectedTicket.created_at).toLocaleString()}</span>
                      {selectedTicket.page && <span>Page: {selectedTicket.page}</span>}
                    </div>

                    <div className="support-ticket-modal__description">
                      <h4>Description</h4>
                      <p>{selectedTicket.description}</p>
                    </div>

                    {selectedTicket.debug_info && (
                      <div className="support-ticket-modal__debug">
                        <h4>Debug Info</h4>
                        <pre>{JSON.stringify(JSON.parse(selectedTicket.debug_info), null, 2)}</pre>
                      </div>
                    )}

                    {/* Responses */}
                    {selectedTicket.responses?.length > 0 && (
                      <div className="support-ticket-modal__responses">
                        <h4>Responses</h4>
                        {selectedTicket.responses.map((response) => (
                          <div key={response.id} className={`support-response support-response--${response.responder_type}`}>
                            <div className="support-response__header">
                              <span className="support-response__author">
                                {response.responder_type === 'admin' ? 'Support Team' : 'User'}
                              </span>
                              <span className="support-response__time">
                                {formatTimeAgo(response.created_at)}
                              </span>
                            </div>
                            <p className="support-response__message">{response.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply Form */}
                    <div className="support-ticket-modal__reply">
                      <h4>Reply</h4>
                      <textarea
                        value={ticketResponse}
                        onChange={(e) => setTicketResponse(e.target.value)}
                        placeholder="Type your response..."
                        rows={4}
                      />
                      <button
                        className="support-reply-btn"
                        onClick={submitTicketResponse}
                        disabled={!ticketResponse.trim() || isSubmittingResponse}
                      >
                        <Send size={14} />
                        {isSubmittingResponse ? 'Sending...' : 'Send Response'}
                      </button>
                    </div>
                  </div>

                  <div className="support-ticket-modal__footer">
                    <div className="support-ticket-modal__status-actions">
                      <span>Update Status:</span>
                      <button
                        className={`support-status-btn ${selectedTicket.status === 'new' ? 'active' : ''}`}
                        onClick={() => updateTicketStatus(selectedTicket.id, 'new')}
                      >
                        New
                      </button>
                      <button
                        className={`support-status-btn ${selectedTicket.status === 'in_progress' ? 'active' : ''}`}
                        onClick={() => updateTicketStatus(selectedTicket.id, 'in_progress')}
                      >
                        In Progress
                      </button>
                      <button
                        className={`support-status-btn support-status-btn--resolve ${selectedTicket.status === 'resolved' ? 'active' : ''}`}
                        onClick={() => updateTicketStatus(selectedTicket.id, 'resolved')}
                      >
                        <CheckCircle size={14} />
                        Resolved
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
