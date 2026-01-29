/**
 * TechnicalFormatter - Handles technical analysis response types
 *
 * Types handled:
 * - technical_indicator
 * - technical_pattern
 * - technical_analysis
 */

import React from 'react';
import { TrendingUp, TrendingDown, Minus, Activity, CheckCircle, XCircle } from '../../icons';
import './Formatters.css';

function TechnicalFormatter({ result, onSymbolClick }) {
  const { type } = result;

  switch (type) {
    case 'technical_indicator':
      return <IndicatorView result={result} onSymbolClick={onSymbolClick} />;

    case 'technical_pattern':
      return <PatternView result={result} onSymbolClick={onSymbolClick} />;

    case 'technical_analysis':
      return <FullAnalysisView result={result} onSymbolClick={onSymbolClick} />;

    default:
      return <FullAnalysisView result={result} onSymbolClick={onSymbolClick} />;
  }
}

/**
 * Single indicator view (RSI, MACD, etc.)
 */
function IndicatorView({ result, onSymbolClick }) {
  const { symbol, indicator, value, interpretation, overall_signal, raw_data } = result;

  const getValueClass = () => {
    if (!value || !indicator) return '';
    const indicatorLower = indicator.toLowerCase();

    if (indicatorLower.includes('rsi')) {
      if (value >= 70) return 'overbought';
      if (value <= 30) return 'oversold';
      return 'neutral';
    }
    return '';
  };

  return (
    <div className="fmt-technical-indicator">
      {symbol && (
        <div className="fmt-header">
          <Activity size={16} />
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {indicator && <span className="fmt-indicator-badge">{indicator}</span>}
        </div>
      )}

      <div className="fmt-indicator-main">
        <div className="fmt-indicator-value-large">
          <span className="fmt-value-label">Current Value</span>
          <span className={`fmt-value-number ${getValueClass()}`}>
            {formatIndicatorValue(value, indicator)}
          </span>
        </div>

        {overall_signal && (
          <div className="fmt-indicator-signal">
            <SignalBadge signal={overall_signal} />
          </div>
        )}
      </div>

      {/* Additional data from raw_data */}
      {raw_data && Object.keys(raw_data).length > 1 && (
        <div className="fmt-indicator-details">
          {Object.entries(raw_data)
            .filter(([k]) => k !== 'value' && k !== 'score')
            .slice(0, 4)
            .map(([key, val]) => (
              <div key={key} className="fmt-detail-item">
                <span className="fmt-detail-label">{formatLabel(key)}</span>
                <span className="fmt-detail-value">{formatValue(val)}</span>
              </div>
            ))}
        </div>
      )}

      {interpretation && (
        <div className="fmt-interpretation">
          {interpretation}
        </div>
      )}
    </div>
  );
}

/**
 * Pattern detection view (oversold, golden cross, etc.)
 */
function PatternView({ result, onSymbolClick }) {
  const { symbol, pattern, detected, interpretation, rsi, overall_signal } = result;

  return (
    <div className="fmt-technical-pattern">
      {symbol && (
        <div className="fmt-header">
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {overall_signal && <SignalBadge signal={overall_signal} />}
        </div>
      )}

      <div className="fmt-pattern">
        <div className={`fmt-pattern-icon ${detected ? 'detected' : 'not-detected'}`}>
          {detected ? <CheckCircle size={20} /> : <XCircle size={20} />}
        </div>
        <div className="fmt-pattern-info">
          <span className="fmt-pattern-name">{pattern || 'Pattern'}</span>
          <span className="fmt-pattern-status">
            {detected ? 'Detected' : 'Not Detected'}
          </span>
        </div>
      </div>

      {rsi !== undefined && (
        <div className="fmt-rsi-display">
          <span className="fmt-rsi-label">RSI</span>
          <div className="fmt-rsi-gauge">
            <div className="fmt-rsi-track">
              <div
                className="fmt-rsi-marker"
                style={{ left: `${Math.min(100, Math.max(0, rsi))}%` }}
              />
              <div className="fmt-rsi-zones">
                <span className="fmt-zone oversold">Oversold</span>
                <span className="fmt-zone neutral">Neutral</span>
                <span className="fmt-zone overbought">Overbought</span>
              </div>
            </div>
            <span className={`fmt-rsi-value ${getRSIClass(rsi)}`}>{rsi.toFixed(1)}</span>
          </div>
        </div>
      )}

      {interpretation && (
        <div className="fmt-interpretation">
          {interpretation}
        </div>
      )}
    </div>
  );
}

/**
 * Full technical analysis view
 */
function FullAnalysisView({ result, onSymbolClick }) {
  const { symbol, current_price, overall_signal, confidence, trend, indicators, interpretation } = result;

  return (
    <div className="fmt-technical-analysis">
      {symbol && (
        <div className="fmt-header">
          <Activity size={16} />
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>
            {symbol}
          </span>
          {current_price && <span className="fmt-price">${current_price.toFixed(2)}</span>}
          {overall_signal && <SignalBadge signal={overall_signal} />}
        </div>
      )}

      {/* Summary metrics */}
      <div className="fmt-tech-summary">
        {trend && (
          <div className="fmt-summary-item">
            <span className="fmt-summary-label">Trend</span>
            <span className={`fmt-summary-value ${getTrendClass(trend)}`}>
              {trend}
            </span>
          </div>
        )}
        {confidence && (
          <div className="fmt-summary-item">
            <span className="fmt-summary-label">Confidence</span>
            <span className="fmt-summary-value">
              {typeof confidence === 'number' ? `${(confidence * 100).toFixed(0)}%` : confidence}
            </span>
          </div>
        )}
      </div>

      {/* Indicators breakdown */}
      {indicators && (
        <div className="fmt-indicators-section">
          {/* RSI */}
          {indicators.rsi && (
            <div className="fmt-indicator-row">
              <span className="fmt-indicator-name">RSI</span>
              <div className="fmt-indicator-content">
                <span className={`fmt-indicator-value ${getRSIClass(indicators.rsi.value)}`}>
                  {indicators.rsi.value?.toFixed(1) || '-'}
                </span>
                {indicators.rsi.condition && (
                  <span className="fmt-indicator-condition">{indicators.rsi.condition}</span>
                )}
              </div>
            </div>
          )}

          {/* MACD */}
          {indicators.macd && (
            <div className="fmt-indicator-row">
              <span className="fmt-indicator-name">MACD</span>
              <div className="fmt-indicator-content">
                <span className={`fmt-indicator-value ${getMACDClass(indicators.macd.histogram)}`}>
                  {indicators.macd.histogram?.toFixed(4) || '-'}
                </span>
                {indicators.macd.signal && (
                  <span className="fmt-indicator-condition">{indicators.macd.signal}</span>
                )}
              </div>
            </div>
          )}

          {/* Moving Averages */}
          {indicators.moving_averages && (
            <div className="fmt-ma-section">
              <span className="fmt-indicator-name">Moving Averages</span>
              <div className="fmt-ma-grid">
                {indicators.moving_averages.sma_20 && (
                  <div className="fmt-ma-item">
                    <span className="fmt-ma-label">SMA 20</span>
                    <span className="fmt-ma-value">${indicators.moving_averages.sma_20.toFixed(2)}</span>
                  </div>
                )}
                {indicators.moving_averages.sma_50 && (
                  <div className="fmt-ma-item">
                    <span className="fmt-ma-label">SMA 50</span>
                    <span className="fmt-ma-value">${indicators.moving_averages.sma_50.toFixed(2)}</span>
                  </div>
                )}
                {indicators.moving_averages.sma_200 && (
                  <div className="fmt-ma-item">
                    <span className="fmt-ma-label">SMA 200</span>
                    <span className="fmt-ma-value">${indicators.moving_averages.sma_200.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Volatility */}
          {indicators.volatility?.atr && (
            <div className="fmt-indicator-row">
              <span className="fmt-indicator-name">ATR (Volatility)</span>
              <div className="fmt-indicator-content">
                <span className="fmt-indicator-value">
                  ${indicators.volatility.atr.toFixed(2)}
                </span>
                {indicators.volatility.atr_percent && (
                  <span className="fmt-indicator-condition">
                    {indicators.volatility.atr_percent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {interpretation && (
        <div className="fmt-interpretation">
          {interpretation}
        </div>
      )}
    </div>
  );
}

// Helper Components
function SignalBadge({ signal }) {
  if (!signal) return null;

  const signalLower = String(signal).toLowerCase();
  let className = 'fmt-signal fmt-signal-neutral';
  let Icon = Minus;

  if (signalLower.includes('buy') || signalLower.includes('bullish') || signalLower === 'strong_buy') {
    className = 'fmt-signal fmt-signal-bullish';
    Icon = TrendingUp;
  } else if (signalLower.includes('sell') || signalLower.includes('bearish') || signalLower === 'strong_sell') {
    className = 'fmt-signal fmt-signal-bearish';
    Icon = TrendingDown;
  }

  return (
    <span className={className}>
      <Icon size={12} />
      {signal.replace(/_/g, ' ')}
    </span>
  );
}

// Utility functions
function formatLabel(str) {
  return str
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function formatValue(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'number') {
    return Math.abs(val) < 1 ? val.toFixed(4) : val.toFixed(2);
  }
  return String(val);
}

function formatIndicatorValue(value, indicator) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'number') return value;

  const indicatorLower = (indicator || '').toLowerCase();
  if (indicatorLower.includes('rsi') || indicatorLower.includes('stochastic')) {
    return value.toFixed(1);
  }
  if (indicatorLower.includes('macd') || indicatorLower.includes('histogram')) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}

function getRSIClass(rsi) {
  if (rsi >= 70) return 'overbought';
  if (rsi <= 30) return 'oversold';
  return 'neutral';
}

function getMACDClass(histogram) {
  if (!histogram) return 'neutral';
  if (histogram > 0) return 'positive';
  if (histogram < 0) return 'negative';
  return 'neutral';
}

function getTrendClass(trend) {
  if (!trend) return '';
  const trendLower = trend.toLowerCase();
  if (trendLower.includes('up')) return 'positive';
  if (trendLower.includes('down')) return 'negative';
  return 'neutral';
}

export default TechnicalFormatter;
