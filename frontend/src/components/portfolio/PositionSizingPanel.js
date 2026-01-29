// frontend/src/components/portfolio/PositionSizingPanel.js
import { useState, useEffect, useCallback } from 'react';
import {
  Loader, Calculator, DollarSign, Target, Percent, AlertTriangle,
  ChevronDown, ChevronUp, BarChart3, Search, TrendingUp, TrendingDown,
  Shield, Info, Settings, RefreshCw
} from '../icons';
import { simulateAPI, companyAPI } from '../../services/api';
import { useAskAI } from '../../hooks/useAskAI';
import AdvancedKellyPanel from './AdvancedKellyPanel';
import ComplianceDisclaimer from '../ui/ComplianceDisclaimer';
import './SimulationPanels.css';

// Kelly preset mappings - defined outside component to avoid recreation on each render
const KELLY_PRESETS = {
  conservative: { fractions: [0.05, 0.10, 0.15], label: 'Conservative (5-15% Kelly)' },
  moderate: { fractions: [0.10, 0.25, 0.50], label: 'Moderate (10-50% Kelly)' },
  aggressive: { fractions: [0.25, 0.50, 0.75], label: 'Aggressive (25-75% Kelly)' }
};

function PositionSizingPanel({ portfolioId, portfolioValue, holdings }) {
  // Ask AI context menu for position sizing
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'position_sizing',
    portfolioId,
    label: 'Position Sizing Calculator',
    portfolioValue
  }));

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
  const [showKellyDetails, setShowKellyDetails] = useState(false); // Collapsible details

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
    maxPositionPct: 25, // Max single position size for diversification
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

  // Debounced search for stock selection (all methods)
  useEffect(() => {
    if (searchQuery.length < 1) {
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

    // Update config.symbol for volatility_based method
    setConfig(prev => ({ ...prev, symbol: company.symbol }));

    // Fetch current price
    try {
      const res = await companyAPI.getOne(company.symbol);
      const currentPrice = res.data.price_metrics?.last_price;
      setSelectedStock(prev => ({
        ...prev,
        currentPrice
      }));
      // Also update entry price in config
      if (currentPrice) {
        setConfig(prev => ({ ...prev, entryPrice: currentPrice.toFixed(2) }));
      }
    } catch (err) {
      console.error('Failed to fetch price:', err);
    }

    // Load Kelly analysis only for kelly method
    if (method === 'kelly') {
      loadKellyAnalysis(company.symbol);
    }
  };

  const clearSelection = () => {
    setSelectedStock(null);
    setSearchQuery('');
    setConfig(prev => ({ ...prev, symbol: '' }));
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
          // Validate required fields for fixed risk
          if (!config.entryPrice || !config.stopLossPrice) {
            setError('Entry Price and Stop Loss Price are required for Fixed Risk method');
            setCalculating(false);
            return;
          }
          params.maxRiskPct = config.maxRiskPct;
          params.entryPrice = parseFloat(config.entryPrice);
          params.stopLossPrice = parseFloat(config.stopLossPrice);
          break;
        case 'volatility_based':
          // Validate required fields for volatility based
          if (!config.symbol) {
            setError('Please select a stock for Volatility-Based sizing');
            setCalculating(false);
            return;
          }
          params.symbol = config.symbol;
          params.targetVolatility = config.targetVolatility;
          params.maxPositionPct = config.maxPositionPct;
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
    <div className="simulation-panel position-sizing-panel" {...askAIProps}>
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
                  // Clear stock selection when switching methods
                  clearSelection();
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

              {/* Quick-select holdings */}
              {holdings && holdings.length > 0 && !selectedStock && (
                <div className="holdings-quick-select">
                  <span className="quick-select-label">Current Holdings:</span>
                  <div className="holdings-chips">
                    {holdings.map(holding => (
                      <button
                        key={holding.symbol}
                        type="button"
                        className="holding-chip"
                        onClick={() => handleSelectStock({
                          symbol: holding.symbol,
                          name: holding.company_name || holding.name || holding.symbol,
                          id: holding.company_id || holding.symbol
                        })}
                      >
                        {holding.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    {/* Prioritize holdings in search results */}
                    {searchResults
                      .sort((a, b) => {
                        const aIsHolding = holdings?.some(h => h.symbol === a.symbol) ? -1 : 0;
                        const bIsHolding = holdings?.some(h => h.symbol === b.symbol) ? -1 : 0;
                        return aIsHolding - bIsHolding;
                      })
                      .slice(0, 8)
                      .map(company => {
                        const isHolding = holdings?.some(h => h.symbol === company.symbol);
                        return (
                          <button
                            key={company.id}
                            type="button"
                            className={`search-result-item ${isHolding ? 'is-holding' : ''}`}
                            onClick={() => handleSelectStock(company)}
                          >
                            <span className="result-symbol">{company.symbol}</span>
                            <span className="result-name">{company.name}</span>
                            {isHolding && <span className="holding-badge">Holding</span>}
                          </button>
                        );
                      })}
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
              <div className="kelly-results kelly-results-minimal">
                {/* Main Recommendation Card - Always Visible */}
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

                  {/* View Details Toggle */}
                  <button
                    className="view-details-btn"
                    onClick={() => setShowKellyDetails(!showKellyDetails)}
                  >
                    <span>{showKellyDetails ? 'Hide Details' : 'View Details'}</span>
                    {showKellyDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {/* Collapsible Details Section */}
                {showKellyDetails && (
                  <div className="kelly-details-section">
                    {/* Inline Stats Row */}
                    <div className="kelly-inline-stats">
                      <div className="inline-stat">
                        <span className="stat-label">Return</span>
                        <span className={`stat-value ${kellyData.statistics?.annualReturn >= 0 ? 'positive' : 'negative'}`}>
                          {kellyData.statistics?.annualReturn >= 0 ? '+' : ''}{kellyData.statistics?.annualReturn}%
                        </span>
                      </div>
                      <div className="inline-stat">
                        <span className="stat-label">Volatility</span>
                        <span className="stat-value">{kellyData.statistics?.annualVolatility}%</span>
                      </div>
                      <div className="inline-stat">
                        <span className="stat-label">Win Rate</span>
                        <span className="stat-value">{kellyData.statistics?.winRate}%</span>
                      </div>
                      <div className="inline-stat">
                        <span className="stat-label">Sharpe</span>
                        <span className={`stat-value ${kellyData.statistics?.sharpeRatio >= 1 ? 'positive' : ''}`}>
                          {kellyData.statistics?.sharpeRatio}
                        </span>
                      </div>
                      <div className="inline-stat">
                        <span className="stat-label">Max Loss</span>
                        <span className="stat-value negative">{kellyData.tailRisk?.maxObservedLoss}%</span>
                      </div>
                    </div>

                    {/* Condensed Fraction Table */}
                    {kellyData.fractionAnalysis && kellyData.fractionAnalysis.length > 0 && (
                      <div className="fraction-analysis compact">
                        <div className="fraction-header">
                          <Info size={16} />
                          <span>Position Size Scenarios</span>
                        </div>
                        <table className="fraction-table">
                          <thead>
                            <tr>
                              <th>Size</th>
                              <th>Shares</th>
                              <th>Value</th>
                              <th>Exp. Return</th>
                              <th>Risk</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kellyData.fractionAnalysis
                              .filter(f => [0.25, 0.5, 1.0].includes(f.fraction) || f.fraction === kellyData.kelly?.recommended?.fraction)
                              .map(f => {
                                // Calculate shares and value consistently with main card
                                const shares = selectedStock?.currentPrice && portfolioValue
                                  ? Math.floor((portfolioValue * f.fraction) / selectedStock.currentPrice)
                                  : null;
                                const actualValue = shares && selectedStock?.currentPrice
                                  ? shares * selectedStock.currentPrice
                                  : portfolioValue * f.fraction;
                                return (
                                  <tr
                                    key={f.fraction}
                                    className={f.fraction === kellyData.kelly?.recommended?.fraction ? 'highlighted' : ''}
                                  >
                                    <td>{(f.fraction * 100).toFixed(0)}%</td>
                                    <td>{shares ? shares.toLocaleString() : '-'}</td>
                                    <td>{formatValue(actualValue)}</td>
                                    <td className={f.expectedReturn >= 0 ? 'positive' : 'negative'}>
                                      {f.expectedReturn >= 0 ? '+' : ''}{f.expectedReturn?.toFixed(1)}%
                                    </td>
                                    <td>
                                      <span className={`risk-badge ${f.riskOf50pctDrawdown > 20 ? 'high' : f.riskOf50pctDrawdown > 10 ? 'medium' : 'low'}`}>
                                        {f.riskOf50pctDrawdown > 20 ? 'High' : f.riskOf50pctDrawdown > 10 ? 'Med' : 'Low'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Benchmark Comparison - Inline Row */}
                    {kellyData.benchmarkComparison && (
                      <div className="benchmark-inline">
                        <span className="benchmark-label">vs {kellyData.benchmarkComparison.benchmark}:</span>
                        <span className="benchmark-stat">
                          Beta <strong>{kellyData.benchmarkComparison.beta}</strong>
                        </span>
                        <span className="benchmark-stat">
                          Alpha <strong className={kellyData.benchmarkComparison.alpha > 0 ? 'positive' : 'negative'}>
                            {kellyData.benchmarkComparison.alpha > 0 ? '+' : ''}{kellyData.benchmarkComparison.alpha}%
                          </strong>
                        </span>
                        <span className="benchmark-stat">
                          Excess <strong className={kellyData.benchmarkComparison.excessReturn > 0 ? 'positive' : 'negative'}>
                            {kellyData.benchmarkComparison.excessReturn > 0 ? '+' : ''}{kellyData.benchmarkComparison.excessReturn}%
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}
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
              {/* Stock Search - First for all non-Kelly methods */}
              <div className="stock-search-section compact">
                <label className="form-label">
                  {method === 'volatility_based' ? 'Select Stock *' : 'Select Stock (optional)'}
                </label>

                {/* Quick-select holdings */}
                {holdings && holdings.length > 0 && !selectedStock && (
                  <div className="holdings-quick-select">
                    <span className="quick-select-label">Holdings:</span>
                    <div className="holdings-chips">
                      {holdings.slice(0, 8).map(holding => (
                        <button
                          key={holding.symbol}
                          type="button"
                          className="holding-chip"
                          onClick={() => handleSelectStock({
                            symbol: holding.symbol,
                            name: holding.company_name || holding.name || holding.symbol,
                            id: holding.company_id || holding.symbol
                          })}
                        >
                          {holding.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
                      placeholder="Search symbol to auto-fill price..."
                    />
                    {searching && <Loader className="spinning search-loader" size={16} />}
                  </div>

                  {showResults && searchResults.length > 0 && !selectedStock && (
                    <div className="search-results">
                      {searchResults
                        .sort((a, b) => {
                          const aIsHolding = holdings?.some(h => h.symbol === a.symbol) ? -1 : 0;
                          const bIsHolding = holdings?.some(h => h.symbol === b.symbol) ? -1 : 0;
                          return aIsHolding - bIsHolding;
                        })
                        .slice(0, 6)
                        .map(company => {
                          const isHolding = holdings?.some(h => h.symbol === company.symbol);
                          return (
                            <button
                              key={company.id}
                              type="button"
                              className={`search-result-item ${isHolding ? 'is-holding' : ''}`}
                              onClick={() => handleSelectStock(company)}
                            >
                              <span className="result-symbol">{company.symbol}</span>
                              <span className="result-name">{company.name}</span>
                              {isHolding && <span className="holding-badge">Holding</span>}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Selected Stock Display */}
                {selectedStock && (
                  <div className="selected-stock-card compact">
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

              {/* Common Fields */}
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
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
                    <label>Entry Price ($){method === 'fixed_risk' ? ' *' : ''}</label>
                    <input
                      type="number"
                      value={config.entryPrice}
                      onChange={e => setConfig({ ...config, entryPrice: e.target.value })}
                      placeholder={selectedStock ? 'Auto-filled' : (method === 'fixed_risk' ? 'Required' : 'Optional')}
                      min="0"
                      step="0.01"
                      required={method === 'fixed_risk'}
                    />
                  </div>
                )}
              </div>

              {/* Fixed Risk Fields */}
              {method === 'fixed_risk' && (
                <div className="fixed-risk-section">
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
                      <label>Stop Loss Price ($) *</label>
                      <input
                        type="number"
                        value={config.stopLossPrice}
                        onChange={e => setConfig({ ...config, stopLossPrice: e.target.value })}
                        placeholder="Required"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Volatility-based Fields */}
              {method === 'volatility_based' && (
                <div className="volatility-section">
                  <div className="form-row">
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
                    <div className="form-group">
                      <label>Max Position (%)</label>
                      <input
                        type="number"
                        value={config.maxPositionPct}
                        onChange={e => setConfig({ ...config, maxPositionPct: parseFloat(e.target.value) })}
                        min="5"
                        max="100"
                        step="5"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Equal Weight Fields */}
              {method === 'equal_weight' && (
                <div className="equal-weight-section">
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
                </div>
              )}

              {/* Percent of Portfolio Fields */}
              {method === 'percent_of_portfolio' && (
                <div className="percent-portfolio-section">
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
                <h4>
                  Recommended Position
                  {selectedStock && <span className="result-stock-context"> for {selectedStock.symbol}</span>}
                </h4>

                {/* Note when no stock selected */}
                {!selectedStock && method !== 'kelly' && (
                  <div className="result-context-note">
                    <Info size={14} />
                    <span>
                      {method === 'fixed_risk' && config.entryPrice
                        ? `Calculation based on Entry Price $${parseFloat(config.entryPrice).toFixed(2)}. Select a stock above for context.`
                        : method === 'equal_weight'
                        ? `Each of ${config.numberOfPositions} positions. Select a stock above to see share count.`
                        : `Select a stock above to calculate shares.`
                      }
                    </span>
                  </div>
                )}

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

                  {/* Volatility-based specific fields */}
                  {result.stockVolatility !== undefined && (
                    <div className="result-card">
                      <span className="result-label">Stock Volatility</span>
                      <span className="result-value">{result.stockVolatility}%</span>
                      <span className="result-hint">annualized</span>
                    </div>
                  )}

                  {/* Equal Weight specific fields */}
                  {result.numberOfPositions !== undefined && (
                    <div className="result-card">
                      <span className="result-label">Positions</span>
                      <span className="result-value">{result.numberOfPositions}</span>
                      <span className="result-hint">equal weight</span>
                    </div>
                  )}

                  {result.cashReserveAmount !== undefined && result.cashReserveAmount > 0 && (
                    <div className="result-card">
                      <span className="result-label">Cash Reserve</span>
                      <span className="result-value">{formatValue(result.cashReserveAmount)}</span>
                      <span className="result-hint">{result.cashReservePct}% reserved</span>
                    </div>
                  )}
                </div>

                {/* Note when position was capped for diversification */}
                {result.wasCapped && (
                  <div className="result-context-note" style={{ marginTop: 'var(--space-3)' }}>
                    <Info size={14} />
                    <span>
                      Position capped at {formatPercent(result.positionPct)} for diversification.
                      Volatility-based sizing suggested {formatPercent(result.uncappedPct)}.
                    </span>
                  </div>
                )}
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

        {/* Compliance Disclaimer */}
        <ComplianceDisclaimer variant="inline" type="analysis" />
      </div>
    </div>
  );
}

export default PositionSizingPanel;
