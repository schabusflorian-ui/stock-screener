// frontend/src/components/portfolio/AdvancedKellyPanel.js
import { useState, useEffect } from 'react';
import {
  Loader, AlertTriangle, TrendingUp, TrendingDown, Activity,
  BarChart3, Target, Zap, RefreshCw, ChevronDown, ChevronRight,
  ArrowUp, ArrowDown, Minus, Info
} from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

function AdvancedKellyPanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('compare');
  const [error, setError] = useState(null);

  // Data states
  const [compareData, setCompareData] = useState(null);
  const [backtestData, setBacktestData] = useState(null);
  const [optimizeData, setOptimizeData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);
  const [drawdownData, setDrawdownData] = useState(null);

  // Settings
  const [period] = useState('3y');
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load comparison data first (most useful)
      const compareRes = await simulateAPI.getKellyCompare(parseInt(portfolioId), { period });
      const data = compareRes.data.data || compareRes.data;

      // Check for error in response
      if (data?.error) {
        setError(data.error);
        setCompareData(null);
      } else {
        setCompareData(data);
      }

    } catch (err) {
      console.error('Failed to load Kelly data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

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

      switch (tab) {
        case 'backtest':
          if (!backtestData) {
            const res = await simulateAPI.getKellyBacktest(parseInt(portfolioId), { period });
            handleResponse(res, setBacktestData);
          }
          break;
        case 'optimize':
          if (!optimizeData) {
            const res = await simulateAPI.getKellyOptimize(parseInt(portfolioId), { period });
            handleResponse(res, setOptimizeData);
          }
          break;
        case 'regime':
          if (!regimeData) {
            const res = await simulateAPI.getKellyRegime(parseInt(portfolioId), { period: '5y' });
            handleResponse(res, setRegimeData);
          }
          break;
        case 'drawdown':
          if (!drawdownData) {
            const res = await simulateAPI.getKellyDrawdown(parseInt(portfolioId), { period: '5y' });
            handleResponse(res, setDrawdownData);
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
    loadTabData(tab);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatPercent = (value, decimals = 2) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getChangeIcon = (value) => {
    if (value > 0) return <ArrowUp size={14} className="text-success" />;
    if (value < 0) return <ArrowDown size={14} className="text-danger" />;
    return <Minus size={14} className="text-muted" />;
  };

  const getRegimeColor = (regime) => {
    const colors = {
      'bull_low_vol': '#22c55e',
      'bull_high_vol': '#eab308',
      'bear_low_vol': '#f97316',
      'bear_high_vol': '#ef4444',
      'neutral': '#6b7280'
    };
    return colors[regime] || '#6b7280';
  };

  const getRegimeLabel = (regime) => {
    const labels = {
      'bull_low_vol': 'Bull Market (Low Vol)',
      'bull_high_vol': 'Bull Market (High Vol)',
      'bear_low_vol': 'Bear Market (Low Vol)',
      'bear_high_vol': 'Bear Market (High Vol)',
      'neutral': 'Neutral'
    };
    return labels[regime] || regime;
  };

  return (
    <div className="simulation-panel kelly-panel">
      <div className="panel-header">
        <h3>Advanced Kelly Criterion</h3>
        <p className="panel-description">
          Historical analysis, portfolio optimization, and regime-aware position sizing
        </p>
        <button className="btn-icon refresh-btn" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="panel-content">
        {/* Tab Navigation */}
        <div className="analytics-tabs">
          <button
            className={`tab-btn ${activeTab === 'compare' ? 'active' : ''}`}
            onClick={() => handleTabChange('compare')}
          >
            <BarChart3 size={16} />
            Strategy Compare
          </button>
          <button
            className={`tab-btn ${activeTab === 'optimize' ? 'active' : ''}`}
            onClick={() => handleTabChange('optimize')}
          >
            <Target size={16} />
            Optimize
          </button>
          <button
            className={`tab-btn ${activeTab === 'regime' ? 'active' : ''}`}
            onClick={() => handleTabChange('regime')}
          >
            <Activity size={16} />
            Regime
          </button>
          <button
            className={`tab-btn ${activeTab === 'drawdown' ? 'active' : ''}`}
            onClick={() => handleTabChange('drawdown')}
          >
            <TrendingDown size={16} />
            Drawdown
          </button>
          <button
            className={`tab-btn ${activeTab === 'backtest' ? 'active' : ''}`}
            onClick={() => handleTabChange('backtest')}
          >
            <Zap size={16} />
            Backtest
          </button>
        </div>

        {loading && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Loading Kelly analysis...</span>
          </div>
        )}

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Strategy Comparison Tab */}
            {activeTab === 'compare' && compareData && (
              <div className="tab-content">
                <div className="kelly-winner-card">
                  <div className="winner-badge">
                    <TrendingUp size={20} />
                    <span>Best Strategy: {compareData.winner}</span>
                  </div>
                  <p className="winner-period">Based on {compareData.tradingDays} trading days</p>
                </div>

                <div className="strategies-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Strategy</th>
                        <th>Final Value</th>
                        <th>CAGR</th>
                        <th>Volatility</th>
                        <th>Sharpe</th>
                        <th>Max DD</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.strategies?.sort((a, b) => a.compositeScore - b.compositeScore).map((s, i) => (
                        <tr key={s.name} className={i === 0 ? 'winner-row' : ''}>
                          <td className="strategy-name">
                            {i === 0 && <span className="rank-badge">1</span>}
                            {s.name}
                          </td>
                          <td>{formatMoney(s.finalValue)}</td>
                          <td className={s.cagr >= 0 ? 'text-success' : 'text-danger'}>
                            {formatPercent(s.cagr)}
                          </td>
                          <td>{s.volatility?.toFixed(1)}%</td>
                          <td className={s.sharpe >= 1 ? 'text-success' : s.sharpe >= 0.5 ? '' : 'text-warning'}>
                            {s.sharpe?.toFixed(2)}
                          </td>
                          <td className="text-danger">-{Math.abs(s.maxDrawdown)?.toFixed(1)}%</td>
                          <td>{s.compositeScore?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rankings-section">
                  <h5>Rankings by Metric</h5>
                  <div className="rankings-grid">
                    {compareData.rankings && Object.entries(compareData.rankings).map(([metric, ranks]) => (
                      <div key={metric} className="ranking-card">
                        <span className="ranking-metric">{metric.replace('by', '')}</span>
                        <span className="ranking-winner">{ranks[0]?.strategy}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Optimize Tab */}
            {activeTab === 'optimize' && optimizeData && (
              <div className="tab-content">
                <div className="optimize-summary">
                  <div className="summary-card current">
                    <h5>Current Allocation</h5>
                    <div className="metric-row">
                      <span>Expected Return</span>
                      <span className={optimizeData.current?.expectedReturn >= 0 ? 'text-success' : 'text-danger'}>
                        {formatPercent(optimizeData.current?.expectedReturn)}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span>Volatility</span>
                      <span>{optimizeData.current?.volatility?.toFixed(1)}%</span>
                    </div>
                    <div className="metric-row">
                      <span>Sharpe Ratio</span>
                      <span>{optimizeData.current?.sharpe?.toFixed(2)}</span>
                    </div>
                    <div className="metric-row">
                      <span>Kelly Growth Rate</span>
                      <span>{formatPercent(optimizeData.current?.kellyGrowth)}</span>
                    </div>
                  </div>

                  <div className="summary-arrow">
                    <ArrowUp size={24} className="text-success" />
                  </div>

                  <div className="summary-card optimized">
                    <h5>Optimized Allocation</h5>
                    <div className="metric-row">
                      <span>Expected Return</span>
                      <span className="text-success">
                        {formatPercent(optimizeData.optimized?.expectedReturn)}
                      </span>
                    </div>
                    <div className="metric-row">
                      <span>Volatility</span>
                      <span>{optimizeData.optimized?.volatility?.toFixed(1)}%</span>
                    </div>
                    <div className="metric-row">
                      <span>Sharpe Ratio</span>
                      <span className="text-success">{optimizeData.optimized?.sharpe?.toFixed(2)}</span>
                    </div>
                    <div className="metric-row">
                      <span>Kelly Growth Rate</span>
                      <span className="text-success">{formatPercent(optimizeData.optimized?.kellyGrowth)}</span>
                    </div>
                  </div>
                </div>

                <div className="improvement-banner">
                  <span>Potential Improvement:</span>
                  <span className="improvement-value">
                    +{optimizeData.improvement?.returnIncrease?.toFixed(2)}% return,{' '}
                    +{optimizeData.improvement?.growthIncrease?.toFixed(2)}% growth
                  </span>
                </div>

                <div className="positions-table">
                  <h5>Position Changes</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Current %</th>
                        <th>Optimal %</th>
                        <th>Change</th>
                        <th>Exp. Return</th>
                        <th>Volatility</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optimizeData.positions?.map(p => (
                        <tr key={p.symbol}>
                          <td className="symbol-cell">{p.symbol}</td>
                          <td>{p.currentWeight?.toFixed(1)}%</td>
                          <td className="text-success">{p.optimalWeight?.toFixed(1)}%</td>
                          <td className={p.change >= 0 ? 'text-success' : 'text-danger'}>
                            {getChangeIcon(p.change)}
                            {formatPercent(p.change, 1)}
                          </td>
                          <td>{formatPercent(p.expectedReturn)}</td>
                          <td>{p.volatility?.toFixed(1)}%</td>
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
                <div className="current-regime-card" style={{ borderColor: getRegimeColor(regimeData.currentRegime?.type) }}>
                  <div className="regime-header">
                    <Activity size={20} style={{ color: getRegimeColor(regimeData.currentRegime?.type) }} />
                    <span className="regime-label">Current Market Regime</span>
                  </div>
                  <div className="regime-type" style={{ color: getRegimeColor(regimeData.currentRegime?.type) }}>
                    {getRegimeLabel(regimeData.currentRegime?.type)}
                  </div>
                  <div className="regime-details">
                    <div className="detail-item">
                      <span>Volatility:</span>
                      <span>{regimeData.currentRegime?.volatility?.toFixed(1)}%</span>
                    </div>
                    <div className="detail-item">
                      <span>Confidence:</span>
                      <span>{regimeData.currentRegime?.confidence?.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                <div className="multiplier-card">
                  <h5>Recommended Kelly Multiplier</h5>
                  <div className="multiplier-value">
                    {(regimeData.recommendedMultiplier * 100)?.toFixed(0)}%
                  </div>
                  <p className="multiplier-hint">
                    {regimeData.recommendedMultiplier === 1 && 'Full Kelly - favorable conditions'}
                    {regimeData.recommendedMultiplier === 0.5 && 'Half Kelly - standard approach'}
                    {regimeData.recommendedMultiplier === 0.25 && 'Quarter Kelly - defensive positioning'}
                    {regimeData.recommendedMultiplier === 0.1 && 'Minimal exposure - high risk environment'}
                  </p>
                </div>

                <div className="regime-multipliers">
                  <h5>Kelly Multipliers by Regime</h5>
                  <div className="multipliers-grid">
                    {regimeData.regimeMultipliers && Object.entries(regimeData.regimeMultipliers).map(([regime, mult]) => (
                      <div
                        key={regime}
                        className={`multiplier-item ${regime === regimeData.currentRegime?.type ? 'active' : ''}`}
                        style={{ borderColor: getRegimeColor(regime) }}
                      >
                        <span className="regime-name">{getRegimeLabel(regime)}</span>
                        <span className="mult-value">{(mult * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="regime-breakdown">
                  <h5>Regime Distribution (Historical)</h5>
                  <div className="breakdown-bars">
                    {regimeData.regimeBreakdown?.map(r => (
                      <div key={r.regime} className="breakdown-row">
                        <span className="breakdown-label">{getRegimeLabel(r.regime)}</span>
                        <div className="breakdown-bar-container">
                          <div
                            className="breakdown-bar-fill"
                            style={{
                              width: `${r.percentage}%`,
                              backgroundColor: getRegimeColor(r.regime)
                            }}
                          />
                        </div>
                        <span className="breakdown-pct">{r.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Drawdown Tab */}
            {activeTab === 'drawdown' && drawdownData && (
              <div className="tab-content">
                <div className="drawdown-recommendation">
                  <Info size={16} />
                  <span>{drawdownData.recommendation}</span>
                </div>

                <div className="drawdown-table">
                  <h5>Drawdown Analysis by Kelly Fraction</h5>
                  <table>
                    <thead>
                      <tr>
                        <th>Fraction</th>
                        <th>CAGR</th>
                        <th>Max DD</th>
                        <th>Avg DD</th>
                        <th>DD Count</th>
                        <th>Avg Recovery</th>
                        <th>Risk of 50% DD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drawdownData.analysis?.map(a => (
                        <tr key={a.kellyFraction} className={a.kellyFraction === 0.5 ? 'highlight-row' : ''}>
                          <td className="fraction-cell">{(a.kellyFraction * 100).toFixed(0)}%</td>
                          <td className={a.cagr >= 0 ? 'text-success' : 'text-danger'}>
                            {formatPercent(a.cagr)}
                          </td>
                          <td className="text-danger">-{Math.abs(a.maxDrawdown)?.toFixed(1)}%</td>
                          <td>-{Math.abs(a.avgDrawdown)?.toFixed(1)}%</td>
                          <td>{a.drawdownCount}</td>
                          <td>{a.avgRecoveryDays?.toFixed(0)} days</td>
                          <td className={a.riskOfRuin?.riskOf50pctDrawdown > 20 ? 'text-danger' : ''}>
                            {a.riskOfRuin?.riskOf50pctDrawdown}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="optimal-by-dd">
                  <h5>Optimal Fraction by Drawdown Tolerance</h5>
                  <div className="dd-tolerance-cards">
                    {drawdownData.optimalByDrawdown?.map(opt => (
                      <div key={opt.name} className="tolerance-card">
                        <span className="tolerance-name">{opt.name}</span>
                        {opt.optimalFraction !== null ? (
                          <>
                            <span className="tolerance-fraction">
                              {(opt.optimalFraction * 100).toFixed(0)}% Kelly
                            </span>
                            <span className="tolerance-cagr">
                              Expected CAGR: {formatPercent(opt.expectedCAGR)}
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
                <div className="backtest-summary">
                  <div className="backtest-meta">
                    <span>Period: {backtestData.startDate} to {backtestData.endDate}</span>
                    <span>{backtestData.tradingDays} trading days</span>
                  </div>
                  <div className="backtest-recommendation">
                    <Info size={16} />
                    <span>{backtestData.recommendation}</span>
                  </div>
                </div>

                <div className="backtest-strategies">
                  {backtestData.strategies && Object.entries(backtestData.strategies).map(([name, data]) => (
                    <div key={name} className="strategy-card">
                      <div
                        className="strategy-header"
                        onClick={() => toggleSection(name)}
                      >
                        {expandedSections[name] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span className="strategy-name">{name.replace('kelly_', 'Kelly ')}</span>
                        <span className={`strategy-return ${data.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                          {formatPercent(data.totalReturn)}
                        </span>
                      </div>
                      {expandedSections[name] && (
                        <div className="strategy-details">
                          <div className="detail-grid">
                            <div className="detail-item">
                              <span>Final Value</span>
                              <span>{formatMoney(data.finalValue)}</span>
                            </div>
                            <div className="detail-item">
                              <span>CAGR</span>
                              <span className={data.cagr >= 0 ? 'text-success' : 'text-danger'}>
                                {formatPercent(data.cagr)}
                              </span>
                            </div>
                            <div className="detail-item">
                              <span>Volatility</span>
                              <span>{data.volatility?.toFixed(1)}%</span>
                            </div>
                            <div className="detail-item">
                              <span>Sharpe</span>
                              <span>{data.sharpe?.toFixed(2)}</span>
                            </div>
                            <div className="detail-item">
                              <span>Max Drawdown</span>
                              <span className="text-danger">-{Math.abs(data.maxDrawdown)?.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="comparison-summary">
                  <h5>Best Performers</h5>
                  <div className="comparison-grid">
                    {backtestData.comparison && Object.entries(backtestData.comparison).map(([metric, winner]) => (
                      <div key={metric} className="comparison-item">
                        <span className="metric-name">{metric.replace('best', '')}</span>
                        <span className="metric-winner">{winner.replace('kelly_', 'Kelly ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdvancedKellyPanel;
