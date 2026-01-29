// frontend/src/components/portfolio/MonteCarloPanel.enhanced.jsx
// Enhanced Monte Carlo Panel with prominent fat-tail warnings
// Import this instead of the original to get Taleb-informed UI

import { useState, useMemo } from 'react';
import { Loader, AlertTriangle, CheckCircle, Play, Target, Info, ChevronDown, ChevronUp } from '../icons';
import { simulateAPI } from '../../services/api';
import { usePreferences } from '../../context/PreferencesContext';
import FatTailWarningBanner from './FatTailWarningBanner';
import TalebRiskDashboard from './TalebRiskDashboard';
import DistributionComparisonChart from './DistributionComparisonChart';
import './SimulationPanels.css';

function MonteCarloPanel({ portfolioId, initialValue }) {
  const { preferences } = usePreferences();
  const [config, setConfig] = useState({
    simulationCount: 1000,
    timeHorizonYears: preferences.defaultTimeHorizon || 10,
    returnModel: 'parametric', // Changed default from 'historical' to 'parametric'
    returnDistribution: 'auto', // Changed default from 'normal' to 'auto'
    initialValue: initialValue || 100000,
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

  // ... (keep all the existing helper functions: formatValue, formatFullValue, getSurvivalColor, etc.)
  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatFullValue = (value) => {
    if (!value && value !== 0) return '-';
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

  const projectionData = useMemo(() => {
    if (!results?.yearlyProjections) {
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

  const goalProbability = useMemo(() => {
    if (!results) return null;
    if (results.goalProbability !== undefined) return results.goalProbability;

    const goal = config.targetGoal;
    const p50 = results.medianEndingValue || 0;
    const p95 = results.percentile95 || 0;

    if (p50 >= goal) return 75;
    if (p95 >= goal) return 25;
    return 10;
  }, [results, config.targetGoal]);

  return (
    <div className="simulation-panel monte-carlo-panel enhanced">
      <div className="panel-header">
        <h3>Monte Carlo Simulation (Taleb-Enhanced)</h3>
        <p className="panel-description">
          Probability-based portfolio projections with fat-tail awareness
        </p>
      </div>

      <div className="panel-content">
        {/* Configuration */}
        <div className="config-grid">
          <div className="config-section">
            <h4>Simulation Settings</h4>

            <div className="form-group">
              <label>Return Model</label>
              <select
                value={config.returnModel}
                onChange={e => setConfig({ ...config, returnModel: e.target.value })}
              >
                <option value="historical">Historical Returns</option>
                <option value="parametric">Parametric (Recommended)</option>
                <option value="forecasted">Forecasted Returns</option>
              </select>
            </div>

            {config.returnModel === 'parametric' && (
              <div className="form-group highlighted">
                <label>Return Distribution</label>
                <select
                  value={config.returnDistribution}
                  onChange={e => setConfig({ ...config, returnDistribution: e.target.value })}
                >
                  <option value="auto">🎯 Auto-fit Best (Recommended)</option>
                  <option value="studentT">Student's t (Fat Tails)</option>
                  <option value="skewedT">Skewed t (Asymmetric)</option>
                  <option value="normal">⚠️ Normal (Not Recommended)</option>
                </select>
                <span className="form-hint">
                  {config.returnDistribution === 'normal' && '⚠️ Normal assumes thin tails - may severely underestimate risk!'}
                  {config.returnDistribution === 'studentT' && '✅ Captures fat tails - more realistic for market returns'}
                  {config.returnDistribution === 'skewedT' && '✅ Captures both fat tails and asymmetry'}
                  {config.returnDistribution === 'auto' && '✅ Automatically selects best-fitting distribution (Taleb-approved)'}
                </span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Simulations</label>
                <select
                  value={config.simulationCount}
                  onChange={e => setConfig({ ...config, simulationCount: parseInt(e.target.value) })}
                >
                  <option value="100">100 (Fast)</option>
                  <option value="1000">1,000 (Standard)</option>
                  <option value="5000">5,000 (Detailed)</option>
                  <option value="10000">10,000 (Comprehensive)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Time Horizon</label>
                <select
                  value={config.timeHorizonYears}
                  onChange={e => setConfig({ ...config, timeHorizonYears: parseInt(e.target.value) })}
                >
                  <option value="5">5 Years</option>
                  <option value="10">10 Years</option>
                  <option value="20">20 Years</option>
                  <option value="30">30 Years</option>
                  <option value="40">40 Years</option>
                </select>
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
            <h4>Cash Flows & Goals</h4>

            <div className="form-group">
              <label>Initial Value ($)</label>
              <input
                type="number"
                value={config.initialValue}
                onChange={e => setConfig({ ...config, initialValue: parseFloat(e.target.value) })}
                min="0"
                step="1000"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Annual Contribution ($)</label>
                <input
                  type="number"
                  value={config.annualContribution}
                  onChange={e => setConfig({ ...config, annualContribution: parseFloat(e.target.value) })}
                  min="0"
                  step="1000"
                />
              </div>
              <div className="form-group">
                <label>Annual Withdrawal ($)</label>
                <input
                  type="number"
                  value={config.annualWithdrawal}
                  onChange={e => setConfig({ ...config, annualWithdrawal: parseFloat(e.target.value) })}
                  min="0"
                  step="1000"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Inflation Rate (%)</label>
                <input
                  type="number"
                  value={config.inflationRate}
                  onChange={e => setConfig({ ...config, inflationRate: parseFloat(e.target.value) })}
                  step="0.1"
                  min="0"
                  max="10"
                />
              </div>
              <div className="form-group">
                <label>Target Goal ($)</label>
                <input
                  type="number"
                  value={config.targetGoal}
                  onChange={e => setConfig({ ...config, targetGoal: parseFloat(e.target.value) })}
                  min="0"
                  step="10000"
                />
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
            {/* NEW: Fat Tail Warning Banner - MOST PROMINENT */}
            {results.distributionFit && (
              <FatTailWarningBanner
                distributionFit={results.distributionFit}
                moments={results.distributionFit.moments}
                varComparison={results.distributionFit.varComparison}
              />
            )}

            <h4>Simulation Results</h4>

            {/* Existing results grid... (keep all existing code) */}
            {/* Key Metrics Grid */}
            <div className="results-grid mc-results-grid">
              {/* ... existing metric cards ... */}
            </div>

            {/* NEW: Taleb Risk Dashboard */}
            {results.distributionFit && results.distributionFit.moments && (
              <TalebRiskDashboard
                distributionFit={results.distributionFit}
                moments={results.distributionFit.moments}
                varComparison={results.distributionFit.varComparison}
                simulationResults={results}
              />
            )}

            {/* NEW: Distribution Comparison Chart */}
            {results.distributionFit && results.distributionFit.moments && (
              <DistributionComparisonChart
                moments={results.distributionFit.moments}
                distributionFit={results.distributionFit}
                historicalReturns={results.historicalReturns}
              />
            )}

            {/* ... rest of existing results display ... */}
            {/* Keep all existing charts, tables, info boxes */}
          </div>
        )}
      </div>
    </div>
  );
}

export default MonteCarloPanel;
