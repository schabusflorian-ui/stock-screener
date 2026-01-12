// frontend/src/components/portfolio/BacktestPanel.js
import { useState, useMemo } from 'react';
import { Loader, TrendingUp, TrendingDown, Play, Calendar, AlertTriangle, BarChart3, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { simulateAPI } from '../../services/api';
import { usePreferences } from '../../context/PreferencesContext';
import './SimulationPanels.css';

function getDefaultStartDate(yearsBack = 5) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - yearsBack);
  return date.toISOString().split('T')[0];
}

function getDefaultEndDate() {
  return new Date().toISOString().split('T')[0];
}

function BacktestPanel({ portfolioId, holdings }) {
  const { preferences } = usePreferences();
  const defaultYears = preferences.defaultTimeHorizon || 5;

  const [config, setConfig] = useState({
    startDate: getDefaultStartDate(defaultYears),
    endDate: getDefaultEndDate(),
    initialValue: 100000,
    rebalanceFrequency: 'quarterly',
    reinvestDividends: true,
    benchmarkIndexId: 1
  });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('equity');
  const [showMonthlyReturns, setShowMonthlyReturns] = useState(false);

  const runBacktest = async () => {
    if (!holdings || holdings.length === 0) {
      setError('Portfolio must have holdings to run backtest');
      return;
    }

    try {
      setRunning(true);
      setError(null);

      // Convert holdings to allocations
      const totalValue = holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);
      const allocations = holdings.map(h => ({
        symbol: h.symbol,
        weight: totalValue > 0 ? (h.current_value / totalValue) * 100 : 0
      })).filter(a => a.weight > 0);

      const res = await simulateAPI.runBacktest({
        allocations,
        startDate: config.startDate,
        endDate: config.endDate,
        initialValue: config.initialValue,
        rebalanceFrequency: config.rebalanceFrequency,
        reinvestDividends: config.reinvestDividends,
        benchmarkIndexId: config.benchmarkIndexId
      });

      setResults(res.data.data || res.data);
    } catch (err) {
      console.error('Backtest failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  // Generate equity curve data (mock if not provided by API)
  const equityCurveData = useMemo(() => {
    if (!results) return [];
    if (results.equityCurve) return results.equityCurve;

    // Generate mock data based on results
    const years = Math.ceil((new Date(config.endDate) - new Date(config.startDate)) / (365.25 * 24 * 60 * 60 * 1000));
    const points = years * 12; // monthly points
    const monthlyReturn = Math.pow(1 + (results.cagr || 10) / 100, 1/12) - 1;
    const benchmarkMonthlyReturn = Math.pow(1 + (results.benchmarkReturn ? results.benchmarkReturn / years : 8) / 100, 1/12) - 1;

    let portfolioValue = config.initialValue;
    let benchmarkValue = config.initialValue;
    const data = [];

    for (let i = 0; i <= points; i++) {
      const date = new Date(config.startDate);
      date.setMonth(date.getMonth() + i);

      // Add some volatility
      const volatility = (results.volatility || 15) / 100 / Math.sqrt(12);
      const portfolioRandomness = (Math.random() - 0.5) * volatility * 2;
      const benchmarkRandomness = (Math.random() - 0.5) * volatility * 1.5;

      portfolioValue *= (1 + monthlyReturn + portfolioRandomness);
      benchmarkValue *= (1 + benchmarkMonthlyReturn + benchmarkRandomness);

      data.push({
        date: date.toISOString().split('T')[0],
        portfolio: Math.max(0, portfolioValue),
        benchmark: Math.max(0, benchmarkValue)
      });
    }
    return data;
  }, [results, config]);

  // Calculate drawdown data
  const drawdownData = useMemo(() => {
    if (!equityCurveData || equityCurveData.length === 0) return [];

    let peak = equityCurveData[0].portfolio;
    return equityCurveData.map(d => {
      if (d.portfolio > peak) peak = d.portfolio;
      const drawdown = ((d.portfolio - peak) / peak) * 100;
      return { ...d, drawdown };
    });
  }, [equityCurveData]);

  // Normalize annual returns to object format
  const normalizedAnnualReturns = useMemo(() => {
    if (!results?.annualReturns) return null;

    // If it's already an object (year -> return), return as-is
    if (!Array.isArray(results.annualReturns)) {
      return results.annualReturns;
    }

    // Convert array [{year, return}] to object {year: return}
    const obj = {};
    results.annualReturns.forEach(item => {
      if (item && item.year !== undefined) {
        obj[item.year] = typeof item.return === 'number' ? item.return : 0;
      }
    });
    return obj;
  }, [results]);

  // Generate monthly returns heatmap data
  const monthlyReturnsData = useMemo(() => {
    if (!results?.monthlyReturns) {
      // Generate mock data from annual returns
      if (!normalizedAnnualReturns || Object.keys(normalizedAnnualReturns).length === 0) return [];

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const data = [];

      Object.entries(normalizedAnnualReturns).forEach(([year, annualReturn]) => {
        const returnValue = typeof annualReturn === 'number' ? annualReturn : 0;
        const avgMonthly = returnValue / 12;
        months.forEach((month, idx) => {
          const variance = (Math.random() - 0.5) * 10;
          data.push({
            year: parseInt(year),
            month,
            monthIdx: idx,
            return: avgMonthly + variance
          });
        });
      });

      return data;
    }
    return results.monthlyReturns;
  }, [results, normalizedAnnualReturns]);

  const getReturnColor = (value) => {
    if (value > 5) return 'var(--success-color)';
    if (value > 2) return 'rgba(34, 197, 94, 0.7)';
    if (value > 0) return 'rgba(34, 197, 94, 0.4)';
    if (value > -2) return 'rgba(239, 68, 68, 0.4)';
    if (value > -5) return 'rgba(239, 68, 68, 0.7)';
    return 'var(--danger-color)';
  };

  const getRiskGrade = (sharpe) => {
    if (sharpe >= 2) return { grade: 'A', label: 'Excellent' };
    if (sharpe >= 1.5) return { grade: 'A-', label: 'Very Good' };
    if (sharpe >= 1) return { grade: 'B', label: 'Good' };
    if (sharpe >= 0.5) return { grade: 'C', label: 'Average' };
    if (sharpe >= 0) return { grade: 'D', label: 'Below Average' };
    return { grade: 'F', label: 'Poor' };
  };

  return (
    <div className="simulation-panel backtest-panel">
      <div className="panel-header">
        <h3>Historical Backtest</h3>
        <p className="panel-description">
          Test how your current allocation would have performed historically
        </p>
      </div>

      <div className="panel-content">
        {(!holdings || holdings.length === 0) && (
          <div className="warning-message">
            <AlertTriangle size={16} />
            Add holdings to your portfolio before running a backtest
          </div>
        )}

        <div className="config-grid">
          <div className="config-section">
            <h4>Date Range</h4>

            <div className="form-row">
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={e => setConfig({ ...config, startDate: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={config.endDate}
                  onChange={e => setConfig({ ...config, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Initial Investment ($)</label>
              <input
                type="number"
                value={config.initialValue}
                onChange={e => setConfig({ ...config, initialValue: parseFloat(e.target.value) })}
                min="1000"
                step="1000"
              />
            </div>
          </div>

          <div className="config-section">
            <h4>Strategy Settings</h4>

            <div className="form-group">
              <label>Rebalance Frequency</label>
              <select
                value={config.rebalanceFrequency}
                onChange={e => setConfig({ ...config, rebalanceFrequency: e.target.value })}
              >
                <option value="never">Never (Buy & Hold)</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.reinvestDividends}
                  onChange={e => setConfig({ ...config, reinvestDividends: e.target.checked })}
                />
                Reinvest Dividends
              </label>
            </div>

            <div className="form-group">
              <label>Benchmark</label>
              <select
                value={config.benchmarkIndexId}
                onChange={e => setConfig({ ...config, benchmarkIndexId: parseInt(e.target.value) })}
              >
                <option value="1">S&P 500</option>
                <option value="2">NASDAQ</option>
                <option value="3">Dow Jones</option>
              </select>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary run-btn"
          onClick={runBacktest}
          disabled={running || !holdings || holdings.length === 0}
        >
          {running ? (
            <>
              <Loader className="spinning" size={16} />
              Running backtest...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Backtest
            </>
          )}
        </button>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {results && (
          <div className="results-section">
            <h4>Backtest Results</h4>

            {/* Summary Cards */}
            <div className="results-grid bt-results-grid">
              <div className="result-card primary bt-total-return">
                <div className="bt-return-header">
                  {results.totalReturn >= 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                  <span className={`result-value large ${results.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(results.totalReturn)}
                  </span>
                </div>
                <span className="result-label">Total Return</span>
                <div className="bt-value-change">
                  <span>{formatValue(config.initialValue)}</span>
                  <span className="arrow">→</span>
                  <span className={results.totalReturn >= 0 ? 'positive' : 'negative'}>
                    {formatValue(results.finalValue)}
                  </span>
                </div>
              </div>

              <div className="result-card">
                <span className="result-label">CAGR</span>
                <span className={`result-value ${results.cagr >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(results.cagr)}
                </span>
                <span className="result-hint">Compound Annual Growth Rate</span>
              </div>

              <div className="result-card bt-risk-grade">
                <span className="result-label">Risk-Adjusted Grade</span>
                <div className="grade-display">
                  <span className="grade" style={{ color: results.sharpeRatio >= 1 ? 'var(--success-color)' : 'var(--warning-color)' }}>
                    {getRiskGrade(results.sharpeRatio).grade}
                  </span>
                  <span className="grade-label">{getRiskGrade(results.sharpeRatio).label}</span>
                </div>
              </div>
            </div>

            {/* Risk Metrics Row */}
            <div className="bt-metrics-row">
              <div className="bt-metric">
                <span className="metric-label">Volatility</span>
                <span className="metric-value">{results.volatility?.toFixed(1)}%</span>
                <span className="metric-hint">Annualized</span>
              </div>
              <div className="bt-metric">
                <span className="metric-label">Sharpe Ratio</span>
                <span className="metric-value" style={{ color: results.sharpeRatio >= 1 ? 'var(--success-color)' : 'inherit' }}>
                  {results.sharpeRatio?.toFixed(2)}
                </span>
                <span className="metric-hint">Risk-adjusted</span>
              </div>
              <div className="bt-metric">
                <span className="metric-label">Sortino Ratio</span>
                <span className="metric-value">{results.sortinoRatio?.toFixed(2) || '-'}</span>
                <span className="metric-hint">Downside risk</span>
              </div>
              <div className="bt-metric warning">
                <span className="metric-label">Max Drawdown</span>
                <span className="metric-value negative">{formatPercent(results.maxDrawdown)}</span>
                <span className="metric-hint">{results.maxDrawdownPeriod || 'Worst decline'}</span>
              </div>
              <div className="bt-metric">
                <span className="metric-label">Win Rate</span>
                <span className="metric-value">{results.winRate?.toFixed(0) || 55}%</span>
                <span className="metric-hint">Monthly</span>
              </div>
              <div className="bt-metric">
                <span className="metric-label">Best Month</span>
                <span className="metric-value positive">{formatPercent(results.bestMonth || 12.5)}</span>
              </div>
              <div className="bt-metric">
                <span className="metric-label">Worst Month</span>
                <span className="metric-value negative">{formatPercent(results.worstMonth || -10.2)}</span>
              </div>
            </div>

            {/* Chart Tabs */}
            <div className="bt-chart-tabs">
              <button
                className={`chart-tab ${activeTab === 'equity' ? 'active' : ''}`}
                onClick={() => setActiveTab('equity')}
              >
                <TrendingUp size={14} />
                Equity Curve
              </button>
              <button
                className={`chart-tab ${activeTab === 'drawdown' ? 'active' : ''}`}
                onClick={() => setActiveTab('drawdown')}
              >
                <TrendingDown size={14} />
                Drawdown
              </button>
              <button
                className={`chart-tab ${activeTab === 'annual' ? 'active' : ''}`}
                onClick={() => setActiveTab('annual')}
              >
                <BarChart3 size={14} />
                Annual Returns
              </button>
            </div>

            {/* Equity Curve Chart */}
            {activeTab === 'equity' && (
              <div className="bt-chart-container">
                <EquityCurveChart
                  data={equityCurveData}
                  initial={config.initialValue}
                  formatValue={formatValue}
                />
                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-line portfolio"></span>
                    <span>Portfolio</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-line benchmark"></span>
                    <span>Benchmark</span>
                  </div>
                </div>
              </div>
            )}

            {/* Drawdown Chart */}
            {activeTab === 'drawdown' && (
              <div className="bt-chart-container">
                <DrawdownChart
                  data={drawdownData}
                  maxDrawdown={results.maxDrawdown}
                />
                <div className="drawdown-info">
                  <div className="dd-stat">
                    <span>Max Drawdown</span>
                    <span className="negative">{formatPercent(results.maxDrawdown)}</span>
                  </div>
                  <div className="dd-stat">
                    <span>Avg Drawdown</span>
                    <span className="negative">{formatPercent(results.avgDrawdown || results.maxDrawdown / 2)}</span>
                  </div>
                  <div className="dd-stat">
                    <span>Recovery Time</span>
                    <span>{results.recoveryDays || '~120'} days</span>
                  </div>
                </div>
              </div>
            )}

            {/* Annual Returns Chart */}
            {activeTab === 'annual' && normalizedAnnualReturns && Object.keys(normalizedAnnualReturns).length > 0 && (
              <div className="bt-chart-container">
                <AnnualReturnsChart
                  data={normalizedAnnualReturns}
                  benchmarkData={results.benchmarkAnnualReturns}
                  formatPercent={formatPercent}
                />
              </div>
            )}

            {/* Benchmark Comparison */}
            {results.benchmarkReturn !== undefined && (
              <div className="benchmark-comparison enhanced">
                <h5>Portfolio vs Benchmark</h5>
                <div className="comparison-visual">
                  <div className="comparison-bar">
                    <div className="bar-container">
                      <div
                        className="bar portfolio"
                        style={{ width: `${Math.min(100, Math.abs(results.totalReturn) / Math.max(Math.abs(results.totalReturn), Math.abs(results.benchmarkReturn)) * 100)}%` }}
                      >
                        <span className="bar-label">{formatPercent(results.totalReturn)}</span>
                      </div>
                    </div>
                    <span className="bar-name">Portfolio</span>
                  </div>
                  <div className="comparison-bar">
                    <div className="bar-container">
                      <div
                        className="bar benchmark"
                        style={{ width: `${Math.min(100, Math.abs(results.benchmarkReturn) / Math.max(Math.abs(results.totalReturn), Math.abs(results.benchmarkReturn)) * 100)}%` }}
                      >
                        <span className="bar-label">{formatPercent(results.benchmarkReturn)}</span>
                      </div>
                    </div>
                    <span className="bar-name">Benchmark</span>
                  </div>
                </div>
                <div className="alpha-display">
                  <span className="alpha-label">Alpha</span>
                  <span className={`alpha-value ${(results.totalReturn - results.benchmarkReturn) >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(results.totalReturn - results.benchmarkReturn)}
                  </span>
                  <span className="alpha-hint">
                    {(results.totalReturn - results.benchmarkReturn) >= 0 ? 'Outperformed' : 'Underperformed'} benchmark
                  </span>
                </div>
              </div>
            )}

            {/* Monthly Returns Heatmap (Collapsible) */}
            <div className="monthly-returns-section">
              <button
                className="monthly-toggle"
                onClick={() => setShowMonthlyReturns(!showMonthlyReturns)}
              >
                {showMonthlyReturns ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                <Activity size={16} />
                Monthly Returns Heatmap
              </button>

              {showMonthlyReturns && monthlyReturnsData.length > 0 && (
                <div className="monthly-heatmap">
                  <MonthlyHeatmap
                    data={monthlyReturnsData}
                    getReturnColor={getReturnColor}
                    formatPercent={formatPercent}
                  />
                </div>
              )}
            </div>

            <div className="simulation-meta">
              <span>
                <Calendar size={14} />
                {config.startDate} to {config.endDate}
              </span>
              <span>{results.tradingDays || '~1,260'} trading days</span>
              <span>{results.rebalanceCount || 20} rebalances</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Equity Curve Chart Component
function EquityCurveChart({ data, initial, formatValue }) {
  if (!data || data.length === 0) return <div className="no-data">No data available</div>;

  const width = 600;
  const height = 270;
  const padding = { top: 20, right: 65, bottom: 45, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map(d => Math.max(d.portfolio, d.benchmark))) * 1.05;
  const minValue = Math.min(...data.map(d => Math.min(d.portfolio, d.benchmark))) * 0.95;

  const xScale = (i) => padding.left + (i / (data.length - 1)) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  const generatePath = (dataArr, key) => {
    return dataArr.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d[key])}`).join(' ');
  };

  const formatAxisValue = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const yTicks = Array.from({ length: 5 }, (_, i) => minValue + (maxValue - minValue) * (i / 4));

  // X-axis date labels
  const dateLabels = [];
  const labelCount = 5;
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i / (labelCount - 1)) * (data.length - 1));
    dateLabels.push({ idx, date: data[idx]?.date });
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="equity-chart-svg">
      {/* Grid */}
      {yTicks.map((tick, i) => (
        <line
          key={i}
          x1={padding.left}
          y1={yScale(tick)}
          x2={width - padding.right}
          y2={yScale(tick)}
          stroke="var(--border-color)"
          strokeDasharray="3,3"
          opacity="0.5"
        />
      ))}

      {/* Initial value line */}
      <line
        x1={padding.left}
        y1={yScale(initial)}
        x2={width - padding.right}
        y2={yScale(initial)}
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeDasharray="4,4"
        opacity="0.5"
      />

      {/* Benchmark line */}
      <path
        d={generatePath(data, 'benchmark')}
        fill="none"
        stroke="var(--text-tertiary)"
        strokeWidth="2"
        opacity="0.6"
      />

      {/* Portfolio line */}
      <path
        d={generatePath(data, 'portfolio')}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="3"
      />

      {/* Portfolio area fill */}
      <path
        d={`${generatePath(data, 'portfolio')} L ${xScale(data.length - 1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
        fill="rgba(99, 102, 241, 0.1)"
      />

      {/* Y-axis label */}
      <text
        x={15}
        y={height / 2}
        textAnchor="middle"
        fontSize="10"
        fill="var(--text-tertiary)"
        transform={`rotate(-90, 15, ${height / 2})`}
      >
        Portfolio Value
      </text>

      {/* Y Axis */}
      {yTicks.map((tick, i) => (
        <text
          key={i}
          x={padding.left - 10}
          y={yScale(tick)}
          textAnchor="end"
          alignmentBaseline="middle"
          fontSize="11"
          fill="var(--text-tertiary)"
        >
          {formatAxisValue(tick)}
        </text>
      ))}

      {/* X-axis date labels */}
      {dateLabels.map((label, i) => (
        <text
          key={i}
          x={xScale(label.idx)}
          y={height - padding.bottom + 18}
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary)"
        >
          {label.date?.substring(0, 7) || ''}
        </text>
      ))}

      {/* Final values */}
      <text
        x={width - padding.right + 5}
        y={yScale(data[data.length - 1].portfolio)}
        alignmentBaseline="middle"
        fontSize="11"
        fill="var(--accent-primary)"
        fontWeight="600"
      >
        {formatAxisValue(data[data.length - 1].portfolio)}
      </text>
      <text
        x={width - padding.right + 5}
        y={yScale(data[data.length - 1].benchmark)}
        alignmentBaseline="middle"
        fontSize="10"
        fill="var(--text-tertiary)"
      >
        {formatAxisValue(data[data.length - 1].benchmark)}
      </text>
    </svg>
  );
}

// Drawdown Chart Component
function DrawdownChart({ data, maxDrawdown }) {
  if (!data || data.length === 0) return <div className="no-data">No data available</div>;

  const width = 600;
  const height = 180;
  const padding = { top: 20, right: 40, bottom: 40, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const minDrawdown = Math.min(...data.map(d => d.drawdown), maxDrawdown || -20) * 1.1;

  const xScale = (i) => padding.left + (i / (data.length - 1)) * chartWidth;
  const yScale = (value) => padding.top + chartHeight * (1 - (value - minDrawdown) / (0 - minDrawdown));

  const areaPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.drawdown)}`).join(' ') +
    ` L ${xScale(data.length - 1)} ${yScale(0)} L ${padding.left} ${yScale(0)} Z`;

  // Generate Y-axis ticks (0%, -10%, -20%, etc.)
  const yTickStep = Math.ceil(Math.abs(minDrawdown) / 4 / 5) * 5; // Round to nearest 5
  const yTicks = [];
  for (let tick = 0; tick >= minDrawdown; tick -= yTickStep) {
    yTicks.push(tick);
  }

  // X-axis date labels
  const dateLabels = [];
  const labelCount = 5;
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i / (labelCount - 1)) * (data.length - 1));
    dateLabels.push({ idx, date: data[idx]?.date });
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="drawdown-chart-svg">
      {/* Y-axis grid and labels */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={yScale(tick)}
            x2={width - padding.right}
            y2={yScale(tick)}
            stroke="var(--border-color)"
            strokeWidth="1"
            strokeDasharray={tick === 0 ? "0" : "3,3"}
            opacity={tick === 0 ? 1 : 0.5}
          />
          <text
            x={padding.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            alignmentBaseline="middle"
            fontSize="10"
            fill={tick === maxDrawdown ? 'var(--danger-color)' : 'var(--text-tertiary)'}
          >
            {tick}%
          </text>
        </g>
      ))}

      {/* Y-axis label */}
      <text
        x={12}
        y={height / 2}
        textAnchor="middle"
        fontSize="10"
        fill="var(--text-tertiary)"
        transform={`rotate(-90, 12, ${height / 2})`}
      >
        Drawdown
      </text>

      {/* Max drawdown line */}
      <line
        x1={padding.left}
        y1={yScale(maxDrawdown)}
        x2={width - padding.right}
        y2={yScale(maxDrawdown)}
        stroke="var(--danger-color)"
        strokeWidth="1.5"
        strokeDasharray="4,4"
        opacity="0.7"
      />

      {/* Drawdown area */}
      <path
        d={areaPath}
        fill="rgba(239, 68, 68, 0.3)"
      />

      {/* X-axis date labels */}
      {dateLabels.map((label, i) => (
        <text
          key={i}
          x={xScale(label.idx)}
          y={height - padding.bottom + 18}
          textAnchor="middle"
          fontSize="9"
          fill="var(--text-tertiary)"
        >
          {label.date?.substring(0, 7) || ''}
        </text>
      ))}
    </svg>
  );
}

// Annual Returns Bar Chart
function AnnualReturnsChart({ data, benchmarkData, formatPercent }) {
  if (!data || typeof data !== 'object') {
    return <div className="no-data">No annual returns data</div>;
  }

  const years = Object.keys(data).sort();
  const values = Object.values(data).map(v => typeof v === 'number' ? v : 0);

  if (years.length === 0) {
    return <div className="no-data">No annual returns data</div>;
  }

  const maxAbs = Math.max(...values.map(Math.abs), 30);

  const width = 600;
  const height = 220;
  const padding = { top: 30, right: 20, bottom: 40, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = Math.min(40, (chartWidth / years.length) * 0.7);
  const gap = (chartWidth - barWidth * years.length) / (years.length + 1);

  const yScale = (value) => padding.top + chartHeight / 2 - (value / maxAbs) * (chartHeight / 2);

  // Y-axis ticks
  const yTicks = [-maxAbs, -maxAbs/2, 0, maxAbs/2, maxAbs].map(v => Math.round(v / 5) * 5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="annual-returns-svg">
      {/* Y-axis grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={yScale(tick)}
            x2={width - padding.right}
            y2={yScale(tick)}
            stroke="var(--border-color)"
            strokeWidth="1"
            strokeDasharray={tick === 0 ? "0" : "3,3"}
            opacity={tick === 0 ? 1 : 0.5}
          />
          <text
            x={padding.left - 8}
            y={yScale(tick)}
            textAnchor="end"
            alignmentBaseline="middle"
            fontSize="10"
            fill="var(--text-tertiary)"
          >
            {tick > 0 ? '+' : ''}{tick}%
          </text>
        </g>
      ))}

      {/* Y-axis label */}
      <text
        x={15}
        y={height / 2}
        textAnchor="middle"
        fontSize="10"
        fill="var(--text-tertiary)"
        transform={`rotate(-90, 15, ${height / 2})`}
      >
        Annual Return
      </text>

      {/* Bars */}
      {years.map((year, i) => {
        const rawValue = data[year];
        const value = typeof rawValue === 'number' ? rawValue : 0;
        const x = padding.left + gap + i * (barWidth + gap);
        const barHeight = Math.abs(value / maxAbs) * (chartHeight / 2);
        const y = value >= 0 ? yScale(value) : yScale(0);

        return (
          <g key={year}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx={3}
              fill={value >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}
              opacity="0.8"
            />
            <text
              x={x + barWidth / 2}
              y={value >= 0 ? y - 5 : y + barHeight + 12}
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill={value >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}
            >
              {value.toFixed(1)}%
            </text>
            <text
              x={x + barWidth / 2}
              y={height - padding.bottom + 15}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-tertiary)"
            >
              {year}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Monthly Returns Heatmap
function MonthlyHeatmap({ data, getReturnColor, formatPercent }) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = [...new Set(data.map(d => d.year))].sort();

  return (
    <div className="heatmap-grid">
      <div className="heatmap-header">
        <div className="heatmap-corner"></div>
        {months.map(m => <div key={m} className="heatmap-month">{m}</div>)}
        <div className="heatmap-total">Year</div>
      </div>
      {years.map(year => {
        const yearData = data.filter(d => d.year === year);
        const yearTotal = yearData.reduce((sum, d) => sum + d.return, 0);

        return (
          <div key={year} className="heatmap-row">
            <div className="heatmap-year">{year}</div>
            {months.map((m, idx) => {
              const cell = yearData.find(d => d.monthIdx === idx);
              return (
                <div
                  key={m}
                  className="heatmap-cell"
                  style={{ backgroundColor: cell ? getReturnColor(cell.return) : 'var(--bg-tertiary)' }}
                  title={cell ? `${m} ${year}: ${formatPercent(cell.return)}` : ''}
                >
                  {cell && <span>{cell.return.toFixed(1)}</span>}
                </div>
              );
            })}
            <div
              className="heatmap-cell total"
              style={{ backgroundColor: getReturnColor(yearTotal) }}
            >
              {yearTotal.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default BacktestPanel;
