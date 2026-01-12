// frontend/src/components/portfolio/AdvancedKellyPanel.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader, AlertTriangle, TrendingUp, TrendingDown, Activity,
  Target, RefreshCw, Settings, Info, Shield, ChevronDown, ChevronUp
} from 'lucide-react';
import { simulateAPI } from '../../services/api';
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

function AdvancedKellyPanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [missingDataWarning, setMissingDataWarning] = useState(null);

  // Data states
  const [compareData, setCompareData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [regimeData, setRegimeData] = useState(null);

  // UI states
  const [showSettings, setShowSettings] = useState(false);
  const [showRiskDetails, setShowRiskDetails] = useState(false);
  const [showRegimeDetails, setShowRegimeDetails] = useState(false);

  // Configuration
  const [period, setPeriod] = useState('3y');
  const [initialCapital, setInitialCapital] = useState(100000);

  // Load all data at once
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setMissingDataWarning(null);

      const params = { period, riskFreeRate: 0.05, initialCapital };

      // Load comparison data (main analysis)
      const [compareRes, riskRes, regimeRes] = await Promise.allSettled([
        simulateAPI.getKellyCompare(parseInt(portfolioId), params),
        simulateAPI.getKellyTalebRisk(parseInt(portfolioId), { ...params, period: '5y' }),
        simulateAPI.getKellyRegime(parseInt(portfolioId), { ...params, period: '5y' })
      ]);

      // Process comparison data
      if (compareRes.status === 'fulfilled') {
        const data = compareRes.value.data.data || compareRes.value.data;
        if (data?.error) {
          setError(data.error);
        } else {
          setCompareData(data);
          if (data.missingData?.length > 0) {
            setMissingDataWarning(`Some holdings excluded: ${data.missingData.join(', ')}`);
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
    if (!compareData?.strategies) return null;

    // Find best risk-adjusted strategy
    const sorted = [...compareData.strategies].sort((a, b) => a.compositeScore - b.compositeScore);
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

  return (
    <div className="portfolio-kelly-panel">
      {/* Header */}
      <div className="kelly-panel-header">
        <div className="header-info">
          <h4><Target size={18} /> Portfolio Position Sizing</h4>
          <p>Optimize your portfolio allocation using Kelly Criterion analysis</p>
        </div>
        <div className="header-actions">
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
                <span className="strategy-name">{recommendation.name.replace('kelly_', '').replace(/_/g, ' ')}</span>
              </div>

              <div className="recommendation-metrics">
                <div className="metric-item">
                  <span className="metric-label">Expected Return</span>
                  <span className={`metric-value ${recommendation.cagr >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(recommendation.cagr)}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Volatility</span>
                  <span className="metric-value">{recommendation.volatility?.toFixed(1)}%</span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Sharpe Ratio</span>
                  <span className={`metric-value ${recommendation.sharpe >= 1 ? 'positive' : ''}`}>
                    {recommendation.sharpe?.toFixed(2)}
                  </span>
                </div>
                <div className="metric-item">
                  <span className="metric-label">Max Drawdown</span>
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
            </div>

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
                <h5>Strategy Comparison</h5>
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
                        .map((s, i) => (
                        <tr key={s.name} className={i === 0 ? 'recommended' : ''}>
                          <td>
                            <div className="strategy-cell">
                              {i === 0 && <span className="rec-badge">Best</span>}
                              <span className="strategy-label">
                                {s.name.replace('kelly_', '').replace(/_/g, ' ')}
                              </span>
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
                      ))}
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
                    {riskData.distributionAnalysis?.interpretation &&
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
                    {riskData.talebWarnings?.length > 0 && (
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
                    {regimeData.regimeBreakdown && (
                      <div className="regime-history">
                        <h6>Historical Regime Distribution</h6>
                        <div className="regime-bars">
                          {regimeData.regimeBreakdown.map(r => {
                            const colors = {
                              'bull_low_vol': '#22c55e',
                              'bull_high_vol': '#eab308',
                              'bear_low_vol': '#f97316',
                              'bear_high_vol': '#ef4444',
                              'neutral': '#6b7280'
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
          </>
        )}
      </div>
    </div>
  );
}

export default AdvancedKellyPanel;
