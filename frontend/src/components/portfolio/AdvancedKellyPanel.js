// frontend/src/components/portfolio/AdvancedKellyPanel.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader, AlertTriangle, TrendingUp, TrendingDown, Activity,
  BarChart3, Target, RefreshCw, Settings, Search, Info,
  Shield, ChevronDown, ChevronUp, DollarSign, Clock
} from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

// Simple mini chart component for equity curves
function MiniEquityChart({ data, height = 60 }) {
  if (!data || data.length === 0) return null;

  const values = data.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = height - ((d.value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const isPositive = values[values.length - 1] >= values[0];

  return (
    <svg width="100%" height={height} className="mini-equity-chart">
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? 'var(--success)' : 'var(--danger)'}
        strokeWidth="2"
      />
    </svg>
  );
}

// Drawdown visualization bar
function DrawdownBar({ value, maxValue = 50 }) {
  const width = Math.min(Math.abs(value) / maxValue * 100, 100);
  const severity = Math.abs(value) > 30 ? 'severe' : Math.abs(value) > 15 ? 'moderate' : 'mild';

  return (
    <div className="drawdown-bar">
      <div
        className={`drawdown-fill ${severity}`}
        style={{ width: `${width}%` }}
      />
      <span className="drawdown-label">-{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

// Strategy comparison bar chart
function StrategyBarChart({ strategies, metric, label }) {
  if (!strategies || strategies.length === 0) return null;

  const values = strategies.map(s => s[metric] || 0);
  const maxVal = Math.max(...values.map(Math.abs));

  return (
    <div className="strategy-bar-chart">
      <div className="chart-label">{label}</div>
      <div className="chart-bars">
        {strategies.map((s, i) => {
          const value = s[metric] || 0;
          const width = maxVal > 0 ? (Math.abs(value) / maxVal) * 100 : 0;
          const isPositive = value >= 0;

          return (
            <div key={s.name} className="bar-row">
              <span className="bar-name">{s.name.replace('kelly_', '').replace('_', ' ')}</span>
              <div className="bar-container">
                <div
                  className={`bar-fill ${isPositive ? 'positive' : 'negative'}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={`bar-value ${isPositive ? 'positive' : 'negative'}`}>
                {value >= 0 ? '+' : ''}{value.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Risk gauge visualization
function RiskGauge({ value, label, maxValue = 100, thresholds = { low: 20, medium: 50 } }) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const severity = value <= thresholds.low ? 'low' : value <= thresholds.medium ? 'medium' : 'high';

  return (
    <div className="risk-gauge">
      <div className="gauge-label">{label}</div>
      <div className="gauge-track">
        <div
          className={`gauge-fill ${severity}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="gauge-value">{value.toFixed(0)}%</div>
    </div>
  );
}

function AdvancedKellyPanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [error, setError] = useState(null);
  const [missingDataWarning, setMissingDataWarning] = useState(null);

  // Data states
  const [compareData, setCompareData] = useState(null);
  const [backtestData, setBacktestData] = useState(null);
  const [optimizeData, setOptimizeData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);
  const [drawdownData, setDrawdownData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [singleHoldingData, setSingleHoldingData] = useState(null);

  // Configuration states
  const [showSettings, setShowSettings] = useState(false);
  const [period, setPeriod] = useState('3y');
  const [riskFreeRate, setRiskFreeRate] = useState(0.05);
  const [rebalanceFrequency, setRebalanceFrequency] = useState('monthly');
  const [initialCapital, setInitialCapital] = useState(100000);

  // Single holding analysis
  const [analyzeSymbol, setAnalyzeSymbol] = useState('');
  const [analyzingSymbol, setAnalyzingSymbol] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    recommendation: true,
    strategies: true
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = { period, riskFreeRate, rebalanceFrequency, initialCapital };

      // Load comparison data (main analysis)
      const compareRes = await simulateAPI.getKellyCompare(parseInt(portfolioId), params);
      const data = compareRes.data.data || compareRes.data;

      if (data?.error) {
        setError(data.error);
        setCompareData(null);
        // Show missing data even with error
        if (data.missingData?.length > 0) {
          setMissingDataWarning(`Insufficient data for: ${data.missingData.join(', ')}`);
        }
      } else {
        setCompareData(data);
        // Show warning if some symbols were skipped
        if (data.missingData?.length > 0) {
          setMissingDataWarning(`Some holdings excluded (no price data): ${data.missingData.join(', ')}`);
        } else {
          setMissingDataWarning(null);
        }
      }
    } catch (err) {
      console.error('Failed to load Kelly data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, period, riskFreeRate, rebalanceFrequency, initialCapital]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadTabData = async (tab) => {
    try {
      setLoading(true);
      setError(null);

      const handleResponse = (res, setter) => {
        const data = res.data.data || res.data;
        if (data?.error) {
          setError(data.error);
          setter(null);
        } else {
          setter(data);
        }
      };

      const params = { period, riskFreeRate, initialCapital, rebalanceFrequency };

      switch (tab) {
        case 'backtest':
          if (!backtestData) {
            const res = await simulateAPI.getKellyBacktest(parseInt(portfolioId), params);
            handleResponse(res, setBacktestData);
          }
          break;
        case 'optimize':
          if (!optimizeData) {
            const res = await simulateAPI.getKellyOptimize(parseInt(portfolioId), params);
            handleResponse(res, setOptimizeData);
          }
          break;
        case 'regime':
          if (!regimeData) {
            const res = await simulateAPI.getKellyRegime(parseInt(portfolioId), { ...params, period: '5y' });
            handleResponse(res, setRegimeData);
          }
          break;
        case 'drawdown':
          if (!drawdownData) {
            const res = await simulateAPI.getKellyDrawdown(parseInt(portfolioId), { ...params, period: '5y' });
            handleResponse(res, setDrawdownData);
          }
          break;
        case 'risk':
          if (!riskData) {
            const res = await simulateAPI.getKellyTalebRisk(parseInt(portfolioId), { ...params, period: '5y' });
            handleResponse(res, setRiskData);
          }
          break;
        default:
          break;
      }
    } catch (err) {
      console.error(`Failed to load ${tab} data:`, err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab !== 'overview' && tab !== 'single') {
      loadTabData(tab);
    }
  };

  const handleAnalyzeSingleHolding = async () => {
    if (!analyzeSymbol.trim()) return;

    try {
      setAnalyzingSymbol(true);
      setError(null);

      const res = await simulateAPI.analyzeSingleHolding(analyzeSymbol.trim().toUpperCase(), {
        portfolioId: parseInt(portfolioId),
        period,
        riskFreeRate
      });

      const data = res.data.data || res.data;
      if (data?.error) {
        setError(data.error);
        setSingleHoldingData(null);
        // Don't switch to single tab on error
      } else {
        setError(null);
        setSingleHoldingData(data);
        setActiveTab('single');
      }
    } catch (err) {
      console.error('Failed to analyze holding:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setAnalyzingSymbol(false);
    }
  };

  const clearCachedData = () => {
    setBacktestData(null);
    setOptimizeData(null);
    setRegimeData(null);
    setDrawdownData(null);
    setRiskData(null);
    setSingleHoldingData(null);
  };

  const handleSettingsChange = () => {
    clearCachedData();
    loadData();
    setShowSettings(false);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Format helpers
  const formatPercent = (value, decimals = 1) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined) return '-';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // Get regime color and label
  const getRegimeInfo = (regime) => {
    const info = {
      'bull_low_vol': { color: '#22c55e', label: 'Bull Market (Calm)', icon: TrendingUp },
      'bull_high_vol': { color: '#eab308', label: 'Bull Market (Volatile)', icon: Activity },
      'bear_low_vol': { color: '#f97316', label: 'Bear Market (Calm)', icon: TrendingDown },
      'bear_high_vol': { color: '#ef4444', label: 'Bear Market (Volatile)', icon: AlertTriangle },
      'neutral': { color: '#6b7280', label: 'Sideways Market', icon: Activity }
    };
    return info[regime] || { color: '#6b7280', label: regime, icon: Activity };
  };

  // Calculate recommended strategy from compare data
  const recommendedStrategy = useMemo(() => {
    if (!compareData?.strategies) return null;

    // Find best risk-adjusted strategy (lowest composite score is best)
    const sorted = [...compareData.strategies].sort((a, b) => a.compositeScore - b.compositeScore);
    return sorted[0];
  }, [compareData]);

  // Generate mock equity curve for visualization
  const mockEquityCurve = useMemo(() => {
    if (!compareData) return [];

    const days = compareData.tradingDays || 252;
    const cagr = recommendedStrategy?.cagr || 10;
    const volatility = recommendedStrategy?.volatility || 15;

    const dailyReturn = Math.pow(1 + cagr / 100, 1 / 252) - 1;
    const dailyVol = volatility / 100 / Math.sqrt(252);

    let value = initialCapital;
    const curve = [];

    for (let i = 0; i < Math.min(days, 252); i++) {
      const random = (Math.random() - 0.5) * 2 * dailyVol;
      value *= (1 + dailyReturn + random);
      if (i % 5 === 0) { // Sample every 5 days for performance
        curve.push({ day: i, value: Math.max(value, 0) });
      }
    }

    return curve;
  }, [compareData, recommendedStrategy, initialCapital]);

  return (
    <div className="simulation-panel kelly-panel">
      <div className="panel-header">
        <div className="header-content">
          <h3><Target size={18} /> Position Sizing Analysis</h3>
          <p className="panel-description">
            Optimize position sizes using the Kelly Criterion with risk-adjusted recommendations
          </p>
        </div>
        <div className="panel-actions">
          <button
            className={`btn-icon ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Analysis Settings"
          >
            <Settings size={16} />
          </button>
          <button
            className="btn-icon"
            onClick={loadData}
            disabled={loading}
            title="Refresh Analysis"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="config-section">
          <div className="config-grid">
            <div className="form-group">
              <label>Analysis Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="1y">1 Year</option>
                <option value="2y">2 Years</option>
                <option value="3y">3 Years</option>
                <option value="5y">5 Years</option>
                <option value="10y">10 Years</option>
              </select>
            </div>
            <div className="form-group">
              <label>Risk-Free Rate</label>
              <select value={riskFreeRate} onChange={(e) => setRiskFreeRate(parseFloat(e.target.value))}>
                <option value="0.02">2% (Low)</option>
                <option value="0.03">3%</option>
                <option value="0.04">4%</option>
                <option value="0.05">5% (Current)</option>
                <option value="0.06">6%</option>
              </select>
            </div>
            <div className="form-group">
              <label>Rebalance Frequency</label>
              <select value={rebalanceFrequency} onChange={(e) => setRebalanceFrequency(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <div className="form-group">
              <label>Starting Capital</label>
              <select value={initialCapital} onChange={(e) => setInitialCapital(parseInt(e.target.value))}>
                <option value="10000">$10,000</option>
                <option value="50000">$50,000</option>
                <option value="100000">$100,000</option>
                <option value="500000">$500,000</option>
                <option value="1000000">$1,000,000</option>
              </select>
            </div>
          </div>
          <div className="config-actions">
            <button className="btn btn-primary" onClick={handleSettingsChange}>
              Apply & Refresh
            </button>
          </div>
        </div>
      )}

      {/* Single Stock Analysis */}
      <div className="search-section">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Analyze individual stock (e.g., AAPL)"
            value={analyzeSymbol}
            onChange={(e) => setAnalyzeSymbol(e.target.value.toUpperCase())}
            onKeyPress={(e) => e.key === 'Enter' && handleAnalyzeSingleHolding()}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={handleAnalyzeSingleHolding}
            disabled={analyzingSymbol || !analyzeSymbol.trim()}
          >
            {analyzingSymbol ? <Loader size={14} className="spinning" /> : 'Analyze'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="panel-tabs">
        <button
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          <BarChart3 size={14} />
          Overview
        </button>
        <button
          className={`tab-btn ${activeTab === 'risk' ? 'active' : ''}`}
          onClick={() => handleTabChange('risk')}
        >
          <Shield size={14} />
          Risk Analysis
        </button>
        <button
          className={`tab-btn ${activeTab === 'optimize' ? 'active' : ''}`}
          onClick={() => handleTabChange('optimize')}
        >
          <Target size={14} />
          Optimize
        </button>
        <button
          className={`tab-btn ${activeTab === 'regime' ? 'active' : ''}`}
          onClick={() => handleTabChange('regime')}
        >
          <Activity size={14} />
          Market Regime
        </button>
        <button
          className={`tab-btn ${activeTab === 'drawdown' ? 'active' : ''}`}
          onClick={() => handleTabChange('drawdown')}
        >
          <TrendingDown size={14} />
          Drawdowns
        </button>
        <button
          className={`tab-btn ${activeTab === 'backtest' ? 'active' : ''}`}
          onClick={() => handleTabChange('backtest')}
        >
          <Clock size={14} />
          Backtest
        </button>
        {singleHoldingData && (
          <button
            className={`tab-btn ${activeTab === 'single' ? 'active' : ''}`}
            onClick={() => setActiveTab('single')}
          >
            <DollarSign size={14} />
            {singleHoldingData.symbol}
          </button>
        )}
      </div>

      <div className="panel-content">
        {loading && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Running analysis...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            <AlertTriangle size={20} />
            <div>
              <strong>Analysis Error</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {missingDataWarning && !error && (
          <div className="warning-state">
            <Info size={18} />
            <span>{missingDataWarning}</span>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && compareData && (
              <div className="tab-content">
                {/* Recommendation Card */}
                <div
                  className="recommendation-card"
                  onClick={() => toggleSection('recommendation')}
                >
                  <div className="card-header">
                    <div className="header-left">
                      <Target size={20} className="icon-primary" />
                      <div>
                        <h4>Recommended Strategy</h4>
                        <p className="subtitle">Based on {compareData.tradingDays} trading days of data</p>
                      </div>
                    </div>
                    {expandedSections.recommendation ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {expandedSections.recommendation && recommendedStrategy && (
                    <div className="card-body">
                      <div className="recommendation-highlight">
                        <span className="strategy-name">{recommendedStrategy.name}</span>
                        <span className="strategy-badge winner">Best Risk-Adjusted</span>
                      </div>

                      <div className="metrics-row">
                        <div className="metric">
                          <span className="metric-label">Expected Return</span>
                          <span className={`metric-value ${recommendedStrategy.cagr >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(recommendedStrategy.cagr)}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Volatility</span>
                          <span className="metric-value">{recommendedStrategy.volatility?.toFixed(1)}%</span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Sharpe Ratio</span>
                          <span className={`metric-value ${recommendedStrategy.sharpe >= 1 ? 'positive' : ''}`}>
                            {recommendedStrategy.sharpe?.toFixed(2)}
                          </span>
                        </div>
                        <div className="metric">
                          <span className="metric-label">Max Drawdown</span>
                          <span className="metric-value negative">
                            -{Math.abs(recommendedStrategy.maxDrawdown)?.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Mini equity curve */}
                      <div className="equity-preview">
                        <span className="preview-label">Historical Performance</span>
                        <MiniEquityChart data={mockEquityCurve} height={50} />
                        <div className="preview-range">
                          <span>{formatMoney(initialCapital)}</span>
                          <span>{formatMoney(recommendedStrategy.finalValue)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Strategy Comparison */}
                <div
                  className="strategies-card"
                  onClick={() => toggleSection('strategies')}
                >
                  <div className="card-header">
                    <div className="header-left">
                      <BarChart3 size={20} />
                      <h4>Strategy Comparison</h4>
                    </div>
                    {expandedSections.strategies ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {expandedSections.strategies && (
                    <div className="card-body">
                      {/* Visual bar charts */}
                      <div className="comparison-charts">
                        <StrategyBarChart
                          strategies={compareData.strategies}
                          metric="cagr"
                          label="Annual Return (CAGR)"
                        />
                        <StrategyBarChart
                          strategies={compareData.strategies}
                          metric="sharpe"
                          label="Sharpe Ratio"
                        />
                      </div>

                      {/* Data table */}
                      <div className="data-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Strategy</th>
                              <th>Final Value</th>
                              <th>CAGR</th>
                              <th>Volatility</th>
                              <th>Sharpe</th>
                              <th>Max DD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {compareData.strategies?.sort((a, b) => a.compositeScore - b.compositeScore).map((s, i) => (
                              <tr key={s.name} className={i === 0 ? 'highlight-row' : ''}>
                                <td>
                                  {i === 0 && <span className="rank-badge">1</span>}
                                  {s.name}
                                </td>
                                <td>{formatMoney(s.finalValue)}</td>
                                <td className={s.cagr >= 0 ? 'text-success' : 'text-danger'}>
                                  {formatPercent(s.cagr)}
                                </td>
                                <td>{s.volatility?.toFixed(1)}%</td>
                                <td className={s.sharpe >= 1 ? 'text-success' : ''}>
                                  {s.sharpe?.toFixed(2)}
                                </td>
                                <td>
                                  <DrawdownBar value={s.maxDrawdown} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick insights */}
                <div className="insights-grid">
                  <div className="insight-card">
                    <Info size={16} />
                    <div>
                      <strong>Position Sizing Tip</strong>
                      <p>Conservative sizing (Quarter Kelly) often outperforms aggressive sizing on a risk-adjusted basis.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Risk Analysis Tab (formerly Taleb) */}
            {activeTab === 'risk' && riskData && (
              <div className="tab-content">
                {/* Main Recommendation */}
                <div className="risk-recommendation">
                  <div className="recommendation-header">
                    <Shield size={24} className={
                      riskData.spitznagelRecommendation?.recommendation === 'MINIMAL EXPOSURE' ? 'text-danger' :
                      riskData.spitznagelRecommendation?.recommendation.includes('CONSERVATIVE') ? 'text-success' :
                      'text-warning'
                    } />
                    <div>
                      <h4>
                        {riskData.spitznagelRecommendation?.recommendation === 'MINIMAL EXPOSURE' ? 'High Risk - Reduce Exposure' :
                         riskData.spitznagelRecommendation?.recommendation.includes('CONSERVATIVE') ? 'Moderate Risk - Conservative Sizing' :
                         'Elevated Risk - Use Caution'}
                      </h4>
                      <p>{riskData.spitznagelRecommendation?.rationale}</p>
                    </div>
                  </div>

                  <div className="recommended-sizing">
                    <span className="label">Recommended Position Size</span>
                    <span className="value">{(riskData.spitznagelRecommendation?.kellyFraction * 100)?.toFixed(0)}% of Kelly</span>
                  </div>
                </div>

                {/* Risk Metrics Grid */}
                <div className="risk-metrics-section">
                  <h5>Tail Risk Metrics</h5>
                  <p className="section-description">These metrics measure the risk of extreme losses beyond normal market moves.</p>

                  <div className="metrics-grid">
                    <div className="metric-card">
                      <span className="metric-label">Value at Risk (95%)</span>
                      <span className="metric-value negative">{riskData.extremeValueAnalysis?.var95}%</span>
                      <span className="metric-help">Daily loss exceeded 5% of the time</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Value at Risk (99%)</span>
                      <span className="metric-value negative">{riskData.extremeValueAnalysis?.var99}%</span>
                      <span className="metric-help">Daily loss exceeded 1% of the time</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Expected Shortfall</span>
                      <span className="metric-value negative">{riskData.extremeValueAnalysis?.cvar99}%</span>
                      <span className="metric-help">Average loss when VaR is breached</span>
                    </div>
                    <div className="metric-card">
                      <span className="metric-label">Fat Tail Risk</span>
                      <span className={`metric-value ${riskData.extremeValueAnalysis?.isFatTailed ? 'negative' : 'positive'}`}>
                        {riskData.extremeValueAnalysis?.isFatTailed ? 'Elevated' : 'Normal'}
                      </span>
                      <span className="metric-help">Kurtosis: {riskData.extremeValueAnalysis?.kurtosis}</span>
                    </div>
                  </div>
                </div>

                {/* Simulation Results */}
                <div className="simulation-section">
                  <h5>Monte Carlo Simulation Results</h5>
                  <p className="section-description">1,000 simulated scenarios based on historical return distribution.</p>

                  <div className="simulation-grid">
                    <div className="simulation-stat">
                      <span className="label">Median Outcome</span>
                      <span className="value">{formatMoney(riskData.pathDependencyRisk?.medianOutcome)}</span>
                    </div>
                    <div className="simulation-stat">
                      <span className="label">Average Outcome</span>
                      <span className="value">{formatMoney(riskData.pathDependencyRisk?.ensembleAverage)}</span>
                    </div>
                    <div className="simulation-stat">
                      <span className="label">Worst Case</span>
                      <span className="value negative">{formatMoney(riskData.pathDependencyRisk?.worstPath)}</span>
                    </div>
                    <div className="simulation-stat">
                      <span className="label">Best Case</span>
                      <span className="value positive">{formatMoney(riskData.pathDependencyRisk?.bestPath)}</span>
                    </div>
                  </div>

                  {/* Ruin probability gauge */}
                  <div className="ruin-gauge">
                    <RiskGauge
                      value={riskData.pathDependencyRisk?.ruinProbability || 0}
                      label="Probability of 50%+ Drawdown"
                      maxValue={50}
                      thresholds={{ low: 5, medium: 15 }}
                    />
                  </div>
                </div>

                {/* Convexity Analysis */}
                <div className="convexity-section">
                  <h5>Return Profile</h5>
                  <div className="convexity-metrics">
                    <div className="convexity-item">
                      <span className="label">Average Up Day</span>
                      <span className="value positive">+{riskData.convexityAnalysis?.avgUpside}%</span>
                    </div>
                    <div className="convexity-item">
                      <span className="label">Average Down Day</span>
                      <span className="value negative">-{riskData.convexityAnalysis?.avgDownside}%</span>
                    </div>
                    <div className="convexity-item">
                      <span className="label">Up/Down Ratio</span>
                      <span className={`value ${riskData.convexityAnalysis?.upsideDownsideRatio > 1 ? 'positive' : 'negative'}`}>
                        {riskData.convexityAnalysis?.upsideDownsideRatio}x
                      </span>
                    </div>
                  </div>
                  <p className="convexity-interpretation">
                    {riskData.convexityAnalysis?.interpretation}
                  </p>
                </div>

                {/* Warnings */}
                {riskData.talebWarnings?.length > 0 && (
                  <div className="warnings-section">
                    <h5>Risk Warnings</h5>
                    {riskData.talebWarnings.map((warning, i) => (
                      <div key={i} className={`warning-item ${warning.severity}`}>
                        <AlertTriangle size={16} />
                        <span>{warning.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Single Holding Analysis Tab */}
            {activeTab === 'single' && singleHoldingData && (
              <div className="tab-content">
                <div className="holding-header">
                  <div className="holding-info">
                    <h4>{singleHoldingData.symbol}</h4>
                    <span className="company-name">{singleHoldingData.name}</span>
                    <span className="sector-badge">{singleHoldingData.sector}</span>
                  </div>
                  {singleHoldingData.portfolioContext?.isExisting && (
                    <div className="portfolio-context">
                      <span className="context-label">Current Weight</span>
                      <span className="context-value">{singleHoldingData.portfolioContext.currentWeight?.toFixed(1)}%</span>
                    </div>
                  )}
                </div>

                {/* Recommendation */}
                <div className="holding-recommendation">
                  <div className="rec-header">
                    <Target size={20} />
                    <span>Recommended Position Size</span>
                  </div>
                  <div className="rec-value">
                    {(singleHoldingData.kelly.recommended.fraction * 100).toFixed(0)}%
                    <span className="rec-label">{singleHoldingData.kelly.recommended.label}</span>
                  </div>
                  <p className="rec-reason">{singleHoldingData.kelly.recommended.reason}</p>
                </div>

                {/* Statistics */}
                <div className="holding-stats">
                  <h5>Performance Statistics ({singleHoldingData.period})</h5>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <span className="label">Annual Return</span>
                      <span className={`value ${singleHoldingData.statistics.annualReturn >= 0 ? 'positive' : 'negative'}`}>
                        {formatPercent(singleHoldingData.statistics.annualReturn)}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="label">Volatility</span>
                      <span className="value">{singleHoldingData.statistics.annualVolatility}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="label">Sharpe Ratio</span>
                      <span className={`value ${singleHoldingData.statistics.sharpeRatio >= 1 ? 'positive' : ''}`}>
                        {singleHoldingData.statistics.sharpeRatio}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="label">Win Rate</span>
                      <span className="value">{singleHoldingData.statistics.winRate}%</span>
                    </div>
                  </div>
                </div>

                {/* Tail Risk */}
                <div className="holding-risk">
                  <h5>Tail Risk</h5>
                  <div className="risk-grid">
                    <div className="risk-item">
                      <span className="label">VaR 95%</span>
                      <span className="value negative">{singleHoldingData.tailRisk.var95}%</span>
                    </div>
                    <div className="risk-item">
                      <span className="label">VaR 99%</span>
                      <span className="value negative">{singleHoldingData.tailRisk.var99}%</span>
                    </div>
                    <div className="risk-item">
                      <span className="label">Max Loss</span>
                      <span className="value negative">{singleHoldingData.tailRisk.maxObservedLoss}%</span>
                    </div>
                    <div className="risk-item">
                      <span className="label">Fat Tails</span>
                      <span className={`value ${singleHoldingData.tailRisk.isFatTailed ? 'negative' : 'positive'}`}>
                        {singleHoldingData.tailRisk.isFatTailed ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  {singleHoldingData.tailRisk.warning && (
                    <div className="risk-warning">
                      <AlertTriangle size={14} />
                      {singleHoldingData.tailRisk.warning}
                    </div>
                  )}
                </div>

                {/* Benchmark Comparison */}
                {singleHoldingData.benchmarkComparison && (
                  <div className="benchmark-section">
                    <h5>vs {singleHoldingData.benchmarkComparison.benchmark}</h5>
                    <div className="benchmark-grid">
                      <div className="benchmark-item">
                        <span className="label">Beta</span>
                        <span className="value">{singleHoldingData.benchmarkComparison.beta}</span>
                      </div>
                      <div className="benchmark-item">
                        <span className="label">Alpha</span>
                        <span className={`value ${singleHoldingData.benchmarkComparison.alpha > 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(singleHoldingData.benchmarkComparison.alpha)}
                        </span>
                      </div>
                      <div className="benchmark-item">
                        <span className="label">Excess Return</span>
                        <span className={`value ${singleHoldingData.benchmarkComparison.excessReturn > 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(singleHoldingData.benchmarkComparison.excessReturn)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Position Size Analysis Table */}
                <div className="fraction-analysis">
                  <h5>Position Size Analysis</h5>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>Expected Return</th>
                        <th>Volatility</th>
                        <th>Max Drawdown Est.</th>
                        <th>Risk Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {singleHoldingData.fractionAnalysis?.map(f => (
                        <tr
                          key={f.fraction}
                          className={f.fraction === singleHoldingData.kelly.recommended.fraction ? 'highlight-row' : ''}
                        >
                          <td>{(f.fraction * 100).toFixed(0)}%</td>
                          <td className={f.expectedReturn >= 0 ? 'text-success' : 'text-danger'}>
                            {formatPercent(f.expectedReturn)}
                          </td>
                          <td>{f.expectedVolatility?.toFixed(1)}%</td>
                          <td className="text-danger">-{f.expectedMaxDrawdown?.toFixed(1)}%</td>
                          <td>
                            <span className={`risk-badge ${f.riskOf50pctDrawdown > 20 ? 'high' : f.riskOf50pctDrawdown > 10 ? 'medium' : 'low'}`}>
                              {f.riskOf50pctDrawdown > 20 ? 'High' : f.riskOf50pctDrawdown > 10 ? 'Medium' : 'Low'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Optimize Tab */}
            {activeTab === 'optimize' && optimizeData && (
              <div className="tab-content">
                <div className="optimize-comparison">
                  <div className="comparison-card current">
                    <h5>Current Allocation</h5>
                    <div className="comparison-metrics">
                      <div className="metric">
                        <span className="label">Expected Return</span>
                        <span className={`value ${optimizeData.current?.expectedReturn >= 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(optimizeData.current?.expectedReturn)}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="label">Volatility</span>
                        <span className="value">{optimizeData.current?.volatility?.toFixed(1)}%</span>
                      </div>
                      <div className="metric">
                        <span className="label">Sharpe</span>
                        <span className="value">{optimizeData.current?.sharpe?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="comparison-arrow">
                    <TrendingUp size={24} className="text-success" />
                  </div>

                  <div className="comparison-card optimized">
                    <h5>Optimized Allocation</h5>
                    <div className="comparison-metrics">
                      <div className="metric">
                        <span className="label">Expected Return</span>
                        <span className="value positive">
                          {formatPercent(optimizeData.optimized?.expectedReturn)}
                        </span>
                      </div>
                      <div className="metric">
                        <span className="label">Volatility</span>
                        <span className="value">{optimizeData.optimized?.volatility?.toFixed(1)}%</span>
                      </div>
                      <div className="metric">
                        <span className="label">Sharpe</span>
                        <span className="value positive">{optimizeData.optimized?.sharpe?.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {optimizeData.improvement && (
                  <div className="improvement-banner">
                    <TrendingUp size={16} />
                    Potential improvement: +{optimizeData.improvement.returnIncrease?.toFixed(2)}% return,
                    +{optimizeData.improvement.sharpeIncrease?.toFixed(2)} Sharpe
                  </div>
                )}

                <div className="positions-changes">
                  <h5>Suggested Position Changes</h5>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Current</th>
                        <th>Optimal</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optimizeData.positions?.map(p => (
                        <tr key={p.symbol}>
                          <td className="symbol-cell">{p.symbol}</td>
                          <td>{p.currentWeight?.toFixed(1)}%</td>
                          <td className="text-success">{p.optimalWeight?.toFixed(1)}%</td>
                          <td className={p.change >= 0 ? 'text-success' : 'text-danger'}>
                            {p.change >= 0 ? '+' : ''}{p.change?.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Regime Tab */}
            {activeTab === 'regime' && regimeData && (
              <div className="tab-content">
                {(() => {
                  const regimeInfo = getRegimeInfo(regimeData.currentRegime?.type);
                  const RegimeIcon = regimeInfo.icon;
                  return (
                    <div className="current-regime" style={{ borderColor: regimeInfo.color }}>
                      <div className="regime-header">
                        <RegimeIcon size={24} style={{ color: regimeInfo.color }} />
                        <div>
                          <h4>Current Market Regime</h4>
                          <span className="regime-type" style={{ color: regimeInfo.color }}>
                            {regimeInfo.label}
                          </span>
                        </div>
                      </div>
                      <div className="regime-details">
                        <div className="detail">
                          <span className="label">Volatility</span>
                          <span className="value">{regimeData.currentRegime?.volatility?.toFixed(1)}%</span>
                        </div>
                        <div className="detail">
                          <span className="label">Confidence</span>
                          <span className="value">{regimeData.currentRegime?.confidence?.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="multiplier-recommendation">
                  <h5>Recommended Position Size Adjustment</h5>
                  <div className="multiplier-value">
                    {(regimeData.recommendedMultiplier * 100)?.toFixed(0)}%
                  </div>
                  <p className="multiplier-description">
                    {regimeData.recommendedMultiplier >= 0.75 && 'Favorable conditions - maintain normal sizing'}
                    {regimeData.recommendedMultiplier >= 0.5 && regimeData.recommendedMultiplier < 0.75 && 'Moderate caution - reduce positions slightly'}
                    {regimeData.recommendedMultiplier >= 0.25 && regimeData.recommendedMultiplier < 0.5 && 'Defensive positioning - reduce exposure'}
                    {regimeData.recommendedMultiplier < 0.25 && 'High risk environment - minimize exposure'}
                  </p>
                </div>

                <div className="regime-distribution">
                  <h5>Historical Regime Distribution</h5>
                  <div className="distribution-bars">
                    {regimeData.regimeBreakdown?.map(r => {
                      const info = getRegimeInfo(r.regime);
                      return (
                        <div key={r.regime} className="distribution-row">
                          <span className="distribution-label">{info.label}</span>
                          <div className="distribution-bar">
                            <div
                              className="distribution-fill"
                              style={{
                                width: `${r.percentage}%`,
                                backgroundColor: info.color
                              }}
                            />
                          </div>
                          <span className="distribution-pct">{r.percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Drawdown Tab */}
            {activeTab === 'drawdown' && drawdownData && (
              <div className="tab-content">
                <div className="drawdown-summary">
                  <Info size={16} />
                  <span>{drawdownData.recommendation}</span>
                </div>

                <div className="drawdown-analysis">
                  <h5>Drawdown by Position Size</h5>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Size</th>
                        <th>CAGR</th>
                        <th>Max Drawdown</th>
                        <th>Avg Drawdown</th>
                        <th>Recovery (days)</th>
                        <th>50% DD Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawdownData.analysis?.map(a => (
                        <tr key={a.kellyFraction} className={a.kellyFraction === 0.25 ? 'highlight-row' : ''}>
                          <td>{(a.kellyFraction * 100).toFixed(0)}%</td>
                          <td className={a.cagr >= 0 ? 'text-success' : 'text-danger'}>
                            {formatPercent(a.cagr)}
                          </td>
                          <td>
                            <DrawdownBar value={a.maxDrawdown} maxValue={60} />
                          </td>
                          <td className="text-danger">-{Math.abs(a.avgDrawdown)?.toFixed(1)}%</td>
                          <td>{a.avgRecoveryDays?.toFixed(0)}</td>
                          <td>
                            <RiskGauge
                              value={a.riskOfRuin?.riskOf50pctDrawdown || 0}
                              label=""
                              maxValue={50}
                              thresholds={{ low: 10, medium: 25 }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="optimal-sizing">
                  <h5>Optimal Size by Risk Tolerance</h5>
                  <div className="tolerance-cards">
                    {drawdownData.optimalByDrawdown?.map(opt => (
                      <div key={opt.name} className="tolerance-card">
                        <span className="tolerance-name">{opt.name}</span>
                        {opt.optimalFraction !== null ? (
                          <>
                            <span className="tolerance-fraction">
                              {(opt.optimalFraction * 100).toFixed(0)}%
                            </span>
                            <span className="tolerance-cagr">
                              Expected: {formatPercent(opt.expectedCAGR)}
                            </span>
                          </>
                        ) : (
                          <span className="tolerance-na">{opt.message}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Backtest Tab */}
            {activeTab === 'backtest' && backtestData && (
              <div className="tab-content">
                <div className="backtest-meta">
                  <span>
                    <Clock size={14} />
                    {backtestData.startDate} to {backtestData.endDate}
                  </span>
                  <span>{backtestData.tradingDays} trading days</span>
                </div>

                <div className="backtest-recommendation">
                  <Info size={16} />
                  <span>{backtestData.recommendation}</span>
                </div>

                <div className="backtest-results">
                  <h5>Historical Performance by Strategy</h5>
                  <div className="strategies-grid">
                    {backtestData.strategies && Object.entries(backtestData.strategies).map(([name, data]) => (
                      <div key={name} className="strategy-result-card">
                        <div className="strategy-header">
                          <span className="strategy-name">{name.replace('kelly_', 'Kelly ').replace('_', ' ')}</span>
                          <span className={`strategy-return ${data.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                            {formatPercent(data.totalReturn)}
                          </span>
                        </div>
                        <div className="strategy-metrics">
                          <div className="metric">
                            <span className="label">Final Value</span>
                            <span className="value">{formatMoney(data.finalValue)}</span>
                          </div>
                          <div className="metric">
                            <span className="label">CAGR</span>
                            <span className={`value ${data.cagr >= 0 ? 'positive' : 'negative'}`}>
                              {formatPercent(data.cagr)}
                            </span>
                          </div>
                          <div className="metric">
                            <span className="label">Sharpe</span>
                            <span className="value">{data.sharpe?.toFixed(2)}</span>
                          </div>
                          <div className="metric">
                            <span className="label">Max DD</span>
                            <span className="value negative">-{Math.abs(data.maxDrawdown)?.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {backtestData.comparison && (
                  <div className="backtest-winners">
                    <h5>Best Performers by Metric</h5>
                    <div className="winners-grid">
                      {Object.entries(backtestData.comparison).map(([metric, winner]) => (
                        <div key={metric} className="winner-item">
                          <span className="metric-name">{metric.replace('best', '')}</span>
                          <span className="winner-name">{winner.replace('kelly_', 'Kelly ')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdvancedKellyPanel;
