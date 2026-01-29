// frontend/src/components/updates/UpdateSystemPanel.js
/**
 * Centralized Update System Management Panel
 *
 * Provides UI for managing all update jobs:
 * - View and toggle bundles/jobs
 * - Trigger manual runs
 * - View execution history
 * - Monitor queue and progress
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  RefreshCw,
  Clock,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Zap,
  Calendar,
  History as HistoryIcon,
  TrendingUp,
  BarChart2,
  Layers,
  Globe,
  MessageCircle,
  Brain,
  FileText,
  Database
} from '../icons';
import './UpdateSystemPanel.css';

// Bundle name to Prism icon mapping
const BUNDLE_ICONS = {
  prices: TrendingUp,
  fundamentals: BarChart2,
  etf: Layers,
  market: Globe,
  sentiment: MessageCircle,
  knowledge: Brain,
  sec: FileText,
  maintenance: Settings,
  default: Database
};

// API calls
const API_BASE = '/api/update-system';

async function fetchAPI(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Format duration
function formatDuration(startStr, endStr) {
  if (!startStr || !endStr) return '-';
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// Status badge component
function StatusBadge({ status }) {
  const config = {
    completed: { icon: CheckCircle, className: 'status-completed', label: 'Completed' },
    running: { icon: RefreshCw, className: 'status-running', label: 'Running' },
    failed: { icon: AlertCircle, className: 'status-failed', label: 'Failed' },
    pending: { icon: Clock, className: 'status-pending', label: 'Pending' },
    idle: { icon: Clock, className: 'status-idle', label: 'Idle' }
  };

  const { icon: Icon, className, label } = config[status] || config.idle;

  return (
    <span className={`update-status-badge ${className}`}>
      <Icon size={12} className={status === 'running' ? 'spinning' : ''} />
      {label}
    </span>
  );
}

// Progress bar
function ProgressBar({ progress, message }) {
  return (
    <div className="update-progress-bar">
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${progress || 0}%` }}
        />
      </div>
      <div className="progress-info">
        <span className="progress-percent">{Math.round(progress || 0)}%</span>
        {message && <span className="progress-message">{message}</span>}
      </div>
    </div>
  );
}

// Toggle switch
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      className={`toggle-switch ${checked ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-knob" />
    </button>
  );
}

// Bundle card
function BundleCard({ bundle, jobs, onToggle, onRunBundle, onRunJob, expanded, onToggleExpand }) {
  const bundleJobs = jobs.filter(j => j.bundle_name === bundle.name);
  const runningJobs = bundleJobs.filter(j => j.status === 'running');
  const hasRunning = runningJobs.length > 0;

  return (
    <div className={`bundle-card ${expanded ? 'expanded' : ''}`}>
      <div className="bundle-header" onClick={onToggleExpand}>
        <div className="bundle-expand">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        <div className="bundle-icon" style={{ backgroundColor: getBundleColor(bundle.name) }}>
          {(() => { const BundleIcon = getBundleIcon(bundle.name); return <BundleIcon size={20} />; })()}
        </div>

        <div className="bundle-info">
          <h4>{bundle.display_name}</h4>
          <span className="bundle-description">{bundle.description}</span>
        </div>

        <div className="bundle-stats">
          <span className="job-count">{bundleJobs.length} jobs</span>
          {hasRunning && <span className="running-indicator"><RefreshCw size={12} className="spinning" /> {runningJobs.length}</span>}
        </div>

        <div className="bundle-toggle" onClick={e => e.stopPropagation()}>
          <span className="toggle-label">Auto</span>
          <ToggleSwitch
            checked={bundle.automatic === 1}
            onChange={(val) => onToggle(bundle.name, val)}
          />
        </div>

        <button
          className="btn-icon run-bundle"
          onClick={(e) => { e.stopPropagation(); onRunBundle(bundle.name); }}
          disabled={hasRunning}
          title="Run all jobs in bundle"
        >
          <Play size={14} />
        </button>
      </div>

      {expanded && (
        <div className="bundle-jobs">
          {bundleJobs.map(job => (
            <JobRow
              key={job.job_key}
              job={job}
              onRun={() => onRunJob(job.job_key)}
              onToggle={(val) => onToggle(job.job_key, val, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Job row
function JobRow({ job, onRun, onToggle }) {
  const isRunning = job.status === 'running';
  const lastRun = job.last_run;

  return (
    <div className={`job-row ${isRunning ? 'running' : ''}`}>
      <div className="job-key">{job.display_name}</div>

      <div className="job-schedule">
        <Calendar size={12} />
        <span>{job.cron_expression || 'Manual'}</span>
      </div>

      <div className="job-last-run">
        {lastRun ? (
          <>
            <StatusBadge status={lastRun.status} />
            <span className="last-run-time">{formatDate(lastRun.completed_at || lastRun.started_at)}</span>
          </>
        ) : (
          <span className="never-run">Never run</span>
        )}
      </div>

      {isRunning && lastRun?.progress !== undefined && (
        <div className="job-progress">
          <ProgressBar progress={lastRun.progress} message={lastRun.progress_message} />
        </div>
      )}

      <div className="job-actions">
        <ToggleSwitch
          checked={job.automatic === 1}
          onChange={onToggle}
          disabled={isRunning}
        />
        <button
          className="btn-icon"
          onClick={onRun}
          disabled={isRunning}
          title="Run now"
        >
          {isRunning ? <RefreshCw size={14} className="spinning" /> : <Play size={14} />}
        </button>
      </div>
    </div>
  );
}

// Run history table
function RunHistory({ runs, loading }) {
  if (loading) {
    return <div className="loading-placeholder">Loading history...</div>;
  }

  if (!runs || runs.length === 0) {
    return <div className="empty-state">No execution history yet</div>;
  }

  return (
    <div className="run-history">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => (
            <tr key={run.id} className={`run-row status-${run.status}`}>
              <td className="run-job">{run.job_display_name || run.job_key}</td>
              <td><StatusBadge status={run.status} /></td>
              <td className="run-time">{formatDate(run.started_at)}</td>
              <td className="run-duration">{formatDuration(run.started_at, run.completed_at)}</td>
              <td className="run-items">
                {run.items_updated !== null ? `${run.items_updated}/${run.items_total}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Queue panel
function QueuePanel({ queue, onCancel }) {
  if (!queue || queue.length === 0) {
    return null;
  }

  return (
    <div className="queue-panel">
      <h4>
        <Zap size={14} />
        Queue ({queue.length})
      </h4>
      <div className="queue-items">
        {queue.map(item => (
          <div key={item.id} className="queue-item">
            <span className="queue-job">{item.job_display_name || item.job_key}</span>
            <span className="queue-trigger">{item.trigger_type}</span>
            <StatusBadge status={item.status} />
            {item.status === 'pending' && (
              <button
                className="btn-icon btn-cancel"
                onClick={() => onCancel(item.id)}
                title="Cancel"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Helpers
function getBundleColor(name) {
  const colors = {
    prices: '#2563EB',
    fundamentals: '#7C3AED',
    etf: '#0891B2',
    market: '#059669',
    sentiment: '#D97706',
    knowledge: '#7C3AED',
    sec: '#7C3AED',
    maintenance: '#94A3B8'
  };
  return colors[name] || '#94A3B8';
}

function getBundleIcon(name) {
  return BUNDLE_ICONS[name] || BUNDLE_ICONS.default;
}

// Main component
function UpdateSystemPanel() {
  const [status, setStatus] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBundles, setExpandedBundles] = useState(new Set());
  const [activeTab, setActiveTab] = useState('bundles');
  const [schedulerAction, setSchedulerAction] = useState(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [statusData, bundlesData, jobsData, runsData, queueData] = await Promise.all([
        fetchAPI('/status'),
        fetchAPI('/bundles'),
        fetchAPI('/jobs'),
        fetchAPI('/runs?limit=20'),
        fetchAPI('/queue')
      ]);

      setStatus(statusData);
      setBundles(bundlesData.bundles || []);
      setJobs(jobsData.jobs || []);
      setRuns(runsData.runs || []);
      setQueue(queueData.queue || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll for updates
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Toggle bundle/job automatic
  const handleToggle = async (key, value, isJob = false) => {
    try {
      if (isJob) {
        await fetchAPI(`/jobs/${key}`, {
          method: 'PATCH',
          body: JSON.stringify({ automatic: value })
        });
      } else {
        await fetchAPI(`/bundles/${key}`, {
          method: 'PATCH',
          body: JSON.stringify({ automatic: value })
        });
      }
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Run a job
  const handleRunJob = async (jobKey) => {
    try {
      await fetchAPI(`/jobs/${jobKey}/run`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Run all jobs in a bundle
  const handleRunBundle = async (bundleName) => {
    try {
      await fetchAPI(`/bundles/${bundleName}/run`, {
        method: 'POST',
        body: JSON.stringify({ sequential: true })
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Cancel queue item
  const handleCancelQueue = async (id) => {
    try {
      await fetchAPI(`/queue/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Start/stop scheduler
  const handleSchedulerAction = async (action) => {
    try {
      setSchedulerAction(action);
      await fetchAPI(`/${action}`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSchedulerAction(null);
    }
  };

  // Toggle bundle expansion
  const toggleBundleExpand = (name) => {
    setExpandedBundles(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="update-system-panel loading">
        <RefreshCw size={24} className="spinning" />
        <span>Loading update system...</span>
      </div>
    );
  }

  return (
    <div className="update-system-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="header-left">
          <h3>
            <Settings size={20} />
            Centralized Update System
          </h3>
          <span className={`scheduler-status ${status?.scheduler_running ? 'running' : 'stopped'}`}>
            {status?.scheduler_running ? 'Scheduler Running' : 'Scheduler Stopped'}
          </span>
        </div>

        <div className="header-actions">
          {status?.scheduler_running ? (
            <button
              className="btn-secondary"
              onClick={() => handleSchedulerAction('stop')}
              disabled={schedulerAction === 'stop'}
            >
              <Pause size={14} />
              {schedulerAction === 'stop' ? 'Stopping...' : 'Stop Scheduler'}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => handleSchedulerAction('start')}
              disabled={schedulerAction === 'start'}
            >
              <Play size={14} />
              {schedulerAction === 'start' ? 'Starting...' : 'Start Scheduler'}
            </button>
          )}

          <button className="btn-icon" onClick={loadData} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Status summary */}
      <div className="status-summary">
        <div className="status-item">
          <span className="status-value">{status?.running_jobs || 0}</span>
          <span className="status-label">Running</span>
        </div>
        <div className="status-item">
          <span className="status-value">{status?.pending_queue || 0}</span>
          <span className="status-label">Queued</span>
        </div>
        <div className="status-item">
          <span className="status-value">{status?.recent_failures?.length || 0}</span>
          <span className="status-label">Failures (24h)</span>
        </div>
        <div className="status-item">
          <span className="status-value">{bundles.length}</span>
          <span className="status-label">Bundles</span>
        </div>
      </div>

      {/* Queue */}
      <QueuePanel queue={queue} onCancel={handleCancelQueue} />

      {/* Tabs */}
      <div className="panel-tabs">
        <button
          className={activeTab === 'bundles' ? 'active' : ''}
          onClick={() => setActiveTab('bundles')}
        >
          <Settings size={14} />
          Bundles & Jobs
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          <HistoryIcon size={14} />
          History
        </button>
      </div>

      {/* Tab content */}
      <div className="panel-content">
        {activeTab === 'bundles' && (
          <div className="bundles-list">
            {bundles.map(bundle => (
              <BundleCard
                key={bundle.name}
                bundle={bundle}
                jobs={jobs}
                onToggle={handleToggle}
                onRunBundle={handleRunBundle}
                onRunJob={handleRunJob}
                expanded={expandedBundles.has(bundle.name)}
                onToggleExpand={() => toggleBundleExpand(bundle.name)}
              />
            ))}
          </div>
        )}

        {activeTab === 'history' && (
          <RunHistory runs={runs} loading={false} />
        )}
      </div>

      {/* Recent failures warning */}
      {status?.recent_failures?.length > 0 && (
        <div className="failures-warning">
          <AlertCircle size={14} />
          <strong>Recent Failures:</strong>
          {status.recent_failures.slice(0, 3).map((f, i) => (
            <span key={i} className="failure-item">
              {f.job_key} ({formatDate(f.started_at)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default UpdateSystemPanel;
