// frontend/src/pages/signals/ValidationTab.js
// Validation tab - imports the existing ValidationDashboard component
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Target,
  Layers,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import '../validation/ValidationDashboard.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const TABS = [
  { id: 'overview', label: 'Signal Health', icon: Activity },
  { id: 'ic-decay', label: 'IC Decay', icon: TrendingDown },
  { id: 'hit-rates', label: 'Hit Rates', icon: Target },
  { id: 'regime', label: 'Regime Stability', icon: Layers },
  { id: 'rolling-ic', label: 'Rolling IC', icon: TrendingUp }
];

const SIGNAL_NAMES = {
  technical: 'Technical',
  sentiment: 'Sentiment',
  insider: 'Insider',
  fundamental: 'Fundamental',
  alternativeData: 'Alternative Data',
  valuation: 'Valuation',
  thirteenF: '13F Holdings',
  earningsMomentum: 'Earnings Momentum',
  valueQuality: 'Value Quality'
};

const PERIOD_NAMES = {
  '1d': '1 Day',
  '5d': '1 Week',
  '21d': '1 Month',
  '63d': '3 Months'
};

const StatusBadge = ({ status, label }) => {
  const statusClass = status === 'HEALTHY' || status === 'pass' ? 'success'
    : status === 'DEGRADED' || status === 'warning' ? 'warning'
    : 'danger';
  const Icon = status === 'HEALTHY' || status === 'pass' ? CheckCircle
    : status === 'DEGRADED' || status === 'warning' ? AlertTriangle
    : XCircle;

  return (
    <span className={`validation-badge validation-badge--${statusClass}`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

const MetricCard = ({ title, value, subtitle, trend, icon: Icon, status }) => (
  <div className={`validation-metric ${status ? `validation-metric--${status}` : ''}`}>
    <div className="validation-metric__header">
      {Icon && <Icon size={16} className="validation-metric__icon" />}
      <span className="validation-metric__title">{title}</span>
    </div>
    <div className="validation-metric__value">{value}</div>
    {subtitle && (
      <div className={`validation-metric__subtitle ${trend ? `validation-metric__subtitle--${trend}` : ''}`}>
        {subtitle}
      </div>
    )}
  </div>
);

const ICGauge = ({ value, label }) => {
  const normalizedValue = Math.max(-1, Math.min(1, value || 0));
  const percentage = ((normalizedValue + 1) / 2) * 100;
  const color = normalizedValue > 0.05 ? 'var(--success)'
    : normalizedValue > 0 ? 'var(--warning)'
    : 'var(--danger)';

  return (
    <div className="ic-gauge">
      <div className="ic-gauge__label">{label}</div>
      <div className="ic-gauge__bar">
        <div className="ic-gauge__fill" style={{ width: `${percentage}%`, background: color }} />
        <div className="ic-gauge__center" />
      </div>
      <div className="ic-gauge__value" style={{ color }}>
        {(normalizedValue * 100).toFixed(2)}%
      </div>
    </div>
  );
};

function ValidationTab() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [lookbackDays, setLookbackDays] = useState(365);

  // Data states
  const [healthReport, setHealthReport] = useState(null);
  const [icDecay, setICDecay] = useState(null);
  const [hitRates, setHitRates] = useState(null);
  const [regimeStability, setRegimeStability] = useState(null);
  const [rollingIC, setRollingIC] = useState({});
  const [selectedSignal, setSelectedSignal] = useState('technical');

  // Fetch health report
  const fetchHealthReport = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/validation/signals/health?lookback=${lookbackDays}`);
      const data = await response.json();
      if (data.success) {
        setHealthReport(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch health report:', err);
    }
  }, [lookbackDays]);

  // Fetch IC decay
  const fetchICDecay = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/validation/signals/ic-decay?lookback=${lookbackDays}`);
      const data = await response.json();
      if (data.success) {
        setICDecay(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch IC decay:', err);
    }
  }, [lookbackDays]);

  // Fetch hit rates
  const fetchHitRates = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/validation/signals/hit-rates?lookback=${lookbackDays}`);
      const data = await response.json();
      if (data.success) {
        setHitRates(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch hit rates:', err);
    }
  }, [lookbackDays]);

  // Fetch regime stability
  const fetchRegimeStability = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/validation/signals/regime-stability?lookback=${lookbackDays}`);
      const data = await response.json();
      if (data.success) {
        setRegimeStability(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch regime stability:', err);
    }
  }, [lookbackDays]);

  // Fetch rolling IC for a specific signal
  const fetchRollingIC = useCallback(async (signalType) => {
    try {
      const response = await fetch(
        `${API_BASE}/validation/signals/rolling-ic/${signalType}?lookback=${lookbackDays}`
      );
      const data = await response.json();
      if (data.success) {
        setRollingIC(prev => ({ ...prev, [signalType]: data.data }));
      }
    } catch (err) {
      console.error('Failed to fetch rolling IC:', err);
    }
  }, [lookbackDays]);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchHealthReport(),
        fetchICDecay(),
        fetchHitRates(),
        fetchRegimeStability()
      ]);
      setLoading(false);
    };

    loadData();
  }, [fetchHealthReport, fetchICDecay, fetchHitRates, fetchRegimeStability]);

  // Load rolling IC when tab changes
  useEffect(() => {
    if (activeTab === 'rolling-ic' && !rollingIC[selectedSignal]) {
      fetchRollingIC(selectedSignal);
    }
  }, [activeTab, selectedSignal, rollingIC, fetchRollingIC]);

  // Recalculate all metrics
  const handleRecalculate = async () => {
    setRefreshing(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/validation/signals/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookbackDays })
      });
      const data = await response.json();

      if (data.success) {
        await Promise.all([
          fetchHealthReport(),
          fetchICDecay(),
          fetchHitRates(),
          fetchRegimeStability()
        ]);
        setRollingIC({});
      } else {
        setError(data.error || 'Recalculation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="validation-dashboard">
        <Skeleton className="validation-dashboard__skeleton-header" />
        <Skeleton className="validation-dashboard__skeleton-content" />
      </div>
    );
  }

  const hasData = healthReport && Object.keys(healthReport.signals || {}).length > 0;

  // Render Overview tab
  const renderOverview = () => {
    if (!hasData) {
      return (
        <Card>
          <div className="validation-empty">
            <AlertTriangle size={48} />
            <h3>No Signal Data</h3>
            <p>Run signal calculations to see validation metrics</p>
            <Button onClick={handleRecalculate} disabled={refreshing}>
              {refreshing ? 'Calculating...' : 'Calculate Signals'}
            </Button>
          </div>
        </Card>
      );
    }

    const signals = Object.entries(healthReport.signals || {});

    return (
      <div className="validation-overview">
        <div className="validation-metrics-grid">
          <MetricCard
            title="Overall Status"
            value={healthReport.overallStatus}
            icon={Activity}
            status={healthReport.overallStatus === 'HEALTHY' ? 'success' : 'warning'}
          />
          <MetricCard
            title="Active Signals"
            value={signals.length}
            subtitle="Signal types tracked"
            icon={Target}
          />
          <MetricCard
            title="Avg IC"
            value={`${((healthReport.avgIC || 0) * 100).toFixed(2)}%`}
            subtitle="Information coefficient"
            trend={healthReport.avgIC > 0.05 ? 'up' : healthReport.avgIC > 0 ? 'neutral' : 'down'}
            icon={TrendingUp}
          />
        </div>

        <div className="validation-signals-table">
          <h3>Signal Health Summary</h3>
          <table className="validation-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Status</th>
                <th>IC (1D)</th>
                <th>IC (5D)</th>
                <th>IC (21D)</th>
                <th>Hit Rate</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {signals.map(([key, signal]) => (
                <tr key={key}>
                  <td>{SIGNAL_NAMES[key] || key}</td>
                  <td>
                    <StatusBadge status={signal.status} label={signal.status} />
                  </td>
                  <td className={signal.ic_1d > 0 ? 'positive' : 'negative'}>
                    {((signal.ic_1d || 0) * 100).toFixed(2)}%
                  </td>
                  <td className={signal.ic_5d > 0 ? 'positive' : 'negative'}>
                    {((signal.ic_5d || 0) * 100).toFixed(2)}%
                  </td>
                  <td className={signal.ic_21d > 0 ? 'positive' : 'negative'}>
                    {((signal.ic_21d || 0) * 100).toFixed(2)}%
                  </td>
                  <td>
                    {signal.hitRate ? `${(signal.hitRate * 100).toFixed(1)}%` : '-'}
                  </td>
                  <td>
                    {signal.coverage ? `${(signal.coverage * 100).toFixed(1)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Render IC Decay tab
  const renderICDecay = () => {
    if (!icDecay || !Object.keys(icDecay).length) {
      return (
        <Card>
          <div className="validation-empty">
            <TrendingDown size={48} />
            <h3>No IC Decay Data</h3>
            <p>IC decay analysis not available</p>
          </div>
        </Card>
      );
    }

    return (
      <div className="validation-ic-decay">
        <p className="validation-description">
          IC Decay measures how predictive power changes over time. Healthy signals maintain positive IC across horizons.
        </p>
        <div className="ic-decay-grid">
          {Object.entries(icDecay).map(([signalType, data]) => (
            <Card key={signalType} className="ic-decay-card">
              <h4>{SIGNAL_NAMES[signalType] || signalType}</h4>
              <div className="ic-decay-values">
                {Object.entries(PERIOD_NAMES).map(([period, label]) => (
                  <ICGauge
                    key={period}
                    value={data[`ic_${period}`] || 0}
                    label={label}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // Render Hit Rates tab
  const renderHitRates = () => {
    if (!hitRates || !Object.keys(hitRates).length) {
      return (
        <Card>
          <div className="validation-empty">
            <Target size={48} />
            <h3>No Hit Rate Data</h3>
            <p>Hit rate analysis not available</p>
          </div>
        </Card>
      );
    }

    return (
      <div className="validation-hit-rates">
        <p className="validation-description">
          Hit rates show the percentage of predictions that correctly identified the direction of price movement.
        </p>
        <div className="hit-rates-grid">
          {Object.entries(hitRates).map(([signalType, data]) => (
            <Card key={signalType} className="hit-rate-card">
              <h4>{SIGNAL_NAMES[signalType] || signalType}</h4>
              <div className="hit-rate-values">
                {Object.entries(PERIOD_NAMES).map(([period, label]) => {
                  const rate = data[`hitRate_${period}`] || 0;
                  return (
                    <div key={period} className="hit-rate-item">
                      <span className="hit-rate-label">{label}</span>
                      <span className={`hit-rate-value ${rate >= 0.5 ? 'positive' : 'negative'}`}>
                        {(rate * 100).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // Render Regime Stability tab
  const renderRegimeStability = () => {
    if (!regimeStability) {
      return (
        <Card>
          <div className="validation-empty">
            <Layers size={48} />
            <h3>No Regime Data</h3>
            <p>Regime stability analysis not available</p>
          </div>
        </Card>
      );
    }

    return (
      <div className="validation-regime">
        <p className="validation-description">
          Regime stability shows how consistently signals perform across different market conditions.
        </p>
        <div className="regime-metrics">
          <MetricCard
            title="Current Regime"
            value={regimeStability.currentRegime || 'Unknown'}
            icon={Layers}
          />
          <MetricCard
            title="Stability Score"
            value={`${((regimeStability.stabilityScore || 0) * 100).toFixed(1)}%`}
            subtitle="Higher is better"
            icon={CheckCircle}
            status={regimeStability.stabilityScore > 0.7 ? 'success' : 'warning'}
          />
          <MetricCard
            title="Regime Changes"
            value={regimeStability.regimeChanges || 0}
            subtitle={`In last ${lookbackDays} days`}
            icon={Activity}
          />
        </div>
      </div>
    );
  };

  // Render Rolling IC tab
  const renderRollingIC = () => {
    const data = rollingIC[selectedSignal];

    return (
      <div className="validation-rolling-ic">
        <div className="rolling-ic-controls">
          <select
            value={selectedSignal}
            onChange={(e) => setSelectedSignal(e.target.value)}
            className="signal-select"
          >
            {Object.entries(SIGNAL_NAMES).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>

        {!data ? (
          <div className="validation-loading">
            <RefreshCw className="spinning" size={24} />
            <span>Loading rolling IC data...</span>
          </div>
        ) : (
          <div className="rolling-ic-content">
            <p className="validation-description">
              Rolling IC shows how the signal's predictive power has evolved over time.
            </p>
            <div className="rolling-ic-summary">
              <MetricCard
                title="Current IC"
                value={`${((data.currentIC || 0) * 100).toFixed(2)}%`}
                icon={TrendingUp}
                status={data.currentIC > 0.05 ? 'success' : data.currentIC > 0 ? 'warning' : 'danger'}
              />
              <MetricCard
                title="Average IC"
                value={`${((data.avgIC || 0) * 100).toFixed(2)}%`}
                icon={Activity}
              />
              <MetricCard
                title="Trend"
                value={data.trend || 'Stable'}
                icon={data.trend === 'Improving' ? TrendingUp : TrendingDown}
                status={data.trend === 'Improving' ? 'success' : data.trend === 'Degrading' ? 'danger' : 'neutral'}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="validation-dashboard">
      {/* Controls */}
      <div className="validation-dashboard__controls">
        <select
          value={lookbackDays}
          onChange={(e) => setLookbackDays(Number(e.target.value))}
          className="validation-dashboard__select"
        >
          <option value={90}>Last 90 Days</option>
          <option value={180}>Last 6 Months</option>
          <option value={365}>Last Year</option>
          <option value={730}>Last 2 Years</option>
        </select>
        <Button onClick={handleRecalculate} disabled={refreshing} size="small">
          <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
          {refreshing ? 'Recalculating...' : 'Recalculate'}
        </Button>
      </div>

      {error && (
        <div className="validation-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="validation-dashboard__tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`validation-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="validation-dashboard__content">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'ic-decay' && renderICDecay()}
        {activeTab === 'hit-rates' && renderHitRates()}
        {activeTab === 'regime' && renderRegimeStability()}
        {activeTab === 'rolling-ic' && renderRollingIC()}
      </div>
    </div>
  );
}

export default ValidationTab;
