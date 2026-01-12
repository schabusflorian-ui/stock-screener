// frontend/src/pages/research/FactorAnalysisTab.js
// Factor analysis - shows how different factor quintiles perform over time
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { historicalAPI } from '../../services/api';
import './FactorAnalysisTab.css';

const FACTORS = [
  { id: 'value', label: 'Value', description: 'P/E, P/B ratios' },
  { id: 'quality', label: 'Quality', description: 'ROE, margins, stability' },
  { id: 'momentum', label: 'Momentum', description: 'Price momentum' },
  { id: 'growth', label: 'Growth', description: 'Revenue/earnings growth' },
  { id: 'size', label: 'Size', description: 'Market capitalization' },
  { id: 'volatility', label: 'Volatility', description: 'Price volatility' }
];

const FACTOR_COLORS = {
  value: '#3b82f6',
  quality: '#22c55e',
  momentum: '#f59e0b',
  growth: '#8b5cf6',
  size: '#ec4899',
  volatility: '#06b6d4'
};

const QUINTILE_COLORS = {
  top: 'var(--positive)',
  high: '#22c55e',
  mid: 'var(--warning)',
  low: '#f97316',
  bottom: 'var(--negative)'
};

export default function FactorAnalysisTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFactor, setSelectedFactor] = useState('value');
  const [performanceData, setPerformanceData] = useState(null);
  const [timeseriesData, setTimeseriesData] = useState(null);
  const [groupBy, setGroupBy] = useState('quarter');

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFactor, groupBy]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load both performance summary and timeseries data
      const [perfRes, tsRes] = await Promise.all([
        historicalAPI.getFactorPerformance(selectedFactor, 30),
        historicalAPI.getFactorTimeseries(selectedFactor, groupBy)
      ]);

      setPerformanceData(perfRes.data);
      setTimeseriesData(tsRes.data);
    } catch (err) {
      console.error('Failed to load factor data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader className="spinning" size={32} />
        <span>Loading factor analysis...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <AlertTriangle size={32} />
        <span>{error}</span>
        <button onClick={loadData} className="btn-retry">Retry</button>
      </div>
    );
  }

  const factorInfo = FACTORS.find(f => f.id === selectedFactor);

  return (
    <div className="factor-analysis-tab">
      {/* Factor Selector */}
      <div className="factor-controls">
        <div className="factor-toggles">
          {FACTORS.map(factor => (
            <button
              key={factor.id}
              className={`factor-toggle ${selectedFactor === factor.id ? 'active' : ''}`}
              onClick={() => setSelectedFactor(factor.id)}
              title={factor.description}
              style={{
                borderColor: selectedFactor === factor.id ? FACTOR_COLORS[factor.id] : 'transparent',
                color: selectedFactor === factor.id ? FACTOR_COLORS[factor.id] : 'inherit'
              }}
            >
              {factor.label}
            </button>
          ))}
        </div>
        <div className="period-selector">
          <button
            className={`period-btn ${groupBy === 'quarter' ? 'active' : ''}`}
            onClick={() => setGroupBy('quarter')}
          >
            Quarterly
          </button>
          <button
            className={`period-btn ${groupBy === 'year' ? 'active' : ''}`}
            onClick={() => setGroupBy('year')}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Interpretation Banner */}
      {performanceData?.interpretation && (
        <div className="factor-interpretation">
          <Info size={16} />
          <span>{performanceData.interpretation}</span>
        </div>
      )}

      {/* Performance by Quintile */}
      {performanceData?.performance && performanceData.performance.length > 0 && (
        <div className="factor-section">
          <h3>Performance by {factorInfo?.label} Quintile</h3>
          <p className="section-description">
            Average 1-year return for stocks in each {selectedFactor} quintile
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={performanceData.performance} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis
                type="number"
                stroke="var(--text-tertiary)"
                fontSize={12}
                tickFormatter={v => `${v?.toFixed(0)}%`}
              />
              <YAxis
                type="category"
                dataKey="factor_quintile"
                stroke="var(--text-tertiary)"
                fontSize={12}
                width={80}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                formatter={(value, name) => {
                  if (name === 'avg_return_pct') return [`${value?.toFixed(2)}%`, 'Avg Return'];
                  if (name === 'avg_alpha_pct') return [`${value?.toFixed(2)}%`, 'Avg Alpha'];
                  if (name === 'beat_market_pct') return [`${value?.toFixed(1)}%`, 'Beat Market'];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar
                dataKey="avg_return_pct"
                name="Avg Return"
                fill={FACTOR_COLORS[selectedFactor]}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Timeseries by Quintile */}
      {timeseriesData?.data && timeseriesData.data.length > 0 && (
        <div className="factor-section">
          <h3>{factorInfo?.label} Factor Returns Over Time</h3>
          <p className="section-description">
            Average returns by quintile across time periods
          </p>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={timeseriesData.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis
                dataKey="period"
                stroke="var(--text-tertiary)"
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                stroke="var(--text-tertiary)"
                fontSize={12}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
                formatter={(value) => [`${value?.toFixed(2)}%`, '']}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="top"
                name="Top 20%"
                stroke={QUINTILE_COLORS.top}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="high"
                name="60-80%"
                stroke={QUINTILE_COLORS.high}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="mid"
                name="40-60%"
                stroke={QUINTILE_COLORS.mid}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="low"
                name="20-40%"
                stroke={QUINTILE_COLORS.low}
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="bottom"
                name="Bottom 20%"
                stroke={QUINTILE_COLORS.bottom}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats Table */}
      {performanceData?.performance && performanceData.performance.length > 0 && (
        <div className="factor-section">
          <h3>Detailed Statistics</h3>
          <div className="factor-stats-table">
            <table>
              <thead>
                <tr>
                  <th>Quintile</th>
                  <th>Decisions</th>
                  <th>Avg Return</th>
                  <th>Avg Alpha</th>
                  <th>Beat Market %</th>
                </tr>
              </thead>
              <tbody>
                {performanceData.performance.map(row => {
                  const isPositive = (row.avg_return_pct || 0) > 0;
                  return (
                    <tr key={row.factor_quintile}>
                      <td className="quintile-cell">{row.factor_quintile}</td>
                      <td>{row.decision_count?.toLocaleString()}</td>
                      <td className={isPositive ? 'positive' : 'negative'}>
                        {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {row.avg_return_pct?.toFixed(2)}%
                      </td>
                      <td className={(row.avg_alpha_pct || 0) > 0 ? 'positive' : 'negative'}>
                        {row.avg_alpha_pct?.toFixed(2)}%
                      </td>
                      <td>{row.beat_market_pct?.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!performanceData?.performance || performanceData.performance.length === 0) &&
       (!timeseriesData?.data || timeseriesData.data.length === 0) && (
        <div className="empty-state">
          <Info size={32} />
          <span>No factor data available</span>
          <p>Factor analysis requires historical investment decisions with calculated outcomes.</p>
        </div>
      )}
    </div>
  );
}
