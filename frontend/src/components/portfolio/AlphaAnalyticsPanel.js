// frontend/src/components/portfolio/AlphaAnalyticsPanel.js
import { useState, useEffect, useRef } from 'react';
import {
  Loader, AlertTriangle, TrendingUp, TrendingDown, Activity,
  Award, Target, BarChart3, RefreshCw, ChevronDown, ChevronRight,
  Minus, Info, CheckCircle, XCircle, Star, MoreHorizontal
} from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

// All available benchmarks grouped by region
const ALL_BENCHMARKS = {
  US: [
    { symbol: 'SPY', name: 'S&P 500', flag: '🇺🇸' },
    { symbol: 'QQQ', name: 'Nasdaq 100', flag: '🇺🇸' },
    { symbol: 'IWM', name: 'Russell 2000', flag: '🇺🇸' },
    { symbol: 'VTI', name: 'Total Market', flag: '🇺🇸' },
    { symbol: 'DIA', name: 'Dow Jones', flag: '🇺🇸' },
  ],
  Europe: [
    { symbol: 'EWU', name: 'FTSE 100', flag: '🇬🇧', index: 'FTSE' },
    { symbol: 'EWG', name: 'DAX 40', flag: '🇩🇪', index: 'DAX' },
    { symbol: 'EWQ', name: 'CAC 40', flag: '🇫🇷', index: 'CAC' },
    { symbol: 'FEZ', name: 'Euro Stoxx 50', flag: '🇪🇺', index: 'SX5E' },
    { symbol: 'EWN', name: 'AEX', flag: '🇳🇱', index: 'AEX' },
    { symbol: 'EWL', name: 'SMI', flag: '🇨🇭', index: 'SMI' },
    { symbol: 'EWP', name: 'IBEX 35', flag: '🇪🇸', index: 'IBEX' },
    { symbol: 'EWI', name: 'FTSE MIB', flag: '🇮🇹', index: 'FTSEMIB' },
    { symbol: 'EWD', name: 'OMX 30', flag: '🇸🇪', index: 'OMX30' },
  ],
};

// Default favorites (max 3)
const DEFAULT_FAVORITES = ['SPY', 'QQQ', 'IWM'];

function AlphaAnalyticsPanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [error, setError] = useState(null);

  // Data states
  const [alphaData, setAlphaData] = useState(null);
  const [attributionData, setAttributionData] = useState(null);

  // Settings
  const [period, setPeriod] = useState('1y');
  const [benchmark, setBenchmark] = useState('SPY');
  const [expandedSections, setExpandedSections] = useState({});

  // Benchmark selector state
  const [showAllBenchmarks, setShowAllBenchmarks] = useState(false);
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('alpha-benchmark-favorites');
    return saved ? JSON.parse(saved) : DEFAULT_FAVORITES;
  });
  const benchmarkDropdownRef = useRef(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId, period, benchmark]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await simulateAPI.getAlpha(parseInt(portfolioId), { period, benchmarkSymbol: benchmark });
      setAlphaData(res.data.data || res.data);

    } catch (err) {
      console.error('Failed to load alpha data:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab) => {
    if (tab === 'attribution' && !attributionData) {
      try {
        const res = await simulateAPI.getAlphaAttribution(parseInt(portfolioId), { period, benchmarkSymbol: benchmark });
        setAttributionData(res.data.data || res.data);
      } catch (err) {
        console.error('Failed to load attribution data:', err);
      }
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (benchmarkDropdownRef.current && !benchmarkDropdownRef.current.contains(event.target)) {
        setShowAllBenchmarks(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get all benchmarks as flat list
  const getAllBenchmarksFlat = () => {
    return [...ALL_BENCHMARKS.US, ...ALL_BENCHMARKS.Europe];
  };

  // Get benchmark info by symbol
  const getBenchmarkInfo = (symbol) => {
    return getAllBenchmarksFlat().find(b => b.symbol === symbol) || { symbol, name: symbol, flag: '' };
  };

  // Toggle favorite (max 3)
  const toggleFavorite = (symbol) => {
    let newFavorites;
    if (favorites.includes(symbol)) {
      newFavorites = favorites.filter(f => f !== symbol);
    } else if (favorites.length < 3) {
      newFavorites = [...favorites, symbol];
    } else {
      // Replace oldest favorite
      newFavorites = [...favorites.slice(1), symbol];
    }
    setFavorites(newFavorites);
    localStorage.setItem('alpha-benchmark-favorites', JSON.stringify(newFavorites));
  };

  // Select benchmark
  const selectBenchmark = (symbol) => {
    setBenchmark(symbol);
    setShowAllBenchmarks(false);
    // Save last used benchmark
    localStorage.setItem('alpha-last-benchmark', symbol);
  };

  const formatPercent = (value, decimals = 2) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
  };

  const getAlphaColor = (alpha) => {
    if (alpha > 5) return 'var(--color-success)';
    if (alpha > 0) return 'var(--color-success-light, #4ade80)';
    if (alpha > -5) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 70) return 'var(--color-success)';
    if (confidence >= 50) return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  const getRatingBadge = (rating) => {
    const colors = {
      'Excellent': 'var(--color-success)',
      'Good': '#4ade80',
      'Fair': 'var(--color-warning)',
      'Neutral': 'var(--color-text-muted)',
      'Poor': 'var(--color-danger)'
    };
    return (
      <span className="alpha-rating-badge" style={{ backgroundColor: colors[rating] || 'var(--color-text-muted)' }}>
        {rating}
      </span>
    );
  };

  if (loading && !alphaData) {
    return (
      <div className="simulation-panel loading">
        <Loader className="spin" size={24} />
        <span>Calculating Alpha Analytics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="simulation-panel error">
        <AlertTriangle size={24} />
        <span>{error}</span>
        <button onClick={loadData} className="retry-btn">
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  if (alphaData?.error) {
    return (
      <div className="simulation-panel info">
        <Info size={24} />
        <span>{alphaData.error}</span>
      </div>
    );
  }

  return (
    <div className="simulation-panel alpha-analytics-panel">
      {/* Controls */}
      <div className="alpha-controls">
        <div className="control-group">
          <label>Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
            <option value="2y">2 Years</option>
            <option value="3y">3 Years</option>
            <option value="5y">5 Years</option>
          </select>
        </div>

        {/* Expandable Benchmark Selector */}
        <div className="control-group benchmark-selector" ref={benchmarkDropdownRef}>
          <label>Benchmark</label>
          <div className="benchmark-selector-container">
            {/* Favorite benchmarks as quick buttons */}
            <div className="benchmark-favorites">
              {favorites.map(symbol => {
                const info = getBenchmarkInfo(symbol);
                return (
                  <button
                    key={symbol}
                    className={`benchmark-chip ${benchmark === symbol ? 'selected' : ''}`}
                    onClick={() => selectBenchmark(symbol)}
                    title={info.name}
                  >
                    {info.flag} {symbol}
                  </button>
                );
              })}
              <button
                className="benchmark-more-btn"
                onClick={() => setShowAllBenchmarks(!showAllBenchmarks)}
                title="More benchmarks"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>

            {/* Expanded dropdown with all benchmarks */}
            {showAllBenchmarks && (
              <div className="benchmark-dropdown">
                <div className="benchmark-dropdown-header">
                  <span>Select Benchmark</span>
                  <span className="favorites-hint">Click star to pin (max 3)</span>
                </div>

                {/* US Benchmarks */}
                <div className="benchmark-group">
                  <div className="benchmark-group-label">🇺🇸 US Indices</div>
                  {ALL_BENCHMARKS.US.map(b => (
                    <div
                      key={b.symbol}
                      className={`benchmark-option ${benchmark === b.symbol ? 'selected' : ''}`}
                    >
                      <button
                        className="benchmark-option-main"
                        onClick={() => selectBenchmark(b.symbol)}
                      >
                        <span className="benchmark-flag">{b.flag}</span>
                        <span className="benchmark-symbol">{b.symbol}</span>
                        <span className="benchmark-name">{b.name}</span>
                      </button>
                      <button
                        className={`benchmark-star ${favorites.includes(b.symbol) ? 'favorited' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(b.symbol); }}
                        title={favorites.includes(b.symbol) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} fill={favorites.includes(b.symbol) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* European Benchmarks */}
                <div className="benchmark-group">
                  <div className="benchmark-group-label">🇪🇺 European Indices</div>
                  {ALL_BENCHMARKS.Europe.map(b => (
                    <div
                      key={b.symbol}
                      className={`benchmark-option ${benchmark === b.symbol ? 'selected' : ''}`}
                    >
                      <button
                        className="benchmark-option-main"
                        onClick={() => selectBenchmark(b.symbol)}
                      >
                        <span className="benchmark-flag">{b.flag}</span>
                        <span className="benchmark-symbol">{b.symbol}</span>
                        <span className="benchmark-name">{b.name}</span>
                      </button>
                      <button
                        className={`benchmark-star ${favorites.includes(b.symbol) ? 'favorited' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(b.symbol); }}
                        title={favorites.includes(b.symbol) ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} fill={favorites.includes(b.symbol) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <button onClick={loadData} className="refresh-btn" disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="analytics-tabs">
        {['summary', 'factors', 'rolling', 'skill', 'attribution'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
          >
            {tab === 'summary' && <Award size={16} />}
            {tab === 'factors' && <BarChart3 size={16} />}
            {tab === 'rolling' && <Activity size={16} />}
            {tab === 'skill' && <Target size={16} />}
            {tab === 'attribution' && <TrendingUp size={16} />}
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </button>
        ))}
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && alphaData?.summary && (
        <div className="tab-content summary-content">
          {/* Key Metrics */}
          <div className="alpha-summary-grid">
            <div className="summary-card main-alpha">
              <div className="summary-label">Jensen's Alpha</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.summary.jensensAlpha) }}>
                {formatPercent(alphaData.summary.jensensAlpha)}
              </div>
              <div className="summary-sublabel">vs {benchmark}</div>
            </div>

            <div className="summary-card">
              <div className="summary-label">Multi-Factor Alpha</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.summary.multifactorAlpha) }}>
                {formatPercent(alphaData.summary.multifactorAlpha)}
              </div>
              <div className="summary-sublabel">Factor-adjusted</div>
            </div>

            <div className="summary-card">
              <div className="summary-label">Skill Confidence</div>
              <div className="summary-value" style={{ color: getConfidenceColor(alphaData.summary.alphaConfidence) }}>
                {alphaData.summary.alphaConfidence}%
              </div>
              <div className="summary-sublabel">Statistical</div>
            </div>

            <div className="summary-card">
              <div className="summary-label">Consistency</div>
              <div className="summary-value" style={{ color: getConfidenceColor(alphaData.summary.alphaConsistency) }}>
                {alphaData.summary.alphaConsistency}%
              </div>
              <div className="summary-sublabel">Periods positive</div>
            </div>

            <div className="summary-card">
              <div className="summary-label">Information Ratio</div>
              <div className="summary-value">
                {alphaData.summary.informationRatio?.toFixed(2)}
              </div>
              <div className="summary-sublabel">Risk-adjusted</div>
            </div>

            <div className="summary-card">
              <div className="summary-label">Overall Rating</div>
              <div className="summary-value">
                {getRatingBadge(alphaData.summary.alphaRating)}
              </div>
            </div>
          </div>

          {/* Jensen's Alpha Details */}
          {alphaData.jensensAlpha && (
            <div className="collapsible-section">
              <div className="section-header" onClick={() => toggleSection('jensens')}>
                {expandedSections.jensens ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span>Jensen's Alpha Details</span>
                {alphaData.jensensAlpha.isStatisticallySignificant && (
                  <span className="badge success">Significant</span>
                )}
              </div>
              {expandedSections.jensens && (
                <div className="section-content">
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Portfolio Return</span>
                      <span className="detail-value">{formatPercent(alphaData.jensensAlpha.actualReturn)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Benchmark Return</span>
                      <span className="detail-value">{formatPercent(alphaData.jensensAlpha.benchmarkReturn)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Expected Return (CAPM)</span>
                      <span className="detail-value">{formatPercent(alphaData.jensensAlpha.expectedReturn)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Beta</span>
                      <span className="detail-value">{alphaData.jensensAlpha.beta}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Correlation</span>
                      <span className="detail-value">{alphaData.jensensAlpha.correlation}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">R-Squared</span>
                      <span className="detail-value">{(alphaData.jensensAlpha.rSquared * 100).toFixed(0)}%</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Tracking Error</span>
                      <span className="detail-value">{formatPercent(alphaData.jensensAlpha.trackingError)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">T-Statistic</span>
                      <span className="detail-value">{alphaData.jensensAlpha.tStatistic}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">P-Value</span>
                      <span className="detail-value">{alphaData.jensensAlpha.pValue}</span>
                    </div>
                  </div>
                  <div className="interpretation-box">
                    <Info size={16} />
                    <p>{alphaData.jensensAlpha.interpretation}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Factors Tab */}
      {activeTab === 'factors' && alphaData?.multiFactor && (
        <div className="tab-content factors-content">
          <div className="alpha-summary-grid">
            <div className="summary-card main-alpha">
              <div className="summary-label">Raw Alpha</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.multiFactor.alpha) }}>
                {formatPercent(alphaData.multiFactor.alpha)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Factor-Adjusted</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.multiFactor.factorAdjustedAlpha) }}>
                {formatPercent(alphaData.multiFactor.factorAdjustedAlpha)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Market Beta</div>
              <div className="summary-value">{alphaData.multiFactor.marketBeta}</div>
            </div>
          </div>

          <h4>Factor Exposures</h4>
          <div className="factor-exposures">
            {Object.entries(alphaData.multiFactor.factors || {}).map(([factor, data]) => (
              <div key={factor} className="factor-bar-item">
                <div className="factor-info">
                  <span className="factor-name">{factor.charAt(0).toUpperCase() + factor.slice(1)}</span>
                  <span className="factor-exposure">Exposure: {data.exposure?.toFixed(2) || '-'}</span>
                </div>
                <div className="factor-bar-container">
                  <div
                    className="factor-bar"
                    style={{
                      width: `${Math.min(100, Math.abs((data.exposure || 0) * 50))}%`,
                      backgroundColor: data.exposure >= 0 ? 'var(--positive)' : 'var(--negative)'
                    }}
                  />
                </div>
                <span className="factor-contribution">
                  {data.estimatedContribution !== undefined
                    ? formatPercent(data.estimatedContribution)
                    : (data.contribution !== undefined ? formatPercent(data.contribution) : '-')}
                </span>
              </div>
            ))}
          </div>

          <div className="interpretation-box">
            <Info size={16} />
            <p>{alphaData.multiFactor.interpretation}</p>
          </div>
        </div>
      )}

      {/* Rolling Tab */}
      {activeTab === 'rolling' && alphaData?.rollingAlpha && (
        <div className="tab-content rolling-content">
          <div className="alpha-summary-grid">
            <div className="summary-card">
              <div className="summary-label">Average Alpha</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.rollingAlpha.statistics?.average) }}>
                {formatPercent(alphaData.rollingAlpha.statistics?.average)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Current Alpha</div>
              <div className="summary-value" style={{ color: getAlphaColor(alphaData.rollingAlpha.statistics?.current) }}>
                {formatPercent(alphaData.rollingAlpha.statistics?.current)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Consistency</div>
              <div className="summary-value" style={{ color: getConfidenceColor(alphaData.rollingAlpha.consistency) }}>
                {alphaData.rollingAlpha.consistency}%
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Trend</div>
              <div className="summary-value trend-indicator">
                {alphaData.rollingAlpha.trend === 'improving' && <TrendingUp size={20} style={{ color: 'var(--color-success)' }} />}
                {alphaData.rollingAlpha.trend === 'declining' && <TrendingDown size={20} style={{ color: 'var(--color-danger)' }} />}
                {alphaData.rollingAlpha.trend === 'stable' && <Minus size={20} style={{ color: 'var(--color-warning)' }} />}
                <span>{alphaData.rollingAlpha.trend}</span>
              </div>
            </div>
          </div>

          <div className="rolling-stats">
            <div className="stat-row">
              <span>Range</span>
              <span>{formatPercent(alphaData.rollingAlpha.statistics?.min)} to {formatPercent(alphaData.rollingAlpha.statistics?.max)}</span>
            </div>
            <div className="stat-row">
              <span>Std Dev</span>
              <span>{formatPercent(alphaData.rollingAlpha.statistics?.stdDev)}</span>
            </div>
            <div className="stat-row">
              <span>Trend Magnitude</span>
              <span>{formatPercent(alphaData.rollingAlpha.trendMagnitude)}</span>
            </div>
          </div>

          {/* Best/Worst Periods */}
          <div className="periods-comparison">
            <div className="periods-section">
              <h5><TrendingUp size={16} /> Best Periods</h5>
              {alphaData.rollingAlpha.bestPeriods?.map((p, i) => (
                <div key={i} className="period-item success">
                  <span>{p.date}</span>
                  <span>{formatPercent(p.alpha)}</span>
                </div>
              ))}
            </div>
            <div className="periods-section">
              <h5><TrendingDown size={16} /> Worst Periods</h5>
              {alphaData.rollingAlpha.worstPeriods?.map((p, i) => (
                <div key={i} className="period-item danger">
                  <span>{p.date}</span>
                  <span>{formatPercent(p.alpha)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="interpretation-box">
            <Info size={16} />
            <p>{alphaData.rollingAlpha.interpretation}</p>
          </div>
        </div>
      )}

      {/* Skill Tab */}
      {activeTab === 'skill' && alphaData?.skillAnalysis && (
        <div className="tab-content skill-content">
          {/* Skill vs Luck Gauge */}
          <div className="skill-gauge-container">
            <div className="skill-gauge">
              <div className="gauge-label left">Luck</div>
              <div className="gauge-bar">
                <div
                  className="gauge-fill"
                  style={{
                    width: `${alphaData.skillAnalysis.skillConfidence}%`,
                    backgroundColor: getConfidenceColor(alphaData.skillAnalysis.skillConfidence)
                  }}
                />
                <div className="gauge-marker" style={{ left: '50%' }} />
              </div>
              <div className="gauge-label right">Skill</div>
            </div>
            <div className="skill-value">
              {alphaData.skillAnalysis.skillConfidence}% Skill Confidence
            </div>
          </div>

          {/* Statistical Tests */}
          <div className="statistical-tests">
            <h5>Statistical Tests</h5>
            <div className="test-grid">
              <div className="test-item">
                <span className="test-label">T-Statistic</span>
                <span className="test-value">{alphaData.skillAnalysis.statisticalTests?.tStatistic}</span>
              </div>
              <div className="test-item">
                <span className="test-label">P-Value</span>
                <span className="test-value">{alphaData.skillAnalysis.statisticalTests?.pValue}</span>
              </div>
              <div className="test-item">
                <span className="test-label">Bootstrap P-Value</span>
                <span className="test-value">{alphaData.skillAnalysis.statisticalTests?.bootstrapPValue}</span>
              </div>
              <div className="test-item">
                <span className="test-label">Significant (5%)</span>
                <span className="test-value">
                  {alphaData.skillAnalysis.statisticalTests?.isSignificantAt5Pct
                    ? <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                    : <XCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  }
                </span>
              </div>
              <div className="test-item">
                <span className="test-label">Significant (1%)</span>
                <span className="test-value">
                  {alphaData.skillAnalysis.statisticalTests?.isSignificantAt1Pct
                    ? <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
                    : <XCircle size={16} style={{ color: 'var(--color-danger)' }} />
                  }
                </span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="performance-metrics">
            <h5>Performance Metrics</h5>
            <div className="metrics-grid">
              <div className="metric-item">
                <span className="metric-label">Hit Rate</span>
                <span className="metric-value">{alphaData.skillAnalysis.performanceMetrics?.hitRate?.toFixed(1)}%</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Win/Loss Ratio</span>
                <span className="metric-value">{alphaData.skillAnalysis.performanceMetrics?.winLossRatio?.toFixed(2)}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Avg Win</span>
                <span className="metric-value success">{formatPercent(alphaData.skillAnalysis.performanceMetrics?.avgWin)}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">Avg Loss</span>
                <span className="metric-value danger">{formatPercent(-alphaData.skillAnalysis.performanceMetrics?.avgLoss)}</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          {alphaData.skillAnalysis.recommendation && (
            <div className={`recommendation-box ${alphaData.skillAnalysis.recommendation.action}`}>
              <strong>Recommendation: {alphaData.skillAnalysis.recommendation.action.toUpperCase()}</strong>
              <p>{alphaData.skillAnalysis.recommendation.message}</p>
            </div>
          )}

          <div className="interpretation-box">
            <Info size={16} />
            <p>{alphaData.skillAnalysis.interpretation}</p>
          </div>
        </div>
      )}

      {/* Attribution Tab */}
      {activeTab === 'attribution' && (alphaData?.attribution || attributionData) && (
        <div className="tab-content attribution-content">
          {/* Top/Bottom Contributors */}
          <div className="contributors-section">
            <div className="contributors-list">
              <h5><TrendingUp size={16} /> Top Alpha Contributors</h5>
              {(alphaData?.attribution?.topContributors || attributionData?.topContributors || []).map((pos, i) => (
                <div key={i} className="contributor-item success">
                  <span className="contributor-symbol">{pos.symbol}</span>
                  <span className="contributor-weight">{pos.weight?.toFixed(1)}%</span>
                  <span className="contributor-alpha">{formatPercent(pos.alphaContribution)}</span>
                </div>
              ))}
            </div>
            <div className="contributors-list">
              <h5><TrendingDown size={16} /> Bottom Alpha Contributors</h5>
              {(alphaData?.attribution?.bottomContributors || attributionData?.bottomContributors || []).map((pos, i) => (
                <div key={i} className="contributor-item danger">
                  <span className="contributor-symbol">{pos.symbol}</span>
                  <span className="contributor-weight">{pos.weight?.toFixed(1)}%</span>
                  <span className="contributor-alpha">{formatPercent(pos.alphaContribution)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sector Attribution */}
          <div className="sector-attribution">
            <h5>Sector Attribution</h5>
            {(alphaData?.attribution?.sectorAttribution || attributionData?.sectorAttribution || []).map((sector, i) => (
              <div key={i} className="sector-row">
                <span className="sector-name">{sector.sector}</span>
                <span className="sector-weight">{sector.weight?.toFixed(1)}%</span>
                <div className="sector-bar-container">
                  <div
                    className="sector-bar"
                    style={{
                      width: `${Math.min(100, Math.abs(sector.alphaContribution || 0) * 10)}%`,
                      backgroundColor: (sector.alphaContribution || 0) >= 0 ? 'var(--positive)' : 'var(--negative)'
                    }}
                  />
                </div>
                <span className={`sector-contribution ${(sector.alphaContribution || 0) >= 0 ? 'success' : 'danger'}`}>
                  {formatPercent(sector.alphaContribution)}
                </span>
              </div>
            ))}
          </div>

          {/* All Positions Table */}
          <div className="collapsible-section">
            <div className="section-header" onClick={() => toggleSection('allPositions')}>
              {expandedSections.allPositions ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span>All Position Attribution</span>
            </div>
            {expandedSections.allPositions && (
              <div className="section-content">
                <table className="attribution-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Weight</th>
                      <th>Return</th>
                      <th>Excess</th>
                      <th>Alpha Contribution</th>
                      <th>Beta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(alphaData?.attribution?.positions || attributionData?.positions || []).map((pos, i) => (
                      <tr key={i}>
                        <td><strong>{pos.symbol}</strong></td>
                        <td>{pos.weight?.toFixed(1)}%</td>
                        <td className={pos.annualizedReturn >= 0 ? 'success' : 'danger'}>
                          {formatPercent(pos.annualizedReturn)}
                        </td>
                        <td className={pos.excessReturn >= 0 ? 'success' : 'danger'}>
                          {formatPercent(pos.excessReturn)}
                        </td>
                        <td className={pos.alphaContribution >= 0 ? 'success' : 'danger'}>
                          <strong>{formatPercent(pos.alphaContribution)}</strong>
                        </td>
                        <td>{pos.beta?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Info Footer */}
      <div className="panel-footer">
        <span className="data-info">
          {alphaData?.tradingDays} trading days analyzed | Benchmark: {benchmark}
        </span>
      </div>
    </div>
  );
}

export default AlphaAnalyticsPanel;
