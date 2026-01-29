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
  Lightbulb,
} from '../../components/icons';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import '../validation/ValidationDashboard.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

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

// ============================================
// HELPER FUNCTIONS FOR INTUITIVE DISPLAY
// ============================================

// Calculate letter grade from health score
const getGrade = (healthScore) => {
  if (healthScore >= 65) return { letter: 'A', color: 'positive', label: 'Excellent' };
  if (healthScore >= 55) return { letter: 'B', color: 'positive', label: 'Good' };
  if (healthScore >= 45) return { letter: 'C', color: 'warning', label: 'Average' };
  return { letter: 'D', color: 'negative', label: 'Weak' };
};

// Get overall grade from average health score
const getOverallGrade = (signals) => {
  const scores = Object.values(signals).map(s => s.healthScore || 0);
  if (scores.length === 0) return { letter: '-', color: 'neutral', label: 'No Data' };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return getGrade(avg);
};

// Generate plain English insight for a signal
const getInsight = (signal) => {
  const accuracy = Math.round((signal.hitRate || 0) * 100);
  const ic63d = signal.ic_63d || 0;

  if (accuracy < 50) return "Not beating random chance";
  if (accuracy >= 55 && ic63d > 0.05) return "Strong long-term predictor";
  if (accuracy >= 55) return "Reliable predictor";
  if (ic63d > 0.1) return "Best for longer holds";
  return "Marginally useful";
};

// Get actionable recommendation based on signals
const getRecommendation = (signals) => {
  const entries = Object.entries(signals);
  const weak = entries.filter(([, s]) => (s.healthScore || 0) < 45);
  const strong = entries.filter(([, s]) => (s.healthScore || 0) >= 55);

  if (weak.length === 0 && strong.length > 0) {
    return "All signals are performing well. Continue current strategy.";
  }
  if (weak.length > 0) {
    const weakName = SIGNAL_NAMES[weak[0][0]] || weak[0][0];
    return `Consider reducing weight on ${weakName} signals until performance improves.`;
  }
  return "Monitor signal performance and adjust weights as needed.";
};

// Get best and worst performers
const getPerformers = (signals) => {
  const entries = Object.entries(signals)
    .map(([key, signal]) => ({
      key,
      name: SIGNAL_NAMES[key] || key,
      healthScore: signal.healthScore || 0,
      accuracy: Math.round((signal.hitRate || 0) * 100),
      grade: getGrade(signal.healthScore || 0)
    }))
    .sort((a, b) => b.healthScore - a.healthScore);

  return {
    best: entries[0] || null,
    worst: entries[entries.length - 1] || null
  };
};

// Calculate average accuracy across signals
const getAverageAccuracy = (signals) => {
  const hitRates = Object.values(signals)
    .map(s => s.hitRate || 0)
    .filter(h => h > 0);
  if (hitRates.length === 0) return 0;
  return Math.round((hitRates.reduce((a, b) => a + b, 0) / hitRates.length) * 100);
};

// ============================================
// SIGNAL SUMMARY CARD COMPONENT
// ============================================

const SignalSummaryCard = ({ signals }) => {
  const overallGrade = getOverallGrade(signals);
  const avgAccuracy = getAverageAccuracy(signals);
  const { best, worst } = getPerformers(signals);
  const recommendation = getRecommendation(signals);

  return (
    <div className="signal-summary-card">
      <div className="signal-summary-card__header">
        <div className="signal-summary-card__grade">
          <span className={`grade-badge grade-badge--${overallGrade.letter}`}>
            {overallGrade.letter}
          </span>
          <div className="signal-summary-card__title">
            <h3>Signal Health: {overallGrade.label}</h3>
            <p className="signal-summary-card__subtitle">
              Your signals predict price direction correctly <strong>{avgAccuracy}%</strong> of the time.
              <span className="benchmark-note"> (Random = 50%)</span>
            </p>
          </div>
        </div>
      </div>

      <div className="signal-summary-card__performers">
        {best && (
          <div className="performer performer--best">
            <CheckCircle size={16} />
            <span>
              <strong>Best:</strong> {best.name} ({best.grade.letter}, {best.accuracy}% accuracy)
            </span>
          </div>
        )}
        {worst && worst.healthScore < 50 && (
          <div className="performer performer--attention">
            <AlertTriangle size={16} />
            <span>
              <strong>Attention:</strong> {worst.name} ({worst.grade.letter}, {worst.accuracy}% accuracy)
            </span>
          </div>
        )}
      </div>

      <div className="signal-summary-card__recommendation">
        <Lightbulb size={16} className="recommendation-icon" />
        <span>{recommendation}</span>
      </div>
    </div>
  );
};

// ============================================
// GRADE BADGE COMPONENT
// ============================================

const GradeBadge = ({ healthScore }) => {
  const grade = getGrade(healthScore);
  return (
    <span className={`grade-badge grade-badge--${grade.letter}`}>
      {grade.letter}
    </span>
  );
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

const ICValue = ({ value, label }) => {
  const icValue = value || 0;
  const displayValue = (icValue * 100).toFixed(1);

  // IC interpretation: > 0.05 is good, > 0.02 is okay, < 0 is bad
  let status = 'neutral';
  let interpretation = 'Weak';
  if (icValue > 0.05) {
    status = 'positive';
    interpretation = 'Strong';
  } else if (icValue > 0.02) {
    status = 'warning';
    interpretation = 'Moderate';
  } else if (icValue <= 0) {
    status = 'negative';
    interpretation = 'None';
  }

  return (
    <div className="ic-value-item">
      <div className="ic-value-item__label">{label}</div>
      <div className={`ic-value-item__value ic-value-item__value--${status}`}>
        {displayValue}%
      </div>
      <div className={`ic-value-item__interpretation ic-value-item__interpretation--${status}`}>
        {interpretation}
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
  const [showDetails, setShowDetails] = useState(false);

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
        // API spreads data directly on response, not under data.data
        const { success, ...reportData } = data;
        setHealthReport(reportData);
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
        // API returns { success, signals, summary, ... }
        setICDecay(data.signals || {});
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
        // API returns { success, signals, ... }
        setHitRates(data.signals || {});
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
        // API returns { success, signals, regimeCounts, ... }
        setRegimeStability({
          signals: data.signals || {},
          regimeCounts: data.regimeCounts || {},
          currentRegime: Object.keys(data.regimeCounts || {})[0] || 'Unknown',
          stabilityScore: 0.5 // Default
        });
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
        // API returns { success, signalType, dataPoints, trend, currentIC }
        const { success, ...rollingData } = data;
        setRollingIC(prev => ({ ...prev, [signalType]: rollingData }));
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
            <h3>No Signal Data Available</h3>
            <p>
              {healthReport?.error || healthReport?.message || 'Signal validation requires aggregated signals with corresponding price history.'}
            </p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 'var(--space-2)' }}>
              Run signal calculations for stocks in your watchlist to generate validation data.
            </p>
            <Button onClick={handleRecalculate} disabled={refreshing}>
              {refreshing ? 'Calculating...' : 'Try Recalculate'}
            </Button>
          </div>
        </Card>
      );
    }

    const signals = Object.entries(healthReport.signals || {});

    return (
      <div className="validation-overview">
        {/* Signal Summary Card - Hero section */}
        <SignalSummaryCard signals={healthReport.signals || {}} />

        {/* Simplified Signal Table */}
        <div className="validation-signals-table">
          <div className="validation-signals-table__header">
            <h3>Signal Performance</h3>
            <label className="show-details-toggle">
              <input
                type="checkbox"
                checked={showDetails}
                onChange={(e) => setShowDetails(e.target.checked)}
              />
              <span>Show Details</span>
            </label>
          </div>
          <table className="validation-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Grade</th>
                <th>Accuracy</th>
                <th>Insight</th>
                {showDetails && (
                  <>
                    <th>IC (1D)</th>
                    <th>IC (5D)</th>
                    <th>IC (21D)</th>
                    <th>Coverage</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {signals.map(([key, signal]) => {
                const accuracy = Math.round((signal.hitRate || 0) * 100);
                return (
                  <tr key={key}>
                    <td>{SIGNAL_NAMES[key] || key}</td>
                    <td>
                      <GradeBadge healthScore={signal.healthScore || 0} />
                    </td>
                    <td className={accuracy >= 50 ? 'positive' : 'negative'}>
                      {accuracy}%
                    </td>
                    <td className="insight-cell">
                      {getInsight(signal)}
                    </td>
                    {showDetails && (
                      <>
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
                          {signal.coverage ? `${(signal.coverage * 100).toFixed(1)}%` : '-'}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
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
          Information Coefficient (IC) measures how well signals predict future returns.
          Higher values = better predictions. Watch how IC changes across time horizons.
        </p>
        <div className="ic-decay-grid">
          {Object.entries(icDecay).map(([signalType, data]) => {
            // Determine overall signal quality
            const avgIC = (
              (data.ic_1d || 0) + (data.ic_5d || 0) +
              (data.ic_21d || 0) + (data.ic_63d || 0)
            ) / 4;
            const overallGrade = getGrade(50 + avgIC * 300); // Scale IC to health score

            return (
              <Card key={signalType} className="ic-decay-card">
                <div className="ic-decay-card__header">
                  <h4>{SIGNAL_NAMES[signalType] || signalType}</h4>
                  <GradeBadge healthScore={50 + avgIC * 300} />
                </div>
                <div className="ic-decay-values">
                  {Object.entries(PERIOD_NAMES).map(([period, label]) => (
                    <ICValue
                      key={period}
                      value={data[`ic_${period}`] || 0}
                      label={label}
                    />
                  ))}
                </div>
                {data.optimalHorizon && (
                  <div className="ic-decay-card__footer">
                    Best horizon: <strong>{PERIOD_NAMES[data.optimalHorizon] || data.optimalHorizon}</strong>
                  </div>
                )}
              </Card>
            );
          })}
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
        <Button
          onClick={handleRecalculate}
          disabled={refreshing}
          size="md"
          loading={refreshing}
          icon={RefreshCw}
        >
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
