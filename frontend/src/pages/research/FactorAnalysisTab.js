// frontend/src/pages/research/FactorAnalysisTab.js
// Factor analysis - shows how different factor quintiles perform over time
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, TrendingUp, TrendingDown, Info } from '../../components/icons';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { historicalAPI } from '../../services/api';
import FeatureGate from '../../components/subscription/FeatureGate';
import './FactorAnalysisTab.css';
import FactorLab from '../../components/research/FactorLab';

const FACTORS = [
  {
    id: 'value',
    label: 'Value',
    description: 'P/E, P/B ratios',
    tooltip: 'Measures how "cheap" a stock is relative to fundamentals. High value = low P/E, high book/market. Value stocks historically outperform growth over long periods.'
  },
  {
    id: 'quality',
    label: 'Quality',
    description: 'ROE, margins, stability',
    tooltip: 'Measures company profitability and stability. High quality = high ROE, stable earnings, strong margins. Quality factor provides downside protection.'
  },
  {
    id: 'momentum',
    label: 'Momentum',
    description: 'Price momentum',
    tooltip: 'Measures recent price performance (6-12 months). High momentum = recent winners. Momentum captures the tendency for winners to keep winning short-term.'
  },
  {
    id: 'growth',
    label: 'Growth',
    description: 'Revenue/earnings growth',
    tooltip: 'Measures company growth rates in revenue and earnings. High growth = rapidly expanding businesses, often at premium valuations.'
  },
  {
    id: 'size',
    label: 'Size',
    description: 'Market capitalization',
    tooltip: 'Measures company size by market cap. Small caps historically outperform large caps (size premium) but with higher volatility and liquidity risk.'
  },
  {
    id: 'volatility',
    label: 'Volatility',
    description: 'Price volatility',
    tooltip: 'Measures stock price variability. Low volatility stocks historically provide better risk-adjusted returns (low-vol anomaly). High vol = more risk, not always more return.'
  }
];

/**
 * Factor colors aligned with Prism Design System chart tokens.
 * Using hex values directly because Recharts requires actual color values,
 * not CSS variables.
 *
 * Mapping to design-system.css tokens:
 * - value:      #2563EB = --chart-primary
 * - quality:    #059669 = --chart-secondary / --positive
 * - momentum:   #D97706 = --chart-tertiary / --warning-dark
 * - growth:     #7C3AED = --chart-ai / --color-ai-violet
 * - size:       #DC2626 = --chart-quaternary / --negative
 * - volatility: #0891B2 = --chart-cyan / --color-ai-cyan
 */
const FACTOR_COLORS = {
  value: '#2563EB',
  quality: '#059669',
  momentum: '#D97706',
  growth: '#7C3AED',
  size: '#DC2626',
  volatility: '#0891B2'
};

/**
 * Quintile colors for factor performance charts.
 * Using hex values for Recharts compatibility.
 *
 * Mapping to design-system.css tokens:
 * - top:    #059669 = --positive
 * - high:   #059669 = --positive
 * - mid:    #F59E0B = --warning
 * - low:    #D97706 = --warning-dark
 * - bottom: #DC2626 = --negative
 */
const QUINTILE_COLORS = {
  top: '#059669',
  high: '#059669',
  mid: '#F59E0B',
  low: '#D97706',
  bottom: '#DC2626'
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
    <FeatureGate
      feature="factor_analysis"
      showPreview={true}
      previewHeight="400px"
      title="Factor Analysis"
      description="Analyze how value, quality, momentum, growth, size, and volatility factors perform across market cycles with professional quantitative tools."
    >
    <div className="factor-analysis-tab">
      {/* Factor Selector */}
      <div className="factor-controls">
        <div className="factor-toggles">
          {FACTORS.map(factor => (
            <div key={factor.id} className="factor-toggle-wrapper">
              <button
                className={`factor-toggle ${selectedFactor === factor.id ? 'active' : ''}`}
                onClick={() => setSelectedFactor(factor.id)}
                style={{
                  borderColor: selectedFactor === factor.id ? FACTOR_COLORS[factor.id] : 'transparent',
                  color: selectedFactor === factor.id ? FACTOR_COLORS[factor.id] : 'inherit'
                }}
              >
                {factor.label}
                <Info size={12} className="factor-toggle-info" />
              </button>
              <div className="factor-toggle-tooltip">
                <strong>{factor.label}</strong>
                <em>{factor.description}</em>
                <span>{factor.tooltip}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="period-selector">
          <span className="period-label">Group by:</span>
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

      {/* Enhanced Interpretation Banner */}
      {performanceData?.interpretation && (
        <div className="factor-interpretation-enhanced">
          <div className="interpretation-summary">
            <span className="summary-icon">📊</span>
            <p className="summary-text">
              {typeof performanceData.interpretation === 'string'
                ? performanceData.interpretation
                : performanceData.interpretation.summary}
            </p>
          </div>
          {performanceData.interpretation.insight && (
            <div className="interpretation-insight">
              <span className="insight-icon">💡</span>
              <div>
                <strong>What this means:</strong> {performanceData.interpretation.insight}
              </div>
            </div>
          )}
          {performanceData.interpretation.recommendation && (
            <div className="interpretation-action">
              <span className="action-icon">🎯</span>
              <div>
                <strong>Actionable insight:</strong> {performanceData.interpretation.recommendation}
              </div>
            </div>
          )}
          {performanceData.interpretation.sampleWarning && (
            <div className="interpretation-warning">
              <span className="warning-icon">⚠️</span>
              {performanceData.interpretation.sampleWarning}
            </div>
          )}
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

      {/* Factor Lab - Interactive Backtesting */}
      <FactorLab />
    </div>
    </FeatureGate>
  );
}
