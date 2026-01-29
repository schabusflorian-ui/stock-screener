// frontend/src/components/investors/PortfolioPerformanceChart.js
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
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  DollarSign,
  BarChart3
} from '../icons';
import { investorsAPI } from '../../services/api';
import { useAskAI, createChartExtractor } from '../../hooks';
import './PortfolioPerformanceChart.css';

const formatValue = (value) => {
  if (!value && value !== 0) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const formatFullDate = (dateStr) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  // Support both camelCase (API) and snake_case field names
  const filingDate = data.filing_date || data.date;
  const totalValue = data.total_value || data.value;
  const positionsCount = data.positions_count ?? data.positionsCount;
  const qoqReturn = data.qoq_return ?? data.qoqReturn;
  const newPositions = data.new_positions ?? data.newPositions;
  const soldPositions = data.sold_positions ?? data.soldPositions;

  return (
    <div className="perf-chart-tooltip">
      <div className="tooltip-header">
        <span className="tooltip-date">{formatFullDate(filingDate)}</span>
        {data.quarterLabel && (
          <span className="tooltip-quarter">Q{data.quarterLabel}</span>
        )}
      </div>
      <div className="tooltip-row primary">
        <span className="tooltip-label">Portfolio Value</span>
        <span className="tooltip-value">{formatValue(totalValue)}</span>
      </div>
      <div className="tooltip-row">
        <span className="tooltip-label">Positions</span>
        <span className="tooltip-value">{positionsCount}</span>
      </div>
      {qoqReturn !== null && qoqReturn !== undefined && (
        <div className={`tooltip-row ${qoqReturn >= 0 ? 'positive' : 'negative'}`}>
          <span className="tooltip-label">QoQ Return</span>
          <span className="tooltip-value">{formatPercent(qoqReturn)}</span>
        </div>
      )}
      {newPositions > 0 && (
        <div className="tooltip-row activity">
          <span className="tooltip-label">New Buys</span>
          <span className="tooltip-value positive">+{newPositions}</span>
        </div>
      )}
      {soldPositions > 0 && (
        <div className="tooltip-row activity">
          <span className="tooltip-label">Sold</span>
          <span className="tooltip-value negative">-{soldPositions}</span>
        </div>
      )}
    </div>
  );
};

export function PortfolioPerformanceChart({ investorId, investorName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('value'); // 'value' or 'returns'

  useEffect(() => {
    async function fetchPerformance() {
      if (!investorId) return;

      setLoading(true);
      setError(null);

      try {
        const res = await investorsAPI.getPerformance(investorId, 60);
        if (res.data.success) {
          setData(res.data);
        } else {
          setError('No performance data available');
        }
      } catch (err) {
        console.error('Error fetching performance:', err);
        setError('Failed to load performance data');
      } finally {
        setLoading(false);
      }
    }

    fetchPerformance();
  }, [investorId]);

  // Ask AI right-click support - must be called before any early returns
  const askAIProps = useAskAI(createChartExtractor(() => ({
    symbol: investorId,
    companyName: investorName,
    metric: 'portfolio_performance'
  })));

  if (loading) {
    return (
      <div className="perf-chart-container">
        <div className="perf-chart-loading">
          <Activity className="spinner" size={24} />
          <span>Loading performance history...</span>
        </div>
      </div>
    );
  }

  if (error || !data || !data.history || data.history.length === 0) {
    return (
      <div className="perf-chart-container">
        <div className="perf-chart-empty">
          <BarChart3 size={48} />
          <p>{error || 'No performance history available'}</p>
          <span className="perf-chart-hint">
            Historical 13F filings are required to show portfolio performance over time.
          </span>
        </div>
      </div>
    );
  }

  const { history, summary } = data;

  // Process chart data - normalize API response to consistent field names
  const chartData = history.map((item, idx) => {
    // Support both camelCase (API) and snake_case field names
    const reportDate = item.report_date || item.reportDate;
    const filingDate = item.filing_date || item.date;
    const totalValue = item.total_value ?? item.value;
    const positionsCount = item.positions_count ?? item.positionsCount;
    const newPositions = item.new_positions ?? item.newPositions;
    const soldPositions = item.sold_positions ?? item.soldPositions;
    const qoqReturn = item.qoq_return ?? item.qoqReturn;

    const quarter = new Date(reportDate);
    const quarterNum = Math.ceil((quarter.getMonth() + 1) / 3);
    return {
      ...item,
      // Normalized fields
      filing_date: filingDate,
      report_date: reportDate,
      total_value: totalValue,
      positions_count: positionsCount,
      new_positions: newPositions,
      sold_positions: soldPositions,
      qoq_return: qoqReturn,
      // Chart display fields
      quarterLabel: `${quarterNum}/${quarter.getFullYear().toString().slice(-2)}`,
      displayDate: formatDate(filingDate),
      valueBillions: totalValue / 1e9
    };
  });

  const latestValue = chartData[chartData.length - 1]?.total_value || 0;
  const startValue = chartData[0]?.total_value || 0;
  const totalReturn = startValue > 0 ? ((latestValue - startValue) / startValue) * 100 : 0;
  const isPositive = totalReturn >= 0;

  // Calculate additional stats
  const positiveQuarters = chartData.filter(h => h.qoq_return > 0).length;
  const negativeQuarters = chartData.filter(h => h.qoq_return < 0).length;
  const maxValue = Math.max(...chartData.map(h => h.total_value));

  return (
    <div className="perf-chart-container" {...askAIProps}>
      {/* Header */}
      <div className="perf-chart-header">
        <div className="perf-chart-title">
          <h3>Portfolio Value History</h3>
          <span className="perf-chart-subtitle">
            {chartData.length} quarters from {formatFullDate(chartData[0]?.filing_date)} to {formatFullDate(chartData[chartData.length - 1]?.filing_date)}
          </span>
        </div>

        <div className="perf-chart-toggles">
          <button
            className={`toggle-btn ${chartType === 'value' ? 'active' : ''}`}
            onClick={() => setChartType('value')}
          >
            <DollarSign size={14} />
            Value
          </button>
          <button
            className={`toggle-btn ${chartType === 'returns' ? 'active' : ''}`}
            onClick={() => setChartType('returns')}
          >
            <TrendingUp size={14} />
            Returns
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="perf-summary-row">
        <div className="perf-stat primary">
          <span className="stat-label">Total Return</span>
          <span className={`stat-value ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {formatPercent(totalReturn)}
          </span>
        </div>
        <div className="perf-stat">
          <span className="stat-label">Current Value</span>
          <span className="stat-value">{formatValue(latestValue)}</span>
        </div>
        <div className="perf-stat">
          <span className="stat-label">Peak Value</span>
          <span className="stat-value">{formatValue(maxValue)}</span>
        </div>
        <div className="perf-stat">
          <span className="stat-label">Avg Quarterly</span>
          <span className={`stat-value ${(summary?.avgQoQReturn || 0) >= 0 ? 'positive' : 'negative'}`}>
            {formatPercent(summary?.avgQoQReturn || 0)}
          </span>
        </div>
        <div className="perf-stat">
          <span className="stat-label">Win Rate</span>
          <span className="stat-value">
            {((positiveQuarters / (positiveQuarters + negativeQuarters)) * 100).toFixed(0)}%
            <span className="stat-detail">({positiveQuarters}/{positiveQuarters + negativeQuarters})</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="perf-chart-wrapper">
        {chartType === 'value' ? (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `$${(val / 1e9).toFixed(1)}B`}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total_value"
                stroke="#2563EB"
                strokeWidth={2}
                fill="url(#valueGradient)"
                dot={false}
                activeDot={{ r: 4, fill: '#2563EB' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={['auto', 'auto']}
                tickFormatter={(val) => `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'ui-monospace, monospace' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#CBD5E1" strokeDasharray="0" />
              <Bar
                dataKey="qoq_return"
                fill="#2563EB"
                radius={[2, 2, 0, 0]}
                maxBarSize={30}
              >
                {chartData.map((entry, index) => (
                  <rect
                    key={`bar-${index}`}
                    fill={entry.qoq_return >= 0 ? '#059669' : '#DC2626'}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Best/Worst Quarters */}
      <div className="perf-extremes">
        <div className="extreme-card best">
          <h4><TrendingUp size={16} /> Best Quarter</h4>
          {(() => {
            const best = [...chartData].sort((a, b) => (b.qoq_return || -999) - (a.qoq_return || -999))[0];
            if (!best || best.qoq_return === null) return <span className="no-data">No data</span>;
            return (
              <div className="extreme-content">
                <span className="extreme-date">{formatFullDate(best.filing_date)}</span>
                <span className="extreme-value positive">{formatPercent(best.qoq_return)}</span>
                <span className="extreme-detail">{formatValue(best.total_value)}</span>
              </div>
            );
          })()}
        </div>
        <div className="extreme-card worst">
          <h4><TrendingDown size={16} /> Worst Quarter</h4>
          {(() => {
            const worst = [...chartData].filter(h => h.qoq_return !== null).sort((a, b) => a.qoq_return - b.qoq_return)[0];
            if (!worst || worst.qoq_return === null) return <span className="no-data">No data</span>;
            return (
              <div className="extreme-content">
                <span className="extreme-date">{formatFullDate(worst.filing_date)}</span>
                <span className="extreme-value negative">{formatPercent(worst.qoq_return)}</span>
                <span className="extreme-detail">{formatValue(worst.total_value)}</span>
              </div>
            );
          })()}
        </div>
        <div className="extreme-card stats">
          <h4><BarChart3 size={16} /> Activity Stats</h4>
          <div className="extreme-content">
            <div className="activity-row">
              <span>Avg Positions</span>
              <span>{Math.round(chartData.reduce((sum, h) => sum + h.positions_count, 0) / chartData.length)}</span>
            </div>
            <div className="activity-row">
              <span>Total Buys</span>
              <span className="positive">{chartData.reduce((sum, h) => sum + (h.new_positions || 0), 0)}</span>
            </div>
            <div className="activity-row">
              <span>Total Sells</span>
              <span className="negative">{chartData.reduce((sum, h) => sum + (h.sold_positions || 0), 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Data info */}
      <div className="perf-chart-info">
        <Calendar size={14} />
        <span>
          Based on {chartData.length} quarterly 13F filings. Returns calculated from portfolio value changes.
        </span>
      </div>
    </div>
  );
}

PortfolioPerformanceChart.propTypes = {
  investorId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  investorName: PropTypes.string
};

export default PortfolioPerformanceChart;
