// frontend/src/pages/HomePage.js
import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Star,
  BarChart3,
  DollarSign,
  Award,
  Target,
  Shield,
  Zap,
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Percent,
  PieChart
} from 'lucide-react';
import { statsAPI, indicesAPI } from '../services/api';
import { useWatchlist } from '../context/WatchlistContext';
import { useFormatters } from '../hooks/useFormatters';
import { WatchlistButton, MiniChart, SelectionActionBar } from '../components';
import { NLQueryBar } from '../components/nl';
import { SkeletonTable, SkeletonDashboard } from '../components/Skeleton';
import {
  PageHeader,
  Badge
} from '../components/ui';
import './HomePage.css';

const API_BASE = process.env.REACT_APP_API_URL || '/api';

// Macro regime colors and icons
const REGIME_CONFIG = {
  CRISIS: { color: '#dc2626', icon: AlertTriangle, label: 'Crisis Mode', bgClass: 'regime-crisis' },
  LATE_CYCLE: { color: '#f59e0b', icon: Activity, label: 'Late Cycle', bgClass: 'regime-late-cycle' },
  FEAR: { color: '#f97316', icon: TrendingDown, label: 'Fear Mode', bgClass: 'regime-fear' },
  EARLY_CYCLE: { color: '#22c55e', icon: TrendingUp, label: 'Early Cycle', bgClass: 'regime-early-cycle' },
  NEUTRAL: { color: '#3b82f6', icon: BarChart3, label: 'Neutral', bgClass: 'regime-neutral' }
};

// Macro screen presets
const MACRO_SCREENS = [
  { id: 'value-with-macro', name: 'Smart Value', description: 'Auto-adjusts for macro conditions', endpoint: 'value-with-macro' },
  { id: 'recession-resistant', name: 'Recession-Resistant', description: 'Defensive sectors with FCF', endpoint: 'recession-resistant' },
  { id: 'deep-value-safe', name: 'Deep Value + Safe', description: 'Deep value when curve is normal', endpoint: 'deep-value-safe' },
  { id: 'garp-low-vol', name: 'GARP + Low Vol', description: 'Quality when VIX is calm', endpoint: 'garp-low-vol' },
  { id: 'cyclical', name: 'Cyclical Value', description: 'Cyclicals for early cycle', endpoint: 'cyclical' },
  { id: 'fear-buying', name: 'Fear Buying', description: 'Quality during fear', endpoint: 'fear-buying' },
  { id: 'credit-stress', name: 'Credit Fortress', description: 'Strong balance sheets', endpoint: 'credit-stress' }
];

// Market Indices Section with Charts and Weekly Performance - memoized to prevent re-renders
const MarketIndicesSection = memo(function MarketIndicesSection({ indices, priceHistory, loading }) {
  // Map index symbols to sectors page with index filter
  const getIndexLink = (symbol) => {
    const indexMap = {
      '^GSPC': '/sectors?index=SPX',
      '^DJI': '/sectors?index=DJI',
      '^IXIC': '/sectors?index=NASDAQ',
      '^RUT': '/sectors?index=RUT',
    };
    return indexMap[symbol] || '/sectors';
  };

  if (loading) {
    return (
      <div className="indices-section">
        <div className="section-header">
          <h3><TrendingUp size={18} /> Market Indices</h3>
        </div>
        <div className="indices-loading">Loading indices...</div>
      </div>
    );
  }

  if (!indices || indices.length === 0) {
    return (
      <div className="indices-section">
        <div className="section-header">
          <h3><TrendingUp size={18} /> Market Indices</h3>
        </div>
        <div className="indices-empty">No indices data available</div>
      </div>
    );
  }

  // Calculate 1-week change from price history
  const getWeeklyChange = (symbol) => {
    const history = priceHistory[symbol];
    if (!history || history.length < 5) return null;
    const currentPrice = history[history.length - 1]?.value;
    const weekAgoPrice = history[Math.max(0, history.length - 6)]?.value;
    if (!currentPrice || !weekAgoPrice) return null;
    return ((currentPrice - weekAgoPrice) / weekAgoPrice) * 100;
  };

  return (
    <div className="indices-section">
      <div className="section-header">
        <h3><TrendingUp size={18} /> Market Indices</h3>
      </div>
      <div className="indices-grid">
        {indices.slice(0, 4).map(idx => {
          const weekChange = getWeeklyChange(idx.symbol);
          const history = priceHistory[idx.symbol] || [];

          // Convert history to correct format for MiniChart
          const chartData = history.map(p => ({ date: p.date, value: p.value }));

          // Support both /api/indices (change_1d_pct) and /api/indices/etfs/market (change_1d)
          const dayChange = idx.change_1d_pct ?? idx.change_1d ?? 0;
          const weekChangeApi = idx.change_1w ?? weekChange;
          const indexLink = getIndexLink(idx.symbol);

          return (
            <Link to={indexLink} key={idx.symbol} className="index-card-new">
              <div className="index-top-row">
                <span className="index-name">{idx.short_name || idx.name || idx.symbol}</span>
                <span className={`index-day-change ${dayChange >= 0 ? 'positive' : 'negative'}`}>
                  {dayChange >= 0 ? '+' : ''}{dayChange?.toFixed(2)}%
                </span>
              </div>
              <div className="index-price-row">
                <span className="index-price-value">
                  {idx.last_price?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                </span>
                {weekChangeApi !== null && weekChangeApi !== undefined && (
                  <span className={`index-week-change ${weekChangeApi >= 0 ? 'positive' : 'negative'}`}>
                    1W: {weekChangeApi >= 0 ? '+' : ''}{weekChangeApi.toFixed(2)}%
                  </span>
                )}
              </div>
              {chartData.length > 0 && (
                <div className="index-chart">
                  <MiniChart
                    data={chartData}
                    width={180}
                    height={50}
                    showYAxis={false}
                    showTimeLabels={false}
                  />
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
});

// Compact Macro Indicators Bar (VIX, 2s10s, HY, MSI - no charts) - memoized
const MacroIndicatorsBar = memo(function MacroIndicatorsBar({ indicators }) {
  if (!indicators) return null;

  const { volatility, treasuryYields, credit, aggregateValuation } = indicators;

  return (
    <div className="macro-bar">
      <div className={`macro-bar-item ${volatility?.vix > 25 ? 'warning' : volatility?.vix > 20 ? 'elevated' : ''}`}>
        <span className="macro-bar-label">VIX</span>
        <span className="macro-bar-value">{volatility?.vix?.toFixed(1) || 'N/A'}</span>
        <span className="macro-bar-status">{volatility?.level || ''}</span>
      </div>
      <div className={`macro-bar-item ${treasuryYields?.curveInverted ? 'warning' : ''}`}>
        <span className="macro-bar-label">2s10s</span>
        <span className="macro-bar-value">{treasuryYields?.spread2s10s?.toFixed(2) || 'N/A'}%</span>
        <span className="macro-bar-status">{treasuryYields?.curveInverted ? 'Inverted' : 'Normal'}</span>
      </div>
      <div className={`macro-bar-item ${credit?.hySpread > 5 ? 'warning' : ''}`}>
        <span className="macro-bar-label">HY Spread</span>
        <span className="macro-bar-value">{credit?.hySpread?.toFixed(2) || 'N/A'}%</span>
        <span className="macro-bar-status">{credit?.level || ''}</span>
      </div>
      <div className="macro-bar-item">
        <span className="macro-bar-label">MSI</span>
        <span className="macro-bar-value">{aggregateValuation?.medianMSI?.toFixed(2) || 'N/A'}</span>
        <span className="macro-bar-status">{aggregateValuation?.msiAssessment || ''}</span>
      </div>
    </div>
  );
});

// Valuation Dashboard Component with Historical Charts - memoized
const ValuationDashboard = memo(function ValuationDashboard({ indicators, valuationHistory, loading }) {
  if (loading) {
    return (
      <div className="valuation-dashboard loading">
        <div className="skeleton-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!indicators) return null;

  const { buffettIndicator, marketTobinQ, aggregateValuation, treasuryYields } = indicators;

  const getAssessmentClass = (assessment) => {
    if (!assessment) return '';
    const lower = assessment.toLowerCase();
    if (lower.includes('overvalued') || lower.includes('expensive')) return 'negative';
    if (lower.includes('undervalued') || lower.includes('attractive')) return 'positive';
    return 'neutral';
  };

  return (
    <div className="valuation-section">
      <div className="section-header">
        <h3><BarChart3 size={18} /> Market Valuation</h3>
      </div>

      <div className="valuation-grid-new">
        {/* Buffett Indicator */}
        <div className="valuation-card-new">
          <div className="valuation-card-header">
            <span className="valuation-card-title">Buffett Indicator</span>
            <span className="valuation-card-subtitle">Market Cap / GDP</span>
          </div>
          <div className="valuation-card-main">
            <span className="valuation-card-value">
              {buffettIndicator?.value ? `${buffettIndicator.value.toFixed(0)}%` : 'N/A'}
            </span>
            <span className={`valuation-card-badge ${getAssessmentClass(buffettIndicator?.assessment)}`}>
              {buffettIndicator?.assessment || 'N/A'}
            </span>
          </div>
          {valuationHistory?.buffett?.length > 0 && (
            <div className="valuation-card-chart">
              <MiniChart
                data={valuationHistory.buffett}
                width={200}
                height={70}
                showYAxis={false}
                showTimeLabels={true}
                formatValue={(v) => v?.toFixed(0)}
                unit="%"
              />
            </div>
          )}
        </div>

        {/* Tobin's Q */}
        <div className="valuation-card-new">
          <div className="valuation-card-header">
            <span className="valuation-card-title">Market Tobin's Q</span>
            <span className="valuation-card-subtitle">Market / Book Value</span>
          </div>
          <div className="valuation-card-main">
            <span className="valuation-card-value">
              {marketTobinQ?.value ? `${marketTobinQ.value.toFixed(2)}x` : 'N/A'}
            </span>
            <span className={`valuation-card-badge ${getAssessmentClass(marketTobinQ?.assessment)}`}>
              {marketTobinQ?.assessment || 'N/A'}
            </span>
          </div>
          {valuationHistory?.tobinQ?.length > 0 && (
            <div className="valuation-card-chart">
              <MiniChart
                data={valuationHistory.tobinQ}
                width={200}
                height={70}
                showYAxis={false}
                showTimeLabels={true}
                formatValue={(v) => v?.toFixed(2)}
                unit="x"
              />
            </div>
          )}
        </div>

        {/* S&P 500 P/E */}
        <div className="valuation-card-new">
          <div className="valuation-card-header">
            <span className="valuation-card-title">S&P 500 P/E</span>
            <span className="valuation-card-subtitle">Market-Cap Weighted</span>
          </div>
          <div className="valuation-card-main">
            <span className="valuation-card-value">
              {valuationHistory?.sp500PE?.length > 0
                ? `${valuationHistory.sp500PE[valuationHistory.sp500PE.length - 1]?.value?.toFixed(1)}x`
                : 'N/A'}
            </span>
            <span className={`valuation-card-badge ${
              valuationHistory?.sp500PE?.length > 0 && valuationHistory.sp500PE[valuationHistory.sp500PE.length - 1]?.value > 25
                ? 'overvalued'
                : valuationHistory?.sp500PE?.length > 0 && valuationHistory.sp500PE[valuationHistory.sp500PE.length - 1]?.value > 20
                  ? 'fair'
                  : 'undervalued'
            }`}>
              {valuationHistory?.sp500PE?.length > 0 && valuationHistory.sp500PE[valuationHistory.sp500PE.length - 1]?.value > 25
                ? 'Expensive'
                : valuationHistory?.sp500PE?.length > 0 && valuationHistory.sp500PE[valuationHistory.sp500PE.length - 1]?.value > 20
                  ? 'Fair'
                  : 'Cheap'}
            </span>
          </div>
          {valuationHistory?.sp500PE?.length > 0 && (
            <div className="valuation-card-chart">
              <MiniChart
                data={valuationHistory.sp500PE}
                width={200}
                height={70}
                showYAxis={false}
                showTimeLabels={true}
                formatValue={(v) => v?.toFixed(1)}
                unit="x"
              />
            </div>
          )}
        </div>

        {/* Median MSI */}
        <div className="valuation-card-new">
          <div className="valuation-card-header">
            <span className="valuation-card-title">Median MSI</span>
            <span className="valuation-card-subtitle">EV / Book Value</span>
          </div>
          <div className="valuation-card-main">
            <span className="valuation-card-value">
              {aggregateValuation?.medianMSI ? `${aggregateValuation.medianMSI.toFixed(2)}x` : 'N/A'}
            </span>
            <span className={`valuation-card-badge ${getAssessmentClass(aggregateValuation?.msiAssessment)}`}>
              {aggregateValuation?.msiAssessment || 'N/A'}
            </span>
          </div>
          {valuationHistory?.medianMSI?.length > 0 && (
            <div className="valuation-card-chart">
              <MiniChart
                data={valuationHistory.medianMSI}
                width={200}
                height={70}
                showYAxis={false}
                showTimeLabels={true}
                formatValue={(v) => v?.toFixed(2)}
                unit="x"
              />
            </div>
          )}
        </div>

        {/* % Undervalued */}
        <div className="valuation-card-new">
          <div className="valuation-card-header">
            <span className="valuation-card-title">Stocks Undervalued</span>
            <span className="valuation-card-subtitle">P/E below 16x</span>
          </div>
          <div className="valuation-card-main">
            <span className="valuation-card-value positive">
              {aggregateValuation?.pctUndervalued ? `${aggregateValuation.pctUndervalued.toFixed(0)}%` : 'N/A'}
            </span>
            <span className="valuation-card-count">
              {aggregateValuation?.undervaluedStocks || 0} of {aggregateValuation?.totalStocks || 0}
            </span>
          </div>
          {valuationHistory?.pctUndervalued?.length > 0 && (
            <div className="valuation-card-chart">
              <MiniChart
                data={valuationHistory.pctUndervalued}
                width={200}
                height={70}
                showYAxis={false}
                showTimeLabels={true}
                formatValue={(v) => v?.toFixed(0)}
                unit="%"
              />
            </div>
          )}
        </div>
      </div>

      {/* Yield Curve Section */}
      {treasuryYields && (
        <div className="yield-section">
          <div className="yield-header-row">
            <span className="yield-section-title">Treasury Yields</span>
            {treasuryYields.curveInverted && (
              <Badge variant="red">Curve Inverted</Badge>
            )}
          </div>
          <div className="yield-pills">
            <div className="yield-pill">
              <span className="yield-pill-label">3M</span>
              <span className="yield-pill-value">{treasuryYields.threeMonth?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-pill">
              <span className="yield-pill-label">2Y</span>
              <span className="yield-pill-value">{treasuryYields.twoYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-pill">
              <span className="yield-pill-label">5Y</span>
              <span className="yield-pill-value">{treasuryYields.fiveYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-pill">
              <span className="yield-pill-label">10Y</span>
              <span className="yield-pill-value">{treasuryYields.tenYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-pill">
              <span className="yield-pill-label">30Y</span>
              <span className="yield-pill-value">{treasuryYields.thirtyYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className={`yield-pill spread ${treasuryYields.spread2s10s < 0 ? 'inverted' : ''}`}>
              <span className="yield-pill-label">2s10s</span>
              <span className="yield-pill-value">{treasuryYields.spread2s10s?.toFixed(2) || 'N/A'}%</span>
            </div>
          </div>
          {treasuryYields.curveInverted && (
            <div className="yield-warning-msg">
              <AlertTriangle size={14} />
              Inverted yield curve historically precedes recession by 12-24 months
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// Safe Havens & Opportunities Panel - memoized
const OpportunitiesPanel = memo(function OpportunitiesPanel({ indicators, loading }) {
  if (loading || !indicators) return null;

  const { safeHavens, opportunities } = indicators;

  return (
    <div className="opportunities-section">
      <div className="opportunities-grid-new">
        {/* Safe Havens */}
        <div className="opportunity-card">
          <div className="opportunity-header">
            <Shield size={18} />
            <span>Safe Havens</span>
          </div>
          {safeHavens?.length > 0 ? (
            <div className="opportunity-list">
              {safeHavens.slice(0, 5).map(stock => (
                <Link to={`/company/${stock.symbol}`} key={stock.symbol} className="opportunity-item">
                  <div className="opportunity-item-left">
                    <span className="opportunity-symbol">{stock.symbol}</span>
                    <span className="opportunity-sector">{stock.sector}</span>
                  </div>
                  <div className="opportunity-item-right">
                    <span className="opportunity-metric">
                      <span className="opportunity-metric-label">Def</span>
                      <span className="opportunity-metric-value">{stock.defensive_score?.toFixed(0)}</span>
                    </span>
                    <span className="opportunity-metric">
                      <span className="opportunity-metric-label">Div</span>
                      <span className="opportunity-metric-value positive">{(stock.dividend_yield * 100)?.toFixed(1)}%</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="opportunity-empty">No safe havens found</div>
          )}
        </div>

        {/* Undervalued Quality */}
        <div className="opportunity-card">
          <div className="opportunity-header">
            <Target size={18} />
            <span>Undervalued Quality</span>
          </div>
          {opportunities?.length > 0 ? (
            <div className="opportunity-list">
              {opportunities.slice(0, 5).map(stock => (
                <Link to={`/company/${stock.symbol}`} key={stock.symbol} className="opportunity-item">
                  <div className="opportunity-item-left">
                    <span className="opportunity-symbol">{stock.symbol}</span>
                    <span className="opportunity-sector">{stock.sector}</span>
                  </div>
                  <div className="opportunity-item-right">
                    <span className="opportunity-metric">
                      <span className="opportunity-metric-label">P/E</span>
                      <span className="opportunity-metric-value">{stock.pe_ratio?.toFixed(1)}</span>
                    </span>
                    <span className="opportunity-discount">
                      -{stock.discount_pct?.toFixed(0)}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="opportunity-empty">No opportunities found</div>
          )}
        </div>
      </div>
    </div>
  );
});

// Regime Banner Component - memoized
const RegimeBanner = memo(function RegimeBanner({ regime, indicators, loading }) {
  if (loading) {
    return (
      <div className="regime-banner regime-loading">
        <Activity size={20} className="loading-pulse" />
        <span>Loading market regime...</span>
      </div>
    );
  }

  const config = REGIME_CONFIG[regime] || REGIME_CONFIG.NEUTRAL;
  const Icon = config.icon;

  return (
    <div className={`regime-banner ${config.bgClass}`} style={{ backgroundColor: `${config.color}15`, borderColor: config.color }}>
      <div className="regime-banner-left">
        <Icon size={20} color={config.color} />
        <div>
          <div className="regime-label" style={{ color: config.color }}>{config.label}</div>
          <div className="regime-description">
            {regime === 'CRISIS' && 'Prioritize quality and defensive positions'}
            {regime === 'LATE_CYCLE' && 'Favor defensive sectors, reduce cyclical exposure'}
            {regime === 'FEAR' && 'Opportunity for quality accumulation'}
            {regime === 'EARLY_CYCLE' && 'Cyclicals may outperform, risk-on environment'}
            {regime === 'NEUTRAL' && 'Balanced approach with quality focus'}
            {!regime && 'Loading...'}
          </div>
        </div>
      </div>
    </div>
  );
});

// Value Screen Results Table - memoized with selection support
const ScreenResultsTable = memo(function ScreenResultsTable({
  results,
  loading,
  selectedSymbols = [],
  onToggleSelect,
  onToggleSelectAll
}) {
  const { percent: formatPercent, number: formatNumber } = useFormatters();

  if (loading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  if (!results || results.length === 0) {
    return <div className="no-results">No stocks match the current criteria</div>;
  }

  const displayedResults = results.slice(0, 8);
  const allDisplayedSelected = displayedResults.every(s => selectedSymbols.includes(s.symbol));
  const someSelected = selectedSymbols.length > 0 && !allDisplayedSelected;

  return (
    <div className="screen-results-table-container">
      <table className="screen-results-table selectable">
        <thead>
          <tr>
            <th className="checkbox-col">
              <input
                type="checkbox"
                checked={allDisplayedSelected && displayedResults.length > 0}
                ref={el => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={() => onToggleSelectAll(displayedResults.map(s => s.symbol))}
                title="Select all displayed"
              />
            </th>
            <th>Symbol</th>
            <th>Company</th>
            <th>ROIC</th>
            <th>P/E</th>
            <th>FCF Yield</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {displayedResults.map((stock) => {
            const isSelected = selectedSymbols.includes(stock.symbol);
            return (
              <tr
                key={stock.symbol}
                className={isSelected ? 'selected' : ''}
                onClick={(e) => {
                  // Don't toggle if clicking on link or button
                  if (e.target.closest('a, button')) return;
                  onToggleSelect(stock.symbol);
                }}
              >
                <td className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(stock.symbol)}
                  />
                </td>
                <td>
                  <Link to={`/company/${stock.symbol}`} className="symbol-link">
                    {stock.symbol}
                  </Link>
                </td>
                <td className="company-name">{stock.name?.substring(0, 20)}</td>
                <td className={stock.roic > 0.15 ? 'value-good' : stock.roic > 0.1 ? 'value-neutral' : 'value-bad'}>
                  {formatPercent(stock.roic, { multiply: true })}
                </td>
                <td className={stock.pe_ratio < 15 ? 'value-good' : stock.pe_ratio < 25 ? 'value-neutral' : 'value-bad'}>
                  {stock.pe_ratio ? formatNumber(stock.pe_ratio, 1) : 'N/A'}
                </td>
                <td className={stock.fcf_yield > 5 ? 'value-good' : stock.fcf_yield > 0 ? 'value-neutral' : 'value-bad'}>
                  {formatPercent(stock.fcf_yield)}
                </td>
                <td>
                  <WatchlistButton symbol={stock.symbol} size="small" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {results.length > 8 && (
        <div className="results-more">+{results.length - 8} more</div>
      )}
    </div>
  );
});

// Value Screens Section Component - memoized with selection support
const ValueScreensSection = memo(function ValueScreensSection({ screens, activeScreen, setActiveScreen, screenResults, screenLoading, screenMeta }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedSymbols, setSelectedSymbols] = useState([]);

  // Clear selection when screen changes
  useEffect(() => {
    setSelectedSymbols([]);
  }, [activeScreen]);

  const handleToggleSelect = useCallback((symbol) => {
    setSelectedSymbols(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  }, []);

  const handleToggleSelectAll = useCallback((symbols) => {
    setSelectedSymbols(prev => {
      const allSelected = symbols.every(s => prev.includes(s));
      if (allSelected) {
        // Deselect all displayed
        return prev.filter(s => !symbols.includes(s));
      } else {
        // Select all displayed
        return [...new Set([...prev, ...symbols])];
      }
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedSymbols([]);
  }, []);

  return (
    <div className="screens-section">
      <div className="section-header clickable" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>
          <Target size={18} />
          Value Screens
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </h3>
        <Link to="/screening" className="section-action">All Screens</Link>
      </div>

      {isExpanded && (
        <div className="screens-content">
          <div className="screen-chips">
            {screens.map(screen => (
              <button
                key={screen.id}
                className={`screen-chip ${activeScreen === screen.id ? 'active' : ''}`}
                onClick={() => setActiveScreen(screen.id)}
              >
                {screen.name}
              </button>
            ))}
          </div>

          {screenMeta && (
            <div className="screen-meta-row">
              <span className="screen-meta-name">{screenMeta.name}</span>
              <Badge variant="blue">{screenMeta.count || 0} stocks</Badge>
              {screenMeta.warning && (
                <span className="screen-meta-warning">
                  <AlertTriangle size={12} />
                  {screenMeta.warning}
                </span>
              )}
            </div>
          )}

          {/* Selection Action Bar */}
          <SelectionActionBar
            selectedItems={selectedSymbols}
            onClear={handleClearSelection}
          />

          <ScreenResultsTable
            results={screenResults}
            loading={screenLoading}
            selectedSymbols={selectedSymbols}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
          />
        </div>
      )}
    </div>
  );
});

// Compact Market Leaders - memoized
const MarketLeadersCompact = memo(function MarketLeadersCompact({ highlights }) {
  if (!highlights) return null;

  return (
    <div className="leaders-section">
      <div className="section-header">
        <h3><Award size={18} /> Market Leaders</h3>
        <Link to="/screening" className="section-action">Screen All</Link>
      </div>

      <div className="leaders-grid-new">
        <div className="leader-col">
          <h4><TrendingUp size={14} /> Top ROIC</h4>
          {highlights?.topROIC?.slice(0, 4).map((company, idx) => (
            <Link to={`/company/${company.symbol}`} key={company.symbol} className="leader-row">
              <span className="leader-rank">#{idx + 1}</span>
              <span className="leader-symbol">{company.symbol}</span>
              <span className="leader-value positive">{(company.roic * 100)?.toFixed(1)}%</span>
            </Link>
          ))}
        </div>

        <div className="leader-col">
          <h4><DollarSign size={14} /> Best Value</h4>
          {highlights?.bestValue?.slice(0, 4).map((company, idx) => (
            <Link to={`/company/${company.symbol}`} key={company.symbol} className="leader-row">
              <span className="leader-rank">#{idx + 1}</span>
              <span className="leader-symbol">{company.symbol}</span>
              <span className="leader-value">{company.earnings_yield?.toFixed(1)}%</span>
            </Link>
          ))}
        </div>

        <div className="leader-col">
          <h4><Zap size={14} /> Growth</h4>
          {highlights?.highestGrowth?.slice(0, 4).map((company, idx) => (
            <Link to={`/company/${company.symbol}`} key={company.symbol} className="leader-row">
              <span className="leader-rank">#{idx + 1}</span>
              <span className="leader-symbol">{company.symbol}</span>
              <span className="leader-value positive">+{company.revenue_growth_yoy?.toFixed(0)}%</span>
            </Link>
          ))}
        </div>

        <div className="leader-col">
          <h4><Percent size={14} /> Dividends</h4>
          {highlights?.dividendLeaders?.slice(0, 4).map((company, idx) => (
            <Link to={`/company/${company.symbol}`} key={company.symbol} className="leader-row">
              <span className="leader-rank">#{idx + 1}</span>
              <span className="leader-symbol">{company.symbol}</span>
              <span className="leader-value positive">{company.dividend_yield?.toFixed(2)}%</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
});

// Quick Actions - memoized
const QuickActions = memo(function QuickActions() {
  const actions = [
    { path: '/screening', icon: Target, label: 'Screen' },
    { path: '/charts', icon: BarChart3, label: 'Compare' },
    { path: '/capital', icon: DollarSign, label: 'Capital' },
    { path: '/sectors', icon: PieChart, label: 'Sectors' },
    { path: '/trending', icon: Activity, label: 'Signals' },
    { path: '/analyst', icon: Zap, label: 'AI' }
  ];

  return (
    <div className="quick-actions">
      {actions.map(action => (
        <Link to={action.path} key={action.path} className="quick-action">
          <action.icon size={16} />
          <span>{action.label}</span>
        </Link>
      ))}
    </div>
  );
});

function HomePage() {
  const { watchlist } = useWatchlist();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [highlights, setHighlights] = useState(null);
  const [marketIndices, setMarketIndices] = useState([]);
  const [indexPriceHistory, setIndexPriceHistory] = useState({});

  // Market indicators state
  const [marketIndicators, setMarketIndicators] = useState(null);
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);
  const [valuationHistory, setValuationHistory] = useState({});

  // Value Investing states
  const [activeScreen, setActiveScreen] = useState('value-with-macro');
  const [screenResults, setScreenResults] = useState(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenMeta, setScreenMeta] = useState(null);

  // Fetch market indicators
  useEffect(() => {
    const fetchIndicators = async () => {
      try {
        const response = await fetch(`${API_BASE}/macro/market-indicators`);
        if (response.ok) {
          const data = await response.json();
          setMarketIndicators(data);
        }
      } catch (err) {
        console.error('Failed to fetch market indicators:', err);
      } finally {
        setIndicatorsLoading(false);
      }
    };
    fetchIndicators();
  }, []);

  // Fetch real historical valuation data for sparklines
  useEffect(() => {
    const fetchHistoricalData = async () => {
      try {
        const response = await fetch(`${API_BASE}/macro/market-indicators/history?startQuarter=2015-Q1`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setValuationHistory({
              buffett: result.data.buffett || [],
              tobinQ: result.data.tobinQ || [],
              medianPE: result.data.medianPE || [],
              sp500PE: result.data.sp500PE || [],
              medianMSI: result.data.medianMSI || [],
              pctUndervalued: result.data.pctUndervalued || []
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch historical valuation data:', err);
      }
    };
    fetchHistoricalData();
  }, []);

  // Fetch screen results
  const fetchScreen = useCallback(async (screenId) => {
    setScreenLoading(true);
    try {
      const screen = MACRO_SCREENS.find(s => s.id === screenId);
      if (!screen) return;

      const response = await fetch(`${API_BASE}/screening/macro/${screen.endpoint}?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setScreenResults(data.results || []);
        setScreenMeta({
          name: data.screen,
          description: data.description,
          regime: data.regime,
          strategy: data.strategy,
          recommendation: data.recommendation,
          warning: data.warning,
          count: data.count,
          macroContext: data.macroContext
        });
      }
    } catch (err) {
      console.error('Failed to fetch screen:', err);
      setScreenResults([]);
    } finally {
      setScreenLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScreen(activeScreen);
  }, [activeScreen, fetchScreen]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, highlightsRes, indicesRes] = await Promise.all([
        statsAPI.getDashboard(),
        statsAPI.getHighlights(),
        indicesAPI.getAll().catch(() => ({ data: { data: [] } }))
      ]);

      setStats(statsRes.data);
      setHighlights(highlightsRes.data);
      const indices = (indicesRes.data?.data || indicesRes.data || []).slice(0, 4);
      setMarketIndices(indices);

      // Load price history for index charts (3 months for better visualization)
      if (indices.length > 0) {
        const priceHistoryPromises = indices.map(async (idx) => {
          try {
            // Use indicesAPI.getPrices for index symbols - 3m for smoother charts
            const res = await indicesAPI.getPrices(idx.symbol, '3m');
            const rawPrices = res.data?.data || [];
            // Convert to chart format {date, value}
            const prices = rawPrices.map(p => ({ date: p.date, value: p.close }));
            return { symbol: idx.symbol, data: prices };
          } catch (e) {
            console.log(`Failed to fetch prices for ${idx.symbol}:`, e.message);
            return { symbol: idx.symbol, data: [] };
          }
        });

        const priceHistories = await Promise.all(priceHistoryPromises);
        const historyMap = {};
        priceHistories.forEach(ph => {
          if (ph.data.length > 0) {
            // Data is already in {date, value} format from line 836
            historyMap[ph.symbol] = ph.data;
          }
        });
        setIndexPriceHistory(historyMap);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="home-page">
        <SkeletonDashboard />
      </div>
    );
  }

  return (
    <div className="home-page">
      {/* Page Header */}
      <PageHeader title="Market Dashboard" />

      {/* Quick Actions + Stats Row */}
      <div className="top-row">
        <QuickActions />
        <div className="stats-row">
          <div className="stat-item highlight">
            <span className="stat-value">{stats?.companies?.total || 0}</span>
            <span className="stat-label">Companies</span>
          </div>
          <div className="stat-item">
            <Star size={14} />
            <span className="stat-value">{watchlist.length}</span>
            <span className="stat-label">Watchlist</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats?.companies?.sectors || 0}</span>
            <span className="stat-label">Sectors</span>
          </div>
        </div>
      </div>

      {/* NL Query Bar */}
      <div className="search-section">
        <NLQueryBar
          placeholder="Ask anything... 'Show me undervalued tech stocks'"
          context={{ page: 'home' }}
          onResultSelect={(symbol) => navigate(`/company/${symbol}`)}
        />
      </div>

      {/* Market Indices with Charts */}
      <MarketIndicesSection
        indices={marketIndices}
        priceHistory={indexPriceHistory}
        loading={loading}
      />

      {/* Macro Indicators Bar (compact, no charts) */}
      <MacroIndicatorsBar indicators={marketIndicators} />

      {/* Valuation Dashboard with Historical Charts */}
      <ValuationDashboard
        indicators={marketIndicators}
        valuationHistory={valuationHistory}
        loading={indicatorsLoading}
      />

      {/* Regime Banner */}
      <RegimeBanner
        regime={screenMeta?.regime}
        indicators={marketIndicators}
        loading={indicatorsLoading && !screenMeta}
      />

      {/* Safe Havens & Opportunities */}
      <OpportunitiesPanel indicators={marketIndicators} loading={indicatorsLoading} />

      {/* Value Screens */}
      <ValueScreensSection
        screens={MACRO_SCREENS}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        screenResults={screenResults}
        screenLoading={screenLoading}
        screenMeta={screenMeta}
      />

      {/* Market Leaders */}
      <MarketLeadersCompact highlights={highlights} />
    </div>
  );
}

export default HomePage;
