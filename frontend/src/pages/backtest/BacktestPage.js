// frontend/src/pages/backtest/BacktestPage.js
// Full backtest page with walk-forward analysis, overfitting detection, and factor attribution

import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  BarChart3,
  Settings,
  Download,
  RefreshCw,
  Loader,
  Target,
  Percent,
  Clock,
  List,
  Info,
  ChevronDown,
  ChevronRight
} from '../../components/icons';
import { unifiedStrategyAPI, agentsAPI } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import './BacktestPage.css';

// Backtest modes
const BACKTEST_MODES = [
  { id: 'simple', label: 'Simple Backtest', description: 'Historical simulation with basic metrics' },
  { id: 'walk_forward', label: 'Walk-Forward', description: 'Rolling out-of-sample validation' },
  { id: 'full_validation', label: 'Full Validation', description: 'Complete suite with overfitting detection' }
];

// Stress scenarios
const STRESS_SCENARIOS = [
  { id: 'COVID_2020', label: 'COVID Crash 2020', period: 'Feb-Apr 2020' },
  { id: 'RATE_SHOCK_2022', label: 'Rate Shock 2022', period: '2022' },
  { id: 'GFC_2008', label: 'Financial Crisis 2008', period: '2008-2009' },
  { id: 'DOT_COM_2000', label: 'Dot-Com Bubble', period: '2000-2002' },
  { id: 'FLASH_CRASH_2010', label: 'Flash Crash', period: 'May 2010' }
];

function BacktestPage() {
  const [searchParams] = useSearchParams();
  const strategyIdParam = searchParams.get('strategyId');
  const agentIdParam = searchParams.get('agentId');

  // State
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(strategyIdParam || '');
  const [loading, setLoading] = useState(false);
  const [loadingStrategies, setLoadingStrategies] = useState(true);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  // Backtest config
  const [config, setConfig] = useState({
    startDate: getDefaultStartDate(),
    endDate: new Date().toISOString().split('T')[0],
    mode: 'simple',
    benchmark: 'SPY',
    stressScenarios: ['COVID_2020', 'RATE_SHOCK_2022'],
    includeFactorAnalysis: true
  });

  // UI state
  const [expandedSections, setExpandedSections] = useState({
    performance: true,
    walkForward: true,
    overfitting: true,
    factors: false,
    stress: false,
    trades: false
  });

  function getDefaultStartDate() {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 2);
    return date.toISOString().split('T')[0];
  }

  // Load strategies on mount
  useEffect(() => {
    loadStrategies();
  }, []);

  const loadStrategies = async () => {
    try {
      setLoadingStrategies(true);
      const response = await unifiedStrategyAPI.getAll();
      setStrategies(response.data?.strategies || []);

      // If agent ID provided, get linked strategy
      if (agentIdParam) {
        const agentResponse = await agentsAPI.get(agentIdParam);
        const strategyId = agentResponse.data?.data?.unified_strategy_id;
        if (strategyId) {
          setSelectedStrategy(strategyId.toString());
        }
      }
    } catch (err) {
      console.error('Failed to load strategies:', err);
    } finally {
      setLoadingStrategies(false);
    }
  };

  const runBacktest = async () => {
    if (!selectedStrategy) {
      setError('Please select a strategy');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await unifiedStrategyAPI.runBacktest(selectedStrategy, config);
      setResults(response.data?.results);
    } catch (err) {
      console.error('Backtest failed:', err);
      setError(err.response?.data?.error || err.message || 'Backtest failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return 'N/A';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(2)}%`;
  };

  const formatNumber = (value, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(decimals);
  };

  const getOverfitColor = (risk) => {
    switch (risk) {
      case 'low': return '#059669';
      case 'medium': return '#D97706';
      case 'high': return '#DC2626';
      default: return '#94A3B8';
    }
  };

  const exportResults = () => {
    if (!results) return;

    const exportData = {
      exportDate: new Date().toISOString(),
      config,
      results
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${selectedStrategy}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="backtest-page">
      {/* Header */}
      <header className="backtest-page__header">
        <Link to="/agents" className="backtest-page__back">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1>Strategy Backtest</h1>
          <p>Comprehensive historical validation with walk-forward analysis</p>
        </div>
      </header>

      {/* Configuration Panel */}
      <Card variant="glass" className="backtest-page__config">
        <h2>
          <Settings size={20} />
          Configuration
        </h2>

        <div className="config-grid">
          {/* Strategy Selection */}
          <div className="config-group">
            <label>Strategy</label>
            <select
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value)}
              disabled={loadingStrategies}
            >
              <option value="">Select a strategy...</option>
              {strategies.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="config-group">
            <label>Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => updateConfig('startDate', e.target.value)}
            />
          </div>

          <div className="config-group">
            <label>End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => updateConfig('endDate', e.target.value)}
            />
          </div>

          {/* Benchmark */}
          <div className="config-group">
            <label>Benchmark</label>
            <select
              value={config.benchmark}
              onChange={(e) => updateConfig('benchmark', e.target.value)}
            >
              <option value="SPY">S&P 500 (SPY)</option>
              <option value="QQQ">NASDAQ 100 (QQQ)</option>
              <option value="IWM">Russell 2000 (IWM)</option>
              <option value="VTI">Total Market (VTI)</option>
            </select>
          </div>

          {/* Backtest Mode */}
          <div className="config-group full-width">
            <label>Backtest Mode</label>
            <div className="mode-buttons">
              {BACKTEST_MODES.map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  className={`mode-btn ${config.mode === mode.id ? 'active' : ''}`}
                  onClick={() => updateConfig('mode', mode.id)}
                >
                  <span className="mode-label">{mode.label}</span>
                  <span className="mode-desc">{mode.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stress Scenarios */}
          <div className="config-group full-width">
            <label>Stress Scenarios</label>
            <div className="stress-checkboxes">
              {STRESS_SCENARIOS.map(scenario => (
                <label key={scenario.id} className="stress-checkbox">
                  <input
                    type="checkbox"
                    checked={config.stressScenarios.includes(scenario.id)}
                    onChange={(e) => {
                      const scenarios = e.target.checked
                        ? [...config.stressScenarios, scenario.id]
                        : config.stressScenarios.filter(s => s !== scenario.id);
                      updateConfig('stressScenarios', scenarios);
                    }}
                  />
                  <span>{scenario.label}</span>
                  <span className="stress-period">{scenario.period}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Factor Analysis Toggle */}
          <div className="config-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={config.includeFactorAnalysis}
                onChange={(e) => updateConfig('includeFactorAnalysis', e.target.checked)}
              />
              <span>Include Factor Analysis</span>
            </label>
          </div>
        </div>

        {/* Run Button */}
        <div className="config-actions">
          <Button
            variant="primary"
            onClick={runBacktest}
            disabled={loading || !selectedStrategy}
          >
            {loading ? (
              <>
                <Loader size={18} className="spinning" />
                Running Backtest...
              </>
            ) : (
              <>
                <Play size={18} />
                Run Backtest
              </>
            )}
          </Button>

          {results && (
            <Button variant="secondary" onClick={exportResults}>
              <Download size={18} />
              Export Results
            </Button>
          )}
        </div>

        {error && (
          <div className="config-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}
      </Card>

      {/* Results */}
      {results && (
        <div className="backtest-results">
          {/* Performance Summary */}
          <Card variant="glass" className="results-section">
            <button
              className="section-header"
              onClick={() => toggleSection('performance')}
            >
              <div className="section-title">
                <TrendingUp size={20} />
                <h3>Performance Summary</h3>
              </div>
              {expandedSections.performance ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>

            {expandedSections.performance && results.backtest && (
              <div className="section-content">
                <div className="metrics-summary">
                  <div className="metric-large">
                    <span className="metric-label">Total Return</span>
                    <span className={`metric-value ${results.backtest.metrics?.totalReturn >= 0 ? 'positive' : 'negative'}`}>
                      {formatPercent(results.backtest.metrics?.totalReturn)}
                    </span>
                  </div>
                  <div className="metric-large">
                    <span className="metric-label">Sharpe Ratio</span>
                    <span className={`metric-value ${results.backtest.metrics?.sharpeRatio >= 1 ? 'positive' : ''}`}>
                      {formatNumber(results.backtest.metrics?.sharpeRatio)}
                    </span>
                  </div>
                  <div className="metric-large">
                    <span className="metric-label">Max Drawdown</span>
                    <span className="metric-value negative">
                      {formatPercent(results.backtest.metrics?.maxDrawdown)}
                    </span>
                  </div>
                </div>

                <div className="metrics-grid">
                  <div className="metric-item">
                    <Activity size={16} />
                    <span className="label">Annualized Return</span>
                    <span className="value">{formatPercent(results.backtest.metrics?.annualizedReturn)}</span>
                  </div>
                  <div className="metric-item">
                    <Activity size={16} />
                    <span className="label">Volatility</span>
                    <span className="value">{formatPercent(results.backtest.metrics?.volatility)}</span>
                  </div>
                  <div className="metric-item">
                    <Target size={16} />
                    <span className="label">Win Rate</span>
                    <span className="value">{formatPercent(results.backtest.metrics?.winRate)}</span>
                  </div>
                  <div className="metric-item">
                    <Percent size={16} />
                    <span className="label">Profit Factor</span>
                    <span className="value">{formatNumber(results.backtest.metrics?.profitFactor)}</span>
                  </div>
                  <div className="metric-item">
                    <List size={16} />
                    <span className="label">Total Trades</span>
                    <span className="value">{results.backtest.metrics?.totalTrades}</span>
                  </div>
                  <div className="metric-item">
                    <Clock size={16} />
                    <span className="label">Avg Holding</span>
                    <span className="value">{formatNumber(results.backtest.metrics?.avgHoldingDays, 0)} days</span>
                  </div>
                </div>

                {/* Benchmark Comparison */}
                {results.backtest.benchmarkMetrics && (
                  <div className="benchmark-comparison">
                    <h4>vs {config.benchmark}</h4>
                    <div className="comparison-row">
                      <span>Alpha</span>
                      <span className={results.backtest.benchmarkMetrics?.alpha >= 0 ? 'positive' : 'negative'}>
                        {formatPercent(results.backtest.benchmarkMetrics?.alpha)}
                      </span>
                    </div>
                    <div className="comparison-row">
                      <span>Beta</span>
                      <span>{formatNumber(results.backtest.benchmarkMetrics?.beta)}</span>
                    </div>
                    <div className="comparison-row">
                      <span>Information Ratio</span>
                      <span>{formatNumber(results.backtest.benchmarkMetrics?.informationRatio)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Walk-Forward Analysis */}
          {results.walkForward && (
            <Card variant="glass" className="results-section">
              <button
                className="section-header"
                onClick={() => toggleSection('walkForward')}
              >
                <div className="section-title">
                  <RefreshCw size={20} />
                  <h3>Walk-Forward Analysis</h3>
                </div>
                {expandedSections.walkForward ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              {expandedSections.walkForward && (
                <div className="section-content">
                  <div className="walk-forward-summary">
                    <div className="wf-metric">
                      <span className="label">In-Sample Sharpe</span>
                      <span className="value">{formatNumber(results.walkForward.inSampleSharpe)}</span>
                    </div>
                    <div className="wf-metric">
                      <span className="label">Out-of-Sample Sharpe</span>
                      <span className="value">{formatNumber(results.walkForward.outOfSampleSharpe)}</span>
                    </div>
                    <div className="wf-metric">
                      <span className="label">WF Efficiency</span>
                      <span className={`value ${results.walkForward.efficiency >= 0.5 ? 'positive' : 'negative'}`}>
                        {formatPercent(results.walkForward.efficiency)}
                      </span>
                    </div>
                    <div className="wf-metric">
                      <span className="label">Consistent Windows</span>
                      <span className="value">
                        {results.walkForward.consistentWindows} / {results.walkForward.totalWindows}
                      </span>
                    </div>
                  </div>

                  {/* Walk-Forward Windows */}
                  {results.walkForward.windows && (
                    <div className="wf-windows">
                      <h4>Window Results</h4>
                      <div className="windows-table">
                        <div className="table-header">
                          <span>Period</span>
                          <span>Train Return</span>
                          <span>Test Return</span>
                          <span>Efficiency</span>
                        </div>
                        {results.walkForward.windows.slice(0, 5).map((window, i) => (
                          <div key={i} className="table-row">
                            <span>{window.period}</span>
                            <span className={window.trainReturn >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(window.trainReturn)}
                            </span>
                            <span className={window.testReturn >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(window.testReturn)}
                            </span>
                            <span className={window.efficiency >= 0.5 ? 'positive' : 'negative'}>
                              {formatPercent(window.efficiency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Overfitting Detection */}
          {results.overfitting && (
            <Card variant="glass" className="results-section">
              <button
                className="section-header"
                onClick={() => toggleSection('overfitting')}
              >
                <div className="section-title">
                  <AlertTriangle size={20} />
                  <h3>Overfitting Detection</h3>
                  <span
                    className="risk-badge"
                    style={{ backgroundColor: getOverfitColor(results.overfitting.overallRisk) }}
                  >
                    {results.overfitting.overallRisk} risk
                  </span>
                </div>
                {expandedSections.overfitting ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              {expandedSections.overfitting && (
                <div className="section-content">
                  <div className="overfitting-tests">
                    {results.overfitting.tests && Object.entries(results.overfitting.tests).map(([testName, result]) => (
                      <div key={testName} className={`test-result ${result.passed ? 'passed' : 'failed'}`}>
                        {result.passed ? <CheckCircle size={18} /> : <XCircle size={18} />}
                        <div className="test-info">
                          <span className="test-name">{formatTestName(testName)}</span>
                          <span className="test-desc">{result.description}</span>
                        </div>
                        <span className="test-value">{result.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Deflated Sharpe */}
                  {results.statistical && (
                    <div className="statistical-section">
                      <h4>Statistical Significance</h4>
                      <div className="stat-metrics">
                        <div className="stat-metric">
                          <span className="label">Deflated Sharpe Ratio</span>
                          <span className="value">{formatNumber(results.statistical.deflatedSharpe)}</span>
                        </div>
                        <div className="stat-metric">
                          <span className="label">p-value</span>
                          <span className={`value ${results.statistical.pValue <= 0.05 ? 'positive' : 'negative'}`}>
                            {formatNumber(results.statistical.pValue, 4)}
                          </span>
                        </div>
                        <div className="stat-metric">
                          <span className="label">Trials Adjustment</span>
                          <span className="value">{results.statistical.trialsAdjustment}</span>
                        </div>
                      </div>

                      {results.statistical.confidenceIntervals && (
                        <div className="confidence-intervals">
                          <h5>95% Confidence Intervals</h5>
                          <div className="ci-row">
                            <span>Sharpe Ratio</span>
                            <span>
                              [{formatNumber(results.statistical.confidenceIntervals.sharpe?.lower)},
                              {formatNumber(results.statistical.confidenceIntervals.sharpe?.upper)}]
                            </span>
                          </div>
                          <div className="ci-row">
                            <span>Annual Return</span>
                            <span>
                              [{formatPercent(results.statistical.confidenceIntervals.annualReturn?.lower)},
                              {formatPercent(results.statistical.confidenceIntervals.annualReturn?.upper)}]
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Recommendation */}
                  {results.recommendation && (
                    <div className={`recommendation ${results.recommendation.deployable ? 'positive' : 'negative'}`}>
                      <Info size={18} />
                      <div>
                        <strong>{results.recommendation.deployable ? 'Ready for Deployment' : 'Not Recommended'}</strong>
                        <p>{results.recommendation.reason}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Factor Attribution */}
          {results.factors && (
            <Card variant="glass" className="results-section">
              <button
                className="section-header"
                onClick={() => toggleSection('factors')}
              >
                <div className="section-title">
                  <BarChart3 size={20} />
                  <h3>Factor Attribution</h3>
                </div>
                {expandedSections.factors ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              {expandedSections.factors && (
                <div className="section-content">
                  <div className="factor-exposures">
                    {results.factors.exposures && Object.entries(results.factors.exposures).map(([factor, exposure]) => (
                      <div key={factor} className="factor-bar">
                        <span className="factor-name">{factor}</span>
                        <div className="factor-bar-container">
                          <div
                            className={`factor-bar-fill ${exposure >= 0 ? 'positive' : 'negative'}`}
                            style={{ width: `${Math.min(Math.abs(exposure) * 100, 100)}%` }}
                          />
                        </div>
                        <span className={`factor-value ${exposure >= 0 ? 'positive' : 'negative'}`}>
                          {formatNumber(exposure)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {results.factors.attribution && (
                    <div className="factor-attribution">
                      <h4>Return Attribution</h4>
                      <div className="attribution-chart">
                        {Object.entries(results.factors.attribution).map(([factor, contribution]) => (
                          <div key={factor} className="attribution-row">
                            <span>{factor}</span>
                            <span className={contribution >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(contribution)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Stress Testing */}
          {results.stress && results.stress.scenarios && (
            <Card variant="glass" className="results-section">
              <button
                className="section-header"
                onClick={() => toggleSection('stress')}
              >
                <div className="section-title">
                  <AlertTriangle size={20} />
                  <h3>Stress Test Results</h3>
                </div>
                {expandedSections.stress ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
              </button>

              {expandedSections.stress && (
                <div className="section-content">
                  <div className="stress-results">
                    {results.stress.scenarios.map((scenario, i) => (
                      <div key={i} className="stress-scenario">
                        <div className="scenario-header">
                          <span className="scenario-name">{scenario.name}</span>
                          <span className="scenario-period">{scenario.period}</span>
                        </div>
                        <div className="scenario-metrics">
                          <div className="scenario-metric">
                            <span>Strategy</span>
                            <span className={scenario.strategyReturn >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(scenario.strategyReturn)}
                            </span>
                          </div>
                          <div className="scenario-metric">
                            <span>Benchmark</span>
                            <span className={scenario.benchmarkReturn >= 0 ? 'positive' : 'negative'}>
                              {formatPercent(scenario.benchmarkReturn)}
                            </span>
                          </div>
                          <div className="scenario-metric">
                            <span>Max Drawdown</span>
                            <span className="negative">
                              {formatPercent(scenario.maxDrawdown)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to format test names
function formatTestName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

export default BacktestPage;
