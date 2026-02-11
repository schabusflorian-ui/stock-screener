// frontend/src/components/research/QuantWorkbench/ICDashboard.js
// IC Analysis Dashboard - Test predictive power of factors

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Loader, AlertTriangle, Info, TrendingUp, Check, X, Clock } from '../../icons';
import { factorsAPI } from '../../../services/api';
import ICTimeSeriesChart from './ICTimeSeriesChart';

// ============================================================
// UNIFIED THRESHOLD CONSTANTS - Single source of truth
// ============================================================
const IC_THRESHOLDS = {
  STRONG: 0.05,    // 5% - Excellent signal, worth pursuing immediately
  GOOD: 0.03,      // 3% - Solid signal, worth further testing
  WEAK: 0.02,      // 2% - Detectable but weak, combine with other factors
  NOISE: 0.01      // 1% - Below this is likely noise
};

const TSTAT_THRESHOLD = 2.0;      // Statistical significance (95% confidence)
const UNIQUENESS_THRESHOLD = 0.3; // 30% uniqueness minimum
const ICIR_THRESHOLD = 0.3;       // IC Information Ratio threshold

export default function ICDashboard({ factor, preloadedResults, triggerAnalysis = 0 }) {
  const [formula, setFormula] = useState('');
  const [icResults, setICResults] = useState(null);
  const [correlations, setCorrelations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load preloaded results from one-click analysis
  useEffect(() => {
    if (preloadedResults) {
      if (preloadedResults.icResults) {
        setICResults(preloadedResults.icResults);
      }
      if (preloadedResults.correlations) {
        setCorrelations(preloadedResults.correlations);
      }
    }
  }, [preloadedResults]);

  // Set formula when factor changes
  useEffect(() => {
    if (factor?.formula) {
      setFormula(factor.formula);
    }
  }, [factor]);

  // Auto-run analysis when triggered centrally
  useEffect(() => {
    if (triggerAnalysis > 0 && factor?.formula) {
      runFullAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerAnalysis]);

  // Run unified analysis (IC + Correlations together)
  const runFullAnalysis = async () => {
    if (!formula.trim()) return;

    setLoading(true);
    setError(null);
    setICResults(null);
    setCorrelations(null);

    try {
      // Run IC and Correlation analysis in parallel
      const [icRes, corrRes] = await Promise.all([
        factorsAPI.icAnalysis({
          factorId: factor?.id,
          formula,
          horizons: [1, 5, 21, 63, 126, 252]
        }),
        factorsAPI.correlation({ formula })
      ]);

      const icData = icRes.data;
      const corrData = corrRes.data;

      // Check standardized response format
      if (!icData.success) {
        throw new Error(icData.error || 'IC analysis failed');
      }

      setICResults(icData.data);

      // Correlations are optional - don't fail if they don't work
      if (corrData.success) {
        setCorrelations(corrData.data);
      } else {
        console.warn('Correlation analysis failed:', corrData.error);
        // Don't throw - correlations are supplementary
      }

    } catch (err) {
      console.error('IC Analysis error:', err);
      const isDemoMode = err?.originalError?.response?.data?.code === 'QUANT_LAB_POSTGRES_UNSUPPORTED';
      setError(isDemoMode ? 'Demo mode: Quant Lab analysis is not available on this deployment. Showing sample data.' : (err.message || 'Failed to run IC analysis'));
    } finally {
      setLoading(false);
    }
  };

  // Prepare IC chart data
  const icChartData = icResults?.ic?.icByHorizon
    ? Object.entries(icResults.ic.icByHorizon).map(([horizon, value]) => ({
        horizon: `${horizon}d`,
        ic: value,
        significant: Math.abs(value) > 0.02
      }))
    : [];

  // Prepare correlation chart data
  const corrChartData = correlations?.correlations
    ? Object.entries(correlations.correlations)
        .filter(([_, v]) => v !== null)
        .map(([factor, corr]) => ({
          factor: factor.charAt(0).toUpperCase() + factor.slice(1),
          correlation: corr,
          absCorr: Math.abs(corr)
        }))
        .sort((a, b) => b.absCorr - a.absCorr)
    : [];

  // Baseline IC values for comparison
  const BASELINE_IC = {
    value: 0.025,
    momentum: 0.035,
    quality: 0.020,
    size: 0.015
  };

  // Get traffic light color based on IC value - uses unified thresholds
  const getTrafficLight = (ic) => {
    const absIC = Math.abs(ic || 0);
    if (absIC >= IC_THRESHOLDS.GOOD) return 'green';      // 3%+ is green
    if (absIC >= IC_THRESHOLDS.WEAK) return 'yellow';     // 2%+ is yellow
    return 'red';                                          // Below 2% is red
  };

  // Get unified signal quality assessment
  // Primary factors: IC magnitude + statistical significance
  // Secondary factor: uniqueness (bonus, not gatekeeper)
  const getSignalQuality = () => {
    if (!icResults?.ic) return null;

    const ic21d = icResults.ic.icByHorizon?.[21] || 0;
    const absIC = Math.abs(ic21d);
    const tstat = Math.abs(icResults.ic.tstat || 0);
    const uniqueness = correlations?.uniquenessScore;
    const hasUniquenessData = uniqueness !== undefined && uniqueness !== null;

    // Strong: Excellent IC (>= 5%) + statistically significant (t >= 2)
    // Uniqueness is a bonus indicator, not a gatekeeper
    if (absIC >= IC_THRESHOLDS.STRONG && tstat >= TSTAT_THRESHOLD) {
      const isUnique = !hasUniquenessData || uniqueness >= 0.5;
      return {
        level: 'strong',
        label: 'Strong Signal',
        color: 'var(--positive)',
        verdict: isUnique
          ? 'Worth pursuing - deploy to production'
          : 'Strong but correlated with existing factors - still worth testing'
      };
    }

    // Good: Solid IC (>= 3%) + reasonably significant (t >= 1.5)
    if (absIC >= IC_THRESHOLDS.GOOD && tstat >= 1.5) {
      const isUnique = !hasUniquenessData || uniqueness >= UNIQUENESS_THRESHOLD;
      return {
        level: 'moderate',
        label: 'Good Signal',
        color: 'var(--warning)',
        verdict: isUnique
          ? 'Worth testing further - validate with backtest'
          : 'Good signal but may overlap with existing factors'
      };
    }

    // Decent IC but low t-stat: promising but not statistically robust
    if (absIC >= IC_THRESHOLDS.GOOD) {
      return {
        level: 'moderate',
        label: 'Promising Signal',
        color: 'var(--warning)',
        verdict: 'Good IC but low statistical significance - needs more data'
      };
    }

    // Weak: Detectable IC (>= 2%) but below "good" threshold
    if (absIC >= IC_THRESHOLDS.WEAK) {
      return {
        level: 'weak',
        label: 'Weak Signal',
        color: 'var(--text-secondary)',
        verdict: 'Consider combining with other factors'
      };
    }

    // No signal
    return {
      level: 'none',
      label: 'No Signal',
      color: 'var(--negative)',
      verdict: 'Likely noise - try different metrics'
    };
  };

  // Get plain English summary - uses unified thresholds
  const getPlainEnglishSummary = () => {
    if (!icResults?.ic) return null;

    const ic21d = icResults.ic.icByHorizon?.[21] || 0;
    const absIC = Math.abs(ic21d);
    const isInverse = ic21d < 0;
    const direction = isInverse ? 'underperform' : 'outperform';
    const bestHorizon = Object.entries(icResults.ic.icByHorizon || {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

    let headline = '';
    let details = '';

    if (absIC >= IC_THRESHOLDS.GOOD) {
      headline = 'This factor has meaningful predictive power';
      details = `Stocks ranking high on this factor tend to ${direction} over 21 days. The signal is ${isInverse ? 'inverse' : 'positive'} (${isInverse ? 'lower' : 'higher'} values predict better returns).`;
    } else if (absIC >= IC_THRESHOLDS.WEAK) {
      headline = 'This factor shows weak but detectable signal';
      details = `There's a slight tendency for high-scoring stocks to ${direction}, but the effect may not be strong enough to use alone.`;
    } else {
      headline = 'This factor shows no meaningful predictive pattern';
      details = 'The relationship between factor scores and future returns appears random. Consider revising the formula.';
    }

    return { headline, details, bestHorizon };
  };

  const signalQuality = getSignalQuality();
  const plainEnglish = getPlainEnglishSummary();

  // Empty state when no factor selected
  if (!factor) {
    return (
      <div className="ic-dashboard">
        <div className="test-empty-state">
          <TrendingUp size={32} className="empty-icon" />
          <h4>Select a Factor</h4>
          <p>Choose a factor from the panel above to analyze its Information Coefficient and predictive power.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ic-dashboard">
      {/* Loading State */}
      {loading && (
        <div className="analysis-loading-bar">
          <div className="loading-content">
            <Loader size={16} className="spin" />
            <span>Running IC Analysis...</span>
          </div>
          <div className="loading-progress" />
        </div>
      )}

      {error && (
        <div className="ic-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Results */}
      {icResults && (
        <div className="ic-results">
          {/* Top Row: Verdict + Summary Cards */}
          <div className="ic-top-row">
            {/* Traffic Light Verdict */}
            <div className={`ic-verdict-card ${signalQuality?.level || 'none'}`}>
              <div className="verdict-label">Overall Verdict</div>
              <div className={`traffic-light ${getTrafficLight(icResults.ic?.icByHorizon?.[21])}`}>
                <span className="traffic-light-dot"></span>
                <span>{signalQuality?.label || 'No Signal'}</span>
              </div>
              <div className="verdict-description">{signalQuality?.verdict}</div>
            </div>

            {/* Summary Cards - Color based on meaningful thresholds, not just sign */}
            <div className="ic-summary">
              <div className="summary-card">
                <span className="card-label">IC (21-day)</span>
                <span className={`card-value ${
                  Math.abs(icResults.ic?.icByHorizon?.[21] || 0) >= IC_THRESHOLDS.GOOD ? 'positive' :
                  Math.abs(icResults.ic?.icByHorizon?.[21] || 0) >= IC_THRESHOLDS.WEAK ? 'moderate' : 'muted'
                }`}>
                  {(icResults.ic?.icByHorizon?.[21] * 100)?.toFixed(2)}%
                </span>
                <span className="card-baseline">Good if |IC| ≥ 3%</span>
              </div>
              <div className="summary-card">
                <span className="card-label">T-Statistic</span>
                <span className={`card-value ${Math.abs(icResults.ic?.tstat || 0) >= TSTAT_THRESHOLD ? 'positive' : 'muted'}`}>
                  {icResults.ic?.tstat?.toFixed(2)}
                </span>
                <span className="card-baseline">Need |t| ≥ 2.0</span>
              </div>
              <div className="summary-card">
                <span className="card-label">IC IR</span>
                <span className={`card-value ${(icResults.ic?.icIR || 0) >= 0.5 ? 'positive' : (icResults.ic?.icIR || 0) >= ICIR_THRESHOLD ? 'moderate' : 'muted'}`}>
                  {icResults.ic?.icIR?.toFixed(2)}
                </span>
                <span className="card-baseline">Good if ≥ 0.5</span>
              </div>
              <div className="summary-card">
                <span className="card-label">Universe Size</span>
                <span className="card-value">
                  {icResults.universeSize?.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Plain English Summary */}
          {plainEnglish && (
            <div className="plain-english-summary">
              <div className="summary-headline">{plainEnglish.headline}</div>
              <div className="summary-details">{plainEnglish.details}</div>
              {plainEnglish.bestHorizon && (
                <div className="summary-baseline">
                  Best horizon: {plainEnglish.bestHorizon[0]} days (IC: {(plainEnglish.bestHorizon[1] * 100).toFixed(2)}%)
                  {' • '}Typical Value factor IC: ~2.5% • Momentum: ~3.5%
                </div>
              )}
            </div>
          )}

          {/* IC by Horizon Chart */}
          <div className="ic-chart-section">
            <h4>IC by Horizon</h4>
            <p className="chart-description">
              Information Coefficient measures predictive power. |IC| ≥ 3% is good (green), |IC| ≥ 5% is strong.
            </p>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={icChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="horizon" tick={{ fontSize: 12 }} />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                  tick={{ fontSize: 12 }}
                  domain={[-0.1, 0.1]}
                />
                <Tooltip
                  formatter={(value) => [`${(value * 100).toFixed(2)}%`, 'IC']}
                  wrapperClassName="prism-chart-tooltip"
                />
                <ReferenceLine y={0} stroke="var(--text-secondary)" />
                <ReferenceLine y={0.02} stroke="var(--positive)" strokeDasharray="3 3" label="Strong" />
                <ReferenceLine y={-0.02} stroke="var(--positive)" strokeDasharray="3 3" />
                <Bar
                  dataKey="ic"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* IC Time Series Chart */}
          {factor?.id && (
            <div className="ic-time-series-section">
              <div className="section-header">
                <Clock size={18} />
                <h4>IC Stability Over Time</h4>
              </div>
              <p className="chart-description">
                Rolling IC shows how consistently the factor predicts returns. Stable IC indicates robust signal.
              </p>
              <ICTimeSeriesChart
                factorId={factor.id}
                formula={formula}
                horizon={21}
                showRegimes={true}
                showConfidenceBands={false}
                height={280}
              />
            </div>
          )}

          {/* Comparison Table */}
          <div className="ic-comparison-section">
            <h4>Factor Comparison</h4>
            <p className="chart-description">How does your factor stack up against standard factors?</p>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Factor</th>
                  <th>IC (21d)</th>
                  <th>T-Stat</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                <tr className="your-factor">
                  <td><strong>Your Factor</strong></td>
                  <td className={getTrafficLight(icResults.ic?.icByHorizon?.[21])}>
                    {((icResults.ic?.icByHorizon?.[21] || 0) * 100).toFixed(2)}%
                  </td>
                  <td className={Math.abs(icResults.ic?.tstat || 0) > 2 ? 'green' : 'yellow'}>
                    {icResults.ic?.tstat?.toFixed(2) || '-'}
                  </td>
                  <td>{signalQuality?.label || '-'}</td>
                </tr>
                <tr className="baseline">
                  <td>Value (1/P/E)</td>
                  <td>~2.5%</td>
                  <td>~1.8</td>
                  <td className="moderate-text">Moderate</td>
                </tr>
                <tr className="baseline">
                  <td>Momentum (12m)</td>
                  <td>~3.5%</td>
                  <td>~2.5</td>
                  <td className="strong-text">Strong</td>
                </tr>
                <tr className="baseline">
                  <td>Quality (ROE)</td>
                  <td>~2.0%</td>
                  <td>~1.5</td>
                  <td className="weak-text">Weak</td>
                </tr>
                <tr className="baseline">
                  <td>Size (Small Cap)</td>
                  <td>~1.5%</td>
                  <td>~1.2</td>
                  <td className="weak-text">Weak</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Interpretation - Uses unified thresholds with Math.abs for inverse factors */}
          <div className="ic-interpretation">
            <Info size={16} />
            <div>
              <strong>What this means:</strong>
              {(() => {
                const ic = icResults.ic?.icByHorizon?.[21] || 0;
                const absIC = Math.abs(ic);
                const isInverse = ic < 0;
                const direction = isInverse ? 'underperform' : 'outperform';

                if (absIC >= IC_THRESHOLDS.GOOD) {
                  return (
                    <p>
                      This factor shows meaningful predictive power at the 21-day horizon.
                      Stocks with {isInverse ? 'lower' : 'higher'} factor values tend to {direction}.
                      {isInverse && ' (Inverse factor - consider flipping the formula sign.)'}
                    </p>
                  );
                } else if (absIC >= IC_THRESHOLDS.WEAK) {
                  return (
                    <p>
                      This factor shows weak but detectable predictive power.
                      Consider combining with other factors or testing on different universes.
                    </p>
                  );
                } else {
                  return (
                    <p>
                      This factor shows no meaningful predictive power (IC &lt; {(IC_THRESHOLDS.WEAK * 100).toFixed(0)}%).
                      The relationship appears random. Review the formula or try different metrics.
                    </p>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Correlation Results */}
      {correlations && (
        <div className="correlation-results">
          <h4>Factor Correlations</h4>
          <p className="chart-description">
            Correlations with standard factors. High correlation (&gt;0.7) means your factor may not add new information.
          </p>

          {/* Uniqueness Score */}
          <div className="uniqueness-display">
            <div className="uniqueness-score">
              <span className="score-label">Uniqueness Score</span>
              <span className={`score-value ${
                correlations.uniquenessScore > 0.7 ? 'positive' :
                correlations.uniquenessScore > 0.4 ? 'moderate' : 'negative'
              }`}>
                {(correlations.uniquenessScore * 100).toFixed(0)}%
              </span>
            </div>
            <p className="uniqueness-interpretation">
              {correlations.interpretation}
              {correlations.mostSimilarFactor && (
                <span> Most similar to: <strong>{correlations.mostSimilarFactor}</strong> ({(correlations.mostSimilarCorrelation * 100).toFixed(0)}%)</span>
              )}
            </p>
          </div>

          {/* Correlation Chart */}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={corrChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis
                type="number"
                domain={[-1, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                type="category"
                dataKey="factor"
                tick={{ fontSize: 12 }}
                width={80}
              />
              <Tooltip
                formatter={(value) => [`${(value * 100).toFixed(1)}%`, 'Correlation']}
                wrapperClassName="prism-chart-tooltip"
              />
              <ReferenceLine x={0} stroke="var(--text-secondary)" />
              <ReferenceLine x={0.7} stroke="var(--warning)" strokeDasharray="3 3" />
              <ReferenceLine x={-0.7} stroke="var(--warning)" strokeDasharray="3 3" />
              <Bar
                dataKey="correlation"
                fill="var(--color-primary)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Analysis Checklist */}
      {(icResults || correlations) && (
        <div className="analysis-checklist">
          <h4>Signal Quality Checklist</h4>
          <div className="checklist-items">
            {/* IC check - uses Math.abs and GOOD threshold (3%) to match traffic light */}
            <div className={`checklist-item ${Math.abs(icResults?.ic?.icByHorizon?.[21] || 0) >= IC_THRESHOLDS.GOOD ? 'pass' : 'fail'}`}>
              {Math.abs(icResults?.ic?.icByHorizon?.[21] || 0) >= IC_THRESHOLDS.GOOD ? <Check size={16} /> : <X size={16} />}
              <span>|IC| ≥ 3% (Meaningful predictive power)</span>
            </div>
            {/* T-stat check - already uses Math.abs */}
            <div className={`checklist-item ${Math.abs(icResults?.ic?.tstat || 0) >= TSTAT_THRESHOLD ? 'pass' : 'fail'}`}>
              {Math.abs(icResults?.ic?.tstat || 0) >= TSTAT_THRESHOLD ? <Check size={16} /> : <X size={16} />}
              <span>|T-stat| ≥ 2 (Statistically significant)</span>
            </div>
            {/* Uniqueness - default to 0 when not available */}
            <div className={`checklist-item ${(correlations?.uniquenessScore ?? 0) >= UNIQUENESS_THRESHOLD ? 'pass' : correlations ? 'fail' : 'pending'}`}>
              {(correlations?.uniquenessScore ?? 0) >= UNIQUENESS_THRESHOLD ? <Check size={16} /> : <X size={16} />}
              <span>Uniqueness ≥ 30% (Adds new information)</span>
            </div>
            {/* IC IR check */}
            <div className={`checklist-item ${(icResults?.ic?.icIR || 0) >= ICIR_THRESHOLD ? 'pass' : 'fail'}`}>
              {(icResults?.ic?.icIR || 0) >= ICIR_THRESHOLD ? <Check size={16} /> : <X size={16} />}
              <span>IC IR ≥ 0.3 (Consistent signal)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
