// frontend/src/components/portfolio/PositionSizingPanel.js
import { useState, useEffect, useCallback } from 'react';
import {
  Loader, Calculator, DollarSign, Target, Percent, AlertTriangle,
  ChevronDown, ChevronUp, BarChart3, Search, TrendingUp, TrendingDown,
  Shield, Info, Settings, RefreshCw
} from 'lucide-react';
import { simulateAPI, companyAPI } from '../../services/api';
import AdvancedKellyPanel from './AdvancedKellyPanel';
import './SimulationPanels.css';

// Kelly preset mappings - defined outside component to avoid recreation on each render
const KELLY_PRESETS = {
  conservative: { fractions: [0.05, 0.10, 0.15], label: 'Conservative (5-15% Kelly)' },
  moderate: { fractions: [0.10, 0.25, 0.50], label: 'Moderate (10-50% Kelly)' },
  aggressive: { fractions: [0.25, 0.50, 0.75], label: 'Aggressive (25-75% Kelly)' }
};

function PositionSizingPanel({ portfolioId, portfolioValue, holdings }) {
  const [method, setMethod] = useState('kelly');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Kelly auto-analysis state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [kellyData, setKellyData] = useState(null);
  const [kellyLoading, setKellyLoading] = useState(false);
  const [kellyError, setKellyError] = useState(null);

  // Kelly settings state
  const [showSettings, setShowSettings] = useState(false);
  const [period, setPeriod] = useState('3y');
  const [riskFreeRate, setRiskFreeRate] = useState(5); // as percentage
  const [kellyPreset, setKellyPreset] = useState('moderate');
  const [showParametricVaR, setShowParametricVaR] = useState(true);
  const [showDistributionDetails, setShowDistributionDetails] = useState(true);

  // Config for non-Kelly methods
  const [config, setConfig] = useState({
    portfolioValue: portfolioValue || 100000,
    entryPrice: '',
    // Fixed Risk
    maxRiskPct: 2,
    stopLossPrice: '',
    // Volatility
    symbol: '',
    targetVolatility: 15,
    // Equal Weight
    numberOfPositions: 10,
    cashReserve: 5,
    // Percent of Portfolio
    targetPct: 5
  });
  const [calculating, setCalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const methods = [
    { id: 'kelly', name: 'Kelly Criterion', icon: Target, description: 'Auto-analyze any stock using historical data' },
    { id: 'fixed_risk', name: 'Fixed Risk', icon: Percent, description: 'Risk a fixed percentage per trade' },
    { id: 'volatility_based', name: 'Volatility-Based', icon: AlertTriangle, description: 'Size inversely proportional to volatility' },
    { id: 'equal_weight', name: 'Equal Weight', icon: DollarSign, description: 'Divide equally across positions' },
    { id: 'percent_of_portfolio', name: 'Percent of Portfolio', icon: Calculator, description: 'Simple percentage allocation' }
  ];

  // Debounced search for Kelly method
  useEffect(() => {
    if (method !== 'kelly' || searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await companyAPI.search(searchQuery);
        setSearchResults(res.data.companies || res.data || []);
        setShowResults(true);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, method]);

  // Load Kelly analysis when stock is selected
  const loadKellyAnalysis = useCallback(async (symbol) => {
    setKellyLoading(true);
    setKellyError(null);
    setKellyData(null);

    try {
      const res = await simulateAPI.analyzeSingleHolding(symbol, {
        portfolioId,
        period,
        riskFreeRate: riskFreeRate / 100, // Convert from percentage
        kellyFractions: KELLY_PRESETS[kellyPreset].fractions
      });
      const data = res.data.data || res.data;
      if (data?.error) {
        setKellyError(data.error);
      } else {
        setKellyData(data);
      }
    } catch (err) {
      console.error('Kelly analysis failed:', err);
      setKellyError(err.response?.data?.error || err.message || 'Analysis failed');
    } finally {
      setKellyLoading(false);
    }
  }, [portfolioId, period, riskFreeRate, kellyPreset]);

  // Re-analyze when settings change and stock is already selected
  const handleApplySettings = () => {
    if (selectedStock) {
      loadKellyAnalysis(selectedStock.symbol);
    }
  };

  const handleSelectStock = async (company) => {
    setSelectedStock(company);
    setSearchQuery(company.symbol);
    setShowResults(false);
    setSearchResults([]);

    // Fetch current price
    try {
      const res = await companyAPI.getOne(company.symbol);
      const currentPrice = res.data.price_metrics?.last_price;
      setSelectedStock(prev => ({
        ...prev,
        currentPrice
      }));
    } catch (err) {
      console.error('Failed to fetch price:', err);
    }

    // Load Kelly analysis
    loadKellyAnalysis(company.symbol);
  };

  const clearSelection = () => {
    setSelectedStock(null);
    setSearchQuery('');
    setKellyData(null);
    setKellyError(null);
  };

  // Calculate for non-Kelly methods
  const calculate = async () => {
    try {
      setCalculating(true);
      setError(null);

      const params = { portfolioValue: config.portfolioValue };

      switch (method) {
        case 'fixed_risk':
          params.maxRiskPct = config.maxRiskPct;
          params.entryPrice = parseFloat(config.entryPrice);
          params.stopLossPrice = parseFloat(config.stopLossPrice);
          break;
        case 'volatility_based':
          params.symbol = config.symbol;
          params.targetVolatility = config.targetVolatility;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        case 'equal_weight':
          params.numberOfPositions = config.numberOfPositions;
          params.cashReserve = config.cashReserve;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        case 'percent_of_portfolio':
          params.targetPct = config.targetPct;
          if (config.entryPrice) params.entryPrice = parseFloat(config.entryPrice);
          break;
        default:
          break;
      }

      const res = await simulateAPI.calculatePositionSize({
        method,
        ...params
      });

      setResult(res.data.data || res.data);
    } catch (err) {
      console.error('Position sizing failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setCalculating(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(2)}%`;
  };

  // Calculate suggested shares for Kelly
  const suggestedShares = kellyData?.kelly?.recommended?.fraction && selectedStock?.currentPrice && portfolioValue
    ? Math.floor((portfolioValue * kellyData.kelly.recommended.fraction) / selectedStock.currentPrice)
    : null;

  const suggestedValue = suggestedShares && selectedStock?.currentPrice
    ? suggestedShares * selectedStock.currentPrice
    : null;

  return (
    <div className="simulation-panel position-sizing-panel">
      <div className="panel-header">
        <h3>Position Size Calculator</h3>
        <p className="panel-description">
          Calculate optimal position size for your next trade
        </p>
      </div>

      <div className="panel-content">
        {/* Method Selection */}
        <div className="method-selector">
          {methods.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                className={`method-btn ${method === m.id ? 'active' : ''}`}
                onClick={() => {
                  setMethod(m.id);
                  setResult(null);
                  setError(null);
                }}
              >
                <Icon size={18} />
                <span>{m.name}</span>
              </button>
            );
          })}
        </div>

        <p className="method-description">
          {methods.find(m => m.id === method)?.description}
        </p>

        {/* Kelly Criterion - Auto Analysis */}
        {method === 'kelly' && (
          <div className="kelly-auto-section">
            {/* Settings Toggle & Panel */}
            <div className="kelly-settings-header">
              <button
                className={`settings-toggle-btn ${showSettings ? 'active' : ''}`}
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings size={16} />
                <span>Analysis Settings</span>
                {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <span className="settings-summary">
                {period} data • {riskFreeRate}% risk-free • {KELLY_PRESETS[kellyPreset].label.split(' ')[0]}
              </span>
            </div>

            {showSettings && (
              <div className="kelly-settings-panel single-stock-settings">
                <div className="settings-row">
                  <div className="setting-item">
                    <label>Analysis Period</label>
                    <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                      <option value="1y">1 Year</option>
                      <option value="2y">2 Years</option>
                      <option value="3y">3 Years (Default)</option>
                      <option value="5y">5 Years</option>
                      <option value="10y">10 Years</option>
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>Risk-Free Rate</label>
                    <select value={riskFreeRate} onChange={(e) => setRiskFreeRate(parseFloat(e.target.value))}>
                      <option value="2">2%</option>
                      <option value="3">3%</option>
                      <option value="4">4%</option>
                      <option value="5">5% (Default)</option>
                      <option value="6">6%</option>
                      <option value="7">7%</option>
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>Kelly Aggressiveness</label>
                    <select value={kellyPreset} onChange={(e) => setKellyPreset(e.target.value)}>
                      <option value="conservative">Conservative (5-15%)</option>
                      <option value="moderate">Moderate (10-50%)</option>
                      <option value="aggressive">Aggressive (25-75%)</option>
                    </select>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="setting-item toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={showParametricVaR}
                        onChange={(e) => setShowParametricVaR(e.target.checked)}
                      />
                      Show Cornish-Fisher VaR (fat-tail adjusted)
                    </label>
                  </div>
                  <div className="setting-item toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={showDistributionDetails}
                        onChange={(e) => setShowDistributionDetails(e.target.checked)}
                      />
                      Show distribution analysis details
                    </label>
                  </div>
                </div>
                {selectedStock && (
                  <div className="settings-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleApplySettings}
                      disabled={kellyLoading}
                    >
                      {kellyLoading ? (
                        <><Loader className="spinning" size={14} /> Analyzing...</>
                      ) : (
                        <><RefreshCw size={14} /> Re-analyze with new settings</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Stock Search */}
            <div className="stock-search-section">
              <label className="form-label">Search for a stock to analyze</label>
              <div className="search-container">
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input
                    type="text"
                    className="form-input search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value.toUpperCase());
                      if (selectedStock && e.target.value.toUpperCase() !== selectedStock.symbol) {
                        clearSelection();
                      }
                      setShowResults(true);
                    }}
                    onFocus={() => searchResults.length > 0 && setShowResults(true)}
                    placeholder="Enter symbol (e.g., AAPL, MSFT, GOOGL)..."
                  />
                  {searching && <Loader className="spinning search-loader" size={16} />}
                </div>

                {showResults && searchResults.length > 0 && !selectedStock && (
                  <div className="search-results">
                    {searchResults.slice(0, 8).map(company => (
                      <button
                        key={company.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => handleSelectStock(company)}
                      >
                        <span className="result-symbol">{company.symbol}</span>
                        <span className="result-name">{company.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Stock Display */}
              {selectedStock && (
                <div className="selected-stock-card">
                  <div className="stock-info">
                    <span className="stock-symbol">{selectedStock.symbol}</span>
                    <span className="stock-name">{selectedStock.name}</span>
                  </div>
                  {selectedStock.currentPrice && (
                    <span className="stock-price">${selectedStock.currentPrice.toFixed(2)}</span>
                  )}
                  <button className="clear-btn" onClick={clearSelection}>×</button>
                </div>
              )}
            </div>

            {/* Kelly Analysis Results */}
            {kellyLoading && (
              <div className="kelly-loading-state">
                <Loader className="spinning" size={24} />
                <span>Analyzing {selectedStock?.symbol}...</span>
                <p className="loading-hint">Calculating win rate, volatility, tail risk from 3 years of data</p>
              </div>
            )}

            {kellyError && (
              <div className="kelly-error-state">
                <AlertTriangle size={24} />
                <p>{kellyError}</p>
                <span className="error-hint">Try a different stock or check if it has sufficient trading history</span>
              </div>
            )}

            {kellyData && !kellyLoading && (
              <div className="kelly-results">
                {/* Main Recommendation */}
                <div className="kelly-recommendation-card">
                  <div className="recommendation-header">
                    <div className="recommendation-badge">
                      <Target size={20} />
                      <span>Recommended</span>
                    </div>
                    <div className="recommendation-main">
                      <span className="rec-percent">
                        {((kellyData.kelly?.recommended?.fraction || 0) * 100).toFixed(0)}%
                      </span>
                      <span className="rec-label">{kellyData.kelly?.recommended?.label || 'Kelly'}</span>
                    </div>
                  </div>
                  <p className="recommendation-reason">{kellyData.kelly?.recommended?.reason}</p>

                  {/* Suggested Position */}
                  {suggestedShares && (
                    <div className="suggested-position">
                      <div className="suggestion-row">
                        <span className="suggestion-label">Suggested Position:</span>
                        <span className="suggestion-value">
                          <strong>{suggestedShares.toLocaleString()}</strong> shares
                        </span>
                        <span className="suggestion-cost">
                          ({formatValue(suggestedValue)})
                        </span>
                      </div>
                      <div className="suggestion-note">
                        Based on ${portfolioValue.toLocaleString()} portfolio value
                      </div>
                    </div>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="kelly-stats-grid">
                  {/* Performance Stats */}
                  <div className="stats-card">
                    <div className="stats-header">
                      <TrendingUp size={16} />
                      <span>Performance</span>
                    </div>
                    <div className="stats-rows">
                      <div className="stat-row">
                        <span>Annual Return</span>
                        <span className={kellyData.statistics?.annualReturn >= 0 ? 'positive' : 'negative'}>
                          {kellyData.statistics?.annualReturn >= 0 ? '+' : ''}{kellyData.statistics?.annualReturn}%
                        </span>
                      </div>
                      <div className="stat-row">
                        <span>Win Rate</span>
                        <span>{kellyData.statistics?.winRate}%</span>
                      </div>
                      <div className="stat-row">
                        <span>Sharpe Ratio</span>
                        <span className={kellyData.statistics?.sharpeRatio >= 1 ? 'positive' : ''}>
                          {kellyData.statistics?.sharpeRatio}
                        </span>
                      </div>
                      <div className="stat-row">
                        <span>Volatility</span>
                        <span>{kellyData.statistics?.annualVolatility}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Tail Risk Stats - Enhanced with Distribution Analysis */}
                  <div className="stats-card">
                    <div className="stats-header">
                      <Shield size={16} />
                      <span>Tail Risk</span>
                      {kellyData.distributionAnalysis?.bestFit && (
                        <span className="distribution-badge">
                          {kellyData.distributionAnalysis.bestFit === 'studentT' ? "Student's t" :
                           kellyData.distributionAnalysis.bestFit === 'skewedT' ? 'Skewed t' :
                           kellyData.distributionAnalysis.bestFit === 'johnsonSU' ? 'Johnson SU' :
                           'Normal'}
                        </span>
                      )}
                    </div>
                    <div className="stats-rows">
                      {/* Show Cornish-Fisher adjusted VaR if toggle is on and data available */}
                      {showParametricVaR && kellyData.cornishFisherVaR ? (
                        <>
                          <div className="stat-row">
                            <span>VaR 95% (CF-adj)</span>
                            <span className="negative">{kellyData.cornishFisherVaR.var95.adjusted}%</span>
                          </div>
                          <div className="stat-row">
                            <span>VaR 99% (CF-adj)</span>
                            <span className="negative">{kellyData.cornishFisherVaR.var99.adjusted}%</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="stat-row">
                            <span>VaR 95%</span>
                            <span className="negative">{kellyData.tailRisk?.var95}%</span>
                          </div>
                          <div className="stat-row">
                            <span>VaR 99%</span>
                            <span className="negative">{kellyData.tailRisk?.var99}%</span>
                          </div>
                        </>
                      )}
                      <div className="stat-row">
                        <span>Max Daily Loss</span>
                        <span className="negative">{kellyData.tailRisk?.maxObservedLoss}%</span>
                      </div>
                      <div className="stat-row">
                        <span>Skewness</span>
                        <span className={kellyData.statistics?.skewness < -0.5 ? 'negative' : kellyData.statistics?.skewness > 0.5 ? 'positive' : ''}>
                          {kellyData.statistics?.skewness || '0'}
                        </span>
                      </div>
                      <div className="stat-row">
                        <span>Fat Tails</span>
                        <span className={kellyData.tailRisk?.isFatTailed ? 'negative' : 'positive'}>
                          {kellyData.tailRisk?.isFatTailed ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Benchmark Comparison */}
                  {kellyData.benchmarkComparison && (
                    <div className="stats-card">
                      <div className="stats-header">
                        <TrendingDown size={16} />
                        <span>vs {kellyData.benchmarkComparison.benchmark}</span>
                      </div>
                      <div className="stats-rows">
                        <div className="stat-row">
                          <span>Beta</span>
                          <span>{kellyData.benchmarkComparison.beta}</span>
                        </div>
                        <div className="stat-row">
                          <span>Alpha</span>
                          <span className={kellyData.benchmarkComparison.alpha > 0 ? 'positive' : 'negative'}>
                            {kellyData.benchmarkComparison.alpha > 0 ? '+' : ''}{kellyData.benchmarkComparison.alpha}%
                          </span>
                        </div>
                        <div className="stat-row">
                          <span>Correlation</span>
                          <span>{kellyData.benchmarkComparison.correlation}</span>
                        </div>
                        <div className="stat-row">
                          <span>Excess Return</span>
                          <span className={kellyData.benchmarkComparison.excessReturn > 0 ? 'positive' : 'negative'}>
                            {kellyData.benchmarkComparison.excessReturn > 0 ? '+' : ''}{kellyData.benchmarkComparison.excessReturn}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Risk Warning */}
                {kellyData.tailRisk?.warning && (
                  <div className="kelly-warning-banner">
                    <AlertTriangle size={16} />
                    <span>{kellyData.tailRisk.warning}</span>
                  </div>
                )}

                {/* Distribution Interpretation - only show if toggle is on, non-normal, and has data */}
                {showDistributionDetails &&
                 kellyData.distributionAnalysis?.interpretation &&
                 kellyData.distributionAnalysis.bestFit !== 'normal' && (
                  <div className="distribution-interpretation">
                    <div className="interpretation-header">
                      <BarChart3 size={16} />
                      <span>Return Distribution Analysis</span>
                    </div>
                    <ul className="interpretation-list">
                      {kellyData.distributionAnalysis.interpretation.map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                    {showParametricVaR &&
                     kellyData.cornishFisherVaR?.var95?.adjustmentPct &&
                     Math.abs(kellyData.cornishFisherVaR.var95.adjustmentPct) > 5 && (
                      <p className="var-adjustment-note">
                        Standard VaR underestimates risk by ~{Math.abs(kellyData.cornishFisherVaR.var95.adjustmentPct).toFixed(0)}%
                        due to non-normal returns. Cornish-Fisher adjustment applied.
                      </p>
                    )}
                  </div>
                )}

                {/* Fraction Analysis Table */}
                {kellyData.fractionAnalysis && kellyData.fractionAnalysis.length > 0 && (
                  <div className="fraction-analysis">
                    <div className="fraction-header">
                      <Info size={16} />
                      <span>Position Size Scenarios</span>
                    </div>
                    <table className="fraction-table">
                      <thead>
                        <tr>
                          <th>Size</th>
                          <th>Expected Return</th>
                          <th>Volatility</th>
                          <th>Est. Max DD</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kellyData.fractionAnalysis.map(f => (
                          <tr
                            key={f.fraction}
                            className={f.fraction === kellyData.kelly?.recommended?.fraction ? 'highlighted' : ''}
                          >
                            <td>{(f.fraction * 100).toFixed(0)}% Kelly</td>
                            <td className={f.expectedReturn >= 0 ? 'positive' : 'negative'}>
                              {f.expectedReturn >= 0 ? '+' : ''}{f.expectedReturn?.toFixed(1)}%
                            </td>
                            <td>{f.expectedVolatility?.toFixed(1)}%</td>
                            <td className="negative">-{f.expectedMaxDrawdown?.toFixed(1)}%</td>
                            <td>
                              <span className={`risk-badge ${f.riskOf50pctDrawdown > 20 ? 'high' : f.riskOf50pctDrawdown > 10 ? 'medium' : 'low'}`}>
                                {f.riskOf50pctDrawdown > 20 ? 'High' : f.riskOf50pctDrawdown > 10 ? 'Med' : 'Low'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Kelly Formula Details */}
                <div className="kelly-formula-details">
                  <div className="formula-header" onClick={() => document.querySelector('.formula-content')?.classList.toggle('expanded')}>
                    <ChevronDown size={16} />
                    <span>Kelly Formula Details</span>
                  </div>
                  <div className="formula-content">
                    <div className="formula-row">
                      <span>Classic Kelly (f* = (bp - q) / b)</span>
                      <span>{((kellyData.kelly?.classic || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="formula-row">
                      <span>Continuous Kelly (f* = (μ - r) / σ²)</span>
                      <span>{((kellyData.kelly?.continuous || 0) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="formula-row">
                      <span>Safe Kelly (capped at 25%)</span>
                      <span>{((kellyData.kelly?.recommended?.fraction || 0) * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!selectedStock && !kellyLoading && (
              <div className="kelly-empty-state">
                <Target size={32} />
                <p>Search for a stock above to analyze optimal position size</p>
                <span className="empty-hint">
                  Kelly Criterion uses historical win rate, volatility, and tail risk to recommend safe position sizes
                </span>
              </div>
            )}
          </div>
        )}

        {/* Non-Kelly Methods */}
        {method !== 'kelly' && (
          <>
            <div className="config-section">
              {/* Common Fields */}
              <div className="form-row">
                <div className="form-group">
                  <label>Portfolio Value ($)</label>
                  <input
                    type="number"
                    value={config.portfolioValue}
                    onChange={e => setConfig({ ...config, portfolioValue: parseFloat(e.target.value) })}
                    min="0"
                  />
                </div>
                {method !== 'equal_weight' && (
                  <div className="form-group">
                    <label>Entry Price ($)</label>
                    <input
                      type="number"
                      value={config.entryPrice}
                      onChange={e => setConfig({ ...config, entryPrice: e.target.value })}
                      placeholder="Optional"
                      min="0"
                      step="0.01"
                    />
                  </div>
                )}
              </div>

              {/* Fixed Risk Fields */}
              {method === 'fixed_risk' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Max Risk Per Trade (%)</label>
                    <input
                      type="number"
                      value={config.maxRiskPct}
                      onChange={e => setConfig({ ...config, maxRiskPct: parseFloat(e.target.value) })}
                      min="0.1"
                      max="10"
                      step="0.1"
                    />
                  </div>
                  <div className="form-group">
                    <label>Stop Loss Price ($)</label>
                    <input
                      type="number"
                      value={config.stopLossPrice}
                      onChange={e => setConfig({ ...config, stopLossPrice: e.target.value })}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Volatility-based Fields */}
              {method === 'volatility_based' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Symbol</label>
                    <input
                      type="text"
                      value={config.symbol}
                      onChange={e => setConfig({ ...config, symbol: e.target.value.toUpperCase() })}
                      placeholder="e.g., AAPL"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Target Volatility (%)</label>
                    <input
                      type="number"
                      value={config.targetVolatility}
                      onChange={e => setConfig({ ...config, targetVolatility: parseFloat(e.target.value) })}
                      min="1"
                      max="100"
                    />
                  </div>
                </div>
              )}

              {/* Equal Weight Fields */}
              {method === 'equal_weight' && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Number of Positions</label>
                    <input
                      type="number"
                      value={config.numberOfPositions}
                      onChange={e => setConfig({ ...config, numberOfPositions: parseInt(e.target.value) })}
                      min="1"
                      max="100"
                    />
                  </div>
                  <div className="form-group">
                    <label>Cash Reserve (%)</label>
                    <input
                      type="number"
                      value={config.cashReserve}
                      onChange={e => setConfig({ ...config, cashReserve: parseFloat(e.target.value) })}
                      min="0"
                      max="50"
                    />
                  </div>
                </div>
              )}

              {/* Percent of Portfolio Fields */}
              {method === 'percent_of_portfolio' && (
                <div className="form-group">
                  <label>Target Allocation (%)</label>
                  <input
                    type="number"
                    value={config.targetPct}
                    onChange={e => setConfig({ ...config, targetPct: parseFloat(e.target.value) })}
                    min="0.1"
                    max="100"
                    step="0.5"
                  />
                </div>
              )}
            </div>

            <button
              className="btn btn-primary run-btn"
              onClick={calculate}
              disabled={calculating}
            >
              {calculating ? (
                <>
                  <Loader className="spinning" size={16} />
                  Calculating...
                </>
              ) : (
                <>
                  <Calculator size={16} />
                  Calculate Position Size
                </>
              )}
            </button>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {result && (
              <div className="results-section">
                <h4>Recommended Position</h4>

                <div className="results-grid">
                  <div className="result-card primary large">
                    <span className="result-label">Shares to Buy</span>
                    <span className="result-value">{result.shares?.toLocaleString() || '-'}</span>
                  </div>

                  <div className="result-card primary">
                    <span className="result-label">Position Value</span>
                    <span className="result-value">{formatValue(result.positionValue)}</span>
                  </div>

                  <div className="result-card">
                    <span className="result-label">% of Portfolio</span>
                    <span className="result-value">{formatPercent(result.positionPct)}</span>
                  </div>

                  {result.maxLoss !== undefined && (
                    <div className="result-card warning">
                      <span className="result-label">Max Loss</span>
                      <span className="result-value negative">{formatValue(result.maxLoss)}</span>
                      <span className="result-hint">{formatPercent(result.maxLossPct)} of portfolio</span>
                    </div>
                  )}

                  {result.kellyPercent !== undefined && (
                    <div className="result-card">
                      <span className="result-label">Kelly %</span>
                      <span className="result-value">{formatPercent(result.kellyPercent)}</span>
                      <span className="result-hint">Optimal fraction</span>
                    </div>
                  )}

                  {result.riskRewardRatio !== undefined && result.riskRewardRatio !== null && (
                    <div className="result-card">
                      <span className="result-label">Risk/Reward</span>
                      <span className="result-value">1:{result.riskRewardRatio?.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Advanced Kelly Analysis Section - Portfolio Level */}
        {portfolioId && (
          <div className="advanced-analysis-section">
            <button
              className="advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <BarChart3 size={18} />
              <span>Portfolio-Level Analysis</span>
              <span className="toggle-hint">Multi-asset optimization, regime detection, drawdown analysis</span>
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showAdvanced && (
              <div className="advanced-content">
                <AdvancedKellyPanel portfolioId={portfolioId} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PositionSizingPanel;
