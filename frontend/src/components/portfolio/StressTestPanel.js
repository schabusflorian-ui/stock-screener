// frontend/src/components/portfolio/StressTestPanel.js
import { useState, useEffect } from 'react';
import { Loader, AlertTriangle, Shield, TrendingDown, Play, RefreshCw } from '../icons';
import { simulateAPI } from '../../services/api';
import { useAskAI } from '../../hooks';
import './SimulationPanels.css';

function StressTestPanel({ portfolioId }) {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [running, setRunning] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const [results, setResults] = useState(null);
  const [allResults, setAllResults] = useState(null);
  const [error, setError] = useState(null);

  // Ask AI context for stress test results
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'stress_test',
    label: 'Stress Test Analysis',
    scenariosCount: scenarios?.length || 0,
    selectedScenario: selectedScenario,
    portfolioImpact: results?.portfolioImpact,
    worstCaseScenario: allResults?.worstCase?.scenario,
    worstCaseImpact: allResults?.worstCase?.impact
  }));

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const res = await simulateAPI.getStressTestScenarios();
      const raw = res.data.data ?? res.data.scenarios;
      setScenarios(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('Failed to load scenarios:', err);
    }
  };

  const runStressTest = async () => {
    if (!selectedScenario) return;

    try {
      setRunning(true);
      setError(null);
      setResults(null);

      const res = await simulateAPI.runStressTest(parseInt(portfolioId), selectedScenario);
      setResults(res.data.data || res.data);
    } catch (err) {
      console.error('Stress test failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunning(false);
    }
  };

  const runAllStressTests = async () => {
    try {
      setRunningAll(true);
      setError(null);
      setAllResults(null);

      const res = await simulateAPI.runAllStressTests(parseInt(portfolioId));
      const data = res.data.data ?? res.data;
      const resultsList = Array.isArray(data?.results) ? data.results : [];
      setAllResults(data ? { ...data, results: resultsList } : null);
    } catch (err) {
      console.error('All stress tests failed:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setRunningAll(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatValue = (value) => {
    if (!value && value !== 0) return '-';
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const getImpactColor = (value) => {
    if (value >= 0) return 'var(--success-color)';
    if (value > -10) return 'var(--warning-color)';
    return 'var(--danger-color)';
  };

  const getSeverityLabel = (drawdown) => {
    if (drawdown > -10) return { label: 'Minimal', color: 'var(--positive)' };
    if (drawdown > -20) return { label: 'Moderate', color: 'var(--warning-dark)' };
    if (drawdown > -35) return { label: 'Significant', color: 'var(--negative)' };
    return { label: 'Severe', color: 'var(--negative)' };
  };

  return (
    <div className="simulation-panel stress-test-panel" {...askAIProps}>
      <div className="panel-header">
        <h3>Stress Testing</h3>
        <p className="panel-description">
          Test your portfolio against historical market crises and custom scenarios
        </p>
      </div>

      <div className="panel-content">
        <div className="config-section">
          <h4>Select Crisis Scenario</h4>

          <div className="scenario-grid">
            {(Array.isArray(scenarios) ? scenarios : []).map((scenario) => (
              <button
                key={scenario.id}
                className={`scenario-card ${selectedScenario === scenario.id ? 'selected' : ''}`}
                onClick={() => setSelectedScenario(scenario.id)}
                disabled={running || runningAll}
              >
                <div className="scenario-icon">
                  <TrendingDown size={20} />
                </div>
                <div className="scenario-info">
                  <span className="scenario-name">{scenario.name}</span>
                  <span className="scenario-dates">
                    {scenario.startDate} to {scenario.endDate}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="button-row">
          <button
            className="btn btn-primary run-btn"
            onClick={runStressTest}
            disabled={!selectedScenario || running || runningAll}
          >
            {running ? (
              <>
                <Loader className="spinning" size={16} />
                Running Stress Test...
              </>
            ) : (
              <>
                <Play size={16} />
                Run Selected Scenario
              </>
            )}
          </button>

          <button
            className="btn btn-secondary run-btn"
            onClick={runAllStressTests}
            disabled={running || runningAll}
          >
            {runningAll ? (
              <>
                <Loader className="spinning" size={16} />
                Testing All Scenarios...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Run All Scenarios
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        {results && (
          <div className="results-section">
            <h4>
              <Shield size={18} />
              {results.scenarioName} Results
            </h4>

            <div className="results-grid">
              <div className="result-card primary">
                <span className="result-label">Portfolio Impact</span>
                <span
                  className="result-value"
                  style={{ color: getImpactColor(results.portfolioReturn) }}
                >
                  {formatPercent(results.portfolioReturn)}
                </span>
                <span className="result-hint">Total return during crisis</span>
              </div>

              <div className="result-card">
                <span className="result-label">Max Drawdown</span>
                <span
                  className="result-value"
                  style={{ color: getImpactColor(results.maxDrawdown) }}
                >
                  {formatPercent(results.maxDrawdown)}
                </span>
                <span className="result-hint">
                  {getSeverityLabel(results.maxDrawdown).label} impact
                </span>
              </div>

              <div className="result-card">
                <span className="result-label">Starting Value</span>
                <span className="result-value">{formatValue(results.startValue)}</span>
              </div>

              <div className="result-card">
                <span className="result-label">Ending Value</span>
                <span className="result-value">{formatValue(results.endValue)}</span>
              </div>

              {results.recoveryDays && (
                <div className="result-card">
                  <span className="result-label">Recovery Time</span>
                  <span className="result-value">{results.recoveryDays} days</span>
                  <span className="result-hint">Time to recover losses</span>
                </div>
              )}

              {results.worstDay && (
                <div className="result-card warning">
                  <span className="result-label">Worst Single Day</span>
                  <span className="result-value" style={{ color: 'var(--danger-color)' }}>
                    {formatPercent(results.worstDay.return)}
                  </span>
                  <span className="result-hint">{results.worstDay.date}</span>
                </div>
              )}
            </div>

            {results.benchmarkReturn !== undefined && (
              <div className="benchmark-comparison">
                <h5>Benchmark Comparison (S&P 500)</h5>
                <div className="comparison-grid">
                  <div className="comparison-item">
                    <span className="comp-label">Benchmark Return</span>
                    <span
                      className={`comp-value ${results.benchmarkReturn >= 0 ? 'positive' : 'negative'}`}
                    >
                      {formatPercent(results.benchmarkReturn)}
                    </span>
                  </div>
                  <div className="comparison-item">
                    <span className="comp-label">Relative Performance</span>
                    <span
                      className={`comp-value ${(results.portfolioReturn - results.benchmarkReturn) >= 0 ? 'positive' : 'negative'}`}
                    >
                      {formatPercent(results.portfolioReturn - results.benchmarkReturn)}
                    </span>
                  </div>
                  <div className="comparison-item">
                    <span className="comp-label">Beta Estimate</span>
                    <span className="comp-value">
                      {results.betaEstimate?.toFixed(2) || '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {allResults && (
          <div className="results-section all-scenarios">
            <h4>
              <Shield size={18} />
              All Scenarios Summary
            </h4>

            <div className="scenarios-table">
              <div className="table-header">
                <span>Scenario</span>
                <span>Portfolio</span>
                <span>Max DD</span>
                <span>Benchmark</span>
                <span>Relative</span>
              </div>
              {(Array.isArray(allResults.results) ? allResults.results : []).map((result) => {
                const relative = result.portfolioReturn - (result.benchmarkReturn || 0);
                return (
                  <div key={result.scenarioId} className="table-row">
                    <span className="scenario-name">{result.scenarioName}</span>
                    <span style={{ color: getImpactColor(result.portfolioReturn) }}>
                      {formatPercent(result.portfolioReturn)}
                    </span>
                    <span style={{ color: getImpactColor(result.maxDrawdown) }}>
                      {formatPercent(result.maxDrawdown)}
                    </span>
                    <span style={{ color: getImpactColor(result.benchmarkReturn) }}>
                      {formatPercent(result.benchmarkReturn)}
                    </span>
                    <span style={{ color: getImpactColor(relative) }}>
                      {formatPercent(relative)}
                    </span>
                  </div>
                );
              })}
            </div>

            {allResults.summary && (
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-label">Average Impact</span>
                  <span
                    className="stat-value"
                    style={{ color: getImpactColor(allResults.summary.averageReturn) }}
                  >
                    {formatPercent(allResults.summary.averageReturn)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Worst Case</span>
                  <span className="stat-value" style={{ color: 'var(--danger-color)' }}>
                    {formatPercent(allResults.summary.worstReturn)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Best Case</span>
                  <span className="stat-value">
                    {formatPercent(allResults.summary.bestReturn)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default StressTestPanel;
