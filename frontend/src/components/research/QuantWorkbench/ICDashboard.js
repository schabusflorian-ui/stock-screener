// frontend/src/components/research/QuantWorkbench/ICDashboard.js
// IC Analysis Dashboard - Test predictive power of factors

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Loader, AlertTriangle, Info, TrendingUp, Check, X, Play, Clock } from '../../icons';
import ICTimeSeriesChart from './ICTimeSeriesChart';

export default function ICDashboard({ factor, onFactorChange, preloadedResults }) {
  const [formula, setFormula] = useState('');
  const [icResults, setICResults] = useState(null);
  const [correlations, setCorrelations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userFactors, setUserFactors] = useState([]);

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

  // Load user factors for selection
  useEffect(() => {
    fetch('/api/factors/user')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUserFactors(data.data || []);
        }
      })
      .catch(err => console.error('Failed to load user factors:', err));
  }, []);

  // Set formula when factor changes
  useEffect(() => {
    if (factor?.formula) {
      setFormula(factor.formula);
    }
  }, [factor]);

  // Run unified analysis (IC + Correlations together)
  const runFullAnalysis = async () => {
    if (!formula.trim()) return;

    setLoading(true);
    setError(null);
    setICResults(null);
    setCorrelations(null);

    try {
      // Run IC and Correlation analysis in parallel
      const [icResponse, corrResponse] = await Promise.all([
        fetch('/api/factors/ic-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factorId: factor?.id,
            formula,
            horizons: [1, 5, 21, 63, 126, 252]
          })
        }),
        fetch('/api/factors/correlation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formula })
        })
      ]);

      const [icData, corrData] = await Promise.all([
        icResponse.json(),
        corrResponse.json()
      ]);

      if (!icData.success) {
        throw new Error(icData.error || 'IC analysis failed');
      }

      setICResults(icData.data);

      // Correlations are optional - don't fail if they don't work
      if (corrData.success) {
        setCorrelations(corrData.data);
      }
    } catch (err) {
      setError(err.message);
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

  // Get traffic light color based on IC value
  const getTrafficLight = (ic) => {
    const absIC = Math.abs(ic || 0);
    if (absIC >= 0.03) return 'green';
    if (absIC >= 0.01) return 'yellow';
    return 'red';
  };

  // Get signal quality assessment
  const getSignalQuality = () => {
    if (!icResults?.ic) return null;

    const ic21d = icResults.ic.icByHorizon?.[21] || 0;
    const tstat = icResults.ic.tstat || 0;
    const uniqueness = correlations?.uniquenessScore || 1;

    if (Math.abs(ic21d) > 0.05 && tstat > 2 && uniqueness > 0.5) {
      return { level: 'strong', label: 'Strong Signal', color: 'var(--positive)', verdict: 'Worth pursuing' };
    } else if (Math.abs(ic21d) > 0.03 && tstat > 1.5 && uniqueness > 0.3) {
      return { level: 'moderate', label: 'Moderate Signal', color: 'var(--warning)', verdict: 'Worth testing further' };
    } else if (Math.abs(ic21d) > 0.02) {
      return { level: 'weak', label: 'Weak Signal', color: 'var(--text-secondary)', verdict: 'Consider combining with other factors' };
    }
    return { level: 'none', label: 'No Signal', color: 'var(--negative)', verdict: 'Likely noise - try different metrics' };
  };

  // Get plain English summary
  const getPlainEnglishSummary = () => {
    if (!icResults?.ic) return null;

    const ic21d = icResults.ic.icByHorizon?.[21] || 0;
    const absIC = Math.abs(ic21d);
    const direction = ic21d > 0 ? 'outperform' : 'underperform';
    const bestHorizon = Object.entries(icResults.ic.icByHorizon || {})
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

    let headline = '';
    let details = '';

    if (absIC >= 0.03) {
      headline = 'This factor has meaningful predictive power';
      details = `Stocks ranking high on this factor tend to ${direction} over 21 days. The signal is ${ic21d > 0 ? 'positive' : 'inverse'} (${ic21d > 0 ? 'higher' : 'lower'} values predict better returns).`;
    } else if (absIC >= 0.01) {
      headline = 'This factor shows weak but detectable signal';
      details = `There's a slight tendency for high-scoring stocks to ${direction}, but the effect is not strong enough to use alone.`;
    } else {
      headline = 'This factor shows no meaningful predictive pattern';
      details = 'The relationship between factor scores and future returns appears random. Consider revising the formula.';
    }

    return { headline, details, bestHorizon };
  };

  const signalQuality = getSignalQuality();
  const plainEnglish = getPlainEnglishSummary();

  return (
    <div className="ic-dashboard">
      {/* Factor Selection */}
      <div className="ic-controls">
        <div className="factor-selector">
          <label>Select Factor</label>
          <select
            value={factor?.id || ''}
            onChange={(e) => {
              const selected = userFactors.find(f => f.id === e.target.value);
              onFactorChange(selected || null);
            }}
          >
            <option value="">-- Select a saved factor --</option>
            {userFactors.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="formula-display">
          <label>Formula</label>
          <input
            type="text"
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="Enter formula or select a factor above"
            className="formula-input"
          />
        </div>

        <div className="analysis-buttons">
          <button
            className="run-analysis-btn"
            onClick={runFullAnalysis}
            disabled={loading || !formula.trim()}
          >
            {loading ? (
              <><Loader size={16} className="spin" /> Running Analysis...</>
            ) : (
              <><Play size={16} /> Run Analysis</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="ic-error">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Results */}
      {icResults && (
        <div className="ic-results">
          {/* Traffic Light Verdict */}
          <div className={`ic-verdict-card ${signalQuality?.level || 'none'}`}>
            <div className="verdict-label">Overall Verdict</div>
            <div className={`traffic-light ${getTrafficLight(icResults.ic?.icByHorizon?.[21])}`}>
              <span className="traffic-light-dot"></span>
              <span>{signalQuality?.label || 'No Signal'}</span>
            </div>
            <div className="verdict-description">{signalQuality?.verdict}</div>
          </div>

          {/* Summary Cards */}
          <div className="ic-summary">
            <div className="summary-card">
              <span className="card-label">IC (21-day)</span>
              <span className={`card-value ${icResults.ic?.icByHorizon?.[21] > 0 ? 'positive' : 'negative'}`}>
                {(icResults.ic?.icByHorizon?.[21] * 100)?.toFixed(2)}%
              </span>
              <span className="card-baseline">Baseline: Value ~2.5%</span>
            </div>
            <div className="summary-card">
              <span className="card-label">T-Statistic</span>
              <span className={`card-value ${Math.abs(icResults.ic?.tstat) > 2 ? 'positive' : ''}`}>
                {icResults.ic?.tstat?.toFixed(2)}
              </span>
              <span className="card-baseline">Need &gt;2.0 for significance</span>
            </div>
            <div className="summary-card">
              <span className="card-label">IC IR</span>
              <span className={`card-value ${icResults.ic?.icIR > 0.5 ? 'positive' : ''}`}>
                {icResults.ic?.icIR?.toFixed(2)}
              </span>
              <span className="card-baseline">Good if &gt;0.5</span>
            </div>
            <div className="summary-card">
              <span className="card-label">Universe Size</span>
              <span className="card-value">
                {icResults.universeSize?.toLocaleString()}
              </span>
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
              Information Coefficient measures predictive power. IC &gt; 0.02 is interesting, &gt; 0.05 is strong.
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

          {/* Interpretation */}
          <div className="ic-interpretation">
            <Info size={16} />
            <div>
              <strong>What this means:</strong>
              {icResults.ic?.icByHorizon?.[21] > 0.03 ? (
                <p>This factor shows meaningful predictive power at the 21-day horizon. Stocks with higher factor values tend to outperform.</p>
              ) : icResults.ic?.icByHorizon?.[21] > 0 ? (
                <p>This factor shows weak positive predictive power. Consider combining with other factors or testing on different universes.</p>
              ) : (
                <p>This factor shows no positive predictive power or may be inversely predictive. Review the formula or try different metrics.</p>
              )}
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
            <div className={`checklist-item ${icResults?.ic?.icByHorizon?.[21] > 0.02 ? 'pass' : 'fail'}`}>
              {icResults?.ic?.icByHorizon?.[21] > 0.02 ? <Check size={16} /> : <X size={16} />}
              <span>IC &gt; 2% (Predictive power)</span>
            </div>
            <div className={`checklist-item ${Math.abs(icResults?.ic?.tstat || 0) > 2 ? 'pass' : 'fail'}`}>
              {Math.abs(icResults?.ic?.tstat || 0) > 2 ? <Check size={16} /> : <X size={16} />}
              <span>T-stat &gt; 2 (Statistically significant)</span>
            </div>
            <div className={`checklist-item ${(correlations?.uniquenessScore || 1) > 0.3 ? 'pass' : 'fail'}`}>
              {(correlations?.uniquenessScore || 1) > 0.3 ? <Check size={16} /> : <X size={16} />}
              <span>Uniqueness &gt; 30% (Adds new information)</span>
            </div>
            <div className={`checklist-item ${icResults?.ic?.icIR > 0.3 ? 'pass' : 'fail'}`}>
              {icResults?.ic?.icIR > 0.3 ? <Check size={16} /> : <X size={16} />}
              <span>IC IR &gt; 0.3 (Consistent signal)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
