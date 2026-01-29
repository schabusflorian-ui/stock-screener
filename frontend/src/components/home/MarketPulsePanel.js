// frontend/src/components/home/MarketPulsePanel.js
import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ChevronRight,
  AlertTriangle,
  BarChart3
} from '../icons';
import { useAskAI, AskAIProvider } from '../../hooks';
import { MiniChart } from '../../components';
import { Badge } from '../ui';
import './MarketPulsePanel.css';

// Calculate period change from price history
function calculatePeriodChange(history, daysBack) {
  if (!history || history.length < daysBack) return null;
  const currentPrice = history[history.length - 1]?.value;
  const pastPrice = history[Math.max(0, history.length - daysBack)]?.value;
  if (!currentPrice || !pastPrice) return null;
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

// Single Index Card component with Ask AI support - Enhanced with more data
const PulseIndexCard = memo(function PulseIndexCard({ idx, chartData, dayChange, weekChange, monthChange, yearChange, indexLink }) {
  const askAIContext = {
    type: 'index',
    symbol: idx.symbol,
    label: idx.short_name || idx.name || idx.symbol,
    price: idx.last_price,
    dayChange,
    weekChange,
    monthChange,
    yearChange
  };

  const askAIProps = useAskAI(() => askAIContext);

  const formatChange = (val) => {
    if (val === null || val === undefined) return '—';
    return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
  };

  return (
    <AskAIProvider value={askAIContext}>
      <Link to={indexLink} className="pulse-index-card" {...askAIProps}>
        <div className="pulse-index-header">
          <span className="pulse-index-name">{idx.short_name || idx.name || idx.symbol}</span>
          <span className={`pulse-index-change ${dayChange >= 0 ? 'positive' : 'negative'}`}>
            {dayChange >= 0 ? '+' : ''}{dayChange?.toFixed(2)}%
          </span>
        </div>
        <div className="pulse-index-price">
          {idx.last_price?.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </div>

        {/* Performance periods */}
        <div className="pulse-index-periods">
          <span className={`period-item ${weekChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="period-label">1W</span>
            <span className="period-value">{formatChange(weekChange)}</span>
          </span>
          <span className={`period-item ${monthChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="period-label">1M</span>
            <span className="period-value">{formatChange(monthChange)}</span>
          </span>
          <span className={`period-item ${yearChange >= 0 ? 'positive' : 'negative'}`}>
            <span className="period-label">1Y</span>
            <span className="period-value">{formatChange(yearChange)}</span>
          </span>
        </div>

        {chartData && chartData.length > 0 && (
          <div className="pulse-index-chart">
            <MiniChart
              data={chartData}
              width={180}
              height={60}
              showYAxis={false}
              showTimeLabels={false}
            />
          </div>
        )}
      </Link>
    </AskAIProvider>
  );
});

// Single Risk Indicator component with Ask AI support - now links to factors
const PulseRiskIndicator = memo(function PulseRiskIndicator({ label, value, status, className, metric, linkTo }) {
  const askAIProps = useAskAI(() => ({
    type: 'macro_indicator',
    metric,
    label,
    value,
    status
  }));

  const content = (
    <div className={`pulse-risk-item ${className || ''}`} {...askAIProps}>
      <span className="pulse-risk-label">{label}</span>
      <span className="pulse-risk-value">{value}</span>
      <span className="pulse-risk-status">{status}</span>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo} className="pulse-risk-link">{content}</Link>;
  }

  return content;
});

// Map index symbols to indices page
function getIndexLink(symbol) {
  const indexMap = {
    '^GSPC': '/sectors?index=SPX',
    '^DJI': '/sectors?index=DJI',
    '^IXIC': '/sectors?index=NASDAQ',
    '^RUT': '/sectors?index=RUT',
  };
  return indexMap[symbol] || '/sectors';
}

function MarketPulsePanel({ indices, priceHistory, macroIndicators, loading }) {
  if (loading) {
    return (
      <div className="market-pulse-panel loading">
        <div className="pulse-header">
          <span className="section-label">MARKET PULSE</span>
        </div>
        <div className="pulse-skeleton">
          <div className="skeleton-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const { volatility, treasuryYields, credit, aggregateValuation } = macroIndicators || {};

  return (
    <div className="market-pulse-panel">
      <div className="pulse-header">
        <div className="pulse-header-left">
          <span className="section-label">MARKET PULSE</span>
          <h3><TrendingUp size={18} /> Markets & Risk</h3>
        </div>
        <Link to="/sectors" className="section-action">
          Indices <ChevronRight size={14} />
        </Link>
      </div>

      <div className="pulse-content">
        {/* Indices Section */}
        <div className="pulse-indices">
          {indices && indices.slice(0, 4).map(idx => {
            const history = priceHistory?.[idx.symbol] || [];
            const chartData = history.map(p => ({ date: p.date, value: p.value }));
            const dayChange = idx.change_1d_pct ?? idx.change_1d ?? 0;

            // Calculate different period changes
            const weekChange = idx.change_1w ?? calculatePeriodChange(history, 5);
            const monthChange = idx.change_1m ?? calculatePeriodChange(history, 22);
            const yearChange = idx.change_1y ?? calculatePeriodChange(history, 252);

            return (
              <PulseIndexCard
                key={idx.symbol}
                idx={idx}
                chartData={chartData}
                dayChange={dayChange}
                weekChange={weekChange}
                monthChange={monthChange}
                yearChange={yearChange}
                indexLink={getIndexLink(idx.symbol)}
              />
            );
          })}
        </div>

        {/* Divider */}
        <div className="pulse-divider" />

        {/* Risk Indicators Section - now with links to factors */}
        <div className="pulse-risk">
          <PulseRiskIndicator
            label="VIX"
            value={volatility?.vix?.toFixed(1) || 'N/A'}
            status={volatility?.level || ''}
            className={volatility?.vix > 25 ? 'warning' : volatility?.vix > 20 ? 'elevated' : ''}
            metric="vix"
            linkTo="/research/factors?factor=volatility"
          />
          <PulseRiskIndicator
            label="2s10s"
            value={`${treasuryYields?.spread2s10s?.toFixed(2) || 'N/A'}%`}
            status={treasuryYields?.curveInverted ? 'Inverted' : 'Normal'}
            className={treasuryYields?.curveInverted ? 'warning' : ''}
            metric="yield_curve_spread"
            linkTo="/research/factors?factor=rates"
          />
          <PulseRiskIndicator
            label="HY Spread"
            value={`${credit?.hySpread?.toFixed(2) || 'N/A'}%`}
            status={credit?.level || ''}
            className={credit?.hySpread > 5 ? 'warning' : ''}
            metric="high_yield_spread"
            linkTo="/research/factors?factor=credit"
          />
          <PulseRiskIndicator
            label="MSI"
            value={aggregateValuation?.medianMSI?.toFixed(2) || 'N/A'}
            status={aggregateValuation?.msiAssessment || ''}
            metric="median_msi"
            linkTo="/research/factors?factor=valuation"
          />
        </div>
      </div>

      {/* Treasury Yields Row - Centered with legend */}
      {treasuryYields && (
        <div className="pulse-yields">
          <div className="yields-legend">
            <BarChart3 size={14} />
            <span className="yields-legend-text">Treasury Yields</span>
            {treasuryYields.curveInverted && (
              <Badge variant="red" size="small">
                <AlertTriangle size={10} /> Curve Inverted
              </Badge>
            )}
          </div>
          <div className="yields-items">
            <div className="yield-item">
              <span className="yield-label">3M</span>
              <span className="yield-value">{treasuryYields.threeMonth?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-item">
              <span className="yield-label">2Y</span>
              <span className="yield-value">{treasuryYields.twoYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-item">
              <span className="yield-label">5Y</span>
              <span className="yield-value">{treasuryYields.fiveYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-item">
              <span className="yield-label">10Y</span>
              <span className="yield-value">{treasuryYields.tenYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className="yield-item">
              <span className="yield-label">30Y</span>
              <span className="yield-value">{treasuryYields.thirtyYear?.toFixed(2) || 'N/A'}%</span>
            </div>
            <div className={`yield-item spread ${treasuryYields.curveInverted ? 'inverted' : ''}`}>
              <span className="yield-label">2s10s</span>
              <span className="yield-value">{treasuryYields.spread2s10s?.toFixed(2) || 'N/A'}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MarketPulsePanel);
