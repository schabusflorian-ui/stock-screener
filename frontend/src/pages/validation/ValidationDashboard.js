// frontend/src/pages/validation/ValidationDashboard.js
// Signal Performance & Validation Dashboard

import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  BarChart3,
  Target,
  Layers,
  Clock,
  Zap
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import './ValidationDashboard.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

/**
 * Dashboard tabs
 */
const TABS = [
  { id: 'overview', label: 'Signal Health', icon: Activity },
  { id: 'ic-decay', label: 'IC Decay', icon: TrendingDown },
  { id: 'hit-rates', label: 'Hit Rates', icon: Target },
  { id: 'regime', label: 'Regime Stability', icon: Layers },
  { id: 'rolling-ic', label: 'Rolling IC', icon: TrendingUp }
];

/**
 * Signal type display names
 */
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

/**
 * Holding period display names
 */
const PERIOD_NAMES = {
  '1d': '1 Day',
  '5d': '1 Week',
  '21d': '1 Month',
  '63d': '3 Months'
};

/**
 * Status badge component
 */
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

/**
 * Metric card component
 */
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

/**
 * IC Gauge component - visual representation of IC value
 */
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

/**
 * Main ValidationDashboard component
 */
function ValidationDashboard() {
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
      const response = await fetch(`${API_BASE}/validation/signals/health?lookbackDays=${lookbackDays}`);
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
      const response = await fetch(`${API_BASE}/validation/signals/ic-decay?lookbackDays=${lookbackDays}`);
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
      const response = await fetch(`${API_BASE}/validation/signals/hit-rates?lookbackDays=${lookbackDays}`);
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
      const response = await fetch(`${API_BASE}/validation/signals/regime-stability?lookbackDays=${lookbackDays}`);
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
        `${API_BASE}/validation/signals/rolling-ic/${signalType}?lookbackDays=${lookbackDays}`
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
        // Refetch all data
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

  // Check if we have data
  const hasData = healthReport && Object.keys(healthReport.signals || {}).length > 0;

  return (
    <div className="validation-dashboard">
      {/* Header */}
      <div className="validation-dashboard__header">
        <div className="validation-dashboard__title-section">
          <div>
            <h1 className="validation-dashboard__title">
              <Activity size={24} />
              Signal Validation Dashboard
            </h1>
            <p className="validation-dashboard__subtitle">
              Monitor signal quality, IC decay, and regime stability
            </p>
          </div>
        </div>
        <div className="validation-dashboard__actions">
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
          <Button
            variant="primary"
            onClick={handleRecalculate}
            disabled={refreshing}
            icon={refreshing ? RefreshCw : Zap}
          >
            {refreshing ? 'Recalculating...' : 'Recalculate'}
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Card variant="base" className="validation-dashboard__error-card">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </Card>
      )}

      {/* No data warning */}
      {!hasData && (
        <Card variant="base" className="validation-dashboard__info-card">
          <Info size={16} />
          <div>
            <strong>No signal performance data available</strong>
            <p>Signal performance tracking requires recommendations to be tracked over time.
            Use the AI Trading agent to generate recommendations and track their outcomes.</p>
          </div>
        </Card>
      )}

      {/* Tab Navigation */}
      <div className="validation-dashboard__tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`validation-dashboard__tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="validation-dashboard__content">
        {/* Signal Health Overview Tab */}
        {activeTab === 'overview' && (
          <div className="validation-overview">
            {/* Summary metrics */}
            <div className="validation-overview__summary">
              <MetricCard
                title="Overall Health Score"
                value={healthReport?.overallScore?.toFixed(0) || '--'}
                subtitle={`out of 100`}
                icon={Activity}
                status={healthReport?.overallStatus?.toLowerCase()}
              />
              <MetricCard
                title="Healthy Signals"
                value={healthReport ?
                  `${Object.values(healthReport.signals || {}).filter(s => s.status === 'HEALTHY').length}/${Object.keys(healthReport.signals || {}).length}`
                  : '--'}
                subtitle="passing validation"
                icon={CheckCircle}
              />
              <MetricCard
                title="Avg IC (21d)"
                value={healthReport?.avgIC21d ? (healthReport.avgIC21d * 100).toFixed(2) + '%' : '--'}
                subtitle="average predictive power"
                icon={TrendingUp}
                trend={healthReport?.avgIC21d > 0.02 ? 'positive' : healthReport?.avgIC21d > 0 ? 'neutral' : 'negative'}
              />
              <MetricCard
                title="Data Period"
                value={`${lookbackDays}d`}
                subtitle={`lookback window`}
                icon={Clock}
              />
            </div>

            {/* Signal health cards */}
            <div className="validation-overview__signals">
              <h3>Signal Health Status</h3>
              <div className="validation-signal-grid">
                {Object.entries(healthReport?.signals || {}).map(([signalType, data]) => (
                  <Card key={signalType} variant="base" className="validation-signal-card">
                    <div className="validation-signal-card__header">
                      <span className="validation-signal-card__name">
                        {SIGNAL_NAMES[signalType] || signalType}
                      </span>
                      <StatusBadge status={data.status} label={data.status} />
                    </div>
                    <div className="validation-signal-card__score">
                      <span className="score">{data.healthScore?.toFixed(0) || '--'}</span>
                      <span className="label">/ 100</span>
                    </div>
                    <div className="validation-signal-card__metrics">
                      <div className="metric">
                        <span className="label">IC (21d)</span>
                        <span className={`value ${data.ic21d > 0.02 ? 'positive' : data.ic21d > 0 ? 'neutral' : 'negative'}`}>
                          {data.ic21d ? (data.ic21d * 100).toFixed(2) + '%' : '--'}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="label">Hit Rate</span>
                        <span className={`value ${data.hitRate21d > 55 ? 'positive' : data.hitRate21d > 50 ? 'neutral' : 'negative'}`}>
                          {data.hitRate21d ? data.hitRate21d.toFixed(1) + '%' : '--'}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="label">Stability</span>
                        <span className={`value ${data.stability > 0.7 ? 'positive' : data.stability > 0.5 ? 'neutral' : 'negative'}`}>
                          {data.stability ? (data.stability * 100).toFixed(0) + '%' : '--'}
                        </span>
                      </div>
                    </div>
                    {data.interpretation && (
                      <div className="validation-signal-card__interpretation">
                        {data.interpretation}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* IC Decay Tab */}
        {activeTab === 'ic-decay' && (
          <div className="validation-ic-decay">
            <div className="validation-section__header">
              <h3>Information Coefficient Decay Analysis</h3>
              <p className="validation-section__description">
                How quickly does predictive power fade across different holding periods?
              </p>
            </div>

            {icDecay ? (
              <div className="validation-ic-decay__content">
                {/* IC by period overview */}
                <div className="validation-ic-decay__overview">
                  {Object.entries(PERIOD_NAMES).map(([period, label]) => {
                    const avgIC = icDecay.averageByPeriod?.[period] || 0;
                    return (
                      <MetricCard
                        key={period}
                        title={label}
                        value={(avgIC * 100).toFixed(2) + '%'}
                        subtitle="avg IC across signals"
                        trend={avgIC > 0.02 ? 'positive' : avgIC > 0 ? 'neutral' : 'negative'}
                      />
                    );
                  })}
                </div>

                {/* IC decay by signal */}
                <Card variant="base" className="validation-ic-decay__table-card">
                  <Card.Header><h4>IC by Signal and Holding Period</h4></Card.Header>
                  <Card.Content>
                    <table className="validation-table">
                      <thead>
                        <tr>
                          <th>Signal</th>
                          {Object.keys(PERIOD_NAMES).map(period => (
                            <th key={period}>{PERIOD_NAMES[period]}</th>
                          ))}
                          <th>Best Period</th>
                          <th>Decay Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(icDecay.bySignal || {}).map(([signalType, data]) => {
                          const decayRate = data.decayRate;
                          return (
                            <tr key={signalType}>
                              <td className="signal-name">{SIGNAL_NAMES[signalType] || signalType}</td>
                              {Object.keys(PERIOD_NAMES).map(period => {
                                const ic = data[period] || 0;
                                return (
                                  <td key={period} className={ic > 0.02 ? 'positive' : ic > 0 ? 'neutral' : 'negative'}>
                                    {(ic * 100).toFixed(2)}%
                                  </td>
                                );
                              })}
                              <td className="best-period">{PERIOD_NAMES[data.bestPeriod] || data.bestPeriod || '--'}</td>
                              <td className={decayRate < 0.5 ? 'positive' : decayRate < 0.8 ? 'neutral' : 'negative'}>
                                {decayRate ? (decayRate * 100).toFixed(0) + '%' : '--'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card>

                {/* Interpretation */}
                <Card variant="base" className="validation-interpretation">
                  <Card.Header><h4>Interpretation</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {icDecay.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="validation-empty">
                <p>No IC decay data available. Track recommendations to analyze IC decay.</p>
              </Card>
            )}
          </div>
        )}

        {/* Hit Rates Tab */}
        {activeTab === 'hit-rates' && (
          <div className="validation-hit-rates">
            <div className="validation-section__header">
              <h3>Hit Rates by Holding Period</h3>
              <p className="validation-section__description">
                Win rate analysis: percentage of times signal direction correctly predicted return direction
              </p>
            </div>

            {hitRates ? (
              <div className="validation-hit-rates__content">
                {/* Hit rate summary */}
                <div className="validation-hit-rates__overview">
                  {Object.entries(PERIOD_NAMES).map(([period, label]) => {
                    const avgHit = hitRates.averageByPeriod?.[period] || 50;
                    return (
                      <MetricCard
                        key={period}
                        title={label}
                        value={avgHit.toFixed(1) + '%'}
                        subtitle="avg hit rate"
                        trend={avgHit > 55 ? 'positive' : avgHit > 50 ? 'neutral' : 'negative'}
                        icon={Target}
                      />
                    );
                  })}
                </div>

                {/* Hit rate table */}
                <Card variant="base" className="validation-hit-rates__table-card">
                  <Card.Header><h4>Hit Rate by Signal and Period</h4></Card.Header>
                  <Card.Content>
                    <table className="validation-table">
                      <thead>
                        <tr>
                          <th>Signal</th>
                          {Object.keys(PERIOD_NAMES).map(period => (
                            <th key={period}>{PERIOD_NAMES[period]}</th>
                          ))}
                          <th>Sample Size</th>
                          <th>Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(hitRates.bySignal || {}).map(([signalType, data]) => (
                          <tr key={signalType}>
                            <td className="signal-name">{SIGNAL_NAMES[signalType] || signalType}</td>
                            {Object.keys(PERIOD_NAMES).map(period => {
                              const hit = data.hitRates?.[period] || 50;
                              const wins = data.wins?.[period] || 0;
                              const total = data.total?.[period] || 0;
                              return (
                                <td key={period} className={hit > 55 ? 'positive' : hit > 50 ? 'neutral' : 'negative'}>
                                  {hit.toFixed(1)}%
                                  <span className="hit-detail">({wins}/{total})</span>
                                </td>
                              );
                            })}
                            <td>{data.sampleSize || '--'}</td>
                            <td>
                              <StatusBadge
                                status={data.confidence === 'HIGH' ? 'pass' : data.confidence === 'MEDIUM' ? 'warning' : 'fail'}
                                label={data.confidence || 'LOW'}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card>

                {/* Hit rate interpretation */}
                <Card variant="base" className="validation-interpretation">
                  <Card.Header><h4>Interpretation</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {hitRates.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="validation-empty">
                <p>No hit rate data available. Track recommendations to analyze hit rates.</p>
              </Card>
            )}
          </div>
        )}

        {/* Regime Stability Tab */}
        {activeTab === 'regime' && (
          <div className="validation-regime">
            <div className="validation-section__header">
              <h3>Signal Performance by Market Regime</h3>
              <p className="validation-section__description">
                How consistently do signals perform across different market conditions?
              </p>
            </div>

            {regimeStability ? (
              <div className="validation-regime__content">
                {/* Regime summary */}
                <div className="validation-regime__overview">
                  {Object.entries(regimeStability.regimes || {}).map(([regime, data]) => (
                    <MetricCard
                      key={regime}
                      title={regime}
                      value={(data.avgIC * 100).toFixed(2) + '%'}
                      subtitle={`${data.sampleCount} recommendations`}
                      trend={data.avgIC > 0.02 ? 'positive' : data.avgIC > 0 ? 'neutral' : 'negative'}
                      icon={Layers}
                    />
                  ))}
                </div>

                {/* Signal stability matrix */}
                <Card variant="base" className="validation-regime__matrix">
                  <Card.Header><h4>Signal Performance by Regime (IC)</h4></Card.Header>
                  <Card.Content>
                    <table className="validation-table">
                      <thead>
                        <tr>
                          <th>Signal</th>
                          {Object.keys(regimeStability.regimes || {}).map(regime => (
                            <th key={regime}>{regime}</th>
                          ))}
                          <th>Stability</th>
                          <th>Best Regime</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(regimeStability.bySignal || {}).map(([signalType, data]) => (
                          <tr key={signalType}>
                            <td className="signal-name">{SIGNAL_NAMES[signalType] || signalType}</td>
                            {Object.keys(regimeStability.regimes || {}).map(regime => {
                              const ic = data.byRegime?.[regime]?.ic || 0;
                              return (
                                <td key={regime} className={ic > 0.02 ? 'positive' : ic > 0 ? 'neutral' : 'negative'}>
                                  {(ic * 100).toFixed(2)}%
                                </td>
                              );
                            })}
                            <td className={data.stabilityScore > 0.7 ? 'positive' : data.stabilityScore > 0.5 ? 'neutral' : 'negative'}>
                              {data.stabilityScore ? (data.stabilityScore * 100).toFixed(0) + '%' : '--'}
                            </td>
                            <td>{data.bestRegime || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card>

                {/* Regime interpretation */}
                <Card variant="base" className="validation-interpretation">
                  <Card.Header><h4>Regime Analysis Insights</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {regimeStability.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="validation-empty">
                <p>No regime stability data available. Track recommendations across different market conditions.</p>
              </Card>
            )}
          </div>
        )}

        {/* Rolling IC Tab */}
        {activeTab === 'rolling-ic' && (
          <div className="validation-rolling-ic">
            <div className="validation-section__header">
              <h3>Rolling Information Coefficient Trend</h3>
              <p className="validation-section__description">
                Track how IC evolves over time for each signal
              </p>
            </div>

            {/* Signal selector */}
            <div className="validation-rolling-ic__selector">
              <label>Select Signal:</label>
              <select
                value={selectedSignal}
                onChange={(e) => {
                  setSelectedSignal(e.target.value);
                  if (!rollingIC[e.target.value]) {
                    fetchRollingIC(e.target.value);
                  }
                }}
                className="validation-dashboard__select"
              >
                {Object.entries(SIGNAL_NAMES).map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
              </select>
            </div>

            {rollingIC[selectedSignal] ? (
              <div className="validation-rolling-ic__content">
                {/* Current stats */}
                <div className="validation-rolling-ic__stats">
                  <MetricCard
                    title="Current IC"
                    value={(rollingIC[selectedSignal].currentIC * 100).toFixed(2) + '%'}
                    trend={rollingIC[selectedSignal].currentIC > 0.02 ? 'positive' : 'neutral'}
                  />
                  <MetricCard
                    title="Average IC"
                    value={(rollingIC[selectedSignal].averageIC * 100).toFixed(2) + '%'}
                    subtitle="over period"
                  />
                  <MetricCard
                    title="Trend"
                    value={rollingIC[selectedSignal].trend || '--'}
                    subtitle="IC direction"
                    trend={rollingIC[selectedSignal].trend === 'IMPROVING' ? 'positive' :
                           rollingIC[selectedSignal].trend === 'STABLE' ? 'neutral' : 'negative'}
                  />
                  <MetricCard
                    title="Volatility"
                    value={(rollingIC[selectedSignal].volatility * 100).toFixed(2) + '%'}
                    subtitle="IC standard deviation"
                  />
                </div>

                {/* IC Timeline visualization */}
                <Card variant="base" className="validation-rolling-ic__chart">
                  <Card.Header><h4>IC Over Time - {SIGNAL_NAMES[selectedSignal]}</h4></Card.Header>
                  <Card.Content>
                    <div className="validation-rolling-ic__timeline">
                      {rollingIC[selectedSignal].history?.map((point, idx) => (
                        <ICGauge
                          key={idx}
                          value={point.ic}
                          label={point.date ? new Date(point.date).toLocaleDateString('en-US', { month: 'short' }) : `P${idx + 1}`}
                        />
                      ))}
                    </div>
                  </Card.Content>
                </Card>

                {/* Interpretation */}
                <Card variant="base" className="validation-interpretation">
                  <Card.Header><h4>Signal Analysis</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {rollingIC[selectedSignal].interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="validation-empty">
                <p>Loading rolling IC data for {SIGNAL_NAMES[selectedSignal]}...</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ValidationDashboard;
