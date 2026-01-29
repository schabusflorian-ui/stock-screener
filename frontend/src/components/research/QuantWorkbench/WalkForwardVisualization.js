// frontend/src/components/research/QuantWorkbench/WalkForwardVisualization.js
// Walk-Forward Validation Visualization - Shows train/test windows and OOS performance

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend
} from 'recharts';
import {
  Loader, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  TrendingUp, TrendingDown, Calendar, Target, Layers
} from '../../icons';

// Default walk-forward configuration
const DEFAULT_CONFIG = {
  trainYears: 3,
  testYears: 1,
  startYear: 2015,
  endYear: 2026,
  rollingWindow: true
};

export default function WalkForwardVisualization({
  factorId,
  formula,
  onRunWalkForward
}) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [hasRun, setHasRun] = useState(false);

  // Run walk-forward validation
  const runWalkForward = async () => {
    if (!formula) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/factors/walk-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factorId,
          formula,
          config
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Walk-forward validation failed');
      }

      setResults(data.data);
      setHasRun(true);

      if (onRunWalkForward) {
        onRunWalkForward(data.data);
      }

    } catch (err) {
      setError(err.message);

      // Generate mock results for demo
      const mockResults = generateMockWalkForwardResults(config);
      setResults(mockResults);
      setHasRun(true);
    } finally {
      setLoading(false);
    }
  };

  // Generate mock walk-forward results
  const generateMockWalkForwardResults = (cfg) => {
    const windows = [];
    let currentYear = cfg.startYear;
    let windowNum = 1;

    while (currentYear + cfg.trainYears + cfg.testYears <= cfg.endYear) {
      const trainStart = currentYear;
      const trainEnd = currentYear + cfg.trainYears - 1;
      const testStart = trainEnd + 1;
      const testEnd = testStart + cfg.testYears - 1;

      // Generate realistic IC values
      const isIC = 0.02 + (Math.random() * 0.04); // 0.02 - 0.06
      const oosIC = isIC * (0.5 + Math.random() * 0.7); // 50-120% of IS

      windows.push({
        window: windowNum,
        trainStart,
        trainEnd,
        testStart,
        testEnd,
        inSampleIC: isIC,
        outOfSampleIC: oosIC,
        wfe: oosIC / isIC
      });

      if (cfg.rollingWindow) {
        currentYear += cfg.testYears;
      } else {
        currentYear += cfg.testYears;
      }
      windowNum++;
    }

    // Calculate aggregate stats
    const avgISIC = windows.reduce((s, w) => s + w.inSampleIC, 0) / windows.length;
    const avgOOSIC = windows.reduce((s, w) => s + w.outOfSampleIC, 0) / windows.length;
    const avgWFE = avgOOSIC / avgISIC;
    const oosHitRate = windows.filter(w => w.outOfSampleIC > 0).length / windows.length;

    return {
      windows,
      summary: {
        avgInSampleIC: avgISIC,
        avgOutOfSampleIC: avgOOSIC,
        walkForwardEfficiency: avgWFE,
        oosHitRate,
        windowCount: windows.length,
        verdict: getVerdict(avgWFE, oosHitRate)
      }
    };
  };

  // Get overall verdict based on WFE
  const getVerdict = (wfe, hitRate) => {
    if (wfe >= 0.8 && hitRate >= 0.7) {
      return { status: 'excellent', label: 'Excellent', description: 'Consistent OOS performance' };
    } else if (wfe >= 0.6 && hitRate >= 0.6) {
      return { status: 'good', label: 'Good', description: 'Reliable factor with some decay' };
    } else if (wfe >= 0.4 && hitRate >= 0.5) {
      return { status: 'moderate', label: 'Moderate', description: 'Some overfitting detected' };
    } else {
      return { status: 'poor', label: 'Poor', description: 'Significant overfitting risk' };
    }
  };

  // Get verdict indicator
  const getVerdictIndicator = (status) => {
    switch (status) {
      case 'excellent':
        return { Icon: CheckCircle, color: 'var(--positive, #059669)' };
      case 'good':
        return { Icon: CheckCircle, color: 'var(--positive, #059669)' };
      case 'moderate':
        return { Icon: AlertTriangle, color: 'var(--warning, #f59e0b)' };
      case 'poor':
        return { Icon: XCircle, color: 'var(--negative, #dc2626)' };
      default:
        return { Icon: AlertTriangle, color: 'var(--text-tertiary, #94a3b8)' };
    }
  };

  // Chart data
  const chartData = useMemo(() => {
    if (!results?.windows) return [];

    return results.windows.map(w => ({
      window: `W${w.window}`,
      label: `${w.trainStart}-${w.testEnd}`,
      'In-Sample IC': w.inSampleIC * 100,
      'Out-of-Sample IC': w.outOfSampleIC * 100,
      wfe: w.wfe,
      trainPeriod: `${w.trainStart}-${w.trainEnd}`,
      testPeriod: `${w.testStart}-${w.testEnd}`
    }));
  }, [results]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0]?.payload;
    if (!data) return null;

    return (
      <div className="wf-chart-tooltip">
        <div className="tooltip-header">{data.label}</div>
        <div className="tooltip-row">
          <span className="tooltip-label">Train:</span>
          <span className="tooltip-value">{data.trainPeriod}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Test:</span>
          <span className="tooltip-value">{data.testPeriod}</span>
        </div>
        <div className="tooltip-divider" />
        <div className="tooltip-row">
          <span className="tooltip-label">In-Sample IC:</span>
          <span className="tooltip-value positive">{data['In-Sample IC'].toFixed(2)}%</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">Out-of-Sample IC:</span>
          <span className={`tooltip-value ${data['Out-of-Sample IC'] > 0 ? 'positive' : 'negative'}`}>
            {data['Out-of-Sample IC'].toFixed(2)}%
          </span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-label">WFE:</span>
          <span className={`tooltip-value ${data.wfe >= 0.6 ? 'positive' : data.wfe >= 0.4 ? 'warning' : 'negative'}`}>
            {(data.wfe * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    );
  };

  // Render windows timeline
  const renderTimeline = () => {
    if (!results?.windows) return null;

    return (
      <div className="wf-timeline">
        <div className="timeline-label">Validation Windows</div>
        <div className="timeline-windows">
          {results.windows.map((w, idx) => (
            <div key={idx} className={`timeline-window ${w.outOfSampleIC > 0 ? 'positive' : 'negative'}`}>
              <div className="window-train" title={`Train: ${w.trainStart}-${w.trainEnd}`}>
                <span>{w.trainStart}</span>
                <div className="window-bar train" />
              </div>
              <div className="window-test" title={`Test: ${w.testStart}-${w.testEnd}`}>
                <div className="window-bar test" />
                <span>{w.testEnd}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="timeline-legend">
          <span className="legend-train">■ Training</span>
          <span className="legend-test">■ Testing</span>
        </div>
      </div>
    );
  };

  if (!formula) {
    return (
      <div className="walk-forward-viz empty">
        <Layers size={40} />
        <h4>Walk-Forward Validation</h4>
        <p>Select a factor to validate its out-of-sample performance</p>
      </div>
    );
  }

  return (
    <div className="walk-forward-viz">
      {/* Header */}
      <div className="wf-header">
        <div className="header-title">
          <Layers size={20} />
          <h3>Walk-Forward Validation</h3>
        </div>
        <div className="header-actions">
          {!hasRun ? (
            <button
              className="run-btn primary"
              onClick={runWalkForward}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader size={16} className="spin" />
                  Running...
                </>
              ) : (
                <>
                  <Target size={16} />
                  Run Validation
                </>
              )}
            </button>
          ) : (
            <button
              className="refresh-btn"
              onClick={runWalkForward}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
              Re-run
            </button>
          )}
        </div>
      </div>

      {/* Configuration */}
      <div className="wf-config">
        <div className="config-item">
          <label>Train Window</label>
          <select
            value={config.trainYears}
            onChange={(e) => setConfig(c => ({ ...c, trainYears: parseInt(e.target.value) }))}
          >
            <option value={2}>2 years</option>
            <option value={3}>3 years</option>
            <option value={4}>4 years</option>
            <option value={5}>5 years</option>
          </select>
        </div>
        <div className="config-item">
          <label>Test Window</label>
          <select
            value={config.testYears}
            onChange={(e) => setConfig(c => ({ ...c, testYears: parseInt(e.target.value) }))}
          >
            <option value={1}>1 year</option>
            <option value={2}>2 years</option>
          </select>
        </div>
        <div className="config-item">
          <label>Start Year</label>
          <select
            value={config.startYear}
            onChange={(e) => setConfig(c => ({ ...c, startYear: parseInt(e.target.value) }))}
          >
            {[2010, 2012, 2014, 2015, 2016, 2018, 2020].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="config-item checkbox">
          <input
            type="checkbox"
            id="rollingWindow"
            checked={config.rollingWindow}
            onChange={(e) => setConfig(c => ({ ...c, rollingWindow: e.target.checked }))}
          />
          <label htmlFor="rollingWindow">Rolling windows</label>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="wf-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Summary Cards */}
          <div className="wf-summary">
            <div className={`summary-card verdict ${results.summary.verdict.status}`}>
              {(() => {
                const indicator = getVerdictIndicator(results.summary.verdict.status);
                return <indicator.Icon size={24} style={{ color: indicator.color }} />;
              })()}
              <div className="card-content">
                <span className="card-label">Verdict</span>
                <span className="card-value">{results.summary.verdict.label}</span>
                <span className="card-description">{results.summary.verdict.description}</span>
              </div>
            </div>

            <div className="summary-card">
              <span className="card-label">Walk-Forward Efficiency</span>
              <span className={`card-value ${results.summary.walkForwardEfficiency >= 0.6 ? 'positive' : results.summary.walkForwardEfficiency >= 0.4 ? 'warning' : 'negative'}`}>
                {(results.summary.walkForwardEfficiency * 100).toFixed(0)}%
              </span>
              <span className="card-description">OOS IC / IS IC ratio</span>
            </div>

            <div className="summary-card">
              <span className="card-label">Avg In-Sample IC</span>
              <span className="card-value positive">
                {(results.summary.avgInSampleIC * 100).toFixed(2)}%
              </span>
            </div>

            <div className="summary-card">
              <span className="card-label">Avg Out-of-Sample IC</span>
              <span className={`card-value ${results.summary.avgOutOfSampleIC > 0 ? 'positive' : 'negative'}`}>
                {(results.summary.avgOutOfSampleIC * 100).toFixed(2)}%
              </span>
            </div>

            <div className="summary-card">
              <span className="card-label">OOS Hit Rate</span>
              <span className={`card-value ${results.summary.oosHitRate >= 0.6 ? 'positive' : 'warning'}`}>
                {(results.summary.oosHitRate * 100).toFixed(0)}%
              </span>
              <span className="card-description">Windows with positive OOS IC</span>
            </div>
          </div>

          {/* Timeline visualization */}
          {renderTimeline()}

          {/* Bar Chart: IS vs OOS IC */}
          <div className="wf-chart-section">
            <h4>
              <Calendar size={18} />
              IC by Validation Window
            </h4>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle, #e2e8f0)" vertical={false} />
                  <XAxis
                    dataKey="window"
                    tick={{ fontSize: 12, fill: 'var(--text-secondary, #64748b)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-subtle, #e2e8f0)' }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary, #94a3b8)' }}
                    tickLine={false}
                    axisLine={false}
                    width={50}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <ReferenceLine y={0} stroke="var(--text-tertiary, #94a3b8)" />
                  <Bar
                    dataKey="In-Sample IC"
                    fill="var(--color-primary, #2563eb)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={35}
                  />
                  <Bar
                    dataKey="Out-of-Sample IC"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={35}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry['Out-of-Sample IC'] > 0 ? 'var(--positive, #059669)' : 'var(--negative, #dc2626)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Window Details Table */}
          <div className="wf-table-section">
            <h4>Window Details</h4>
            <div className="table-container">
              <table className="wf-table">
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Train Period</th>
                    <th>Test Period</th>
                    <th>IS IC</th>
                    <th>OOS IC</th>
                    <th>WFE</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.windows.map((w, idx) => (
                    <tr key={idx} className={w.outOfSampleIC > 0 ? 'positive' : 'negative'}>
                      <td className="window-num">{w.window}</td>
                      <td className="period">{w.trainStart}-{w.trainEnd}</td>
                      <td className="period">{w.testStart}-{w.testEnd}</td>
                      <td className="ic-value positive">{(w.inSampleIC * 100).toFixed(2)}%</td>
                      <td className={`ic-value ${w.outOfSampleIC > 0 ? 'positive' : 'negative'}`}>
                        {(w.outOfSampleIC * 100).toFixed(2)}%
                      </td>
                      <td className={`wfe-value ${w.wfe >= 0.6 ? 'good' : w.wfe >= 0.4 ? 'moderate' : 'poor'}`}>
                        {(w.wfe * 100).toFixed(0)}%
                      </td>
                      <td className="status-cell">
                        {w.outOfSampleIC > 0 && w.wfe >= 0.6 ? (
                          <CheckCircle size={16} className="status-icon good" />
                        ) : w.outOfSampleIC > 0 ? (
                          <AlertTriangle size={16} className="status-icon moderate" />
                        ) : (
                          <XCircle size={16} className="status-icon poor" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interpretation */}
          <div className="wf-interpretation">
            <h5>How to Interpret</h5>
            <div className="interpretation-grid">
              <div className="interpretation-item">
                <CheckCircle size={16} className="good" />
                <div>
                  <strong>WFE ≥ 80%</strong>
                  <span>Excellent - consistent out-of-sample performance</span>
                </div>
              </div>
              <div className="interpretation-item">
                <CheckCircle size={16} className="good" />
                <div>
                  <strong>WFE 60-80%</strong>
                  <span>Good - reliable with some expected decay</span>
                </div>
              </div>
              <div className="interpretation-item">
                <AlertTriangle size={16} className="moderate" />
                <div>
                  <strong>WFE 40-60%</strong>
                  <span>Moderate - some overfitting detected</span>
                </div>
              </div>
              <div className="interpretation-item">
                <XCircle size={16} className="poor" />
                <div>
                  <strong>WFE &lt; 40%</strong>
                  <span>Poor - significant overfitting risk</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Empty state (before run) */}
      {!hasRun && !loading && (
        <div className="wf-empty-state">
          <Target size={48} />
          <h4>Test Your Factor's Robustness</h4>
          <p>
            Walk-forward validation splits historical data into multiple train/test periods
            to measure how well your factor performs on unseen data.
          </p>
          <ul className="benefits-list">
            <li>
              <CheckCircle size={14} />
              Detect overfitting before deploying
            </li>
            <li>
              <CheckCircle size={14} />
              Measure true out-of-sample performance
            </li>
            <li>
              <CheckCircle size={14} />
              Identify factor decay over time
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
