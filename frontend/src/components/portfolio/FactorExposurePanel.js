// frontend/src/components/portfolio/FactorExposurePanel.js
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, PieChart, TrendingUp, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { simulateAPI } from '../../services/api';
import './SimulationPanels.css';

function FactorExposurePanel({ portfolioId }) {
  const [loading, setLoading] = useState(true);
  const [factorData, setFactorData] = useState(null);
  const [diversification, setDiversification] = useState(null);
  const [correlation, setCorrelation] = useState(null);
  const [incomeProjection, setIncomeProjection] = useState(null);
  const [activeTab, setActiveTab] = useState('factors');
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [factorRes, divRes, corrRes, incomeRes] = await Promise.all([
        simulateAPI.getFactorExposure(parseInt(portfolioId)),
        simulateAPI.getDiversification(parseInt(portfolioId)),
        simulateAPI.getCorrelation(parseInt(portfolioId)),
        simulateAPI.getIncomeProjection(parseInt(portfolioId), 10, 5)
      ]);

      setFactorData(factorRes.data.data || factorRes.data);
      setDiversification(divRes.data.data || divRes.data);
      setCorrelation(corrRes.data.data || corrRes.data);
      setIncomeProjection(incomeRes.data.data || incomeRes.data);
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
    if (score >= 60) return '#22c55e';
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
    <div className="simulation-panel factor-panel">
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
                    <span className="factor-name">Market Beta</span>
                    {getExposureBar(factorData.beta, 0, 2)}
                    <span className="factor-hint">
                      {factorData.beta > 1 ? 'More volatile than market' : 'Less volatile than market'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Size Tilt</span>
                    {getExposureBar(factorData.sizeTilt, -1, 1)}
                    <span className="factor-hint">
                      {factorData.sizeTilt > 0 ? 'Large cap bias' : 'Small cap bias'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Value Tilt</span>
                    {getExposureBar(factorData.valueTilt, -1, 1)}
                    <span className="factor-hint">
                      {factorData.valueTilt > 0 ? 'Value bias' : 'Growth bias'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Momentum</span>
                    {getExposureBar(factorData.momentum, -1, 1)}
                    <span className="factor-hint">
                      {factorData.momentum > 0 ? 'High momentum stocks' : 'Low momentum stocks'}
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Quality</span>
                    {getExposureBar(factorData.quality, 0, 1)}
                    <span className="factor-hint">
                      Based on ROE and margins
                    </span>
                  </div>

                  <div className="factor-item">
                    <span className="factor-name">Volatility</span>
                    {getExposureBar(factorData.volatility, 0, 50)}
                    <span className="factor-hint">
                      Annualized portfolio volatility
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
          </>
        )}
      </div>
    </div>
  );
}

export default FactorExposurePanel;
