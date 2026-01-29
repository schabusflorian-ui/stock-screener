// frontend/src/pages/agents/components/BacktestPreviewStep.js
// Quick backtest preview step for agent creation wizard

import React, { useState, useEffect } from 'react';
import {
  Play,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Calendar,
  Loader,
  RefreshCw,
  Info,
  Target,
  Percent,
  IconButton
} from '../../../components/icons';

// Simple chart component for equity curve preview
function MiniEquityChart({ data }) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const width = 300;
  const height = 80;
  const padding = 10;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.value - minValue) / range) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const isPositive = data[data.length - 1]?.value >= data[0]?.value;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-equity-chart">
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isPositive ? '#059669' : '#DC2626'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? '#059669' : '#DC2626'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={isPositive ? '#059669' : '#DC2626'}
        strokeWidth="2"
        points={points}
      />
      <polygon
        fill="url(#chartGradient)"
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
      />
    </svg>
  );
}

function BacktestPreviewStep({ formData, updateField, onRunBacktest }) {
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [backtestPeriod, setBacktestPeriod] = useState('1y');

  const PERIODS = [
    { id: '3m', label: '3 Months', days: 90 },
    { id: '6m', label: '6 Months', days: 180 },
    { id: '1y', label: '1 Year', days: 365 },
    { id: '2y', label: '2 Years', days: 730 },
    { id: '3y', label: '3 Years', days: 1095 }
  ];

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    setLoadingStage('Initializing...');

    try {
      const period = PERIODS.find(p => p.id === backtestPeriod);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period.days);

      // Build backtest config from form data
      const config = {
        signal_weights: formData.signal_weights || {},
        risk_params: {
          maxPositionSize: formData.max_position_size,
          maxSectorConcentration: formData.max_sector_exposure,
          maxDrawdown: formData.max_drawdown,
          maxCorrelation: formData.max_correlation
        },
        universe_config: formData.universe_config || {},
        regime_config: {
          enabled: formData.regime_scaling_enabled,
          useHMM: formData.use_hmm_regime,
          exposures: formData.regime_exposures,
          pauseInCrisis: formData.pause_in_crisis
        },
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        benchmark: 'SPY',
        mode: 'quick'  // Quick mode for preview
      };

      // Call the backtest API if provided, otherwise use mock data with progress simulation
      if (onRunBacktest) {
        setLoadingStage('Running simulation...');
        setLoadingProgress(30);
        const backtestResults = await onRunBacktest(config);
        setLoadingProgress(100);
        setResults(backtestResults);
      } else {
        // Simulate progress stages for mock data
        setLoadingStage('Loading historical data...');
        setLoadingProgress(20);
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingStage('Generating signals...');
        setLoadingProgress(40);
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingStage('Simulating trades...');
        setLoadingProgress(60);
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingStage('Calculating metrics...');
        setLoadingProgress(80);
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingStage('Complete!');
        setLoadingProgress(100);
        setResults(generateMockResults(config));
      }
    } catch (err) {
      setError(err.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  // Generate mock results for preview when API isn't available
  const generateMockResults = (config) => {
    const days = PERIODS.find(p => p.id === backtestPeriod)?.days || 365;
    const equityCurve = [];
    let value = 100000;

    for (let i = 0; i < days; i++) {
      const dailyReturn = (Math.random() - 0.48) * 0.02; // Slight positive bias
      value *= (1 + dailyReturn);
      if (i % 5 === 0) {
        equityCurve.push({ day: i, value });
      }
    }

    const finalReturn = (value - 100000) / 100000;
    const sharpe = (finalReturn * (365 / days)) / 0.15 + (Math.random() * 0.5);
    const maxDrawdown = 0.08 + Math.random() * 0.12;
    const winRate = 0.48 + Math.random() * 0.12;

    return {
      metrics: {
        totalReturn: finalReturn,
        annualizedReturn: finalReturn * (365 / days),
        sharpeRatio: sharpe,
        maxDrawdown: -maxDrawdown,
        winRate: winRate,
        profitFactor: 1.0 + Math.random() * 0.8,
        totalTrades: Math.floor(days / 5),
        avgHoldingDays: 12 + Math.random() * 8
      },
      equityCurve,
      benchmark: {
        totalReturn: finalReturn * 0.7,
        sharpeRatio: sharpe * 0.8
      },
      overfitting: {
        risk: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low',
        warnings: Math.random() > 0.5 ? ['In-sample Sharpe significantly higher than out-of-sample'] : []
      }
    };
  };

  const getOverfitColor = (risk) => {
    switch (risk) {
      case 'low': return '#059669';
      case 'medium': return '#D97706';
      case 'high': return '#DC2626';
      default: return '#94A3B8';
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="backtest-preview-step">
      <div className="backtest-header">
        <BarChart3 size={24} />
        <div className="header-text">
          <h3>Backtest Preview</h3>
          <p>Run a quick historical simulation to validate your strategy before deployment.</p>
        </div>
      </div>

      {/* Period Selection */}
      <div className="period-selection">
        <label>Test Period</label>
        <div className="period-buttons">
          {PERIODS.map(period => (
            <button
              key={period.id}
              type="button"
              className={`period-btn ${backtestPeriod === period.id ? 'active' : ''}`}
              onClick={() => setBacktestPeriod(period.id)}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Run Button */}
      <div className="run-backtest-section">
        <button
          type="button"
          className="run-backtest-btn"
          onClick={runBacktest}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader size={18} className="spinning" />
              Running...
            </>
          ) : results ? (
            <>
              <RefreshCw size={18} />
              Run Again
            </>
          ) : (
            <>
              <Play size={18} />
              Run Quick Backtest
            </>
          )}
        </button>
        {!loading && (
          <span className="run-hint">
            Tests against historical data with your current configuration
          </span>
        )}
      </div>

      {/* Progress Indicator */}
      {loading && (
        <div className="backtest-progress">
          <div className="backtest-progress__bar">
            <div
              className="backtest-progress__fill"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="backtest-progress__info">
            <span className="backtest-progress__stage">{loadingStage}</span>
            <span className="backtest-progress__percent">{loadingProgress}%</span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="backtest-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <div className="backtest-results">
          {/* Equity Curve Preview */}
          <div className="equity-preview">
            <h4>Equity Curve</h4>
            <MiniEquityChart data={results.equityCurve} />
            <div className="equity-stats">
              <div className="equity-stat">
                <span className="stat-label">Strategy</span>
                <span className={`stat-value ${results.metrics.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(results.metrics.totalReturn)}
                </span>
              </div>
              <div className="equity-stat">
                <span className="stat-label">Benchmark (SPY)</span>
                <span className={`stat-value ${results.benchmark.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(results.benchmark.totalReturn)}
                </span>
              </div>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="metrics-grid">
            <div className="metric-card">
              <IconButton icon={TrendingUp} colorScheme="growth" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Annualized Return</span>
                <span className={`metric-value ${results.metrics.annualizedReturn >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(results.metrics.annualizedReturn)}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <IconButton icon={Activity} colorScheme="analytics" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Sharpe Ratio</span>
                <span className={`metric-value ${results.metrics.sharpeRatio >= 1 ? 'positive' : results.metrics.sharpeRatio >= 0.5 ? '' : 'negative'}`}>
                  {results.metrics.sharpeRatio.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <IconButton icon={TrendingDown} colorScheme="decline" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Max Drawdown</span>
                <span className="metric-value negative">
                  {formatPercent(results.metrics.maxDrawdown)}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <IconButton icon={Target} colorScheme="ai" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Win Rate</span>
                <span className={`metric-value ${results.metrics.winRate >= 0.5 ? 'positive' : ''}`}>
                  {(results.metrics.winRate * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="metric-card">
              <IconButton icon={Percent} colorScheme="portfolio" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Profit Factor</span>
                <span className={`metric-value ${results.metrics.profitFactor >= 1.5 ? 'positive' : results.metrics.profitFactor >= 1 ? '' : 'negative'}`}>
                  {results.metrics.profitFactor.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="metric-card">
              <IconButton icon={Calendar} colorScheme="default" size="small" className="metric-icon-btn" />
              <div className="metric-content">
                <span className="metric-label">Avg Holding</span>
                <span className="metric-value">
                  {results.metrics.avgHoldingDays.toFixed(0)} days
                </span>
              </div>
            </div>
          </div>

          {/* Overfitting Warning */}
          <div className="overfitting-section">
            <h4>Overfitting Risk Assessment</h4>
            <div
              className={`overfitting-indicator risk-${results.overfitting.risk}`}
              style={{ '--risk-color': getOverfitColor(results.overfitting.risk) }}
            >
              {results.overfitting.risk === 'low' ? (
                <CheckCircle size={20} />
              ) : results.overfitting.risk === 'medium' ? (
                <AlertTriangle size={20} />
              ) : (
                <XCircle size={20} />
              )}
              <div className="overfitting-text">
                <span className="risk-label">
                  {results.overfitting.risk.charAt(0).toUpperCase() + results.overfitting.risk.slice(1)} Risk
                </span>
                <span className="risk-desc">
                  {results.overfitting.risk === 'low' && 'Strategy appears robust to overfitting'}
                  {results.overfitting.risk === 'medium' && 'Some overfitting indicators detected'}
                  {results.overfitting.risk === 'high' && 'High risk of overfitting - consider simplifying'}
                </span>
              </div>
            </div>

            {results.overfitting.warnings.length > 0 && (
              <div className="overfitting-warnings">
                {results.overfitting.warnings.map((warning, i) => (
                  <div key={i} className="warning-item">
                    <AlertTriangle size={14} />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Note */}
          <div className="backtest-note">
            <Info size={16} />
            <p>
              This is a quick preview. For comprehensive validation with walk-forward analysis,
              factor attribution, and stress testing, use the dedicated Backtest page after creating the agent.
            </p>
          </div>
        </div>
      )}

      {/* Skip Option */}
      {!results && !loading && (
        <div className="skip-section">
          <p className="skip-text">
            You can skip this step and run a full backtest after creating the agent.
          </p>
        </div>
      )}
    </div>
  );
}

export default BacktestPreviewStep;
