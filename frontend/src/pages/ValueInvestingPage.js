// frontend/src/pages/ValueInvestingPage.js
import { useState, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { macroAPI, screeningAPI } from '../services/api';
import { PageHeader } from '../components/ui';
import { WatchlistButton } from '../components';
import { SkeletonTable } from '../components/Skeleton';
import { useFormatters } from '../hooks/useFormatters';
import { useAskAI } from '../hooks/useAskAI';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Activity, DollarSign, BarChart3, Shield } from '../components/icons';
import './ValueInvestingPage.css';

// Macro regime configuration - colors now handled via CSS classes (Prism Design System)
const REGIME_CONFIG = {
  CRISIS: { className: 'crisis', icon: AlertTriangle, label: 'Crisis Mode' },
  LATE_CYCLE: { className: 'late-cycle', icon: Activity, label: 'Late Cycle' },
  FEAR: { className: 'fear', icon: TrendingDown, label: 'Fear Mode' },
  EARLY_CYCLE: { className: 'early-cycle', icon: TrendingUp, label: 'Early Cycle' },
  NEUTRAL: { className: 'neutral', icon: BarChart3, label: 'Neutral' }
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

function MacroCard({ title, value, subtext, status, icon: Icon }) {
  // Status colors now handled via CSS classes (Prism Design System)
  return (
    <div className={`macro-card status-${status || 'neutral'}`}>
      <div className="macro-card-header">
        {Icon && <Icon size={18} />}
        <span className="macro-card-title">{title}</span>
      </div>
      <div className="macro-card-value">{value}</div>
      {subtext && <div className="macro-card-subtext">{subtext}</div>}
    </div>
  );
}

function RegimeBanner({ regime, macroContext }) {
  const config = REGIME_CONFIG[regime] || REGIME_CONFIG.NEUTRAL;
  const Icon = config.icon;

  return (
    <div className={`regime-banner ${config.className}`}>
      <div className="regime-banner-left">
        <Icon size={24} />
        <div>
          <div className="regime-label">{config.label}</div>
          <div className="regime-description">
            {regime === 'CRISIS' && 'Prioritize quality and defensive positions'}
            {regime === 'LATE_CYCLE' && 'Favor defensive sectors, reduce cyclical exposure'}
            {regime === 'FEAR' && 'Opportunity for quality accumulation'}
            {regime === 'EARLY_CYCLE' && 'Cyclicals may outperform, risk-on environment'}
            {regime === 'NEUTRAL' && 'Balanced approach with quality focus'}
          </div>
        </div>
      </div>
      {macroContext && (
        <div className="regime-banner-right">
          <span>VIX: {macroContext.vix?.toFixed(1) || 'N/A'}</span>
          <span>2s10s: {macroContext.spread2s10s?.toFixed(2) || 'N/A'}%</span>
          <span>HY: {macroContext.hySpread?.toFixed(2) || 'N/A'}%</span>
        </div>
      )}
    </div>
  );
}

// Value stock row component with Ask AI
const ValueStockRow = memo(function ValueStockRow({ stock, formatPercent, formatNumber }) {
  const askAIProps = useAskAI(() => ({
    type: 'table_row',
    symbol: stock.symbol,
    label: `${stock.symbol} - ${stock.name} Value Metrics`,
    data: {
      sector: stock.sector,
      roic: stock.roic,
      peRatio: stock.pe_ratio,
      fcfYield: stock.fcf_yield,
      debtToEquity: stock.debt_to_equity
    }
  }));

  return (
    <tr {...askAIProps}>
      <td>
        <Link to={`/company/${stock.symbol}`} className="symbol-link">
          {stock.symbol}
        </Link>
      </td>
      <td className="company-name">{stock.name?.substring(0, 30)}</td>
      <td>{stock.sector}</td>
      <td className={stock.roic > 15 ? 'value-good' : stock.roic > 10 ? 'value-neutral' : 'value-bad'}>
        {formatPercent(stock.roic)}
      </td>
      <td className={stock.pe_ratio < 15 ? 'value-good' : stock.pe_ratio < 25 ? 'value-neutral' : 'value-bad'}>
        {stock.pe_ratio ? formatNumber(stock.pe_ratio, 1) : 'N/A'}
      </td>
      <td className={stock.fcf_yield > 5 ? 'value-good' : stock.fcf_yield > 0 ? 'value-neutral' : 'value-bad'}>
        {formatPercent(stock.fcf_yield)}
      </td>
      <td className={stock.debt_to_equity < 0.5 ? 'value-good' : stock.debt_to_equity < 1 ? 'value-neutral' : 'value-bad'}>
        {stock.debt_to_equity ? formatNumber(stock.debt_to_equity, 2) : 'N/A'}
      </td>
      <td>
        <WatchlistButton symbol={stock.symbol} size="small" />
      </td>
    </tr>
  );
});

function ResultsTable({ results, loading }) {
  const { percent: formatPercent, number: formatNumber } = useFormatters();

  if (loading) {
    return <SkeletonTable rows={10} columns={8} />;
  }

  if (!results || results.length === 0) {
    return <div className="no-results">No stocks match the current criteria</div>;
  }

  return (
    <div className="results-table-container">
      <table className="results-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Company</th>
            <th>Sector</th>
            <th>ROIC</th>
            <th>P/E</th>
            <th>FCF Yield</th>
            <th>Debt/Eq</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map((stock) => (
            <ValueStockRow
              key={stock.symbol}
              stock={stock}
              formatPercent={formatPercent}
              formatNumber={formatNumber}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ValueInvestingPage() {
  const [macroData, setMacroData] = useState(null);
  const [macroLoading, setMacroLoading] = useState(true);
  const [activeScreen, setActiveScreen] = useState('value-with-macro');
  const [screenResults, setScreenResults] = useState(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenMeta, setScreenMeta] = useState(null);

  // Fetch macro context (use macroAPI for credentials + X-Admin-Bypass)
  useEffect(() => {
    const fetchMacro = async () => {
      try {
        const response = await macroAPI.getKeyMetrics();
        setMacroData(response.data);
      } catch (err) {
        console.error('Failed to fetch macro data:', err);
      } finally {
        setMacroLoading(false);
      }
    };
    fetchMacro();
  }, []);

  // Fetch screen results (use screeningAPI for credentials + X-Admin-Bypass)
  const fetchScreen = useCallback(async (screenId) => {
    setScreenLoading(true);
    try {
      const screen = MACRO_SCREENS.find(s => s.id === screenId);
      if (!screen) return;

      const response = await screeningAPI.getMacroScreen(screen.endpoint, 50);
      const data = response.data;
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
    } catch (err) {
      console.error('Failed to fetch screen:', err);
      setScreenResults([]);
    } finally {
      setScreenLoading(false);
    }
  }, []);

  // Initial screen fetch
  useEffect(() => {
    fetchScreen(activeScreen);
  }, [activeScreen, fetchScreen]);

  // Determine VIX status
  const getVixStatus = (vix) => {
    if (!vix) return 'neutral';
    if (vix > 30) return 'danger';
    if (vix > 25) return 'warning';
    if (vix > 20) return 'neutral';
    return 'good';
  };

  // Determine yield curve status
  const getCurveStatus = (spread, inverted) => {
    if (inverted) return 'danger';
    if (spread < 0.5) return 'warning';
    if (spread > 1.5) return 'good';
    return 'neutral';
  };

  // Determine credit status
  const getCreditStatus = (spread) => {
    if (!spread) return 'neutral';
    if (spread > 7) return 'danger';
    if (spread > 5) return 'warning';
    if (spread < 3.5) return 'good';
    return 'neutral';
  };

  return (
    <div className="value-investing-page">
      <PageHeader
        title="Value Investing Dashboard"
        subtitle="Macro-aware screening for long-term value investors"
      />

      {/* Macro Context Cards */}
      <section className="macro-context-section">
        <h2>
          <Activity size={20} />
          Market Context
        </h2>
        {macroLoading ? (
          <div className="macro-cards-loading">Loading macro data...</div>
        ) : macroData ? (
          <div className="macro-cards-grid">
            <MacroCard
              title="VIX"
              value={macroData.volatility?.vix?.toFixed(1) || 'N/A'}
              subtext={macroData.volatility?.level || 'Unknown'}
              status={getVixStatus(macroData.volatility?.vix)}
              icon={Activity}
            />
            <MacroCard
              title="2s10s Spread"
              value={`${macroData.rates?.spread2s10s?.toFixed(2) || 'N/A'}%`}
              subtext={macroData.rates?.curveInverted ? 'INVERTED' : 'Normal'}
              status={getCurveStatus(macroData.rates?.spread2s10s, macroData.rates?.curveInverted)}
              icon={TrendingUp}
            />
            <MacroCard
              title="HY Spread"
              value={`${macroData.credit?.hySpread?.toFixed(2) || 'N/A'}%`}
              subtext={macroData.credit?.stressLevel || 'Unknown'}
              status={getCreditStatus(macroData.credit?.hySpread)}
              icon={DollarSign}
            />
            <MacroCard
              title="Fed Funds"
              value={`${macroData.rates?.fedFunds?.toFixed(2) || 'N/A'}%`}
              subtext="Target Rate"
              status="neutral"
              icon={Shield}
            />
          </div>
        ) : (
          <div className="macro-cards-error">Failed to load macro data</div>
        )}
      </section>

      {/* Regime Banner */}
      {screenMeta?.regime && (
        <RegimeBanner regime={screenMeta.regime} macroContext={screenMeta.macroContext} />
      )}

      {/* Screen Selector */}
      <section className="screen-selector-section">
        <h2>
          <BarChart3 size={20} />
          Macro-Aware Screens
        </h2>
        <div className="screen-buttons">
          {MACRO_SCREENS.map(screen => (
            <button
              key={screen.id}
              className={`screen-button ${activeScreen === screen.id ? 'active' : ''}`}
              onClick={() => setActiveScreen(screen.id)}
            >
              <span className="screen-button-name">{screen.name}</span>
              <span className="screen-button-desc">{screen.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Screen Results */}
      <section className="screen-results-section">
        <div className="results-header">
          <div>
            <h2>{screenMeta?.name || 'Screen Results'}</h2>
            {screenMeta?.description && (
              <p className="results-description">{screenMeta.description}</p>
            )}
          </div>
          <div className="results-count">
            {screenMeta?.count || 0} stocks
          </div>
        </div>

        {screenMeta?.warning && (
          <div className="results-warning">
            <AlertTriangle size={16} />
            {screenMeta.warning}
          </div>
        )}

        {screenMeta?.recommendation && (
          <div className="results-recommendation">
            <CheckCircle size={16} />
            {screenMeta.recommendation}
          </div>
        )}

        <ResultsTable results={screenResults} loading={screenLoading} />
      </section>
    </div>
  );
}
