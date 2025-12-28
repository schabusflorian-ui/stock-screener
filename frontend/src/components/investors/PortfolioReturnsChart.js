// frontend/src/components/investors/PortfolioReturnsChart.js
// Shows actual portfolio returns based on stock price changes with S&P 500 benchmark
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Award
} from 'lucide-react';
import { investorsAPI } from '../../services/api';
import './PortfolioReturnsChart.css';

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: "'yy" });
};

const formatFullDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="returns-chart-tooltip">
      <div className="tooltip-header">
        <span className="tooltip-date">{formatFullDate(data.endDate)}</span>
      </div>
      <div className={`tooltip-row ${data.return >= 0 ? 'positive' : 'negative'}`}>
        <span className="tooltip-label">Portfolio Return</span>
        <span className="tooltip-value">{formatPercent(data.return)}</span>
      </div>
      {data.benchmarkReturn !== null && (
        <div className={`tooltip-row benchmark ${data.benchmarkReturn >= 0 ? 'positive' : 'negative'}`}>
          <span className="tooltip-label">S&P 500</span>
          <span className="tooltip-value">{formatPercent(data.benchmarkReturn)}</span>
        </div>
      )}
      <div className={`tooltip-row alpha ${data.alpha >= 0 ? 'positive' : 'negative'}`}>
        <span className="tooltip-label">Alpha</span>
        <span className="tooltip-value">{formatPercent(data.alpha)}</span>
      </div>
      <div className="tooltip-row cumulative">
        <span className="tooltip-label">Cumulative</span>
        <span className="tooltip-value">{formatPercent(data.cumulativeReturn)}</span>
      </div>
    </div>
  );
};

export function PortfolioReturnsChart({ investorId, investorName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('cumulative'); // 'cumulative' or 'quarterly'

  useEffect(() => {
    async function fetchReturns() {
      if (!investorId) return;

      setLoading(true);
      setError(null);

      try {
        const res = await investorsAPI.getReturns(investorId);
        if (res.data.success) {
          setData(res.data);
        } else {
          setError('No returns data available');
        }
      } catch (err) {
        console.error('Error fetching returns:', err);
        setError('Failed to load returns data');
      } finally {
        setLoading(false);
      }
    }

    fetchReturns();
  }, [investorId]);

  if (loading) {
    return (
      <div className="returns-chart-container">
        <div className="returns-chart-loading">
          <Activity className="spinner" size={24} />
          <span>Loading portfolio returns...</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.returns || data.returns.length === 0) {
    return (
      <div className="returns-chart-container">
        <div className="returns-chart-empty">
          <Target size={48} />
          <p>{error || 'No returns data available'}</p>
          <span className="returns-chart-hint">
            Portfolio returns are calculated from stock price changes of disclosed holdings.
          </span>
        </div>
      </div>
    );
  }

  const { returns, summary } = data;

  // Process chart data
  const chartData = returns.map((item) => ({
    ...item,
    displayDate: formatDate(item.endDate)
  }));

  const isPositive = summary.totalReturn >= 0;
  const alphaPositive = summary.alpha >= 0;

  return (
    <div className="returns-chart-container">
      {/* Header */}
      <div className="returns-chart-header">
        <div className="returns-chart-title">
          <h3>
            <Target size={20} />
            Portfolio Returns vs S&P 500
          </h3>
          <span className="returns-chart-subtitle">
            {summary.periodCount} quarters from {formatFullDate(summary.startDate)} to {formatFullDate(summary.endDate)}
          </span>
        </div>

        <div className="returns-chart-toggles">
          <button
            className={`toggle-btn ${chartType === 'cumulative' ? 'active' : ''}`}
            onClick={() => setChartType('cumulative')}
          >
            Cumulative
          </button>
          <button
            className={`toggle-btn ${chartType === 'quarterly' ? 'active' : ''}`}
            onClick={() => setChartType('quarterly')}
          >
            Quarterly
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="returns-summary-row">
        <div className="returns-stat primary">
          <span className="stat-label">Total Return</span>
          <span className={`stat-value ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {formatPercent(summary.totalReturn)}
          </span>
        </div>
        <div className="returns-stat">
          <span className="stat-label">S&P 500 Return</span>
          <span className={`stat-value ${summary.benchmarkTotalReturn >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(summary.benchmarkTotalReturn)}
          </span>
        </div>
        <div className={`returns-stat alpha ${alphaPositive ? 'positive' : 'negative'}`}>
          <span className="stat-label">
            <Award size={14} />
            Alpha
          </span>
          <span className={`stat-value ${alphaPositive ? 'positive' : 'negative'}`}>
            {formatPercent(summary.alpha)}
          </span>
        </div>
        <div className="returns-stat">
          <span className="stat-label">Annualized</span>
          <span className={`stat-value ${summary.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(summary.annualizedReturn)}
          </span>
        </div>
        <div className="returns-stat">
          <span className="stat-label">Win Rate</span>
          <span className="stat-value">
            {((summary.positiveQuarters / summary.periodCount) * 100).toFixed(0)}%
            <span className="stat-detail">({summary.positiveQuarters}/{summary.periodCount})</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="returns-chart-wrapper">
        {chartType === 'cumulative' ? (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#9ca3af" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Area
                type="monotone"
                dataKey="cumulativeBenchmark"
                name="S&P 500"
                stroke="#9ca3af"
                strokeWidth={2}
                fill="url(#benchmarkGradient)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="cumulativeReturn"
                name="Portfolio"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{ r: 4, fill: '#6366f1' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(0,0,0,0.06)' }}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Bar
                dataKey="benchmarkReturn"
                name="S&P 500"
                fill="#e5e7eb"
                radius={[2, 2, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="return"
                name="Portfolio"
                radius={[2, 2, 0, 0]}
                maxBarSize={20}
              >
                {chartData.map((entry, index) => (
                  <rect
                    key={`bar-${index}`}
                    fill={entry.return >= 0 ? '#10b981' : '#ef4444'}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Alpha Analysis */}
      <div className="returns-alpha-section">
        <div className={`alpha-card ${alphaPositive ? 'positive' : 'negative'}`}>
          <div className="alpha-header">
            <Award size={24} />
            <div>
              <h4>Alpha Generation</h4>
              <p>Excess returns vs S&P 500</p>
            </div>
          </div>
          <div className="alpha-stats">
            <div className="alpha-stat">
              <span className="alpha-label">Annualized Alpha</span>
              <span className={`alpha-value ${alphaPositive ? 'positive' : 'negative'}`}>
                {formatPercent(summary.alpha)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="alpha-label">Avg Quarterly Alpha</span>
              <span className={`alpha-value ${(summary.avgQuarterlyReturn - summary.avgBenchmarkReturn) >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary.avgQuarterlyReturn - summary.avgBenchmarkReturn)}
              </span>
            </div>
            <div className="alpha-stat">
              <span className="alpha-label">Best Quarter</span>
              <span className="alpha-value positive">{formatPercent(summary.bestQuarter)}</span>
            </div>
            <div className="alpha-stat">
              <span className="alpha-label">Worst Quarter</span>
              <span className="alpha-value negative">{formatPercent(summary.worstQuarter)}</span>
            </div>
          </div>
        </div>

        <div className="returns-comparison">
          <h4>Performance Comparison</h4>
          <div className="comparison-bars">
            <div className="comparison-row">
              <span className="comparison-label">Portfolio</span>
              <div className="comparison-bar-container">
                <div
                  className={`comparison-bar ${summary.annualizedReturn >= 0 ? 'positive' : 'negative'}`}
                  style={{ width: `${Math.min(Math.abs(summary.annualizedReturn) * 2, 100)}%` }}
                />
              </div>
              <span className={`comparison-value ${summary.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary.annualizedReturn)}
              </span>
            </div>
            <div className="comparison-row">
              <span className="comparison-label">S&P 500</span>
              <div className="comparison-bar-container">
                <div
                  className={`comparison-bar benchmark ${summary.annualizedBenchmark >= 0 ? 'positive' : 'negative'}`}
                  style={{ width: `${Math.min(Math.abs(summary.annualizedBenchmark) * 2, 100)}%` }}
                />
              </div>
              <span className={`comparison-value ${summary.annualizedBenchmark >= 0 ? 'positive' : 'negative'}`}>
                {formatPercent(summary.annualizedBenchmark)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="returns-chart-info">
        <span>
          Returns calculated from weighted price changes of disclosed 13F holdings.
          Does not include cash, derivatives, short positions, or intra-quarter trading.
        </span>
      </div>
    </div>
  );
}

PortfolioReturnsChart.propTypes = {
  investorId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  investorName: PropTypes.string
};

export default PortfolioReturnsChart;
