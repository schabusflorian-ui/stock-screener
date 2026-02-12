// frontend/src/components/portfolio/AdvancedKellyPanel.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader, AlertTriangle, TrendingUp, TrendingDown, Activity,
  Target, RefreshCw, Settings, Info, Shield, ChevronDown, ChevronUp,
  HelpCircle, Check, ArrowRight, PieChart, Grid3X3, Eye, EyeOff
} from '../icons';
import { simulateAPI } from '../../services/api';
import { useAskAI } from '../../hooks/useAskAI';
import ComplianceDisclaimer from '../ui/ComplianceDisclaimer';
import './SimulationPanels.css';

// Helper: Format percent with sign
const formatPercent = (value, decimals = 1) => {
  if (value === null || value === undefined) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

// Helper: Format money
const formatMoney = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

// User-friendly strategy names and descriptions
const STRATEGY_LABELS = {
  'kelly_full': {
    name: 'Full Kelly',
    shortName: 'Full (100%)',
    description: 'Maximum growth rate but high volatility. Use only if you can tolerate large swings.',
    risk: 'high'
  },
  'kelly_three_quarter': {
    name: 'Three-Quarter Kelly',
    shortName: 'Moderate (75%)',
    description: '75% of optimal. Good balance between growth and stability.',
    risk: 'moderate'
  },
  'kelly_half': {
    name: 'Half Kelly',
    shortName: 'Balanced (50%)',
    description: 'Half of optimal size. Recommended for most investors. Smoother ride with ~75% of max growth.',
    risk: 'moderate'
  },
  'kelly_quarter': {
    name: 'Quarter Kelly',
    shortName: 'Conservative (25%)',
    description: 'Conservative approach. ~50% of max growth but much lower drawdowns.',
    risk: 'low'
  },
  'kelly_eighth': {
    name: 'Eighth Kelly',
    shortName: 'Very Safe (12.5%)',
    description: 'Very conservative. Prioritizes capital preservation over growth.',
    risk: 'low'
  },
  'equal_weight': {
    name: 'Equal Weight',
    shortName: 'Equal',
    description: 'Divide portfolio equally among all holdings. Simple and diversified.',
    risk: 'moderate'
  },
  'buy_hold': {
    name: 'Buy & Hold',
    shortName: 'Buy & Hold',
    description: 'No rebalancing. Let winners run.',
    risk: 'varies'
  }
};

// Get friendly name for strategy
const getStrategyLabel = (strategyName) => {
  const config = STRATEGY_LABELS[strategyName];
  if (config) return config;
  // Fallback for unknown strategies
  const cleanName = strategyName.replace('kelly_', '').replace(/_/g, ' ');
  return {
    name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
    shortName: cleanName,
    description: 'Position sizing strategy',
    risk: 'moderate'
  };
};

// Tooltip component
function Tooltip({ content, children }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && <span className="tooltip-content">{content}</span>}
    </span>
  );
}

// Risk Level Badge Component
function RiskBadge({ level }) {
  const config = {
    low: { label: 'Low Risk', color: 'success' },
    moderate: { label: 'Moderate', color: 'warning' },
    high: { label: 'High Risk', color: 'danger' },
    extreme: { label: 'Extreme', color: 'danger' }
  };
  const { label, color } = config[level] || config.moderate;
  return <span className={`risk-level-badge ${color}`}>{label}</span>;
}

// Drawdown Bar Visualization
function DrawdownBar({ value, maxValue = 50 }) {
  const width = Math.min(Math.abs(value) / maxValue * 100, 100);
  const severity = Math.abs(value) > 30 ? 'severe' : Math.abs(value) > 15 ? 'moderate' : 'mild';

  return (
    <div className="drawdown-bar-container">
      <div className="drawdown-bar-track">
        <div className={`drawdown-bar-fill ${severity}`} style={{ width: `${width}%` }} />
      </div>
      <span className="drawdown-bar-value">-{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

// Correlation Matrix Component
function CorrelationMatrix({ matrix, symbols }) {
  if (!matrix || !symbols || symbols.length === 0) return null;

  const getCorrelationColor = (value) => {
    if (value === 1) return 'var(--color-neutral)';
    if (value > 0.7) return 'var(--color-danger)';
    if (value > 0.4) return 'var(--color-warning)';
    if (value > 0) return 'var(--color-success-light)';
    if (value > -0.3) return 'var(--color-success)';
    return 'var(--color-success-dark)';
  };

  return (
    <div className="correlation-matrix">
      <table className="correlation-table">
        <thead>
          <tr>
            <th></th>
            {symbols.map(s => <th key={s}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol, i) => (
            <tr key={symbol}>
              <td className="row-header">{symbol}</td>
              {matrix[i].map((corr, j) => (
                <td
                  key={`${i}-${j}`}
                  className="correlation-cell"
                  style={{ backgroundColor: getCorrelationColor(corr) }}
                  title={`${symbols[i]} vs ${symbols[j]}: ${corr.toFixed(2)}`}
                >
                  {i === j ? '-' : corr.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="correlation-legend">
        <span className="legend-item"><span className="legend-color" style={{backgroundColor: 'var(--color-danger)'}}></span> High (+)</span>
        <span className="legend-item"><span className="legend-color" style={{backgroundColor: 'var(--color-warning)'}}></span> Moderate (+)</span>
        <span className="legend-item"><span className="legend-color" style={{backgroundColor: 'var(--color-success)'}}></span> Low/Negative</span>
      </div>
    </div>
  );
}

// Allocation Bar Component
function AllocationBar({ current, optimal, symbol }) {
  const delta = optimal - current;
  const maxWidth = Math.max(current, optimal, 30);

  return (
    <div className="allocation-bar-wrapper">
      <div className="allocation-labels">
        <span className="alloc-symbol">{symbol}</span>
        <span className={`alloc-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}`}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
        </span>
      </div>
      <div className="allocation-bars">
        <div className="alloc-track">
          <div
            className="alloc-bar current"
            style={{ width: `${(current / maxWidth) * 100}%` }}
            title={`Current: ${current.toFixed(1)}%`}
          />
          <div
            className="alloc-bar optimal"
            style={{ width: `${(optimal / maxWidth) * 100}%` }}
            title={`Optimal: ${optimal.toFixed(1)}%`}
          />
        </div>
        <div className="alloc-values">
          <span className="alloc-current">{current.toFixed(1)}%</span>
          <ArrowRight size={12} />
          <span className="alloc-optimal">{optimal.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function AdvancedKellyPanel({ portfolioId, holdings, portfolioValue, onApplyRecommendation }) {
  // Ask AI context menu for Kelly analysis
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'kelly',
    portfolioId,
    label: 'Kelly Criterion Analysis',
    portfolioValue,
    holdingsCount: holdings?.length
  }));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [missingDataWarning, setMissingDataWarning] = useState(null);

  // Data states
  const [compareData, setCompareData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);
  const [allocationData, setAllocationData] = useState(null);

  // UI states
  const [showSettings, setShowSettings] = useState(false);
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const [showRegimeDetails, setShowRegimeDetails] = useState(false);
  const [showAllocationDetails, setShowAllocationDetails] = useState(false);
  const [advancedView, setAdvancedView] = useState(false);
  const [applyingRecommendation, setApplyingRecommendation] = useState(false);

  // Configuration
  const [period, setPeriod] = useState('3y');
  const [initialCapital, setInitialCapital] = useState(portfolioValue || 100000);

  // Load all data at once
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMissingDataWarning(null);

      const params = { period, riskFreeRate: 0.05, initialCapital };

      // Load comparison data (main analysis) + multi-asset allocation
      const [compareRes, riskRes, regimeRes, allocRes] = await Promise.allSettled([
        simulateAPI.getKellyCompare(parseInt(portfolioId), params),
        simulateAPI.getKellyTalebRisk(parseInt(portfolioId), { ...params, period: '5y' }),
        simulateAPI.getKellyRegime(parseInt(portfolioId), { ...params, period: '5y' }),
        simulateAPI.getKellyMultiAsset ?
          simulateAPI.getKellyMultiAsset(parseInt(portfolioId), params) :
          Promise.resolve({ status: 'rejected' })
      ]);

      // Process comparison data
      if (compareRes.status === 'fulfilled') {
        const data = compareRes.value.data.data || compareRes.value.data;
        if (data?.error) {
          setError(data.error);
        } else {
          setCompareData(data);
          const missing = Array.isArray(data?.missingData) ? data.missingData : [];
          if (missing.length > 0) {
            setMissingDataWarning(`Some holdings excluded: ${missing.join(', ')}`);
          }
        }
      }

      // Process risk data
      if (riskRes.status === 'fulfilled') {
        const data = riskRes.value.data.data || riskRes.value.data;
        if (!data?.error) {
          setRiskData(data);
        }
      }

      // Process regime data
      if (regimeRes.status === 'fulfilled') {
        const data = regimeRes.value.data.data || regimeRes.value.data;
        if (!data?.error) {
          setRegimeData(data);
        }
      }

      // Process allocation data
      if (allocRes.status === 'fulfilled') {
        const data = allocRes.value?.data?.data || allocRes.value?.data;
        if (data && !data?.error) {
          setAllocationData({
            ...data,
            optimalWeights: Array.isArray(data.optimalWeights) ? data.optimalWeights : [],
            riskContribution: Array.isArray(data.riskContribution) ? data.riskContribution : []
          });
        }
      }

    } catch (err) {
      console.error('Failed to load Kelly data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, period, initialCapital]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate recommended strategy from compare data
  const recommendation = useMemo(() => {
    const strategies = Array.isArray(compareData?.strategies) ? compareData.strategies : [];
    if (strategies.length === 0) return null;

    // Find best risk-adjusted strategy
    const sorted = [...strategies].sort((a, b) => a.compositeScore - b.compositeScore);
    const best = sorted[0];

    // Determine risk level based on max drawdown and volatility
    let riskLevel = 'low';
    if (Math.abs(best.maxDrawdown) > 30 || best.volatility > 25) riskLevel = 'high';
    else if (Math.abs(best.maxDrawdown) > 20 || best.volatility > 18) riskLevel = 'moderate';

    return { ...best, riskLevel };
  }, [compareData]);

  // Derive actionable insights
  const actionableInsights = useMemo(() => {
    const insights = [];

    if (recommendation) {
      // Position sizing recommendation
      const sizing = recommendation.name.includes('quarter') ? '25%' :
                     recommendation.name.includes('half') ? '50%' :
                     recommendation.name.includes('eighth') ? '12.5%' : '100%';
      insights.push({
        type: 'sizing',
        title: 'Optimal Position Size',
        value: sizing,
        description: `Use ${sizing} of full Kelly for best risk-adjusted returns`
      });

      // Return expectation
      if (recommendation.cagr !== undefined) {
        insights.push({
          type: 'return',
          title: 'Expected Annual Return',
          value: formatPercent(recommendation.cagr),
          description: 'Based on historical performance',
          positive: recommendation.cagr >= 0
        });
      }

      // Risk warning if needed
      if (recommendation.riskLevel === 'high' || Math.abs(recommendation.maxDrawdown) > 25) {
        insights.push({
          type: 'warning',
          title: 'High Drawdown Risk',
          value: `-${Math.abs(recommendation.maxDrawdown).toFixed(0)}%`,
          description: 'Consider reducing position sizes or diversifying'
        });
      }
    }

    // Market regime insight
    if (regimeData?.currentRegime) {
      const regimeLabels = {
        'bull_low_vol': 'Bull Market (Calm)',
        'bull_high_vol': 'Bull Market (Volatile)',
        'bear_low_vol': 'Bear Market (Calm)',
        'bear_high_vol': 'Bear Market (Volatile)',
        'neutral': 'Sideways Market'
      };
      const multiplier = regimeData.recommendedMultiplier || 1;
      insights.push({
        type: 'regime',
        title: 'Market Environment',
        value: regimeLabels[regimeData.currentRegime.type] || regimeData.currentRegime.type,
        description: multiplier < 0.75 ? 'Consider reducing exposure' : 'Favorable for investing'
      });
    }

    return insights;
  }, [recommendation, regimeData]);

  const handleSettingsChange = () => {
    loadData();
    setShowSettings(false);
  };

  // Handle Apply Recommendation
  const handleApplyRecommendation = async () => {
    if (!onApplyRecommendation || !allocationData?.optimalWeights) return;

    setApplyingRecommendation(true);
    try {
      await onApplyRecommendation(allocationData.optimalWeights);
    } catch (err) {
      console.error('Failed to apply recommendation:', err);
    } finally {
      setApplyingRecommendation(false);
    }
  };

  return (
    <div className="portfolio-kelly-panel" {...askAIProps}>
      {/* Header */}
      <div className="kelly-panel-header">
        <div className="header-info">
          <h4><Target size={18} /> Portfolio Position Sizing</h4>
          <p>Optimize your portfolio allocation using Kelly Criterion analysis</p>
        </div>
        <div className="header-actions">
          {/* View Toggle */}
          <button
            className={`view-toggle-btn ${advancedView ? 'advanced' : 'simple'}`}
            onClick={() => setAdvancedView(!advancedView)}
            title={advancedView ? 'Switch to Simple View' : 'Switch to Advanced View'}
          >
            {advancedView ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{advancedView ? 'Simple' : 'Advanced'}</span>
          </button>
          <button
            className={`icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button
            className="icon-btn"
            onClick={loadData}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="kelly-settings-panel">
          <div className="settings-row">
            <div className="setting-item">
              <label>Analysis Period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="1y">1 Year</option>
                <option value="2y">2 Years</option>
                <option value="3y">3 Years</option>
                <option value="5y">5 Years</option>
              </select>
            </div>
            <div className="setting-item">
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
          <button className="btn btn-primary btn-sm" onClick={handleSettingsChange}>
            Apply Changes
          </button>
        </div>
      )}

      {/* Content */}
      <div className="kelly-panel-content">
        {loading && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Analyzing portfolio...</span>
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
          <div className="warning-state compact">
            <Info size={16} />
            <span>{missingDataWarning}</span>
          </div>
        )}

        {!loading && !error && recommendation && (
          <>
            {/* Main Recommendation Card */}
            <div className="main-recommendation-card">
              <div className="recommendation-top">
                <div className="recommendation-badge">
                  <Target size={16} />
                  <span>Recommended Strategy</span>
                </div>
                <RiskBadge level={recommendation.riskLevel} />
              </div>

              <div className="recommendation-strategy">
                <span className="strategy-name">{getStrategyLabel(recommendation.name).name}</span>
                <Tooltip content={getStrategyLabel(recommendation.name).description}>
                  <HelpCircle size={14} className="help-icon" />
                </Tooltip>
              </div>

              <div className="recommendation-metrics">
                <div className="metric-item">
                  <span className="metric-label">
                    Expected Return
                    <Tooltip content="Compound annual growth rate based on historical performance">
                      <HelpCircle size={12} />
                    </Tooltip>
                  </span>
                  <span className={`metric-value ${recommendation.cagr >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(recommendation.cagr)}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    Volatility
                    <Tooltip content="Annualized standard deviation of returns. Higher = more unpredictable.">
                      <HelpCircle size={12} />
                    </Tooltip>
                  </span>
                  <span className="metric-value">{recommendation.volatility?.toFixed(1)}%</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    Sharpe Ratio
                    <Tooltip content="Risk-adjusted return. Above 1.0 is good, above 2.0 is excellent.">
                      <HelpCircle size={12} />
                    </Tooltip>
                  </span>
                  <span className={`metric-value ${recommendation.sharpe >= 1 ? 'positive' : ''}`}>
                    {recommendation.sharpe?.toFixed(2)}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">
                    Max Drawdown
                    <Tooltip content="Largest peak-to-trough decline. Shows worst-case historical loss.">
                      <HelpCircle size={12} />
                    </Tooltip>
                  </span>
                  <span className="metric-value negative">
                    -{Math.abs(recommendation.maxDrawdown)?.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Projected Value */}
              <div className="projected-value">
                <span className="pv-label">Projected Value ({period})</span>
                <span className="pv-values">
                  <span className="pv-start">{formatMoney(initialCapital)}</span>
                  <TrendingUp size={16} />
                  <span className="pv-end">{formatMoney(recommendation.finalValue)}</span>
                </span>
              </div>

              {/* Apply Button - Only show if callback provided */}
              {onApplyRecommendation && allocationData?.optimalWeights && (
                <button
                  className="apply-recommendation-btn"
                  onClick={handleApplyRecommendation}
                  disabled={applyingRecommendation}
                >
                  {applyingRecommendation ? (
                    <><Loader className="spinning" size={16} /> Applying...</>
                  ) : (
                    <><Check size={16} /> Apply to Portfolio</>
                  )}
                </button>
              )}
            </div>

            {/* Multi-Asset Allocation Section */}
            {(allocationData || (holdings && holdings.length > 1)) && (
              <div className="collapsible-section allocation-section">
                <button
                  className={`section-toggle ${showAllocationDetails ? 'expanded' : ''}`}
                  onClick={() => setShowAllocationDetails(!showAllocationDetails)}
                >
                  <PieChart size={16} />
                  <span>Per-Holding Allocation</span>
                  <span className="toggle-summary">
                    {allocationData?.optimalWeights?.length || holdings?.length || 0} holdings
                  </span>
                  {showAllocationDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showAllocationDetails && (
                  <div className="section-content">
                    <div className="allocation-legend">
                      <span className="legend-current">Current</span>
                      <span className="legend-optimal">Optimal (Kelly)</span>
                    </div>

                    <div className="allocation-bars-container">
                      {Array.isArray(allocationData?.optimalWeights) && allocationData.optimalWeights.length > 0 ? (
                        allocationData.optimalWeights.map((item, idx) => (
                          <AllocationBar
                            key={item.symbol || idx}
                            symbol={item.symbol}
                            current={item.currentWeight * 100}
                            optimal={item.optimalWeight * 100}
                          />
                        ))
                      ) : holdings ? (
                        holdings.map((h, idx) => (
                          <AllocationBar
                            key={h.symbol || idx}
                            symbol={h.symbol}
                            current={h.weightPercent || (100 / holdings.length)}
                            optimal={100 / holdings.length}
                          />
                        ))
                      ) : (
                        <p className="no-data">No allocation data available</p>
                      )}
                    </div>

                    {/* Advanced View: Correlation Matrix */}
                    {advancedView && allocationData?.correlationMatrix && (
                      <div className="correlation-section">
                        <h6>
                          <Grid3X3 size={14} /> Correlation Matrix
                          <Tooltip content="Shows how holdings move together. High correlation (red) means less diversification benefit.">
                            <HelpCircle size={12} />
                          </Tooltip>
                        </h6>
                        <CorrelationMatrix
                          matrix={allocationData.correlationMatrix}
                          symbols={Array.isArray(allocationData.optimalWeights) ? allocationData.optimalWeights.map(w => w.symbol) : []}
                        />
                      </div>
                    )}

                    {/* Advanced View: Risk Contribution */}
                    {advancedView && Array.isArray(allocationData?.riskContribution) && allocationData.riskContribution.length > 0 && (
                      <div className="risk-contribution-section">
                        <h6>
                          Risk Contribution by Holding
                          <Tooltip content="Shows how much each holding contributes to total portfolio risk.">
                            <HelpCircle size={12} />
                          </Tooltip>
                        </h6>
                        <div className="risk-contribution-bars">
                          {allocationData.riskContribution.map((item, idx) => (
                            <div key={item.symbol || idx} className="risk-contrib-row">
                              <span className="rc-symbol">{item.symbol}</span>
                              <div className="rc-bar-track">
                                <div
                                  className="rc-bar"
                                  style={{ width: `${item.contribution * 100}%` }}
                                />
                              </div>
                              <span className="rc-value">{(item.contribution * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Diversification Score */}
                    {allocationData?.diversificationRatio && (
                      <div className="diversification-score">
                        <span className="ds-label">
                          Diversification Score
                          <Tooltip content="Higher is better. 1.0 = no diversification benefit, 2.0+ = excellent diversification.">
                            <HelpCircle size={12} />
                          </Tooltip>
                        </span>
                        <span className={`ds-value ${allocationData.diversificationRatio >= 1.5 ? 'good' : ''}`}>
                          {allocationData.diversificationRatio.toFixed(2)}x
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actionable Insights */}
            {actionableInsights.length > 0 && (
              <div className="actionable-insights">
                <h5>Key Insights</h5>
                <div className="insights-grid">
                  {actionableInsights.map((insight, idx) => (
                    <div key={idx} className={`insight-card ${insight.type}`}>
                      {insight.type === 'warning' && <AlertTriangle size={16} />}
                      {insight.type === 'return' && <TrendingUp size={16} />}
                      {insight.type === 'regime' && <Activity size={16} />}
                      {insight.type === 'sizing' && <Target size={16} />}
                      <div className="insight-content">
                        <span className="insight-title">{insight.title}</span>
                        <span className={`insight-value ${insight.positive ? 'positive' : ''} ${insight.type === 'warning' ? 'negative' : ''}`}>
                          {insight.value}
                        </span>
                        <span className="insight-desc">{insight.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Strategy Comparison Table */}
            {compareData?.strategies && (
              <div className="strategy-comparison">
                <h5>
                  Strategy Comparison
                  <Tooltip content="Different Kelly fractions trade off between growth rate and stability. Lower fractions = smoother returns but slower growth.">
                    <HelpCircle size={14} />
                  </Tooltip>
                </h5>
                <p className="section-hint">
                  Compare different position sizing strategies based on {compareData.tradingDays} days of historical data
                </p>
                <div className="comparison-table-wrapper">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Strategy</th>
                        <th>Final Value</th>
                        <th>Return</th>
                        <th>Sharpe</th>
                        <th>Max Drawdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareData.strategies
                        .sort((a, b) => a.compositeScore - b.compositeScore)
                        .map((s, i) => {
                          const strategyInfo = getStrategyLabel(s.name);
                          return (
                            <tr key={s.name} className={i === 0 ? 'recommended' : ''}>
                              <td>
                                <div className="strategy-cell">
                                  {i === 0 && <span className="rec-badge">Best</span>}
                                  <Tooltip content={strategyInfo.description}>
                                    <span className="strategy-label">
                                      {strategyInfo.shortName}
                                    </span>
                                  </Tooltip>
                                </div>
                              </td>
                              <td className="value-cell">{formatMoney(s.finalValue)}</td>
                              <td className={s.cagr >= 0 ? 'positive' : 'negative'}>
                                {formatPercent(s.cagr)}
                              </td>
                              <td className={s.sharpe >= 1 ? 'positive' : ''}>
                                {s.sharpe?.toFixed(2)}
                              </td>
                              <td>
                                <DrawdownBar value={s.maxDrawdown} />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Risk Analysis (Collapsible) */}
            {riskData && (
              <div className="collapsible-section">
                <button
                  className={`section-toggle ${showRiskDetails ? 'expanded' : ''}`}
                  onClick={() => setShowRiskDetails(!showRiskDetails)}
                >
                  <Shield size={16} />
                  <span>Risk Analysis</span>
                  {riskData.distributionAnalysis?.bestFit && riskData.distributionAnalysis.bestFit !== 'normal' && (
                    <span className="distribution-badge">
                      {riskData.distributionAnalysis.bestFit === 'studentT' ? "Student's t" :
                       riskData.distributionAnalysis.bestFit === 'skewedT' ? 'Skewed t' :
                       riskData.distributionAnalysis.bestFit === 'johnsonSU' ? 'Johnson SU' :
                       'Normal'}
                    </span>
                  )}
                  <span className="toggle-summary">
                    VaR 95%: {riskData.cornishFisherVaR?.var95?.adjusted || riskData.extremeValueAnalysis?.var95}% |
                    Ruin Risk: {(riskData.pathDependencyRisk?.ruinProbability || 0).toFixed(1)}%
                  </span>
                  {showRiskDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showRiskDetails && (
                  <div className="section-content">
                    {/* Risk Recommendation */}
                    {riskData.spitznagelRecommendation && (
                      <div className={`risk-recommendation ${
                        riskData.spitznagelRecommendation.recommendation === 'MINIMAL EXPOSURE' ? 'danger' :
                        riskData.spitznagelRecommendation.recommendation.includes('CONSERVATIVE') ? 'success' : 'warning'
                      }`}>
                        <Shield size={18} />
                        <div>
                          <strong>
                            {riskData.spitznagelRecommendation.recommendation === 'MINIMAL EXPOSURE'
                              ? 'High Risk - Reduce Exposure'
                              : riskData.spitznagelRecommendation.recommendation.includes('CONSERVATIVE')
                              ? 'Moderate Risk - Conservative Sizing'
                              : 'Elevated Risk - Use Caution'}
                          </strong>
                          <p>{riskData.spitznagelRecommendation.rationale}</p>
                          <span className="recommended-kelly">
                            Recommended: {(riskData.spitznagelRecommendation.kellyFraction * 100).toFixed(0)}% of Kelly
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Risk Metrics Grid */}
                    <div className="risk-metrics-grid">
                      <div className="risk-metric">
                        <span className="rm-label">VaR 95% {riskData.cornishFisherVaR ? '(CF-adj)' : ''}</span>
                        <span className="rm-value negative">
                          {riskData.cornishFisherVaR?.var95?.adjusted || riskData.extremeValueAnalysis?.var95}%
                        </span>
                        <span className="rm-hint">Daily loss exceeded 5% of time</span>
                      </div>
                      <div className="risk-metric">
                        <span className="rm-label">VaR 99% {riskData.cornishFisherVaR ? '(CF-adj)' : ''}</span>
                        <span className="rm-value negative">
                          {riskData.cornishFisherVaR?.var99?.adjusted || riskData.extremeValueAnalysis?.var99}%
                        </span>
                        <span className="rm-hint">Daily loss exceeded 1% of time</span>
                      </div>
                      <div className="risk-metric">
                        <span className="rm-label">Expected Shortfall</span>
                        <span className="rm-value negative">{riskData.extremeValueAnalysis?.cvar99}%</span>
                        <span className="rm-hint">Average loss when VaR is breached</span>
                      </div>
                      <div className="risk-metric">
                        <span className="rm-label">50% Drawdown Risk</span>
                        <span className={`rm-value ${(riskData.pathDependencyRisk?.ruinProbability || 0) > 15 ? 'negative' : ''}`}>
                          {(riskData.pathDependencyRisk?.ruinProbability || 0).toFixed(1)}%
                        </span>
                        <span className="rm-hint">Probability of catastrophic loss</span>
                      </div>
                      {riskData.distributionAnalysis?.moments && (
                        <>
                          <div className="risk-metric">
                            <span className="rm-label">Skewness</span>
                            <span className={`rm-value ${riskData.distributionAnalysis.moments.skewness < -0.5 ? 'negative' : riskData.distributionAnalysis.moments.skewness > 0.5 ? 'positive' : ''}`}>
                              {riskData.distributionAnalysis.moments.skewness}
                            </span>
                            <span className="rm-hint">
                              {riskData.distributionAnalysis.moments.skewness < -0.5 ? 'Crash-prone' :
                               riskData.distributionAnalysis.moments.skewness > 0.5 ? 'Favorable upside' : 'Symmetric'}
                            </span>
                          </div>
                          <div className="risk-metric">
                            <span className="rm-label">Kurtosis</span>
                            <span className={`rm-value ${riskData.distributionAnalysis.moments.kurtosis > 4 ? 'negative' : ''}`}>
                              {riskData.distributionAnalysis.moments.kurtosis}
                            </span>
                            <span className="rm-hint">
                              {riskData.distributionAnalysis.moments.kurtosis > 5 ? 'Very fat tails' :
                               riskData.distributionAnalysis.moments.kurtosis > 4 ? 'Fat tails' : 'Near-normal'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Distribution Interpretation */}
                    {Array.isArray(riskData.distributionAnalysis?.interpretation) &&
                     riskData.distributionAnalysis.interpretation.length > 0 &&
                     riskData.distributionAnalysis.bestFit !== 'normal' && (
                      <div className="distribution-interpretation">
                        <div className="interpretation-header">
                          <Info size={16} />
                          <span>Return Distribution Analysis</span>
                        </div>
                        <ul className="interpretation-list">
                          {riskData.distributionAnalysis.interpretation.map((text, i) => (
                            <li key={i}>{text}</li>
                          ))}
                        </ul>
                        {riskData.cornishFisherVaR?.var95?.adjustmentPct &&
                         Math.abs(riskData.cornishFisherVaR.var95.adjustmentPct) > 5 && (
                          <p className="var-adjustment-note">
                            Cornish-Fisher adjustment: Normal VaR underestimates risk by ~{Math.abs(riskData.cornishFisherVaR.var95.adjustmentPct).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    )}

                    {/* Simulation Results */}
                    {riskData.pathDependencyRisk && (
                      <div className="simulation-outcomes">
                        <h6>Monte Carlo Simulation (1,000 scenarios)</h6>
                        <div className="outcomes-grid">
                          <div className="outcome-item">
                            <span className="oi-label">Median Outcome</span>
                            <span className="oi-value">{formatMoney(riskData.pathDependencyRisk.medianOutcome)}</span>
                          </div>
                          <div className="outcome-item worst">
                            <span className="oi-label">Worst Case</span>
                            <span className="oi-value negative">{formatMoney(riskData.pathDependencyRisk.worstPath)}</span>
                          </div>
                          <div className="outcome-item best">
                            <span className="oi-label">Best Case</span>
                            <span className="oi-value positive">{formatMoney(riskData.pathDependencyRisk.bestPath)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Risk Warnings */}
                    {Array.isArray(riskData.talebWarnings) && riskData.talebWarnings.length > 0 && (
                      <div className="risk-warnings">
                        {riskData.talebWarnings.map((warning, i) => (
                          <div key={i} className={`risk-warning-item ${warning.severity}`}>
                            <AlertTriangle size={14} />
                            <span>{warning.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Market Regime (Collapsible) */}
            {regimeData && (
              <div className="collapsible-section">
                <button
                  className={`section-toggle ${showRegimeDetails ? 'expanded' : ''}`}
                  onClick={() => setShowRegimeDetails(!showRegimeDetails)}
                >
                  <Activity size={16} />
                  <span>Market Regime</span>
                  <span className="toggle-summary">
                    {(() => {
                      const labels = {
                        'bull_low_vol': 'Bull (Calm)',
                        'bull_high_vol': 'Bull (Volatile)',
                        'bear_low_vol': 'Bear (Calm)',
                        'bear_high_vol': 'Bear (Volatile)',
                        'neutral': 'Sideways'
                      };
                      return labels[regimeData.currentRegime?.type] || regimeData.currentRegime?.type;
                    })()} | Sizing: {(regimeData.recommendedMultiplier * 100).toFixed(0)}%
                  </span>
                  {showRegimeDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showRegimeDetails && (
                  <div className="section-content">
                    {/* Current Regime Card */}
                    <div className={`current-regime-card ${regimeData.currentRegime?.type}`}>
                      <div className="regime-indicator">
                        {regimeData.currentRegime?.type.includes('bull') ? (
                          <TrendingUp size={24} />
                        ) : regimeData.currentRegime?.type.includes('bear') ? (
                          <TrendingDown size={24} />
                        ) : (
                          <Activity size={24} />
                        )}
                      </div>
                      <div className="regime-info">
                        <span className="regime-label">Current Market Regime</span>
                        <span className="regime-name">
                          {(() => {
                            const labels = {
                              'bull_low_vol': 'Bull Market (Low Volatility)',
                              'bull_high_vol': 'Bull Market (High Volatility)',
                              'bear_low_vol': 'Bear Market (Low Volatility)',
                              'bear_high_vol': 'Bear Market (High Volatility)',
                              'neutral': 'Sideways/Neutral Market'
                            };
                            return labels[regimeData.currentRegime?.type] || regimeData.currentRegime?.type;
                          })()}
                        </span>
                        <span className="regime-confidence">
                          Confidence: {regimeData.currentRegime?.confidence?.toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Position Size Adjustment */}
                    <div className="regime-sizing">
                      <h6>Recommended Position Size Adjustment</h6>
                      <div className="sizing-display">
                        <span className="sizing-value">{(regimeData.recommendedMultiplier * 100).toFixed(0)}%</span>
                        <span className="sizing-label">of normal position size</span>
                      </div>
                      <p className="sizing-rationale">
                        {regimeData.recommendedMultiplier >= 0.75 && 'Market conditions are favorable - maintain normal position sizes'}
                        {regimeData.recommendedMultiplier >= 0.5 && regimeData.recommendedMultiplier < 0.75 && 'Moderate caution advised - consider reducing positions slightly'}
                        {regimeData.recommendedMultiplier >= 0.25 && regimeData.recommendedMultiplier < 0.5 && 'Defensive positioning recommended - reduce exposure significantly'}
                        {regimeData.recommendedMultiplier < 0.25 && 'High-risk environment - minimize exposure to protect capital'}
                      </p>
                    </div>

                    {/* Historical Distribution */}
                    {Array.isArray(regimeData?.regimeBreakdown) && regimeData.regimeBreakdown.length > 0 && (
                      <div className="regime-history">
                        <h6>Historical Regime Distribution</h6>
                        <div className="regime-bars">
                          {regimeData.regimeBreakdown.map(r => {
                            // Prism semantic colors: positive, warning-dark, negative, navy-400
                            const colors = {
                              'bull_low_vol': 'var(--positive)',
                              'bull_high_vol': 'var(--warning-dark)',
                              'bear_low_vol': 'var(--warning-dark)',
                              'bear_high_vol': 'var(--negative)',
                              'neutral': 'var(--color-navy-400)'
                            };
                            const labels = {
                              'bull_low_vol': 'Bull (Calm)',
                              'bull_high_vol': 'Bull (Volatile)',
                              'bear_low_vol': 'Bear (Calm)',
                              'bear_high_vol': 'Bear (Volatile)',
                              'neutral': 'Sideways'
                            };
                            return (
                              <div key={r.regime} className="regime-bar-row">
                                <span className="regime-bar-label">{labels[r.regime] || r.regime}</span>
                                <div className="regime-bar-track">
                                  <div
                                    className="regime-bar-fill"
                                    style={{ width: `${r.percentage}%`, backgroundColor: colors[r.regime] }}
                                  />
                                </div>
                                <span className="regime-bar-pct">{r.percentage}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Educational Note */}
            <div className="kelly-note">
              <Info size={14} />
              <p>
                The Kelly Criterion optimizes long-term growth rate but can lead to large short-term swings.
                Most practitioners use fractional Kelly (25-50%) for smoother returns.
                Past performance doesn't guarantee future results.
              </p>
            </div>

            {/* Compliance Disclaimer */}
            <ComplianceDisclaimer variant="inline" type="backtest" />
          </>
        )}
      </div>
    </div>
  );
}

export default AdvancedKellyPanel;
