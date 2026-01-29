// frontend/src/components/settings/TCABenchmarkPanel.js
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  TrendingDown,
  DollarSign,
  BarChart3,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Info,
  Clock,
  TrendingUp,
  Save
} from '../icons';
import { tcaAPI } from '../../services/api';
import './TCABenchmarkPanel.css';

/**
 * Status badge component for pass/fail indicators
 */
const StatusBadge = ({ pass, label }) => {
  const Icon = pass ? CheckCircle : XCircle;
  return (
    <span className={`tca-status-badge ${pass ? 'tca-status-badge--pass' : 'tca-status-badge--fail'}`}>
      <Icon size={14} />
      {label || (pass ? 'PASS' : 'FAIL')}
    </span>
  );
};

/**
 * Simple trend chart component for TCA history
 */
const TrendChart = ({ data, metric, color = '#7C3AED', height = 120 }) => {
  if (!data || data.length === 0) {
    return (
      <div className="tca-trend-chart tca-trend-chart--empty">
        <span>No historical data available</span>
      </div>
    );
  }

  const values = data.map(d => d[metric]).filter(v => v != null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 100;
  const padding = 4;

  // Generate SVG path
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;

  // Area fill path
  const areaPoints = [...points, `${width - padding},${height - padding}`, `${padding},${height - padding}`];
  const areaD = `M ${points[0]} L ${points.slice(1).join(' L ')} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

  return (
    <div className="tca-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* Area fill */}
        <path d={areaD} fill={`${color}20`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data points */}
        {values.length <= 15 && values.map((v, i) => {
          const x = (i / (values.length - 1 || 1)) * (width - padding * 2) + padding;
          const y = height - padding - ((v - min) / range) * (height - padding * 2);
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="tca-trend-chart__labels">
        <span className="tca-trend-chart__min">{min.toFixed(1)} bps</span>
        <span className="tca-trend-chart__max">{max.toFixed(1)} bps</span>
      </div>
    </div>
  );
};

/**
 * Metric card component for displaying TCA metrics
 */
const MetricCard = ({ title, value, subtitle, threshold, pass, icon: Icon }) => {
  const statusClass = pass === undefined ? '' : pass ? 'tca-metric--pass' : 'tca-metric--fail';

  return (
    <div className={`tca-metric ${statusClass}`}>
      <div className="tca-metric__header">
        {Icon && <Icon size={18} className="tca-metric__icon" />}
        <span className="tca-metric__title">{title}</span>
      </div>
      <div className="tca-metric__value">
        {value !== null && value !== undefined ? value : 'N/A'}
      </div>
      <div className="tca-metric__footer">
        <span className="tca-metric__subtitle">{subtitle}</span>
        {threshold !== undefined && (
          <span className="tca-metric__threshold">
            threshold: {threshold} bps
          </span>
        )}
      </div>
      {pass !== undefined && (
        <div className="tca-metric__status">
          <StatusBadge pass={pass} />
        </div>
      )}
    </div>
  );
};

/**
 * TCA Benchmark Panel - Displays execution quality analysis
 */
function TCABenchmarkPanel() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [thresholds, setThresholds] = useState(null);
  const [historyTrend, setHistoryTrend] = useState([]);
  const [historyRuns, setHistoryRuns] = useState([]);
  const [historyStats, setHistoryStats] = useState(null);
  const [historyPeriod, setHistoryPeriod] = useState('-30 days');

  // Fetch TCA benchmark results (without saving)
  const runBenchmark = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [benchmarkRes, thresholdsRes] = await Promise.all([
        tcaAPI.runBenchmark(),
        tcaAPI.getThresholds()
      ]);

      if (benchmarkRes.data?.success) {
        setData(benchmarkRes.data.data);
      } else {
        setError(benchmarkRes.data?.error || 'Failed to run benchmark');
      }

      if (thresholdsRes.data?.success) {
        setThresholds(thresholdsRes.data.data);
      }
    } catch (err) {
      console.error('TCA benchmark error:', err);
      setError(err.message || 'Failed to run TCA benchmark');
    } finally {
      setLoading(false);
    }
  }, []);

  // Run benchmark AND save to history
  const runAndSaveBenchmark = useCallback(async () => {
    setSaving(true);
    setError(null);

    try {
      const [benchmarkRes, thresholdsRes] = await Promise.all([
        tcaAPI.runBenchmarkAndSave({ runType: 'manual' }),
        tcaAPI.getThresholds()
      ]);

      if (benchmarkRes.data?.success) {
        setData(benchmarkRes.data.data);
        // Refresh history after saving
        fetchHistory();
      } else {
        setError(benchmarkRes.data?.error || 'Failed to run benchmark');
      }

      if (thresholdsRes.data?.success) {
        setThresholds(thresholdsRes.data.data);
      }
    } catch (err) {
      console.error('TCA benchmark error:', err);
      setError(err.message || 'Failed to run TCA benchmark');
    } finally {
      setSaving(false);
    }
  }, []);

  // Fetch historical data
  const fetchHistory = useCallback(async () => {
    try {
      const [trendRes, statsRes, historyRes] = await Promise.all([
        tcaAPI.getHistoryTrend(historyPeriod),
        tcaAPI.getHistoryStats(historyPeriod),
        tcaAPI.getHistory(30)
      ]);

      if (trendRes.data?.success) {
        setHistoryTrend(trendRes.data.data.trend || []);
      }

      if (statsRes.data?.success) {
        setHistoryStats(statsRes.data.data);
      }

      if (historyRes.data?.success) {
        setHistoryRuns(historyRes.data.data.results || []);
      }
    } catch (err) {
      console.warn('Failed to fetch TCA history:', err.message);
    }
  }, [historyPeriod]);

  // Load on mount
  useEffect(() => {
    runBenchmark();
    fetchHistory();
  }, [runBenchmark, fetchHistory]);

  // Format basis points
  const formatBps = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'N/A';
    return `${parseFloat(value).toFixed(2)} bps`;
  };

  // Render loading state
  if (loading && !data) {
    return (
      <div className="tca-benchmark-panel">
        <div className="tca-loading">
          <RefreshCw className="tca-loading__spinner" size={24} />
          <span>Running TCA Benchmark...</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !data) {
    return (
      <div className="tca-benchmark-panel">
        <div className="tca-error">
          <AlertTriangle size={24} />
          <span>{error}</span>
          <button onClick={runBenchmark} className="tca-retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const passFail = data?.passFail;
  const byTier = data?.byLiquidityTier;

  return (
    <div className="tca-benchmark-panel">
      {/* Header */}
      <div className="tca-benchmark-panel__header">
        <div className="tca-benchmark-panel__title">
          <BarChart3 size={24} />
          <h2>Transaction Cost Analysis (TCA)</h2>
        </div>
        <div className="tca-benchmark-panel__actions">
          <button
            onClick={runBenchmark}
            disabled={loading || saving}
            className="tca-run-btn tca-run-btn--secondary"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            {loading ? 'Running...' : 'Run'}
          </button>
          <button
            onClick={runAndSaveBenchmark}
            disabled={loading || saving}
            className="tca-run-btn"
            title="Run benchmark and save results to history"
          >
            <Save size={16} className={saving ? 'spinning' : ''} />
            {saving ? 'Saving...' : 'Run & Save'}
          </button>
        </div>
      </div>

      {/* Overall Status */}
      {data && (
        <div className={`tca-overall-status ${data.overallPass ? 'tca-overall-status--pass' : 'tca-overall-status--fail'}`}>
          <div className="tca-overall-status__icon">
            {data.overallPass ? <CheckCircle size={32} /> : <XCircle size={32} />}
          </div>
          <div className="tca-overall-status__text">
            <span className="tca-overall-status__label">Overall Status</span>
            <span className="tca-overall-status__value">
              {data.overallPass ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <div className="tca-overall-status__rate">
            {Math.round((data.passRate || 0) * 100)}% tests passing
          </div>
          <div className="tca-overall-status__trades">
            {data.tradeCount || summary?.totalTrades || 0} trades analyzed
          </div>
        </div>
      )}

      {/* Summary Metrics Grid */}
      {summary && (
        <div className="tca-metrics-grid">
          <MetricCard
            title="Implementation Shortfall"
            value={formatBps(summary.implementationShortfall?.median)}
            subtitle="Median (decision → execution)"
            threshold={passFail?.implementationShortfall?.threshold}
            pass={passFail?.implementationShortfall?.pass}
            icon={TrendingDown}
          />
          <MetricCard
            title="VWAP Deviation"
            value={formatBps(summary.vwapDeviation?.median)}
            subtitle="Median vs market VWAP"
            threshold={passFail?.vwapDeviation?.threshold}
            pass={passFail?.vwapDeviation?.pass}
            icon={Activity}
          />
          <MetricCard
            title="Market Impact"
            value={formatBps(summary.marketImpact?.median)}
            subtitle="Median price impact"
            threshold={passFail?.marketImpact?.threshold}
            pass={passFail?.marketImpact?.pass}
            icon={BarChart3}
          />
          <MetricCard
            title="Spread Cost"
            value={formatBps(summary.spreadCost?.median)}
            subtitle="Median half-spread"
            threshold={passFail?.spreadCost?.threshold}
            pass={passFail?.spreadCost?.pass}
            icon={DollarSign}
          />
        </div>
      )}

      {/* Liquidity Tier Breakdown */}
      {byTier && Object.keys(byTier).length > 0 && (
        <div className="tca-tier-section">
          <h3 className="tca-section-title">
            <Info size={18} />
            By Liquidity Tier
          </h3>
          <table className="tca-tier-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Count</th>
                <th>Impl. Shortfall</th>
                <th>VWAP Dev.</th>
                <th>Market Impact</th>
                <th>Threshold (IS)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byTier).map(([tier, tierData]) => (
                <tr key={tier}>
                  <td className="tca-tier-name">{tier.replace('_', ' ')}</td>
                  <td>{tierData.count}</td>
                  <td className={tierData.implementationShortfall <= tierData.thresholds?.implementationShortfall ? 'positive' : 'negative'}>
                    {formatBps(tierData.implementationShortfall)}
                  </td>
                  <td className={tierData.vwapDeviation <= tierData.thresholds?.vwapDeviation ? 'positive' : 'negative'}>
                    {formatBps(tierData.vwapDeviation)}
                  </td>
                  <td className={tierData.marketImpact <= tierData.thresholds?.marketImpact ? 'positive' : 'negative'}>
                    {formatBps(tierData.marketImpact)}
                  </td>
                  <td className="tca-threshold-cell">
                    {formatBps(tierData.thresholds?.implementationShortfall)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Historical Trend Section */}
      <div className="tca-history-section">
        <div className="tca-section-header">
          <h3 className="tca-section-title">
            <Clock size={18} />
            Historical Trends
          </h3>
          <select
            value={historyPeriod}
            onChange={(e) => setHistoryPeriod(e.target.value)}
            className="tca-period-select"
          >
            <option value="-7 days">Last 7 Days</option>
            <option value="-30 days">Last 30 Days</option>
            <option value="-90 days">Last 90 Days</option>
            <option value="-180 days">Last 6 Months</option>
          </select>
        </div>

        {(historyTrend.length > 0 || historyRuns.length > 0) ? (
          <>
            {/* Summary stats */}
            {historyStats && historyStats.totalRuns > 0 && (
              <div className="tca-history-stats">
                <div className="tca-history-stat">
                  <span className="tca-history-stat__label">Total Runs</span>
                  <span className="tca-history-stat__value">{historyStats.totalRuns}</span>
                </div>
                <div className="tca-history-stat">
                  <span className="tca-history-stat__label">Pass Rate</span>
                  <span className={`tca-history-stat__value ${historyStats.passRate >= 0.9 ? 'positive' : historyStats.passRate >= 0.7 ? 'warning' : 'negative'}`}>
                    {(historyStats.passRate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="tca-history-stat">
                  <span className="tca-history-stat__label">Avg IS</span>
                  <span className="tca-history-stat__value">{historyStats.avgImplementationShortfall?.toFixed(2)} bps</span>
                </div>
                <div className="tca-history-stat">
                  <span className="tca-history-stat__label">Avg VWAP Dev</span>
                  <span className="tca-history-stat__value">{historyStats.avgVwapDeviation?.toFixed(2)} bps</span>
                </div>
              </div>
            )}

            {/* Trend charts */}
            <div className="tca-trend-charts">
              <div className="tca-trend-card">
                <div className="tca-trend-card__header">
                  <TrendingDown size={16} />
                  <span>Implementation Shortfall</span>
                </div>
                <TrendChart data={historyTrend} metric="implementationShortfall" color="#DC2626" />
              </div>
              <div className="tca-trend-card">
                <div className="tca-trend-card__header">
                  <Activity size={16} />
                  <span>VWAP Deviation</span>
                </div>
                <TrendChart data={historyTrend} metric="vwapDeviation" color="#2563EB" />
              </div>
              <div className="tca-trend-card">
                <div className="tca-trend-card__header">
                  <BarChart3 size={16} />
                  <span>Market Impact</span>
                </div>
                <TrendChart data={historyTrend} metric="marketImpact" color="#D97706" />
              </div>
              <div className="tca-trend-card">
                <div className="tca-trend-card__header">
                  <TrendingUp size={16} />
                  <span>Pass Rate</span>
                </div>
                <TrendChart data={historyTrend} metric="passRate" color="#059669" />
              </div>
            </div>

            {/* Recent runs table */}
            {historyRuns.length > 0 && (
              <div className="tca-history-table-wrapper">
                <h4>Recent Benchmark Runs</h4>
                <table className="tca-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Status</th>
                      <th>Pass Rate</th>
                      <th>IS (median)</th>
                      <th>VWAP (median)</th>
                      <th>Impact (median)</th>
                      <th>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRuns.slice(0, 10).map((run, idx) => (
                      <tr key={idx}>
                        <td>{new Date(run.runDate).toLocaleDateString()}</td>
                        <td>
                          <StatusBadge pass={run.overallPass} />
                        </td>
                        <td>{(run.passRate * 100).toFixed(0)}%</td>
                        <td>{run.summary?.implementationShortfall?.median?.toFixed(2)} bps</td>
                        <td>{run.summary?.vwapDeviation?.median?.toFixed(2)} bps</td>
                        <td>{run.summary?.marketImpact?.median?.toFixed(2)} bps</td>
                        <td>{run.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="tca-history-empty">
            <Info size={24} />
            <p>No historical data available yet.</p>
            <p>Click "Run & Save" to record benchmark results for trending.</p>
          </div>
        )}
      </div>

      {/* Thresholds Reference */}
      {thresholds && (
        <div className="tca-thresholds-section">
          <h3 className="tca-section-title">
            <Info size={18} />
            Production Thresholds Reference
          </h3>
          <div className="tca-thresholds-grid">
            {Object.entries(thresholds).map(([tier, values]) => (
              <div key={tier} className="tca-threshold-card">
                <h4>{tier.replace('_', ' ')}</h4>
                <ul>
                  <li>
                    <span>Implementation Shortfall:</span>
                    <strong>&lt; {values.implementationShortfall} bps</strong>
                  </li>
                  <li>
                    <span>VWAP Deviation:</span>
                    <strong>&lt; {values.vwapDeviation} bps</strong>
                  </li>
                  <li>
                    <span>Market Impact:</span>
                    <strong>&lt; {values.marketImpact} bps</strong>
                  </li>
                  <li>
                    <span>Spread Cost:</span>
                    <strong>&lt; {values.spreadCost} bps</strong>
                  </li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="tca-info-footer">
        <Info size={14} />
        <span>
          TCA benchmarks measure execution quality against production-ready thresholds.
          Lower values indicate better execution quality.
        </span>
      </div>
    </div>
  );
}

export default TCABenchmarkPanel;
