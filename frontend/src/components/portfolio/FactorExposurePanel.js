// frontend/src/components/portfolio/FactorExposurePanel.js
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, PieChart, TrendingUp, DollarSign, Activity, RefreshCw, BarChart3, Info } from '../icons';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { simulateAPI, factorsAPI } from '../../services/api';
import { useAskAI } from '../../hooks';
import './SimulationPanels.css';

// Factor definitions for tooltips - plain English explanations
const FACTOR_DEFINITIONS = {
  // Portfolio Factor Tab
  marketBeta: {
    name: 'Market Beta',
    short: 'Sensitivity to market movements',
    long: 'Measures how much the portfolio moves relative to the overall market. Beta of 1 means it moves with the market; >1 means more volatile; <1 means less volatile.'
  },
  sizeTilt: {
    name: 'Size Tilt',
    short: 'Large vs small company exposure',
    long: 'Indicates whether the portfolio tilts toward large-cap (positive) or small-cap (negative) stocks. Small caps historically have higher returns but more risk.'
  },
  valueTilt: {
    name: 'Value Tilt',
    short: 'Cheap vs expensive stocks',
    long: 'Measures exposure to value stocks (low P/E, high book/market) vs growth stocks. Positive = value bias, negative = growth bias. Value stocks are "cheap" relative to fundamentals.'
  },
  momentum: {
    name: 'Momentum',
    short: 'Recent price trend following',
    long: 'Exposure to stocks with strong recent returns (winners) vs poor returns (losers). Momentum factor captures the tendency for winners to keep winning short-term.'
  },
  quality: {
    name: 'Quality',
    short: 'Profitable, stable companies',
    long: 'Based on ROE, profit margins, and earnings stability. High quality companies have consistent profitability and lower bankruptcy risk.'
  },
  volatility: {
    name: 'Volatility',
    short: 'Price variation intensity',
    long: 'Annualized standard deviation of returns. Higher volatility = larger price swings and more risk. Lower volatility portfolios historically provide better risk-adjusted returns.'
  },
  liquidity: {
    name: 'Liquidity',
    short: 'Ease of trading',
    long: 'Based on trading volume and turnover. High liquidity means positions can be entered/exited easily without moving the price. Low liquidity can trap capital.'
  },
  // Fama-French factors
  market: {
    name: 'Market (MKT)',
    short: 'Overall market exposure',
    long: 'The market risk premium - excess return of stocks over risk-free rate. This is your baseline equity exposure.'
  },
  smb: {
    name: 'Size (SMB)',
    short: 'Small Minus Big',
    long: 'Return difference between small and large cap stocks. Positive exposure means tilted toward smaller companies which historically outperform large caps.'
  },
  hml: {
    name: 'Value (HML)',
    short: 'High Minus Low book-to-market',
    long: 'Return difference between value and growth stocks. Positive = value tilt (cheap stocks). The value premium has been weak recently but historically significant.'
  },
  umd: {
    name: 'Momentum (UMD)',
    short: 'Up Minus Down',
    long: 'Return difference between recent winners and losers. Positive = riding momentum trends. Can be volatile and subject to "momentum crashes."'
  },
  qmj: {
    name: 'Quality (QMJ)',
    short: 'Quality Minus Junk',
    long: 'Return difference between high-quality (profitable, stable) and low-quality (unprofitable, risky) stocks. Quality factor provides defensive characteristics.'
  },
  bab: {
    name: 'Low Volatility (BAB)',
    short: 'Betting Against Beta',
    long: 'Exploits the low-volatility anomaly - low-beta stocks historically beat high-beta stocks on risk-adjusted basis. Positive = defensive, lower-risk positioning.'
  }
};

// Tooltip component with hover info
const FactorTooltip = ({ factorKey }) => {
  const definition = FACTOR_DEFINITIONS[factorKey];
  if (!definition) return null;

  return (
    <span className="factor-tooltip-wrapper">
      <Info size={14} className="factor-info-icon" />
      <span className="factor-tooltip-content">
        <strong>{definition.name}</strong>
        <em>{definition.short}</em>
        <span>{definition.long}</span>
      </span>
    </span>
  );
};

function FactorExposurePanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [factorData, setFactorData] = useState(null);
  const [diversification, setDiversification] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [incomeProjection, setIncomeProjection] = useState(null);
  const [famaFrenchData, setFamaFrenchData] = useState(null);
  const [factorReturns, setFactorReturns] = useState(null);
  const [activeTab, setActiveTab] = useState('factors');
  const [error, setError] = useState(null);

  // Ask AI context for factor exposure panel
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'factor_exposure',
    label: 'Factor Exposure Analysis',
    marketBeta: factorData?.beta,
    valueTilt: factorData?.valueTilt,
    sizeTilt: factorData?.sizeTilt,
    momentum: factorData?.momentum,
    quality: factorData?.quality,
    diversificationScore: diversification?.score,
    concentrationRisk: diversification?.concentrationRisk
  }));

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [factorRes, divRes, corrRes, incomeRes, ffRes, returnsRes] = await Promise.all([
        simulateAPI.getFactorExposure(parseInt(portfolioId)),
        simulateAPI.getDiversification(parseInt(portfolioId)),
        simulateAPI.getCorrelation(parseInt(portfolioId)),
        simulateAPI.getIncomeProjection(parseInt(portfolioId), 10, 5),
        factorsAPI.getFamaFrenchExposures(parseInt(portfolioId)).catch(() => null),
        factorsAPI.getFactorReturns({}).catch(() => null)
      ]);

      setFactorData(factorRes.data.data || factorRes.data);
      setDiversification(divRes.data.data || divRes.data);
      setCorrelation(corrRes.data.data || corrRes.data);
      setIncomeProjection(incomeRes.data.data || incomeRes.data);
      setFamaFrenchData(ffRes?.data?.data || null);
      setFactorReturns(returnsRes?.data?.data || null);
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(1)}%`;
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'var(--success-color)';
    if (score >= 60) return 'var(--positive)';
    if (score >= 40) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  const getExposureBar = (value, min = -1, max = 1) => {
    const normalized = ((value - min) / (max - min)) * 100;
    const center = ((0 - min) / (max - min)) * 100;
    const width = Math.abs(normalized - center);
    const left = normalized < center ? normalized : center;

    return (
      <div className="exposure-bar">
        <div className="exposure-track">
          <div className="exposure-center" style={{ left: `${center}%` }} />
          <div
            className={`exposure-fill ${value >= 0 ? 'positive' : 'negative'}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        <span className="exposure-value">{value?.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div className="simulation-panel factor-panel" {...askAIProps}>
      <div className="panel-header">
        <h3>Portfolio Analytics</h3>
        <p className="panel-description">
          Factor exposures, diversification analysis, and income projections
        </p>
        <button className="btn-icon refresh-btn" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="panel-content">
        {/* Tab Navigation */}
        <div className="analytics-tabs">
          <button
            className={`tab-btn ${activeTab === 'factors' ? 'active' : ''}`}
            onClick={() => setActiveTab('factors')}
          >
            <Activity size={16} />
            Factor Exposure
          </button>
          <button
            className={`tab-btn ${activeTab === 'diversification' ? 'active' : ''}`}
            onClick={() => setActiveTab('diversification')}
          >
            <PieChart size={16} />
            Diversification
          </button>
          <button
            className={`tab-btn ${activeTab === 'correlation' ? 'active' : ''}`}
            onClick={() => setActiveTab('correlation')}
          >
            <TrendingUp size={16} />
            Correlation
          </button>
          <button
            className={`tab-btn ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => setActiveTab('income')}
          >
            <DollarSign size={16} />
            Income
          </button>
          <button
            className={`tab-btn ${activeTab === 'famafrench' ? 'active' : ''}`}
            onClick={() => setActiveTab('famafrench')}
          >
            <BarChart3 size={16} />
            Fama-French
          </button>
        </div>

        {loading && (
          <div className="loading-state">
            <Loader className="spinning" size={24} />
            <span>Loading analytics...</span>
          </div>
        )}

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Factor Exposure Tab */}
            {activeTab === 'factors' && factorData && (
              <div className="tab-content">
                <div className="style-box-section">
                  <h4>Style Box</h4>
                  <div className="style-box">
                    {['Large', 'Mid', 'Small'].map(size => (
                      <div key={size} className="style-row">
                        {['Value', 'Blend', 'Growth'].map(style => {
                          const isActive = factorData.styleBox?.size === size &&
                                          factorData.styleBox?.style === style;
                          return (
                            <div
                              key={style}
                              className={`style-cell ${isActive ? 'active' : ''}`}
                            >
                              {isActive && <div className="style-marker" />}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <div className="style-labels-x">
                      <span>Value</span>
                      <span>Blend</span>
                      <span>Growth</span>
                    </div>
                  </div>
                  <div className="style-labels-y">
                    <span>Large</span>
                    <span>Mid</span>
                    <span>Small</span>
                  </div>
                </div>

                <div className="factors-grid">
                  <div className="factor-item">
                    <span className="factor-name">Market Beta <FactorTooltip factorKey="marketBeta" /></span>
                    {getExposureBar(factorData.beta, 0, 2)}
                    <span className="factor-hint">
                      {factorData.beta > 1 ? 'More volatile than market' : 'Less volatile than market'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Size Tilt <FactorTooltip factorKey="sizeTilt" /></span>
                    {getExposureBar(factorData.sizeTilt, -1, 1)}
                    <span className="factor-hint">
                      {factorData.sizeTilt > 0 ? 'Large cap bias' : 'Small cap bias'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Value Tilt <FactorTooltip factorKey="valueTilt" /></span>
                    {getExposureBar(factorData.valueTilt, -1, 1)}
                    <span className="factor-hint">
                      {factorData.valueTilt > 0 ? 'Value bias' : 'Growth bias'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Momentum <FactorTooltip factorKey="momentum" /></span>
                    {getExposureBar(factorData.momentum, -1, 1)}
                    <span className="factor-hint">
                      {factorData.momentum > 0 ? 'High momentum stocks' : 'Low momentum stocks'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Quality <FactorTooltip factorKey="quality" /></span>
                    {getExposureBar(factorData.quality, 0, 1)}
                    <span className="factor-hint">
                      Based on ROE and margins
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Volatility <FactorTooltip factorKey="volatility" /></span>
                    {getExposureBar(factorData.volatility, 0, 50)}
                    <span className="factor-hint">
                      Annualized portfolio volatility
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Liquidity <FactorTooltip factorKey="liquidity" /></span>
                    {getExposureBar(factorData.liquidity || 50, 0, 100)}
                    <span className="factor-hint">
                      Based on trading volume and turnover
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Diversification Tab */}
            {activeTab === 'diversification' && diversification && (
              <div className="tab-content">
                <div className="score-card">
                  <div className="score-circle" style={{ borderColor: getScoreColor(diversification.overallScore) }}>
                    <span className="score-value">{diversification.overallScore}</span>
                    <span className="score-label">/ 100</span>
                  </div>
                  <div className="score-info">
                    <span className="score-rating" style={{ color: getScoreColor(diversification.overallScore) }}>
                      {diversification.rating}
                    </span>
                    <span className="score-description">Diversification Score</span>
                  </div>
                </div>

                <div className="component-scores">
                  <h5>Score Breakdown</h5>
                  {diversification.components && Object.entries(diversification.components).map(([key, data]) => (
                    <div key={key} className="component-row">
                      <span className="component-name">{key.replace(/_/g, ' ')}</span>
                      <div className="component-bar">
                        <div
                          className="component-fill"
                          style={{
                            width: `${data.score}%`,
                            backgroundColor: getScoreColor(data.score)
                          }}
                        />
                      </div>
                      <span className="component-score">{data.score}</span>
                    </div>
                  ))}
                </div>

                {diversification.suggestions && diversification.suggestions.length > 0 && (
                  <div className="suggestions-section">
                    <h5>Suggestions for Improvement</h5>
                    <ul className="suggestions-list">
                      {diversification.suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Correlation Tab */}
            {activeTab === 'correlation' && correlation && (
              <div className="tab-content">
                <div className="correlation-stats">
                  <div className="stat-card">
                    <span className="stat-label">Average Correlation</span>
                    <span className="stat-value">{correlation.averageCorrelation?.toFixed(2)}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Highly Correlated Pairs</span>
                    <span className="stat-value">{correlation.highCorrelationCount || 0}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-label">Diversification Benefit</span>
                    <span className="stat-value">{formatPercent(correlation.diversificationBenefit)}</span>
                  </div>
                </div>

                {correlation.highCorrelationPairs && correlation.highCorrelationPairs.length > 0 && (
                  <div className="correlation-pairs">
                    <h5>Highly Correlated Pairs (&gt;0.7)</h5>
                    <div className="pairs-list">
                      {correlation.highCorrelationPairs.slice(0, 10).map((pair, i) => (
                        <div key={i} className="pair-item">
                          <span className="pair-symbols">{pair.symbol1} ↔ {pair.symbol2}</span>
                          <span
                            className="pair-correlation"
                            style={{ color: pair.correlation > 0.9 ? 'var(--danger-color)' : 'var(--warning-color)' }}
                          >
                            {pair.correlation.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {correlation.lowCorrelationPairs && correlation.lowCorrelationPairs.length > 0 && (
                  <div className="correlation-pairs">
                    <h5>Uncorrelated Pairs (&lt;0.3)</h5>
                    <div className="pairs-list">
                      {correlation.lowCorrelationPairs.slice(0, 5).map((pair, i) => (
                        <div key={i} className="pair-item">
                          <span className="pair-symbols">{pair.symbol1} ↔ {pair.symbol2}</span>
                          <span className="pair-correlation" style={{ color: 'var(--success-color)' }}>
                            {pair.correlation.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Income Tab */}
            {activeTab === 'income' && incomeProjection && (
              <div className="tab-content">
                <div className="income-summary">
                  <div className="income-card primary">
                    <span className="income-label">Current Annual Income</span>
                    <span className="income-value">
                      ${incomeProjection.currentAnnualIncome?.toLocaleString() || 0}
                    </span>
                    <span className="income-hint">
                      ${incomeProjection.currentMonthlyIncome?.toLocaleString() || 0}/month
                    </span>
                  </div>

                  <div className="income-card">
                    <span className="income-label">Dividend Yield</span>
                    <span className="income-value">
                      {formatPercent(incomeProjection.dividendYield)}
                    </span>
                  </div>

                  <div className="income-card">
                    <span className="income-label">Yield on Cost</span>
                    <span className="income-value">
                      {formatPercent(incomeProjection.yieldOnCost)}
                    </span>
                  </div>
                </div>

                {incomeProjection.projection && (
                  <div className="projection-section">
                    <h5>10-Year Income Projection (5% growth)</h5>
                    <div className="projection-chart">
                      {incomeProjection.projection.map((year, i) => (
                        <div key={i} className="projection-bar">
                          <div
                            className="bar-fill"
                            style={{
                              height: `${(year.income / incomeProjection.projection[9].income) * 100}%`
                            }}
                          />
                          <span className="bar-label">Y{i + 1}</span>
                          <span className="bar-value">${(year.income / 1000).toFixed(1)}k</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {incomeProjection.topDividendPayers && incomeProjection.topDividendPayers.length > 0 && (
                  <div className="top-payers">
                    <h5>Top Dividend Contributors</h5>
                    <div className="payers-list">
                      {incomeProjection.topDividendPayers.slice(0, 5).map((payer, i) => (
                        <div key={i} className="payer-item">
                          <span className="payer-symbol">{payer.symbol}</span>
                          <span className="payer-income">${payer.annualIncome?.toLocaleString()}</span>
                          <span className="payer-yield">{formatPercent(payer.yield)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fama-French Tab */}
            {activeTab === 'famafrench' && (
              <div className="tab-content famafrench-tab">
                {famaFrenchData ? (
                  <>
                    {/* Header Stats */}
                    <div className="ff-header-stats">
                      <div className="ff-stat">
                        <span className="ff-stat-label">Alpha</span>
                        <span className={`ff-stat-value ${(famaFrenchData.alpha || 0) >= 0 ? 'positive' : 'negative'}`}>
                          {((famaFrenchData.alpha || 0) * 100).toFixed(2)}%
                        </span>
                        <span className="ff-stat-hint">Annualized excess return</span>
                      </div>
                      <div className="ff-stat">
                        <span className="ff-stat-label">R²</span>
                        <span className="ff-stat-value">
                          {((famaFrenchData.rSquared || 0) * 100).toFixed(1)}%
                        </span>
                        <span className="ff-stat-hint">Model fit</span>
                      </div>
                      <div className="ff-stat">
                        <span className="ff-stat-label">Data Points</span>
                        <span className="ff-stat-value">
                          {famaFrenchData.dataPoints || 0}
                        </span>
                        <span className="ff-stat-hint">days</span>
                      </div>
                    </div>

                    {/* Factor Exposures */}
                    <div className="ff-exposures-section">
                      <h4>Factor Exposures (Regression-Based)</h4>
                      <div className="ff-factors-grid">
                        <div className="factor-item">
                          <span className="factor-name">Market (β) <FactorTooltip factorKey="market" /></span>
                          {getExposureBar(famaFrenchData.exposures?.market || 1, 0, 2)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.market || 1) > 1 ? 'High market exposure' : 'Defensive'}
                          </span>
                        </div>
                        <div className="factor-item">
                          <span className="factor-name">Size (SMB) <FactorTooltip factorKey="smb" /></span>
                          {getExposureBar(famaFrenchData.exposures?.smb || 0, -1, 1)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.smb || 0) > 0 ? 'Small cap tilt' : 'Large cap tilt'}
                          </span>
                        </div>
                        <div className="factor-item">
                          <span className="factor-name">Value (HML) <FactorTooltip factorKey="hml" /></span>
                          {getExposureBar(famaFrenchData.exposures?.hml || 0, -1, 1)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.hml || 0) > 0 ? 'Value bias' : 'Growth bias'}
                          </span>
                        </div>
                        <div className="factor-item">
                          <span className="factor-name">Momentum (UMD) <FactorTooltip factorKey="umd" /></span>
                          {getExposureBar(famaFrenchData.exposures?.umd || 0, -1, 1)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.umd || 0) > 0 ? 'Winners' : 'Losers/Contrarian'}
                          </span>
                        </div>
                        <div className="factor-item">
                          <span className="factor-name">Quality (QMJ) <FactorTooltip factorKey="qmj" /></span>
                          {getExposureBar(famaFrenchData.exposures?.qmj || 0, -1, 1)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.qmj || 0) > 0 ? 'High quality' : 'Speculative'}
                          </span>
                        </div>
                        <div className="factor-item">
                          <span className="factor-name">Low Vol (BAB) <FactorTooltip factorKey="bab" /></span>
                          {getExposureBar(famaFrenchData.exposures?.bab || 0, -1, 1)}
                          <span className="factor-hint">
                            {(famaFrenchData.exposures?.bab || 0) > 0 ? 'Low beta preference' : 'High beta preference'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Historical Factor Returns Chart */}
                    {factorReturns && factorReturns.length > 0 && (
                      <div className="ff-returns-section">
                        <h4>Cumulative Factor Returns</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={factorReturns}>
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => value?.slice(5) || ''}
                            />
                            <YAxis
                              tickFormatter={(v) => `${v.toFixed(0)}%`}
                              tick={{ fontSize: 11 }}
                              width={45}
                            />
                            <Tooltip
                              formatter={(value) => [`${value.toFixed(2)}%`]}
                              labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Legend />
                            <Line type="monotone" dataKey="mkt" stroke="#2563EB" name="Market" dot={false} strokeWidth={2} />
                            <Line type="monotone" dataKey="smb" stroke="#059669" name="Size" dot={false} strokeWidth={1.5} />
                            <Line type="monotone" dataKey="hml" stroke="#D97706" name="Value" dot={false} strokeWidth={1.5} />
                            <Line type="monotone" dataKey="umd" stroke="#7C3AED" name="Momentum" dot={false} strokeWidth={1.5} />
                            <Line type="monotone" dataKey="qmj" stroke="#0891B2" name="Quality" dot={false} strokeWidth={1.5} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Factor Statistics if available */}
                    {famaFrenchData.factorStats && (
                      <div className="ff-stats-section">
                        <h4>Factor Statistics (Annualized)</h4>
                        <div className="ff-stats-table">
                          <div className="ff-stats-header">
                            <span>Factor</span>
                            <span>Return</span>
                            <span>Volatility</span>
                            <span>Sharpe</span>
                          </div>
                          {Object.entries(famaFrenchData.factorStats).map(([factor, stats]) => (
                            <div key={factor} className="ff-stats-row">
                              <span className="factor-code">{factor.toUpperCase()}</span>
                              <span className={stats.mean >= 0 ? 'positive' : 'negative'}>
                                {(stats.mean * 100).toFixed(1)}%
                              </span>
                              <span>{(stats.volatility * 100).toFixed(1)}%</span>
                              <span className={stats.sharpe >= 0 ? 'positive' : 'negative'}>
                                {stats.sharpe.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="ff-no-data">
                    <AlertTriangle size={24} />
                    <p>Unable to calculate Fama-French exposures for this portfolio.</p>
                    <p className="hint">Ensure the portfolio has holdings with available factor data.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FactorExposurePanel;
