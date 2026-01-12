// frontend/src/components/research/MacroDashboard.js
// Macroeconomic dashboard showing key indicators, yield curve, and credit cycle
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, AlertTriangle,
  DollarSign, Percent, BarChart3, Info, RefreshCw, Home, Briefcase
} from 'lucide-react';
import { macroAPI } from '../../services/api';
import './MacroDashboard.css';

// Category colors
const CATEGORY_COLORS = {
  rates: '#3b82f6',
  credit: '#f59e0b',
  volatility: '#ef4444',
  employment: '#22c55e',
  growth: '#8b5cf6',
  inflation: '#ec4899',
  housing: '#06b6d4',
  sentiment: '#64748b',
  commodities: '#d97706',
  money: '#6366f1',
  market: '#14b8a6'
};

// Indicator definitions for tooltips
const INDICATOR_INFO = {
  fedFunds: {
    name: 'Fed Funds Rate',
    description: 'The interest rate banks charge each other for overnight loans.',
    interpretation: 'Rising = tightening (bearish for growth). Falling = easing (bullish).'
  },
  treasury2y: {
    name: '2-Year Treasury',
    description: 'Short-term government bond yield. Reflects near-term rate expectations.',
    interpretation: 'Closely tracks Fed policy. Inversion vs 10Y signals recession risk.'
  },
  treasury10y: {
    name: '10-Year Treasury',
    description: 'Long-term government bond yield. Benchmark for mortgages.',
    interpretation: 'Rising = growth/inflation expectations. Falling = flight to safety.'
  },
  spread2s10s: {
    name: '2s10s Spread',
    description: 'Difference between 10Y and 2Y yields. Classic recession indicator.',
    interpretation: 'Negative (inverted) = recession warning. Steepening = growth.'
  },
  vix: {
    name: 'VIX (Fear Index)',
    description: 'Expected S&P 500 volatility over next 30 days.',
    interpretation: '<15 = complacency, 15-25 = normal, 25-35 = elevated, >35 = crisis.'
  },
  hySpread: {
    name: 'High-Yield Spread',
    description: 'Premium investors demand for junk bonds over treasuries.',
    interpretation: '<4% = tight (risk-on), 4-5% = normal, >7% = distressed.'
  },
  unemployment: {
    name: 'Unemployment Rate',
    description: 'Percentage of labor force without jobs.',
    interpretation: '<4% = tight labor market, >6% = recession territory.'
  }
};

// Volatility level classification
function getVolatilityLevel(vix) {
  if (!vix) return { level: 'Unknown', color: 'var(--text-tertiary)' };
  if (vix < 15) return { level: 'Low', color: 'var(--positive)' };
  if (vix < 20) return { level: 'Normal', color: 'var(--text-primary)' };
  if (vix < 25) return { level: 'Elevated', color: 'var(--warning)' };
  if (vix < 35) return { level: 'High', color: 'var(--negative)' };
  return { level: 'Crisis', color: 'var(--negative)' };
}

// Credit stress classification
function getCreditStress(spread) {
  if (!spread) return { level: 'Unknown', color: 'var(--text-tertiary)' };
  if (spread < 4) return { level: 'Tight', color: 'var(--positive)' };
  if (spread < 5) return { level: 'Normal', color: 'var(--text-primary)' };
  if (spread < 7) return { level: 'Elevated', color: 'var(--warning)' };
  return { level: 'Distressed', color: 'var(--negative)' };
}

function IndicatorTooltip({ indicator }) {
  const info = INDICATOR_INFO[indicator];
  if (!info) return null;

  return (
    <span className="indicator-tooltip-wrapper">
      <Info size={14} className="indicator-info-icon" />
      <span className="indicator-tooltip-content">
        <strong>{info.name}</strong>
        <em>{info.description}</em>
        <span>{info.interpretation}</span>
      </span>
    </span>
  );
}

// Format large numbers
function formatValue(value, category) {
  if (value === null || value === undefined) return '-';

  // Large numbers (money supply, GDP, etc)
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  // Percentages and rates
  if (category === 'rates' || category === 'inflation') {
    return `${value.toFixed(2)}%`;
  }

  return value.toFixed(2);
}

export default function MacroDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [keyMetrics, setKeyMetrics] = useState(null);
  const [yieldCurve, setYieldCurve] = useState(null);
  const [yieldCurveHistory, setYieldCurveHistory] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [vixHistory, setVixHistory] = useState(null);
  const [creditHistory, setCreditHistory] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('MacroDashboard: Loading data...');

      // Fetch all macro data in parallel
      const [metricsRes, curveRes, historyRes, indicatorsRes, vixRes, creditRes] = await Promise.all([
        macroAPI.getKeyMetrics().catch(e => { console.error('Key metrics error:', e); return { data: null }; }),
        macroAPI.getYieldCurve().catch(e => { console.error('Yield curve error:', e); return { data: null }; }),
        macroAPI.getYieldCurveHistory(90).catch(e => { console.error('Yield history error:', e); return { data: [] }; }),
        macroAPI.getIndicators().catch(e => { console.error('Indicators error:', e); return { data: [] }; }),
        macroAPI.getIndicatorHistory('VIXCLS', 90).catch(e => { console.error('VIX history error:', e); return { data: { history: [] } }; }),
        macroAPI.getIndicatorHistory('BAMLH0A0HYM2', 90).catch(e => { console.error('Credit history error:', e); return { data: { history: [] } }; })
      ]);

      console.log('MacroDashboard: Data loaded', {
        keyMetrics: metricsRes.data,
        yieldCurve: curveRes.data,
        yieldCurveHistory: historyRes.data?.length,
        indicators: indicatorsRes.data?.length,
        vixHistory: vixRes.data?.history?.length,
        creditHistory: creditRes.data?.history?.length
      });

      setKeyMetrics(metricsRes.data);
      setYieldCurve(curveRes.data);
      setYieldCurveHistory(historyRes.data || []);
      setIndicators(indicatorsRes.data || []);
      setVixHistory(vixRes.data?.history || []);
      setCreditHistory(creditRes.data?.history || []);
    } catch (err) {
      console.error('Failed to load macro data:', err);
      setError('Failed to load macroeconomic data');
    } finally {
      setLoading(false);
    }
  };

  // Group indicators by category
  const indicatorsByCategory = useMemo(() => {
    if (!indicators || !indicators.length) return {};

    return indicators.reduce((acc, ind) => {
      const cat = ind.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ind);
      return acc;
    }, {});
  }, [indicators]);

  // Get unique categories
  const categories = useMemo(() => {
    return Object.keys(indicatorsByCategory).sort();
  }, [indicatorsByCategory]);

  // Filter indicators
  const filteredIndicators = useMemo(() => {
    if (!indicators) return [];
    if (selectedCategory === 'all') return indicators;
    return indicators.filter(ind => ind.category === selectedCategory);
  }, [indicators, selectedCategory]);

  // Prepare chart data for indicator changes
  const indicatorChartData = useMemo(() => {
    if (!indicators) return [];

    // Get top indicators by absolute 1M change
    return indicators
      .filter(ind => ind.change_1m !== null)
      .sort((a, b) => Math.abs(b.change_1m) - Math.abs(a.change_1m))
      .slice(0, 12)
      .map(ind => ({
        name: ind.series_name?.replace(/\s+/g, ' ').substring(0, 20) || ind.series_id,
        change: ind.change_1m,
        category: ind.category
      }));
  }, [indicators]);

  if (loading) {
    return (
      <div className="macro-dashboard loading-state">
        <Activity className="spinning" size={32} />
        <span>Loading macro data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="macro-dashboard error-state">
        <AlertTriangle size={32} />
        <span>{error}</span>
        <button onClick={loadData} className="btn-retry">Retry</button>
      </div>
    );
  }

  const volatility = getVolatilityLevel(keyMetrics?.volatility?.vix);
  const credit = getCreditStress(keyMetrics?.credit?.hySpread);

  return (
    <div className="macro-dashboard">
      {/* Header with refresh */}
      <div className="macro-header">
        <div className="macro-title">
          <h2>Macroeconomic Environment</h2>
          <span className="last-updated">
            Data as of {keyMetrics?.timestamp ? new Date(keyMetrics.timestamp).toLocaleDateString() : 'N/A'}
          </span>
        </div>
        <button className="btn-refresh" onClick={loadData} title="Refresh data">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="macro-section">
        <h3>Key Metrics</h3>
        <div className="key-metrics-grid">
          {/* Interest Rates */}
          <div className="metric-card rates">
            <div className="metric-header">
              <Percent size={18} />
              <span>Interest Rates</span>
            </div>
            <div className="metric-items">
              <div className="metric-item">
                <span className="metric-label">
                  Fed Funds
                  <IndicatorTooltip indicator="fedFunds" />
                </span>
                <span className="metric-value">
                  {keyMetrics?.rates?.fedFunds?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">
                  2Y Treasury
                  <IndicatorTooltip indicator="treasury2y" />
                </span>
                <span className="metric-value">
                  {keyMetrics?.rates?.treasury2y?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">
                  10Y Treasury
                  <IndicatorTooltip indicator="treasury10y" />
                </span>
                <span className="metric-value">
                  {keyMetrics?.rates?.treasury10y?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <div className="metric-item highlight">
                <span className="metric-label">
                  2s10s Spread
                  <IndicatorTooltip indicator="spread2s10s" />
                </span>
                <span className={`metric-value ${(keyMetrics?.rates?.spread2s10s ?? 0) < 0 ? 'negative' : 'positive'}`}>
                  {keyMetrics?.rates?.spread2s10s?.toFixed(2) ?? '-'}%
                  {keyMetrics?.rates?.curveInverted && (
                    <span className="inverted-badge">INVERTED</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Volatility */}
          <div className="metric-card volatility">
            <div className="metric-header">
              <Activity size={18} />
              <span>Market Volatility</span>
            </div>
            <div className="metric-items">
              <div className="metric-item">
                <span className="metric-label">
                  VIX
                  <IndicatorTooltip indicator="vix" />
                </span>
                <span className="metric-value" style={{ color: volatility.color }}>
                  {keyMetrics?.volatility?.vix?.toFixed(1) ?? '-'}
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Level</span>
                <span className="metric-value volatility-level" style={{ color: volatility.color }}>
                  {volatility.level}
                </span>
              </div>
            </div>
            <div className="vix-gauge">
              <div className="gauge-track">
                <div
                  className="gauge-fill"
                  style={{
                    width: `${Math.min((keyMetrics?.volatility?.vix ?? 0) / 50 * 100, 100)}%`,
                    background: volatility.color
                  }}
                />
              </div>
              <div className="gauge-labels">
                <span>0</span>
                <span>25</span>
                <span>50+</span>
              </div>
            </div>
          </div>

          {/* Credit */}
          <div className="metric-card credit">
            <div className="metric-header">
              <DollarSign size={18} />
              <span>Credit Markets</span>
            </div>
            <div className="metric-items">
              <div className="metric-item">
                <span className="metric-label">
                  HY Spread
                  <IndicatorTooltip indicator="hySpread" />
                </span>
                <span className="metric-value" style={{ color: credit.color }}>
                  {keyMetrics?.credit?.hySpread?.toFixed(2) ?? '-'}%
                </span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Stress Level</span>
                <span className="metric-value" style={{ color: credit.color }}>
                  {credit.level}
                </span>
              </div>
            </div>
          </div>

          {/* Employment */}
          <div className="metric-card economy">
            <div className="metric-header">
              <Briefcase size={18} />
              <span>Employment</span>
            </div>
            <div className="metric-items">
              <div className="metric-item">
                <span className="metric-label">
                  Unemployment
                  <IndicatorTooltip indicator="unemployment" />
                </span>
                <span className="metric-value">
                  {keyMetrics?.economy?.unemployment?.toFixed(1) ?? '-'}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Yield Curve */}
        <div className="macro-section chart-section">
          <h3>
            Yield Curve
            {yieldCurve?.is_inverted_2s10s === 1 && (
              <span className="curve-warning">
                <AlertTriangle size={14} />
                Inverted
              </span>
            )}
          </h3>
          {yieldCurve?.maturities && yieldCurve.maturities.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={yieldCurve.maturities}>
                  <defs>
                    <linearGradient id="yieldGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis dataKey="term" stroke="var(--text-tertiary)" fontSize={11} />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickFormatter={v => `${v}%`}
                    domain={['dataMin - 0.5', 'dataMax + 0.5']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value) => [`${value?.toFixed(2)}%`, 'Yield']}
                  />
                  <Area
                    type="monotone"
                    dataKey="yield"
                    stroke="#3b82f6"
                    fill="url(#yieldGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="no-data-message">No yield curve data available</div>
          )}
        </div>

        {/* 2s10s Spread History */}
        <div className="macro-section chart-section">
          <h3>2s10s Spread History</h3>
          {yieldCurveHistory && yieldCurveHistory.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={yieldCurveHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis
                    dataKey="curve_date"
                    stroke="var(--text-tertiary)"
                    fontSize={10}
                    tickFormatter={(d) => {
                      const date = new Date(d);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickFormatter={v => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value) => [`${value?.toFixed(2)}%`, '2s10s Spread']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="5 5" />
                  <Line
                    type="monotone"
                    dataKey="spread_2s10s"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="no-data-message">No spread history available</div>
          )}
        </div>
      </div>

      {/* VIX and Credit Spread History Row */}
      <div className="charts-row">
        {/* VIX History */}
        <div className="macro-section chart-section">
          <h3>VIX History</h3>
          {vixHistory && vixHistory.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={vixHistory}>
                  <defs>
                    <linearGradient id="vixGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis
                    dataKey="observation_date"
                    stroke="var(--text-tertiary)"
                    fontSize={10}
                    tickFormatter={(d) => {
                      const date = new Date(d);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value) => [value?.toFixed(2), 'VIX']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <ReferenceLine y={20} stroke="var(--warning)" strokeDasharray="3 3" label={{ value: '20', position: 'right', fontSize: 10 }} />
                  <ReferenceLine y={30} stroke="var(--negative)" strokeDasharray="3 3" label={{ value: '30', position: 'right', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#ef4444"
                    fill="url(#vixGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="no-data-message">No VIX history available</div>
          )}
        </div>

        {/* Credit Spread History */}
        <div className="macro-section chart-section">
          <h3>High-Yield Spread History</h3>
          {creditHistory && creditHistory.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={creditHistory}>
                  <defs>
                    <linearGradient id="creditGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis
                    dataKey="observation_date"
                    stroke="var(--text-tertiary)"
                    fontSize={10}
                    tickFormatter={(d) => {
                      const date = new Date(d);
                      return `${date.getMonth() + 1}/${date.getDate()}`;
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    fontSize={11}
                    tickFormatter={v => `${v}%`}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                    formatter={(value) => [`${value?.toFixed(2)}%`, 'HY Spread']}
                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                  />
                  <ReferenceLine y={4} stroke="var(--warning)" strokeDasharray="3 3" label={{ value: '4%', position: 'right', fontSize: 10 }} />
                  <ReferenceLine y={7} stroke="var(--negative)" strokeDasharray="3 3" label={{ value: '7%', position: 'right', fontSize: 10 }} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#f59e0b"
                    fill="url(#creditGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="no-data-message">No credit spread history available</div>
          )}
        </div>
      </div>

      {/* Monthly Changes Chart */}
      {indicatorChartData.length > 0 && (
        <div className="macro-section">
          <h3>Biggest Monthly Changes</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={indicatorChartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                <XAxis
                  type="number"
                  stroke="var(--text-tertiary)"
                  fontSize={11}
                  tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--text-tertiary)"
                  fontSize={10}
                  width={120}
                  tick={{ fill: 'var(--text-secondary)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                  formatter={(value) => [`${value > 0 ? '+' : ''}${value?.toFixed(2)}%`, '1M Change']}
                />
                <Bar dataKey="change" radius={[0, 4, 4, 0]}>
                  {indicatorChartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.change >= 0 ? 'var(--positive)' : 'var(--negative)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Categorized Indicators */}
      {indicators && indicators.length > 0 && (
        <div className="macro-section">
          <div className="indicators-header">
            <h3>Economic Indicators</h3>
            <div className="category-filter">
              <button
                className={`category-btn ${selectedCategory === 'all' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('all')}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`category-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    borderColor: selectedCategory === cat ? CATEGORY_COLORS[cat] : 'transparent',
                    color: selectedCategory === cat ? CATEGORY_COLORS[cat] : 'inherit'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="indicators-grid">
            {filteredIndicators.slice(0, 20).map((ind, i) => (
              <div key={i} className="indicator-card">
                <div className="ind-header">
                  <span className="ind-name">{ind.series_name || ind.series_id}</span>
                  <span
                    className="ind-category"
                    style={{ background: `${CATEGORY_COLORS[ind.category]}20`, color: CATEGORY_COLORS[ind.category] }}
                  >
                    {ind.category}
                  </span>
                </div>
                <div className="ind-value">
                  {formatValue(ind.value, ind.category)}
                </div>
                <div className="ind-changes">
                  {ind.change_1m !== null && (
                    <span className={`ind-change ${ind.change_1m >= 0 ? 'positive' : 'negative'}`}>
                      {ind.change_1m >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(ind.change_1m).toFixed(2)}% 1M
                    </span>
                  )}
                  {ind.change_1y !== null && (
                    <span className={`ind-change ${ind.change_1y >= 0 ? 'positive' : 'negative'}`}>
                      {ind.change_1y >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(ind.change_1y).toFixed(2)}% 1Y
                    </span>
                  )}
                </div>
                <div className="ind-date">{ind.observation_date}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Interpretation */}
      <div className="macro-section interpretation">
        <h3>Market Interpretation</h3>
        <div className="interpretation-cards">
          {keyMetrics?.rates?.curveInverted && (
            <div className="interp-card warning">
              <AlertTriangle size={20} />
              <div>
                <strong>Yield Curve Inverted</strong>
                <p>The 2s10s spread is negative, historically preceding recessions by 12-18 months. Consider defensive positioning.</p>
              </div>
            </div>
          )}

          {volatility.level === 'High' || volatility.level === 'Crisis' ? (
            <div className="interp-card warning">
              <Activity size={20} />
              <div>
                <strong>Elevated Volatility</strong>
                <p>VIX above 25 indicates market fear. Consider reducing position sizes and hedging.</p>
              </div>
            </div>
          ) : volatility.level === 'Low' ? (
            <div className="interp-card info">
              <Activity size={20} />
              <div>
                <strong>Low Volatility Environment</strong>
                <p>VIX below 15 suggests complacency. Good time to buy portfolio protection cheaply.</p>
              </div>
            </div>
          ) : null}

          {credit.level === 'Distressed' || credit.level === 'Elevated' ? (
            <div className="interp-card warning">
              <DollarSign size={20} />
              <div>
                <strong>Credit Stress Elevated</strong>
                <p>High-yield spreads widening indicates risk aversion. Favor quality over beta.</p>
              </div>
            </div>
          ) : credit.level === 'Tight' ? (
            <div className="interp-card positive">
              <DollarSign size={20} />
              <div>
                <strong>Credit Markets Healthy</strong>
                <p>Tight credit spreads indicate risk appetite. Environment favors cyclicals and beta.</p>
              </div>
            </div>
          ) : null}

          {!keyMetrics?.rates?.curveInverted && volatility.level === 'Normal' && credit.level === 'Normal' && (
            <div className="interp-card info">
              <BarChart3 size={20} />
              <div>
                <strong>Neutral Macro Environment</strong>
                <p>No extreme signals. Focus on individual stock selection and factor exposures.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
