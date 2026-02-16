// frontend/src/components/portfolio/MonteCarloPanel.js
import { useState, useMemo } from 'react';
import { Loader, AlertTriangle, CheckCircle, Play, Target, Info, ChevronDown, ChevronUp, HelpCircle, Activity } from '../icons';
import { simulateAPI } from '../../services/api';
import { usePreferences } from '../../context/PreferencesContext';
import { useAskAI } from '../../hooks';
import { FatTailWarningBanner, TalebRiskDashboard, DistributionComparisonChart } from './TalebComponents';
import ComplianceDisclaimer from '../ui/ComplianceDisclaimer';
import './SimulationPanels.css';

// User-friendly labels and descriptions for configuration options
const RETURN_MODEL_OPTIONS = {
  historical: {
    label: 'Historical Bootstrap',
    description: 'Uses actual past returns randomly sampled. Best when you have 5+ years of history.',
    hint: 'Realistic but limited to past patterns'
  },
  parametric: {
    label: 'Statistical Model',
    description: 'Generates returns from a fitted distribution. Better for capturing fat tails.',
    hint: 'Good for modeling extreme events'
  },
  forecasted: {
    label: 'Custom Forecast',
    description: 'Use your own expected return and volatility estimates.',
    hint: 'Full control over assumptions'
  }
};

const SIMULATION_COUNT_OPTIONS = {
  100: { label: '100', hint: 'Quick preview (less accurate)', speed: 'Fast' },
  1000: { label: '1,000', hint: 'Good balance of speed and accuracy', speed: 'Standard', recommended: true },
  5000: { label: '5,000', hint: 'More stable percentile estimates', speed: 'Slower' },
  10000: { label: '10,000', hint: 'Most accurate, especially for tail events', speed: 'Comprehensive' }
};

const TIME_HORIZON_OPTIONS = {
  5: { label: '5 Years', hint: 'Short-term planning' },
  10: { label: '10 Years', hint: 'Medium-term goals' },
  20: { label: '20 Years', hint: 'Typical retirement horizon' },
  30: { label: '30 Years', hint: 'Full retirement planning' },
  40: { label: '40 Years', hint: 'Lifetime planning' }
};

const TOOLTIPS = {
  survivalRate: 'Percentage of simulations where your portfolio lasted the full time horizon without being depleted.',
  percentile: 'Shows the range of outcomes. For example, 95th percentile means only 5% of outcomes were better.',
  inflationRate: 'Annual inflation assumption. Withdrawals and goals are adjusted for inflation.',
  targetGoal: 'Your target ending portfolio value. Used to calculate probability of success.'
};

function MonteCarloPanel({ portfolioId, initialValue }) {
  const { preferences } = usePreferences();
  const [config, setConfig] = useState({
    simulationCount: 1000,
    timeHorizonYears: preferences.defaultTimeHorizon || 10,
    returnModel: 'historical',
    returnDistribution: 'normal', // NEW: 'normal', 'studentT', 'skewedT', 'auto'
    initialValue: Math.round(initialValue) || 100000,
    annualContribution: 0,
    annualWithdrawal: 0,
    inflationRate: 2.5,
    expectedReturn: 7,
    expectedVolatility: 15,
    targetGoal: 1000000
  });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [showProjectionTable, setShowProjectionTable] = useState(false);
  const [hoveredYear, setHoveredYear] = useState(null);

  // Ask AI context for Monte Carlo simulation
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'monte_carlo',
    label: 'Monte Carlo Simulation',
    timeHorizon: config.timeHorizonYears,
    simulationCount: config.simulationCount,
    survivalRate: results?.survivalRate,
    medianEndValue: results?.percentiles?.p50,
    goalProbability: results?.goalProbability
  }));

  const runSimulation = async () => {
    try {
      setRunning(true);
      setError(null);

      const res = await simulateAPI.runMonteCarlo({
        portfolioId: parseInt(portfolioId),
        simulationCount: config.simulationCount,
        timeHorizonYears: config.timeHorizonYears,
        returnModel: config.returnModel,
        returnDistribution: config.returnDistribution,
        initialValue: config.initialValue,
        annualContribution: config.annualContribution,
        annualWithdrawal: config.annualWithdrawal,
        inflationRate: config.inflationRate / 100,
        expectedReturn: config.expectedReturn / 100,
        expectedVolatility: config.expectedVolatility / 100,
        targetGoal: config.targetGoal
      });

      setResults(res.data.data || res.data);
    } catch (err) {
      console.error('Monte Carlo simulation failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-';
    if (value >= 1e12) {
      return `$${(value / 1e12).toFixed(2)}T`;
    }
    if (value >= 1e9) {
      return `$${(value / 1e9).toFixed(2)}B`;
    }
    if (value >= 1e6) {
      return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatFullValue = (value) => {
    if (!value && value !== 0) return '-';
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const getSurvivalColor = (rate) => {
    if (rate >= 95) return 'var(--success-color)';
    if (rate >= 80) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  const getSurvivalGrade = (rate) => {
    if (rate >= 95) return { label: 'Excellent', emoji: 'A+' };
    if (rate >= 90) return { label: 'Very Good', emoji: 'A' };
    if (rate >= 80) return { label: 'Good', emoji: 'B' };
    if (rate >= 70) return { label: 'Fair', emoji: 'C' };
    if (rate >= 50) return { label: 'At Risk', emoji: 'D' };
    return { label: 'Critical', emoji: 'F' };
  };

  // Generate year-by-year projection data for visualization
  const projectionData = useMemo(() => {
    if (!results?.yearlyProjections) {
      // Generate mock projection data if API doesn't provide it
      if (!results) return [];

      const years = config.timeHorizonYears;
      const growth = (config.expectedReturn / 100) || 0.07;
      const volatility = (config.expectedVolatility / 100) || 0.15;

      return Array.from({ length: years + 1 }, (_, i) => {
        const baseValue = config.initialValue * Math.pow(1 + growth, i);
        const volatilityFactor = Math.pow(1 + volatility, Math.sqrt(i));

        return {
          year: i,
          p5: baseValue * (1 - volatilityFactor * 0.4),
          p25: baseValue * (1 - volatilityFactor * 0.2),
          p50: baseValue,
          p75: baseValue * (1 + volatilityFactor * 0.25),
          p95: baseValue * (1 + volatilityFactor * 0.6)
        };
      });
    }
    return results.yearlyProjections;
  }, [results, config]);

  // Calculate probability of reaching goal
  const goalProbability = useMemo(() => {
    if (!results) return null;
    if (results.goalProbability !== undefined) return results.goalProbability;

    // Estimate based on percentiles
    const goal = config.targetGoal;
    const p50 = results.medianEndingValue || 0;
    const p95 = results.percentile95 || 0;

    if (p50 >= goal) return 75;
    if (p95 >= goal) return 25;
    return 10;
  }, [results, config.targetGoal]);

  return (
    <div className="simulation-panel monte-carlo-panel" {...askAIProps}>
      {/* Panel Header */}
      <div className="panel-header">
        <Activity size={20} className="header-icon" />
        <div className="header-text">
          <h3>Monte Carlo Simulation</h3>
          <p className="panel-description">
            Run thousands of hypothetical scenarios to visualize potential portfolio outcomes
          </p>
        </div>
      </div>

      {/* Hypothetical Results Warning */}
      <div className="hypothetical-callout">
        <AlertTriangle size={18} />
        <div>
          <strong>Hypothetical Projections Only</strong>
          <p>These simulations are based on your specified assumptions and historical data patterns.
          They do not predict actual future results. Past performance does not guarantee future outcomes.</p>
        </div>
      </div>

      <div className="panel-content">
        <div className="config-grid">
          <div className="config-section">
            <h4 className="config-section-title">Simulation Settings</h4>

            <div className="form-group">
              <label className="form-label-enhanced">
                Return Model
                <HelpCircle size={12} className="help-icon" title="How returns are generated for each simulation path" />
              </label>
              <select
                value={config.returnModel}
                onChange={e => setConfig({ ...config, returnModel: e.target.value })}
                className="form-select-enhanced"
              >
                {Object.entries(RETURN_MODEL_OPTIONS).map(([key, { label }]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <span className="form-hint">{RETURN_MODEL_OPTIONS[config.returnModel]?.description}</span>
            </div>

            {config.returnModel === 'parametric' && (
              <div className="form-group">
                <label>Return Distribution</label>
                <select
                  value={config.returnDistribution}
                  onChange={e => setConfig({ ...config, returnDistribution: e.target.value })}
                >
                  <option value="normal">Normal (Gaussian)</option>
                  <option value="studentT">Student's t (Fat Tails)</option>
                  <option value="skewedT">Skewed t (Asymmetric)</option>
                  <option value="auto">Auto-fit Best</option>
                </select>
                <span className="form-hint">
                  {config.returnDistribution === 'normal' && 'Standard bell curve - may underestimate tail risk'}
                  {config.returnDistribution === 'studentT' && 'Captures fat tails - more realistic for market returns'}
                  {config.returnDistribution === 'skewedT' && 'Captures both fat tails and asymmetry'}
                  {config.returnDistribution === 'auto' && 'Automatically selects best-fitting distribution'}
                </span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label-enhanced">
                  Number of Simulations
                  <HelpCircle size={12} className="help-icon" title="More simulations = more accurate results but longer computation time" />
                </label>
                <select
                  value={config.simulationCount}
                  onChange={e => setConfig({ ...config, simulationCount: parseInt(e.target.value) })}
                  className="form-select-enhanced"
                >
                  {Object.entries(SIMULATION_COUNT_OPTIONS).map(([value, opt]) => (
                    <option key={value} value={value}>
                      {opt.label} ({opt.speed}){opt.recommended ? ' ✓' : ''}
                    </option>
                  ))}
                </select>
                <span className="form-hint">{SIMULATION_COUNT_OPTIONS[config.simulationCount]?.hint}</span>
              </div>

              <div className="form-group">
                <label className="form-label-enhanced">
                  Time Horizon
                  <HelpCircle size={12} className="help-icon" title="How many years into the future to project" />
                </label>
                <select
                  value={config.timeHorizonYears}
                  onChange={e => setConfig({ ...config, timeHorizonYears: parseInt(e.target.value) })}
                  className="form-select-enhanced"
                >
                  {Object.entries(TIME_HORIZON_OPTIONS).map(([value, opt]) => (
                    <option key={value} value={value}>{opt.label}</option>
                  ))}
                </select>
                <span className="form-hint">{TIME_HORIZON_OPTIONS[config.timeHorizonYears]?.hint}</span>
              </div>
            </div>

            {config.returnModel === 'forecasted' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Expected Return (%)</label>
                  <input
                    type="number"
                    value={config.expectedReturn}
                    onChange={e => setConfig({ ...config, expectedReturn: parseFloat(e.target.value) })}
                    step="0.5"
                  />
                </div>
                <div className="form-group">
                  <label>Expected Volatility (%)</label>
                  <input
                    type="number"
                    value={config.expectedVolatility}
                    onChange={e => setConfig({ ...config, expectedVolatility: parseFloat(e.target.value) })}
                    step="0.5"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="config-section">
            <h4 className="config-section-title">Cash Flows & Goals</h4>

            <div className="form-group">
              <label className="form-label-enhanced">Starting Portfolio Value</label>
              <div className="input-with-prefix">
                <span className="input-prefix">$</span>
                <input
                  type="number"
                  value={Math.round(config.initialValue) || 0}
                  onChange={e => setConfig({ ...config, initialValue: Math.round(parseFloat(e.target.value) || 0) })}
                  min="0"
                  step="1000"
                  className="form-input-enhanced"
                />
              </div>
              <span className="form-hint">Current portfolio value or starting amount</span>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label-enhanced">
                  Annual Contribution
                  <HelpCircle size={12} className="help-icon" title="Amount you add to the portfolio each year" />
                </label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    type="number"
                    value={Math.round(config.annualContribution) || 0}
                    onChange={e => setConfig({ ...config, annualContribution: Math.round(parseFloat(e.target.value) || 0) })}
                    min="0"
                    step="1000"
                    className="form-input-enhanced"
                  />
                </div>
                <span className="form-hint">Yearly savings or deposits</span>
              </div>
              <div className="form-group">
                <label className="form-label-enhanced">
                  Annual Withdrawal
                  <HelpCircle size={12} className="help-icon" title="Amount you withdraw each year (e.g., for retirement)" />
                </label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    type="number"
                    value={Math.round(config.annualWithdrawal) || 0}
                    onChange={e => setConfig({ ...config, annualWithdrawal: Math.round(parseFloat(e.target.value) || 0) })}
                    min="0"
                    step="1000"
                    className="form-input-enhanced"
                  />
                </div>
                <span className="form-hint">Yearly spending or income</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label-enhanced">
                  Inflation Rate
                  <HelpCircle size={12} className="help-icon" title={TOOLTIPS.inflationRate} />
                </label>
                <div className="input-with-suffix">
                  <input
                    type="number"
                    value={config.inflationRate}
                    onChange={e => setConfig({ ...config, inflationRate: parseFloat(e.target.value) })}
                    step="0.1"
                    min="0"
                    max="10"
                    className="form-input-enhanced"
                  />
                  <span className="input-suffix">%</span>
                </div>
                <span className="form-hint">Historical average: 2-3%</span>
              </div>
              <div className="form-group">
                <label className="form-label-enhanced">
                  Target Goal
                  <HelpCircle size={12} className="help-icon" title={TOOLTIPS.targetGoal} />
                </label>
                <div className="input-with-prefix">
                  <span className="input-prefix">$</span>
                  <input
                    type="number"
                    value={Math.round(config.targetGoal) || 0}
                    onChange={e => setConfig({ ...config, targetGoal: Math.round(parseFloat(e.target.value) || 0) })}
                    min="0"
                    step="10000"
                    className="form-input-enhanced"
                  />
                </div>
                <span className="form-hint">Your wealth target (optional)</span>
              </div>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary run-btn"
          onClick={runSimulation}
          disabled={running}
        >
          {running ? (
            <>
              <Loader className="spinning" size={16} />
              Running {config.simulationCount.toLocaleString()} simulations...
            </>
          ) : (
            <>
              <Play size={16} />
              Run Simulation
            </>
          )}
        </button>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {results && (
          <div className="results-section">
            <h4>Simulation Results</h4>

            {/* Key Metrics Grid */}
            <div className="results-grid mc-results-grid">
              <div className="result-card primary survival-card">
                <div className="survival-header">
                  <div className="result-icon" style={{ color: getSurvivalColor(results.survivalRate) }}>
                    {results.survivalRate >= 95 ? <CheckCircle size={28} /> : <AlertTriangle size={28} />}
                  </div>
                  <div className="survival-grade" style={{ color: getSurvivalColor(results.survivalRate) }}>
                    {getSurvivalGrade(results.survivalRate).emoji}
                  </div>
                </div>
                <div className="result-content">
                  <span className="result-label">Portfolio Survival Rate</span>
                  <span className="result-value" style={{ color: getSurvivalColor(results.survivalRate) }}>
                    {results.survivalRate?.toFixed(1)}%
                  </span>
                  <span className="result-hint">
                    {getSurvivalGrade(results.survivalRate).label} - {results.survivalRate >= 95 ? 'Very low risk of depletion' : results.survivalRate >= 80 ? 'Acceptable risk level' : 'Consider reducing withdrawals'}
                  </span>
                </div>
              </div>

              <div className="result-card">
                <span className="result-label">Median Ending Value</span>
                <span className="result-value">{formatValue(results.medianEndingValue)}</span>
                <span className="result-hint">{formatFullValue(results.medianEndingValue)}</span>
              </div>

              <div className="result-card">
                <span className="result-label">Mean Ending Value</span>
                <span className="result-value">{formatValue(results.meanEndingValue)}</span>
                <span className="result-hint">Average of all simulations</span>
              </div>

              {goalProbability !== null && (
                <div className="result-card goal-card">
                  <Target size={20} className="goal-icon" />
                  <span className="result-label">Chance of Reaching {formatValue(config.targetGoal)}</span>
                  <span className="result-value" style={{
                    color: goalProbability >= 75 ? 'var(--success-color)' :
                           goalProbability >= 50 ? 'var(--warning-color)' : 'var(--danger-color)'
                  }}>
                    {goalProbability}%
                  </span>
                </div>
              )}

              {results.medianDepletionYear && (
                <div className="result-card warning">
                  <span className="result-label">Median Depletion Year</span>
                  <span className="result-value">Year {results.medianDepletionYear}</span>
                  <span className="result-hint">When failed portfolios run out</span>
                </div>
              )}
            </div>

            {/* Distribution Fit Info - shows when using parametric returns */}
            {results.distributionFit && (
              <div className="distribution-fit-section">
                <h5>Fitted Return Distribution</h5>
                <div className="distribution-fit-grid">
                  <div className="dist-fit-card">
                    <span className="dist-label">Distribution Type</span>
                    <span className="dist-value">{results.distributionFit.name || results.distributionFit.type}</span>
                  </div>
                  {results.distributionFit.moments && (
                    <>
                      <div className="dist-fit-card">
                        <span className="dist-label">Skewness</span>
                        <span className="dist-value">{results.distributionFit.moments.skewness?.toFixed(3)}</span>
                        <span className="dist-hint">
                          {results.distributionFit.moments.skewness < -0.5 ? 'Left-skewed (more downside)' :
                           results.distributionFit.moments.skewness > 0.5 ? 'Right-skewed (more upside)' : 'Approximately symmetric'}
                        </span>
                      </div>
                      <div className="dist-fit-card">
                        <span className="dist-label">Kurtosis</span>
                        <span className="dist-value">{results.distributionFit.moments.kurtosis?.toFixed(3)}</span>
                        <span className="dist-hint">
                          {results.distributionFit.moments.kurtosis > 4 ? 'Fat tails detected' :
                           results.distributionFit.moments.kurtosis > 3.5 ? 'Slightly fat tails' : 'Near-normal tails'}
                        </span>
                      </div>
                    </>
                  )}
                  {results.distributionFit.params?.df && (
                    <div className="dist-fit-card">
                      <span className="dist-label">Degrees of Freedom</span>
                      <span className="dist-value">{results.distributionFit.params.df.toFixed(1)}</span>
                      <span className="dist-hint">Lower = fatter tails (normal = infinite)</span>
                    </div>
                  )}
                </div>

                {/* VaR Comparison */}
                {results.distributionFit.varComparison && (
                  <div className="var-comparison">
                    <h6>Risk Model Comparison (95% VaR)</h6>
                    <div className="var-comparison-grid">
                      <div className="var-card">
                        <span className="var-label">Normal VaR</span>
                        <span className="var-value">{(results.distributionFit.varComparison.normalVaR * 100).toFixed(2)}%</span>
                      </div>
                      <div className="var-card">
                        <span className="var-label">Adjusted VaR</span>
                        <span className="var-value">{(results.distributionFit.varComparison.adjustedVaR * 100).toFixed(2)}%</span>
                      </div>
                      <div className="var-card highlight">
                        <span className="var-label">Normal Underestimates By</span>
                        <span className="var-value" style={{ color: results.distributionFit.varComparison.underestimationPct > 10 ? 'var(--danger-color)' : 'var(--warning-color)' }}>
                          {results.distributionFit.varComparison.underestimationPct?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Taleb-Informed Risk Visualization Components */}
            {results.distributionFit && results.distributionFit.moments && (
              <>
                <FatTailWarningBanner
                  distributionFit={results.distributionFit}
                  moments={results.distributionFit.moments}
                  varComparison={results.distributionFit.varComparison}
                />
                <TalebRiskDashboard
                  distributionFit={results.distributionFit}
                  moments={results.distributionFit.moments}
                  varComparison={results.distributionFit.varComparison}
                  simulationResults={results}
                />
                <DistributionComparisonChart
                  moments={results.distributionFit.moments}
                  distributionFit={results.distributionFit}
                  historicalReturns={results.historicalReturns}
                />
              </>
            )}

            {/* Fan Chart Visualization */}
            <div className="fan-chart-section">
              <h5>Wealth Trajectory Projection</h5>
              <div className="fan-chart-container">
                <FanChart
                  data={projectionData}
                  goal={config.targetGoal}
                  initial={config.initialValue}
                  years={config.timeHorizonYears}
                  hoveredYear={hoveredYear}
                  setHoveredYear={setHoveredYear}
                />
                {hoveredYear !== null && projectionData[hoveredYear] && (
                  <div className="fan-chart-tooltip">
                    <div className="tooltip-year">Year {hoveredYear}</div>
                    <div className="tooltip-row pessimistic">
                      <span>5th Percentile:</span>
                      <span>{formatValue(projectionData[hoveredYear].p5)}</span>
                    </div>
                    <div className="tooltip-row low">
                      <span>25th Percentile:</span>
                      <span>{formatValue(projectionData[hoveredYear].p25)}</span>
                    </div>
                    <div className="tooltip-row median">
                      <span>Median:</span>
                      <span>{formatValue(projectionData[hoveredYear].p50)}</span>
                    </div>
                    <div className="tooltip-row high">
                      <span>75th Percentile:</span>
                      <span>{formatValue(projectionData[hoveredYear].p75)}</span>
                    </div>
                    <div className="tooltip-row optimistic">
                      <span>95th Percentile:</span>
                      <span>{formatValue(projectionData[hoveredYear].p95)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="fan-chart-legend">
                <div className="legend-item">
                  <span className="legend-color optimistic"></span>
                  <span>90% Confidence (5th-95th)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color median-range"></span>
                  <span>50% Confidence (25th-75th)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line"></span>
                  <span>Median Path</span>
                </div>
                {config.targetGoal > 0 && (
                  <div className="legend-item">
                    <span className="legend-line goal"></span>
                    <span>Target Goal</span>
                  </div>
                )}
              </div>
            </div>

            {/* Outcome Distribution */}
            <div className="percentile-section">
              <h5>Final Value Distribution</h5>
              <div className="distribution-chart">
                <DistributionChart
                  p5={results.percentile5}
                  p25={results.percentile25}
                  p50={results.medianEndingValue}
                  p75={results.percentile75}
                  p95={results.percentile95}
                  mean={results.meanEndingValue}
                  formatValue={formatValue}
                />
              </div>
            </div>

            {/* Percentile Range Cards */}
            <div className="percentile-cards">
              <div className="percentile-card pessimistic">
                <div className="pct-header">
                  <span className="pct-label">Worst Case (5th)</span>
                  <span className="pct-badge">5%</span>
                </div>
                <span className="pct-value">{formatValue(results.percentile5)}</span>
                <span className="pct-hint">5% of outcomes are worse than this</span>
              </div>
              <div className="percentile-card low">
                <div className="pct-header">
                  <span className="pct-label">Conservative (25th)</span>
                  <span className="pct-badge">25%</span>
                </div>
                <span className="pct-value">{formatValue(results.percentile25)}</span>
                <span className="pct-hint">25% of outcomes are worse than this</span>
              </div>
              <div className="percentile-card median">
                <div className="pct-header">
                  <span className="pct-label">Most Likely (50th)</span>
                  <span className="pct-badge">50%</span>
                </div>
                <span className="pct-value">{formatValue(results.medianEndingValue)}</span>
                <span className="pct-hint">Half of outcomes are better, half worse</span>
              </div>
              <div className="percentile-card high">
                <div className="pct-header">
                  <span className="pct-label">Optimistic (75th)</span>
                  <span className="pct-badge">75%</span>
                </div>
                <span className="pct-value">{formatValue(results.percentile75)}</span>
                <span className="pct-hint">75% of outcomes are worse than this</span>
              </div>
              <div className="percentile-card optimistic">
                <div className="pct-header">
                  <span className="pct-label">Best Case (95th)</span>
                  <span className="pct-badge">95%</span>
                </div>
                <span className="pct-value">{formatValue(results.percentile95)}</span>
                <span className="pct-hint">Only 5% of outcomes are better</span>
              </div>
            </div>

            {/* Year-by-Year Projection Table (Collapsible) */}
            <div className="projection-table-section">
              <button
                className="projection-toggle"
                onClick={() => setShowProjectionTable(!showProjectionTable)}
              >
                {showProjectionTable ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Year-by-Year Projections
              </button>

              {showProjectionTable && projectionData.length > 0 && (
                <div className="projection-table">
                  <div className="projection-header">
                    <span>Year</span>
                    <span>5th</span>
                    <span>25th</span>
                    <span>Median</span>
                    <span>75th</span>
                    <span>95th</span>
                  </div>
                  {projectionData.filter((_, i) => i % Math.ceil(projectionData.length / 10) === 0 || i === projectionData.length - 1).map((row, idx) => (
                    <div key={idx} className="projection-row">
                      <span className="year-cell">{row.year}</span>
                      <span className="value-cell pessimistic">{formatValue(row.p5)}</span>
                      <span className="value-cell low">{formatValue(row.p25)}</span>
                      <span className="value-cell median">{formatValue(row.p50)}</span>
                      <span className="value-cell high">{formatValue(row.p75)}</span>
                      <span className="value-cell optimistic">{formatValue(row.p95)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mc-info-box">
              <Info size={16} />
              <div>
                <strong>How to interpret:</strong> This simulation ran {results.simulationCount?.toLocaleString()} scenarios
                using {config.returnModel === 'historical' ? 'historical bootstrap' :
                       config.returnModel === 'parametric' ?
                         `${results.distributionFit?.name || config.returnDistribution} distribution` :
                         'forecasted'} returns.
                {results.distributionFit?.moments?.kurtosis > 4 && (
                  <> Fat tails were detected in returns, meaning extreme events are more likely than normal models predict.</>
                )}
                {' '}The survival rate shows the percentage of simulations where your portfolio lasted the full {config.timeHorizonYears} years.
                A rate above 90% is generally considered safe for retirement planning.
              </div>
            </div>

            <div className="simulation-meta">
              <span>Completed in {results.executionTimeMs}ms</span>
              <span>{results.simulationCount?.toLocaleString()} simulations</span>
              <span>{results.timeHorizonYears} year horizon</span>
            </div>

            {/* Compliance Disclaimer */}
            <ComplianceDisclaimer variant="inline" type="backtest" />
          </div>
        )}
      </div>
    </div>
  );
}

// Fan Chart Component - SVG-based confidence band visualization
function FanChart({ data, goal, initial, years, hoveredYear, setHoveredYear }) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 280;
  const padding = { top: 20, right: 60, bottom: 40, left: 80 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Find data range for scaling (based on actual data only)
  const actualDataMax = Math.max(...data.map(d => d.p95));
  const actualDataMin = Math.min(...data.map(d => d.p5));

  // Only include goal in axis if it's within 50% of actual data max
  // This prevents a $1M goal from stretching axis when data only goes to $300K
  const goalInRange = goal && goal <= actualDataMax * 1.5;
  const dataMax = goalInRange ? Math.max(actualDataMax, goal) : actualDataMax;
  const dataMin = Math.min(actualDataMin, initial || actualDataMin);

  // Generate nice round tick values for Y axis
  const generateNiceTicks = (min, max, targetTicks = 5) => {
    // Handle edge case where min equals max
    if (max <= min) {
      max = min + 1000;
    }

    const range = max - min;
    // Find a nice step size (1, 2, 5, 10, 20, 50, 100, etc.)
    const roughStep = range / (targetTicks - 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const residual = roughStep / magnitude;

    let niceStep;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    // Calculate nice min/max - keep close to actual data
    const niceMin = Math.floor(min / niceStep) * niceStep;
    // Use smaller ceiling to keep axis tight to data
    const niceMax = Math.ceil(max * 1.05 / niceStep) * niceStep;

    // Generate ticks
    const ticks = [];
    for (let tick = niceMin; tick <= niceMax; tick += niceStep) {
      ticks.push(tick);
    }

    // Limit to reasonable number of ticks
    if (ticks.length > 8) {
      const skipFactor = Math.ceil(ticks.length / 6);
      return {
        ticks: ticks.filter((_, i) => i % skipFactor === 0 || i === ticks.length - 1),
        niceMin,
        niceMax
      };
    }

    return { ticks, niceMin, niceMax };
  };

  const { ticks: yTicks, niceMin, niceMax } = generateNiceTicks(
    Math.max(0, dataMin * 0.95),
    dataMax * 1.05
  );

  const minValue = niceMin;
  const maxValue = niceMax;

  // Scale functions
  const xScale = (year) => padding.left + (year / years) * chartWidth;
  const yScale = (value) => padding.top + chartHeight - ((value - minValue) / (maxValue - minValue)) * chartHeight;

  // Generate path for confidence bands
  const generateBandPath = (data, lowKey, highKey) => {
    const upperPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.year)} ${yScale(d[highKey])}`).join(' ');
    const lowerPath = data.slice().reverse().map((d, i) => `L ${xScale(d.year)} ${yScale(d[lowKey])}`).join(' ');
    return `${upperPath} ${lowerPath} Z`;
  };

  // Generate line path
  const generateLinePath = (data, key) => {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.year)} ${yScale(d[key])}`).join(' ');
  };

  // Format axis labels with appropriate precision
  const formatAxisValue = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return millions >= 10 ? `$${millions.toFixed(0)}M` : `$${millions.toFixed(1)}M`;
    }
    if (value >= 1000) {
      const thousands = value / 1000;
      return thousands >= 100 ? `$${thousands.toFixed(0)}K` : `$${thousands.toFixed(0)}K`;
    }
    return `$${value.toLocaleString()}`;
  };

  // Generate X axis ticks (years)
  const generateYearTicks = (totalYears) => {
    if (totalYears <= 10) {
      // Show every year or every 2 years
      const step = totalYears <= 5 ? 1 : 2;
      return Array.from({ length: Math.floor(totalYears / step) + 1 }, (_, i) => i * step);
    } else if (totalYears <= 20) {
      // Show every 5 years
      return Array.from({ length: Math.floor(totalYears / 5) + 1 }, (_, i) => i * 5);
    } else {
      // Show every 10 years
      return Array.from({ length: Math.floor(totalYears / 10) + 1 }, (_, i) => i * 10);
    }
  };

  const xTicks = generateYearTicks(years);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="fan-chart-svg">
      {/* Grid lines */}
      <g className="grid-lines">
        {yTicks.map((tick, i) => (
          <line
            key={`y-${i}`}
            x1={padding.left}
            y1={yScale(tick)}
            x2={width - padding.right}
            y2={yScale(tick)}
            stroke="var(--border-color)"
            strokeDasharray="3,3"
            opacity="0.5"
          />
        ))}
      </g>

      {/* 90% Confidence Band (5th-95th) */}
      <path
        d={generateBandPath(data, 'p5', 'p95')}
        fill="var(--info-muted)"
        className="band-outer"
      />

      {/* 50% Confidence Band (25th-75th) */}
      <path
        d={generateBandPath(data, 'p25', 'p75')}
        fill="var(--color-ai-violet-muted, rgba(124, 58, 237, 0.25))"
        className="band-inner"
      />

      {/* Goal Line */}
      {goal > 0 && goal <= maxValue && (
        <line
          x1={padding.left}
          y1={yScale(goal)}
          x2={width - padding.right}
          y2={yScale(goal)}
          stroke="var(--success-color)"
          strokeWidth="2"
          strokeDasharray="8,4"
          className="goal-line"
        />
      )}

      {/* Initial Value Line */}
      <line
        x1={padding.left}
        y1={yScale(initial)}
        x2={width - padding.right}
        y2={yScale(initial)}
        stroke="var(--text-tertiary)"
        strokeWidth="1"
        strokeDasharray="4,4"
        opacity="0.5"
      />

      {/* Median Line */}
      <path
        d={generateLinePath(data, 'p50')}
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="3"
        className="median-line"
      />

      {/* Y Axis */}
      <g className="y-axis">
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="var(--border-color)"
        />
        {yTicks.map((tick, i) => (
          <g key={`y-tick-${i}`}>
            <text
              x={padding.left - 10}
              y={yScale(tick)}
              textAnchor="end"
              alignmentBaseline="middle"
              fontSize="11"
              fill="var(--text-tertiary)"
            >
              {formatAxisValue(tick)}
            </text>
          </g>
        ))}
      </g>

      {/* X Axis */}
      <g className="x-axis">
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="var(--border-color)"
        />
        {xTicks.map((tick, i) => (
          <text
            key={`x-tick-${i}`}
            x={xScale(tick)}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-tertiary)"
          >
            Year {tick}
          </text>
        ))}
      </g>

      {/* Hover Areas */}
      {data.map((d, i) => (
        <rect
          key={`hover-${i}`}
          x={xScale(d.year) - chartWidth / data.length / 2}
          y={padding.top}
          width={chartWidth / data.length}
          height={chartHeight}
          fill="transparent"
          onMouseEnter={() => setHoveredYear(i)}
          onMouseLeave={() => setHoveredYear(null)}
          style={{ cursor: 'crosshair' }}
        />
      ))}

      {/* Hover indicator */}
      {hoveredYear !== null && data[hoveredYear] && (
        <g className="hover-indicator">
          <line
            x1={xScale(data[hoveredYear].year)}
            y1={padding.top}
            x2={xScale(data[hoveredYear].year)}
            y2={height - padding.bottom}
            stroke="var(--text-primary)"
            strokeWidth="1"
            strokeDasharray="4,2"
            opacity="0.6"
          />
          <circle
            cx={xScale(data[hoveredYear].year)}
            cy={yScale(data[hoveredYear].p50)}
            r="5"
            fill="var(--accent-primary)"
            stroke="white"
            strokeWidth="2"
          />
        </g>
      )}
    </svg>
  );
}

// Distribution Chart Component - Visual bell curve representation
function DistributionChart({ p5, p25, p50, p75, p95, mean, formatValue }) {
  const width = 500;
  const height = 100;
  const padding = 20;

  // Calculate positions (log scale for better visualization)
  const minVal = p5 * 0.9;
  const maxVal = p95 * 1.1;
  const range = maxVal - minVal;

  const getX = (val) => padding + ((val - minVal) / range) * (width - 2 * padding);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="distribution-svg">
      {/* Background track */}
      <rect
        x={getX(p5)}
        y={height / 2 - 4}
        width={getX(p95) - getX(p5)}
        height={8}
        rx={4}
        fill="var(--bg-tertiary)"
      />

      {/* 25-75 range */}
      <rect
        x={getX(p25)}
        y={height / 2 - 12}
        width={getX(p75) - getX(p25)}
        height={24}
        rx={4}
        fill="var(--info-muted)"
      />

      {/* Percentile markers */}
      <g>
        {/* 5th */}
        <line x1={getX(p5)} y1={height / 2 - 20} x2={getX(p5)} y2={height / 2 + 20} stroke="var(--danger-color)" strokeWidth="2" />
        <text x={getX(p5)} y={height / 2 + 35} textAnchor="middle" fontSize="10" fill="var(--danger-color)">5th</text>

        {/* 25th */}
        <line x1={getX(p25)} y1={height / 2 - 16} x2={getX(p25)} y2={height / 2 + 16} stroke="var(--warning-color)" strokeWidth="2" />

        {/* Median */}
        <line x1={getX(p50)} y1={height / 2 - 24} x2={getX(p50)} y2={height / 2 + 24} stroke="var(--accent-primary)" strokeWidth="3" />
        <circle cx={getX(p50)} cy={height / 2} r="6" fill="var(--accent-primary)" />
        <text x={getX(p50)} y={15} textAnchor="middle" fontSize="11" fill="var(--accent-primary)" fontWeight="600">Median</text>

        {/* 75th */}
        <line x1={getX(p75)} y1={height / 2 - 16} x2={getX(p75)} y2={height / 2 + 16} stroke="var(--success-color)" strokeWidth="2" />

        {/* 95th */}
        <line x1={getX(p95)} y1={height / 2 - 20} x2={getX(p95)} y2={height / 2 + 20} stroke="var(--success-color)" strokeWidth="2" />
        <text x={getX(p95)} y={height / 2 + 35} textAnchor="middle" fontSize="10" fill="var(--success-color)">95th</text>
      </g>

      {/* Mean marker (triangle) */}
      {mean && (
        <g>
          <polygon
            points={`${getX(mean)},${height / 2 - 28} ${getX(mean) - 5},${height / 2 - 36} ${getX(mean) + 5},${height / 2 - 36}`}
            fill="var(--text-secondary)"
          />
          <text x={getX(mean)} y={height / 2 - 42} textAnchor="middle" fontSize="9" fill="var(--text-tertiary)">Mean</text>
        </g>
      )}
    </svg>
  );
}

export default MonteCarloPanel;
