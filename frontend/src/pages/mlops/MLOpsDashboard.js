// frontend/src/pages/mlops/MLOpsDashboard.js
// Unified MLOps Dashboard - Model Registry, Training, Drift Monitoring, Comparison

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Database,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Play,
  Pause,
  BarChart3,
  GitBranch,
  Cpu,
  Zap,
  Award,
  Target,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ArrowLeftRight,
  IconButton
} from '../../components/icons';
import { PageHeader } from '../../components/ui';
import { mlopsAPI } from '../../services/api';
import './MLOpsDashboard.css';

// ============================================================================
// STATUS BADGE COMPONENTS
// ============================================================================

const StatusBadge = ({ status }) => {
  const config = {
    production: { icon: CheckCircle, className: 'status--production', label: 'Production' },
    staged: { icon: Clock, className: 'status--staged', label: 'Staged' },
    deprecated: { icon: XCircle, className: 'status--deprecated', label: 'Deprecated' },
    training: { icon: RefreshCw, className: 'status--training', label: 'Training' },
    ok: { icon: CheckCircle, className: 'status--ok', label: 'Healthy' },
    warning: { icon: AlertTriangle, className: 'status--warning', label: 'Warning' },
    critical: { icon: XCircle, className: 'status--critical', label: 'Critical' }
  };

  const { icon: Icon, className, label } = config[status] || config.staged;

  return (
    <span className={`mlops-status-badge ${className}`}>
      <Icon size={14} />
      {label}
    </span>
  );
};

const MetricCard = ({ title, value, subtitle, icon: Icon, trend, status, colorScheme = 'analytics' }) => (
  <div className={`mlops-metric-card ${status ? `mlops-metric-card--${status}` : ''}`}>
    <IconButton icon={Icon} colorScheme={colorScheme} size="small" className="mlops-metric-card__icon-btn" />
    <div className="mlops-metric-card__content">
      <span className="mlops-metric-card__value">{value}</span>
      <span className="mlops-metric-card__title">{title}</span>
      {subtitle && <span className="mlops-metric-card__subtitle">{subtitle}</span>}
    </div>
    {trend !== undefined && (
      <div className={`mlops-metric-card__trend ${trend >= 0 ? 'positive' : 'negative'}`}>
        {trend >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        {Math.abs(trend).toFixed(1)}%
      </div>
    )}
  </div>
);

// ============================================================================
// MODEL REGISTRY PANEL
// ============================================================================

const ModelRegistryPanel = ({ models, onPromote, onRefresh, loading }) => {
  const [expandedModel, setExpandedModel] = useState(null);

  if (!models || models.length === 0) {
    return (
      <div className="mlops-panel">
        <div className="mlops-panel__header">
          <h3><Database size={18} /> Model Registry</h3>
          <button onClick={onRefresh} disabled={loading} className="mlops-refresh-btn">
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>
        <div className="mlops-empty-state">
          <Database size={32} />
          <p>No models registered yet</p>
          <span>Train a model to see it here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mlops-panel">
      <div className="mlops-panel__header">
        <h3><Database size={18} /> Model Registry</h3>
        <button onClick={onRefresh} disabled={loading} className="mlops-refresh-btn">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>
      <div className="mlops-model-list">
        {models.map(model => (
          <div key={model.name} className="mlops-model-item">
            <div
              className="mlops-model-item__header"
              onClick={() => setExpandedModel(expandedModel === model.name ? null : model.name)}
            >
              <div className="mlops-model-item__info">
                <span className="mlops-model-item__name">{model.name}</span>
                <span className="mlops-model-item__type">{model.modelType || 'deep_learning'}</span>
              </div>
              <div className="mlops-model-item__status">
                <StatusBadge status={model.productionVersion ? 'production' : 'staged'} />
                <span className="mlops-model-item__versions">
                  {model.versions?.length || 0} version{model.versions?.length !== 1 ? 's' : ''}
                </span>
                {expandedModel === model.name ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {expandedModel === model.name && model.versions && (
              <div className="mlops-model-item__versions-list">
                {model.versions.slice(0, 5).map(version => (
                  <div key={version.version} className="mlops-version-row">
                    <span className="mlops-version-row__version">{version.version}</span>
                    <div className="mlops-version-row__metrics">
                      {version.metrics?.ic && (
                        <span title="Information Coefficient">IC: {version.metrics.ic.toFixed(3)}</span>
                      )}
                      {version.metrics?.directionAccuracy && (
                        <span title="Direction Accuracy">
                          Dir: {(version.metrics.directionAccuracy * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <StatusBadge status={version.status} />
                    {version.status === 'staged' && onPromote && (
                      <button
                        className="mlops-promote-btn"
                        onClick={() => onPromote(model.name, version.version)}
                      >
                        Promote
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// TRAINING STATUS PANEL (GAP 1 - Fixed to use backend API)
// ============================================================================

const TrainingStatusPanel = ({ trainingJobs, onStartTraining, loading, onRefresh }) => {
  const [selectedModel, setSelectedModel] = useState('lstm');
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingConfig, setTrainingConfig] = useState({
    epochs: 50,
    walkForward: true,
    autoRegister: true,
    autoPromote: false,
    maxSymbols: 500,
    symbols: '',  // Empty = use all available
    startDate: '2015-01-01'
  });

  const handleStartTraining = async () => {
    setIsTraining(true);
    setTrainingStatus({ status: 'starting', message: 'Initiating training...' });

    try {
      const result = await onStartTraining(selectedModel, trainingConfig);
      if (result?.success) {
        setTrainingStatus({
          status: 'running',
          message: `Training ${selectedModel} model started. Job ID: ${result.jobId || 'pending'}`,
          jobId: result.jobId
        });
      } else {
        setTrainingStatus({
          status: 'error',
          message: result?.error || result?.message || 'Failed to start training'
        });
        setIsTraining(false);
      }
    } catch (err) {
      setTrainingStatus({ status: 'error', message: err.message });
      setIsTraining(false);
    }
  };

  return (
    <div className="mlops-panel">
      <div className="mlops-panel__header">
        <h3><Cpu size={18} /> Training</h3>
        {onRefresh && (
          <button onClick={onRefresh} disabled={loading} className="mlops-refresh-btn">
            <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          </button>
        )}
      </div>

      <div className="mlops-training-config">
        <div className="mlops-training-row">
          <label>
            Model Type
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              disabled={isTraining}
            >
              <option value="lstm">LSTM</option>
              <option value="tft">Temporal Fusion Transformer</option>
              <option value="ensemble">Ensemble</option>
            </select>
          </label>
          <label>
            Epochs
            <input
              type="number"
              value={trainingConfig.epochs}
              onChange={e => setTrainingConfig(prev => ({ ...prev, epochs: parseInt(e.target.value) || 50 }))}
              min="10"
              max="500"
              disabled={isTraining}
            />
          </label>
        </div>

        {/* Dataset Selection */}
        <div className="mlops-training-row">
          <label>
            Start Date
            <input
              type="date"
              value={trainingConfig.startDate}
              onChange={e => setTrainingConfig(prev => ({ ...prev, startDate: e.target.value }))}
              disabled={isTraining}
            />
          </label>
          <label>
            Max Symbols
            <input
              type="number"
              value={trainingConfig.maxSymbols}
              onChange={e => setTrainingConfig(prev => ({ ...prev, maxSymbols: parseInt(e.target.value) || 500 }))}
              min="10"
              max="5000"
              disabled={isTraining}
            />
          </label>
        </div>

        <div className="mlops-training-row mlops-training-row--full">
          <label>
            Specific Symbols (optional, comma-separated)
            <input
              type="text"
              placeholder="AAPL, MSFT, GOOGL... (leave empty for all)"
              value={trainingConfig.symbols}
              onChange={e => setTrainingConfig(prev => ({ ...prev, symbols: e.target.value }))}
              disabled={isTraining}
            />
          </label>
        </div>

        <div className="mlops-training-options">
          <label className="mlops-checkbox">
            <input
              type="checkbox"
              checked={trainingConfig.walkForward}
              onChange={e => setTrainingConfig(prev => ({ ...prev, walkForward: e.target.checked }))}
              disabled={isTraining}
            />
            Walk-Forward Validation
          </label>
          <label className="mlops-checkbox">
            <input
              type="checkbox"
              checked={trainingConfig.autoRegister}
              onChange={e => setTrainingConfig(prev => ({ ...prev, autoRegister: e.target.checked }))}
              disabled={isTraining}
            />
            Auto-Register on Completion
          </label>
          <label className="mlops-checkbox">
            <input
              type="checkbox"
              checked={trainingConfig.autoPromote}
              onChange={e => setTrainingConfig(prev => ({ ...prev, autoPromote: e.target.checked }))}
              disabled={isTraining}
            />
            Auto-Promote if Validation Passes
          </label>
        </div>

        <div className="mlops-training-actions">
          <button
            className="mlops-action-btn mlops-action-btn--primary"
            onClick={handleStartTraining}
            disabled={loading || isTraining}
          >
            <Play size={16} />
            {isTraining ? 'Training...' : 'Start Training'}
          </button>
          {isTraining && (
            <button
              className="mlops-action-btn mlops-action-btn--secondary"
              onClick={() => { setIsTraining(false); setTrainingStatus(null); }}
            >
              <Pause size={16} />
              Dismiss
            </button>
          )}
        </div>

        {/* Training Status Message */}
        {trainingStatus && (
          <div className={`mlops-training-status mlops-training-status--${trainingStatus.status}`}>
            {trainingStatus.status === 'running' && <RefreshCw size={14} className="spinning" />}
            {trainingStatus.status === 'error' && <XCircle size={14} />}
            {trainingStatus.status === 'starting' && <Clock size={14} />}
            <span>{trainingStatus.message}</span>
          </div>
        )}
      </div>

      {trainingJobs && trainingJobs.length > 0 && (
        <div className="mlops-health-list">
          <h4>Recent Training Jobs</h4>
          {trainingJobs.map((job, idx) => (
            <div key={idx} className="mlops-health-item">
              <div className="mlops-health-item__info">
                <span className="mlops-health-item__name">{job.name || job.modelName}</span>
                <span className="mlops-health-item__metrics">
                  {job.createdAt ? new Date(job.createdAt).toLocaleString() : ''}
                  {job.elapsed ? ` • ${Math.round(job.elapsed)}s` : ''}
                </span>
              </div>
              <StatusBadge status={job.success ? 'ok' : (job.status === 'running' ? 'training' : 'critical')} />
            </div>
          ))}
        </div>
      )}

      <div className="mlops-training-info">
        <Zap size={14} />
        <span>Training runs via backend API and auto-registers models on completion.</span>
      </div>
    </div>
  );
};

// ============================================================================
// MODEL COMPARISON PANEL (GAP 5 - Fixed to fetch versions properly)
// ============================================================================

const ModelComparisonPanel = ({ models, onCompare, onLoadVersions }) => {
  const [modelA, setModelA] = useState(null);
  const [modelB, setModelB] = useState(null);
  const [allVersions, setAllVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Load versions for all models when models change
  useEffect(() => {
    const loadAllVersions = async () => {
      if (!models || models.length === 0 || !onLoadVersions) {
        setAllVersions([]);
        return;
      }

      setLoadingVersions(true);
      try {
        const versionsPromises = models.map(async (m) => {
          const modelName = m.model_name || m.name;
          try {
            const versions = await onLoadVersions(modelName);
            return (versions || []).map(v => ({
              ...v,
              modelName,
              displayName: `${modelName} - ${v.version}`
            }));
          } catch (e) {
            console.warn(`Failed to load versions for ${modelName}:`, e);
            return [];
          }
        });

        const results = await Promise.all(versionsPromises);
        setAllVersions(results.flat());
      } catch (e) {
        console.error('Failed to load model versions:', e);
      } finally {
        setLoadingVersions(false);
      }
    };

    loadAllVersions();
  }, [models, onLoadVersions]);

  const handleCompare = async () => {
    if (modelA && modelB && onCompare) {
      await onCompare(modelA, modelB);
    }
  };

  const formatMetric = (value, type) => {
    if (value === null || value === undefined) return 'N/A';
    if (type === 'percentage') return `${(value * 100).toFixed(1)}%`;
    if (type === 'decimal') return value.toFixed(4);
    return value.toFixed(2);
  };

  const getComparisonClass = (a, b, higherIsBetter = true) => {
    if (a === null || b === null || a === undefined || b === undefined) return '';
    if (higherIsBetter) {
      return a > b ? 'better' : a < b ? 'worse' : '';
    }
    return a < b ? 'better' : a > b ? 'worse' : '';
  };

  return (
    <div className="mlops-comparison-panel">
      <div className="mlops-panel__header">
        <h3><ArrowLeftRight size={18} /> Model Comparison</h3>
        {loadingVersions && <RefreshCw size={14} className="spinning" />}
      </div>

      <div className="mlops-comparison-selector">
        <label>
          <span>Model A</span>
          <select
            value={modelA?.displayName || ''}
            onChange={e => setModelA(allVersions.find(v => v.displayName === e.target.value))}
            disabled={loadingVersions}
          >
            <option value="">
              {loadingVersions ? 'Loading...' : allVersions.length === 0 ? 'No versions available' : 'Select model...'}
            </option>
            {allVersions.map(v => (
              <option key={v.displayName} value={v.displayName}>
                {v.displayName} {v.status === 'production' ? '(prod)' : v.status === 'staged' ? '(staged)' : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="mlops-comparison-vs">VS</div>

        <label>
          <span>Model B</span>
          <select
            value={modelB?.displayName || ''}
            onChange={e => setModelB(allVersions.find(v => v.displayName === e.target.value))}
            disabled={loadingVersions}
          >
            <option value="">
              {loadingVersions ? 'Loading...' : allVersions.length === 0 ? 'No versions available' : 'Select model...'}
            </option>
            {allVersions.map(v => (
              <option key={v.displayName} value={v.displayName}>
                {v.displayName} {v.status === 'production' ? '(prod)' : v.status === 'staged' ? '(staged)' : ''}
              </option>
            ))}
          </select>
        </label>

        <button
          className="mlops-compare-btn"
          onClick={handleCompare}
          disabled={!modelA || !modelB}
        >
          Compare
        </button>
      </div>

      {(modelA || modelB) && (
        <div className="mlops-comparison-results">
          <div className="mlops-comparison-model">
            <h4>{modelA?.displayName || 'Model A'} <StatusBadge status={modelA?.status || 'staged'} /></h4>
            <div className="mlops-comparison-metrics">
              <div className="mlops-comparison-metric">
                <span>IC (Information Coefficient)</span>
                <span className={getComparisonClass(modelA?.metrics?.ic, modelB?.metrics?.ic)}>
                  {formatMetric(modelA?.metrics?.ic, 'decimal')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Direction Accuracy</span>
                <span className={getComparisonClass(modelA?.metrics?.directionAccuracy, modelB?.metrics?.directionAccuracy)}>
                  {formatMetric(modelA?.metrics?.directionAccuracy, 'percentage')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Walk-Forward Efficiency</span>
                <span className={getComparisonClass(modelA?.metrics?.walkForwardEfficiency, modelB?.metrics?.walkForwardEfficiency)}>
                  {formatMetric(modelA?.metrics?.walkForwardEfficiency, 'percentage')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Test Sharpe</span>
                <span className={getComparisonClass(modelA?.metrics?.testSharpe, modelB?.metrics?.testSharpe)}>
                  {formatMetric(modelA?.metrics?.testSharpe, 'decimal')}
                </span>
              </div>
            </div>
          </div>
          <div className="mlops-comparison-model">
            <h4>{modelB?.displayName || 'Model B'} <StatusBadge status={modelB?.status || 'staged'} /></h4>
            <div className="mlops-comparison-metrics">
              <div className="mlops-comparison-metric">
                <span>IC (Information Coefficient)</span>
                <span className={getComparisonClass(modelB?.metrics?.ic, modelA?.metrics?.ic)}>
                  {formatMetric(modelB?.metrics?.ic, 'decimal')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Direction Accuracy</span>
                <span className={getComparisonClass(modelB?.metrics?.directionAccuracy, modelA?.metrics?.directionAccuracy)}>
                  {formatMetric(modelB?.metrics?.directionAccuracy, 'percentage')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Walk-Forward Efficiency</span>
                <span className={getComparisonClass(modelB?.metrics?.walkForwardEfficiency, modelA?.metrics?.walkForwardEfficiency)}>
                  {formatMetric(modelB?.metrics?.walkForwardEfficiency, 'percentage')}
                </span>
              </div>
              <div className="mlops-comparison-metric">
                <span>Test Sharpe</span>
                <span className={getComparisonClass(modelB?.metrics?.testSharpe, modelA?.metrics?.testSharpe)}>
                  {formatMetric(modelB?.metrics?.testSharpe, 'decimal')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!modelA && !modelB && allVersions.length > 0 && (
        <div className="mlops-comparison-empty">
          <ArrowLeftRight size={24} />
          <p>Select two model versions to compare their metrics</p>
        </div>
      )}

      {!loadingVersions && allVersions.length === 0 && (
        <div className="mlops-comparison-empty">
          <Database size={24} />
          <p>No model versions available</p>
          <span>Train and register models to compare them</span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// DRIFT MONITORING SUMMARY PANEL
// ============================================================================

const DriftSummaryPanel = ({ driftData, onRunHealthCheck, loading }) => {
  const modelStatuses = driftData?.modelStatuses || {};
  const modelNames = Object.keys(modelStatuses);

  return (
    <div className="mlops-panel">
      <div className="mlops-panel__header">
        <h3><Activity size={18} /> Model Health</h3>
        <button onClick={onRunHealthCheck} disabled={loading} className="mlops-refresh-btn">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          Run All Checks
        </button>
      </div>

      {modelNames.length === 0 ? (
        <div className="mlops-empty-state">
          <Activity size={32} />
          <p>No models being monitored</p>
          <span>Register models to start drift monitoring</span>
        </div>
      ) : (
        <>
          <div className="mlops-drift-summary">
            <span><strong>{driftData?.totalModelsMonitored || 0}</strong> Models Monitored</span>
            <span><strong>{driftData?.criticalAlerts || 0}</strong> Critical Alerts</span>
            <span><strong>{driftData?.warningAlerts || 0}</strong> Warnings</span>
          </div>

          <div className="mlops-health-list">
            {modelNames.map(name => {
              const status = modelStatuses[name];
              return (
                <div key={name} className="mlops-health-item">
                  <div className="mlops-health-item__info">
                    <span className="mlops-health-item__name">{name}</span>
                    <StatusBadge status={status?.status || 'no_data'} />
                  </div>
                  <div className="mlops-health-item__metrics">
                    <span>IC: {status?.ic?.toFixed(3) || 'N/A'}</span>
                    <span>Dir: {status?.directionAccuracy ? `${(status.directionAccuracy * 100).toFixed(1)}%` : 'N/A'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <a href="/settings?tab=drift" className="mlops-drift-link">
            View Full Drift Dashboard <ExternalLink size={14} />
          </a>
        </>
      )}
    </div>
  );
};

// ============================================================================
// PREDICTIONS SUMMARY PANEL
// ============================================================================

const PredictionsSummaryPanel = ({ predictions, onUpdateActuals, loading }) => {
  return (
    <div className="mlops-panel">
      <div className="mlops-panel__header">
        <h3><Target size={18} /> Predictions</h3>
        <button onClick={onUpdateActuals} disabled={loading} className="mlops-refresh-btn">
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
          Update Actuals
        </button>
      </div>

      {!predictions || predictions.length === 0 ? (
        <div className="mlops-empty-state">
          <Target size={32} />
          <p>No predictions logged yet</p>
          <span>Predictions are logged automatically during inference</span>
        </div>
      ) : (
        <div className="mlops-predictions-list">
          {predictions.map((pred, idx) => (
            <div key={idx} className="mlops-prediction-item">
              <div className="mlops-prediction-item__info">
                <span className="mlops-prediction-item__model">{pred.model_name}</span>
                <span className="mlops-prediction-item__count">
                  {pred.total_predictions} predictions
                </span>
              </div>
              <div className="mlops-prediction-item__metrics">
                <span>
                  With actuals: {pred.predictions_with_actuals || 0}
                </span>
                {pred.direction_accuracy && (
                  <span className={pred.direction_accuracy > 0.5 ? 'positive' : 'negative'}>
                    Accuracy: {(pred.direction_accuracy * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

function MLOpsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [driftData, setDriftData] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [trainingJobs, setTrainingJobs] = useState([]);
  const [schedulerStatus, setSchedulerStatus] = useState(null);

  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [modelsRes, driftRes, predictionsRes, schedulerRes] = await Promise.all([
        mlopsAPI.getModels().catch(() => ({ data: { success: false } })),
        mlopsAPI.getDriftDashboard().catch(() => ({ data: { success: false } })),
        mlopsAPI.getPredictionsSummary().catch(() => ({ data: { success: false } })),
        mlopsAPI.getSchedulerStatus().catch(() => ({ data: { success: false } }))
      ]);

      if (modelsRes.data?.success) {
        setModels(modelsRes.data.models || []);
      }

      if (driftRes.data?.success) {
        setDriftData(driftRes.data.data);
      }

      if (predictionsRes.data?.success) {
        setPredictions(predictionsRes.data.data || []);
      }

      if (schedulerRes.data?.success !== false) {
        setSchedulerStatus(schedulerRes.data);
        // Extract recent jobs for training panel
        setTrainingJobs(schedulerRes.data.recentJobs || []);
      }
    } catch (err) {
      console.error('MLOps dashboard error:', err);
      setError(err.message || 'Failed to load MLOps data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Action handlers
  const handlePromoteModel = async (modelName, version) => {
    try {
      await mlopsAPI.promoteModel(modelName, version);
      loadData();
    } catch (err) {
      console.error('Failed to promote model:', err);
    }
  };

  // Start training via backend API
  const handleStartTraining = async (modelType, config) => {
    try {
      // Build job config for the retraining scheduler
      const jobConfig = {
        modelType,
        epochs: config.epochs,
        walkForward: config.walkForward,
        autoRegister: config.autoRegister,
        autoPromote: config.autoPromote,
        maxSymbols: config.maxSymbols,
        symbols: config.symbols ? config.symbols.split(',').map(s => s.trim()).filter(Boolean) : null,
        startDate: config.startDate
      };

      // Trigger training via the scheduler trigger endpoint
      const response = await mlopsAPI.triggerTraining({
        jobName: `train_${modelType}_${Date.now()}`,
        config: jobConfig
      });

      // Reload to show the new job
      setTimeout(loadData, 1000);

      return response.data;
    } catch (err) {
      console.error('Failed to start training:', err);
      return { success: false, error: err.message };
    }
  };

  const handleRunHealthCheck = async () => {
    try {
      await mlopsAPI.runAllDriftHealthChecks();
      loadData();
    } catch (err) {
      console.error('Failed to run health checks:', err);
    }
  };

  const handleUpdateActuals = async () => {
    try {
      await mlopsAPI.updateActuals();
      loadData();
    } catch (err) {
      console.error('Failed to update actuals:', err);
    }
  };

  const handleCompareModels = async (modelA, modelB) => {
    // The comparison is done client-side using the metrics we already have
    return { modelA, modelB };
  };

  // Load versions for a specific model (for comparison panel)
  const handleLoadVersions = useCallback(async (modelName) => {
    try {
      const response = await mlopsAPI.getModelVersions(modelName);
      if (response.data?.success) {
        return response.data.versions || [];
      }
      return [];
    } catch (err) {
      console.error(`Failed to load versions for ${modelName}:`, err);
      return [];
    }
  }, []);

  // Calculate summary metrics
  const productionModels = models.filter(m => m.production_count > 0 || m.productionVersion).length;
  const stagedModels = models.reduce((acc, m) => acc + (m.staged_count || 0), 0);
  const totalPredictions = predictions.reduce((acc, p) => acc + (p.total_predictions || 0), 0);

  if (loading && models.length === 0) {
    return (
      <div className="mlops-dashboard">
        <PageHeader title="MLOps Dashboard" subtitle="Model lifecycle management and monitoring" />
        <div className="mlops-loading">
          <RefreshCw className="spinning" size={32} />
          <span>Loading MLOps data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mlops-dashboard">
      <PageHeader
        title="MLOps Dashboard"
        subtitle="Model lifecycle management and monitoring"
      />

      {error && (
        <div className="mlops-error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="mlops-metrics-row">
        <MetricCard
          title="Production Models"
          value={productionModels}
          icon={Award}
          status={productionModels > 0 ? 'success' : 'warning'}
        />
        <MetricCard
          title="Staged Models"
          value={stagedModels}
          icon={Clock}
          subtitle="Awaiting promotion"
        />
        <MetricCard
          title="Total Predictions"
          value={totalPredictions.toLocaleString()}
          icon={Target}
        />
        <MetricCard
          title="Critical Alerts"
          value={driftData?.criticalAlerts || 0}
          icon={AlertTriangle}
          status={driftData?.criticalAlerts > 0 ? 'critical' : 'success'}
        />
      </div>

      {/* Main Grid */}
      <div className="mlops-grid">
        <div className="mlops-grid__left">
          <ModelRegistryPanel
            models={models}
            onPromote={handlePromoteModel}
            onRefresh={loadData}
            loading={loading}
          />

          <TrainingStatusPanel
            trainingJobs={trainingJobs}
            onStartTraining={handleStartTraining}
            onRefresh={loadData}
            loading={loading}
          />
        </div>

        <div className="mlops-grid__right">
          <DriftSummaryPanel
            driftData={driftData}
            onRunHealthCheck={handleRunHealthCheck}
            loading={loading}
          />

          <PredictionsSummaryPanel
            predictions={predictions}
            onUpdateActuals={handleUpdateActuals}
            loading={loading}
          />
        </div>
      </div>

      {/* Model Comparison (full width) */}
      <ModelComparisonPanel
        models={models}
        onCompare={handleCompareModels}
        onLoadVersions={handleLoadVersions}
      />

      {/* MLOps - AI Agents Relationship Info */}
      <div className="mlops-panel mlops-info-panel">
        <div className="mlops-panel__header">
          <h3><GitBranch size={18} /> MLOps &amp; AI Agents Integration</h3>
        </div>
        <div className="mlops-info-content">
          <p>
            <strong>How models are used:</strong> The trained ML models (LSTM, TFT, Ensemble) generate
            predictions that are consumed by the Unified Strategy Engine as one of 16 signal types.
          </p>
          <ul>
            <li><strong>ML Prediction Signal:</strong> Weight 5% by default in strategy calculations</li>
            <li><strong>AI Trading Agents:</strong> Use these signals combined with other factors to generate trade recommendations</li>
            <li><strong>Drift Monitoring:</strong> When model performance degrades, retraining is automatically triggered</li>
            <li><strong>Model Versioning:</strong> Production models are tracked and can be rolled back if needed</li>
          </ul>
          <div className="mlops-info-links">
            <a href="/agents">View AI Trading Agents →</a>
            <a href="/settings?tab=drift">Full Drift Dashboard →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MLOpsDashboard;
