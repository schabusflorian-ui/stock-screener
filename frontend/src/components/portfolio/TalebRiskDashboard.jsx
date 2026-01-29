// frontend/src/components/portfolio/TalebRiskDashboard.jsx
// Comprehensive Taleb-informed risk dashboard showing fat tail impact
import { useState } from 'react';
import { AlertTriangle, TrendingDown, Target, Shield, Zap, ChevronDown, ChevronUp, IconButton } from '../icons';
import './TalebRiskDashboard.css';

/**
 * Taleb Risk Dashboard
 * Shows side-by-side comparison of Normal vs Fat-Tail risk estimates
 * Highlights the danger of using Gaussian assumptions
 */
function TalebRiskDashboard({ distributionFit, moments, varComparison, simulationResults }) {
  const [expanded, setExpanded] = useState(true);

  if (!moments || !varComparison) return null;

  const kurtosis = moments.kurtosis || 3;
  const hasFatTails = kurtosis > 3.5;

  if (!hasFatTails) return null; // Only show for fat-tailed distributions

  // Calculate frequency amplification (how much more often extreme events occur)
  const calculateFrequencyAmplification = (kurt) => {
    // Heuristic: kurtosis 6 means 10x more frequent, kurtosis 9 means 100x
    return Math.pow(10, (kurt - 3) / 3);
  };

  const frequencyMultiplier = calculateFrequencyAmplification(kurtosis);

  // Risk comparisons
  const riskComparisons = [
    {
      metric: '95% Value at Risk',
      normal: varComparison.normalVaR * 100,
      fatTail: varComparison.adjustedVaR * 100,
      unit: '%',
      suffix: 'loss',
      interpretation: 'Expected worst loss (5% probability)',
      danger: varComparison.underestimationPct
    },
    {
      metric: '99% Value at Risk',
      normal: varComparison.normalVaR99 ? varComparison.normalVaR99 * 100 : (varComparison.normalVaR * 1.5) * 100,
      fatTail: varComparison.adjustedVaR99 ? varComparison.adjustedVaR99 * 100 : (varComparison.adjustedVaR * 1.5) * 100,
      unit: '%',
      suffix: 'loss',
      interpretation: 'Rare but not impossible (1% probability)',
      danger: varComparison.normalVaR99 && varComparison.adjustedVaR99
        ? ((Math.abs(varComparison.adjustedVaR99) - Math.abs(varComparison.normalVaR99)) / Math.abs(varComparison.normalVaR99)) * 100
        : varComparison.underestimationPct * 1.5
    },
    {
      metric: '5-Sigma Event Frequency',
      normal: 'Once per 13,932 years',
      fatTail: frequencyMultiplier > 100 ? 'Once per month' : frequencyMultiplier > 10 ? 'Once per year' : 'Once per 5 years',
      isText: true,
      interpretation: 'How often "impossible" events actually occur',
      danger: frequencyMultiplier > 10 ? 'HIGH' : 'MODERATE'
    }
  ];

  return (
    <div className="taleb-risk-dashboard">
      <div className="dashboard-header" onClick={() => setExpanded(!expanded)}>
        <div className="header-content">
          <AlertTriangle size={20} className="header-icon" />
          <div>
            <h3>Risk Model Comparison</h3>
            <p className="header-subtitle">
              Normal distribution vs. heavy-tailed distribution estimates
            </p>
          </div>
        </div>
        <button className="expand-btn">
          {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {expanded && (
        <div className="dashboard-content">
          {/* Main Insight */}
          <div className="main-insight">
            <Zap size={24} className="insight-icon" />
            <div className="insight-text">
              <strong>Key finding:</strong>
              <span>
                Your returns have kurtosis of <strong>{kurtosis.toFixed(2)}</strong> (normal = 3.0).
                With heavy-tailed distributions, extreme events occur approximately <strong>{frequencyMultiplier.toFixed(0)}x more frequently</strong> than
                normal distribution estimates. Standard models may significantly underestimate tail risk.
              </span>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="comparison-section">
            <div className="comparison-table">
              <div className="table-header">
                <div className="col-metric">Risk Metric</div>
                <div className="col-value normal-col">
                  <Shield size={16} />
                  Normal Model
                  <span className="col-subtitle">(What textbooks say)</span>
                </div>
                <div className="col-value reality-col">
                  <AlertTriangle size={16} />
                  Fat-Tail Reality
                  <span className="col-subtitle">(What actually happens)</span>
                </div>
                <div className="col-danger">
                  <TrendingDown size={16} />
                  Danger
                </div>
              </div>

              {riskComparisons.map((row, idx) => {
                const dangerLevel = row.danger === 'HIGH' || row.danger > 30 ? 'high' :
                                   row.danger === 'MODERATE' || row.danger > 15 ? 'moderate' : 'low';

                return (
                  <div key={idx} className="table-row">
                    <div className="col-metric">
                      <strong>{row.metric}</strong>
                      <span className="metric-hint">{row.interpretation}</span>
                    </div>

                    <div className="col-value normal-col">
                      {row.isText ? (
                        <span className="value-text">{row.normal}</span>
                      ) : (
                        <>
                          <span className="value-number">{Math.abs(row.normal).toFixed(2)}{row.unit}</span>
                          <span className="value-label">{row.suffix}</span>
                        </>
                      )}
                    </div>

                    <div className="col-value reality-col">
                      {row.isText ? (
                        <span className="value-text danger">{row.fatTail}</span>
                      ) : (
                        <>
                          <span className="value-number danger">{Math.abs(row.fatTail).toFixed(2)}{row.unit}</span>
                          <span className="value-label">{row.suffix}</span>
                        </>
                      )}
                    </div>

                    <div className={`col-danger ${dangerLevel}`}>
                      {row.isText ? (
                        <span className="danger-badge">{row.danger}</span>
                      ) : (
                        <>
                          <span className="danger-value">+{row.danger.toFixed(0)}%</span>
                          <span className="danger-label">worse</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual Comparison */}
          <div className="visual-comparison">
            <h4>Risk Underestimation Visualization</h4>
            <div className="comparison-bars">
              <div className="bar-row">
                <span className="bar-label">Normal Model VaR</span>
                <div className="bar-container">
                  <div
                    className="bar normal-bar"
                    style={{ width: '100%' }}
                  >
                    <span className="bar-value">{Math.abs(varComparison.normalVaR * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div className="bar-row">
                <span className="bar-label">Reality (Fat-Tail)</span>
                <div className="bar-container">
                  <div
                    className="bar reality-bar"
                    style={{
                      width: `${(Math.abs(varComparison.adjustedVaR) / Math.abs(varComparison.normalVaR)) * 100}%`
                    }}
                  >
                    <span className="bar-value">{Math.abs(varComparison.adjustedVaR * 100).toFixed(1)}%</span>
                  </div>
                  <span className="bar-extension">
                    {varComparison.underestimationPct.toFixed(0)}% worse than normal predicts
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Understanding Heavy Tails */}
          <div className="understanding-section">
            <h4>Understanding Heavy-Tailed Distributions</h4>
            <div className="info-cards">
              <div className="info-card">
                <strong>What it means</strong>
                <p>
                  Heavy-tailed distributions have more probability mass in the extremes compared to normal distributions.
                  Events that appear "impossible" under normal assumptions occur with meaningful frequency.
                </p>
              </div>

              <div className="info-card">
                <strong>Why it matters</strong>
                <p>
                  Single extreme events can dominate outcomes. The mean becomes less representative of typical experience,
                  and traditional risk metrics (like standard deviation) may not capture true risk.
                </p>
              </div>

              <div className="info-card highlight">
                <strong>How to adapt</strong>
                <p>
                  Use distributions that model tail behavior (Student's t), focus on percentiles rather than means,
                  and employ tail-aware risk metrics like CVaR and maximum drawdown.
                </p>
              </div>
            </div>
          </div>

          {/* Action Items */}
          <div className="action-items">
            <h4>Recommended Adjustments</h4>
            <div className="actions-grid">
              <div className="action-card">
                <IconButton icon={Target} colorScheme="ai" size="small" className="action-icon-btn" />
                <div className="action-content">
                  <strong>Use Parametric Distributions</strong>
                  <p>Switch to Student's t (df=4-5) or auto-fit distributions. Never use Normal for financial returns.</p>
                </div>
              </div>

              <div className="action-card">
                <IconButton icon={Shield} colorScheme="portfolio" size="small" className="action-icon-btn" />
                <div className="action-content">
                  <strong>Focus on Tail Metrics</strong>
                  <p>Use max drawdown, CVaR (Expected Shortfall), and percentiles. Ignore Sharpe ratio and standard deviation.</p>
                </div>
              </div>

              <div className="action-card">
                <IconButton icon={TrendingDown} colorScheme="decline" size="small" className="action-icon-btn" />
                <div className="action-content">
                  <strong>Reduce Position Sizes</strong>
                  <p>Use 50-75% of Kelly criterion. In fat-tailed domains, aggressive sizing leads to ruin.</p>
                </div>
              </div>

              <div className="action-card">
                <IconButton icon={AlertTriangle} colorScheme="risk" size="small" className="action-icon-btn" />
                <div className="action-content">
                  <strong>Plan for Worst Case</strong>
                  <p>Use 5th percentile, not median, for retirement planning. Assume the worst happens every 5-10 years.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Distribution Info Footer */}
          {distributionFit && (
            <div className="dashboard-footer">
              <div className="footer-item">
                <span className="footer-label">Fitted Distribution:</span>
                <span className="footer-value">{distributionFit.name || distributionFit.type}</span>
              </div>
              {distributionFit.params?.df && (
                <div className="footer-item">
                  <span className="footer-label">Degrees of Freedom:</span>
                  <span className="footer-value">{distributionFit.params.df.toFixed(1)}</span>
                  <span className="footer-hint">(df=4 is very fat, df=30 is near-normal)</span>
                </div>
              )}
              <div className="footer-item">
                <span className="footer-label">Excess Kurtosis:</span>
                <span className="footer-value">{(kurtosis - 3).toFixed(2)}</span>
                <span className="footer-hint">(Normal = 0)</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TalebRiskDashboard;
