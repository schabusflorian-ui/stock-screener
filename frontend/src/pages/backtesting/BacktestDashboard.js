// frontend/src/pages/backtesting/BacktestDashboard.js
// Main dashboard for HF-style backtesting framework

import React, { useState, useEffect, useCallback, memo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAskAI } from '../../hooks/useAskAI';
import {
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Layers,
  Zap,
  Scale,
  ArrowLeft,
  RefreshCw,
  Play,
  CheckCircle,
  XCircle,
  Info
} from '../../components/icons';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Skeleton } from '../../components/Skeleton';
import backtestingAPI from '../../services/backtestingAPI';
import { portfoliosAPI } from '../../services/api';
import './BacktestDashboard.css';

/**
 * Dashboard tabs
 */
const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'walkforward', label: 'Walk-Forward', icon: TrendingUp },
  { id: 'var', label: 'VaR Analysis', icon: AlertTriangle },
  { id: 'alpha', label: 'Alpha Validation', icon: CheckCircle },
  { id: 'stress', label: 'Stress Tests', icon: Zap },
  { id: 'regime', label: 'Regime Analysis', icon: Layers },
  { id: 'capacity', label: 'Capacity', icon: Scale }
];

/**
 * Status badge component
 */
const StatusBadge = ({ status, label }) => {
  const statusClass = status === 'pass' ? 'success' : status === 'fail' ? 'danger' : 'warning';
  const Icon = status === 'pass' ? CheckCircle : status === 'fail' ? XCircle : Info;

  return (
    <span className={`backtest-badge backtest-badge--${statusClass}`}>
      <Icon size={12} />
      {label}
    </span>
  );
};

/**
 * Metric card component with Ask AI
 */
const MetricCard = memo(function MetricCard({ title, value, subtitle, trend, icon: Icon, portfolioName }) {
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    label: `${title} - ${portfolioName || 'Portfolio'} Backtest`,
    data: {
      metric: title,
      value,
      subtitle,
      trend
    }
  }));

  return (
    <div className="backtest-metric" {...askAIProps}>
      <div className="backtest-metric__header">
        {Icon && <Icon size={16} className="backtest-metric__icon" />}
        <span className="backtest-metric__title">{title}</span>
      </div>
      <div className="backtest-metric__value">{value}</div>
      {subtitle && (
        <div className={`backtest-metric__subtitle ${trend ? `backtest-metric__subtitle--${trend}` : ''}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
});

/**
 * Main BacktestDashboard component
 */
function BacktestDashboard() {
  const { portfolioId } = useParams();
  const [portfolio, setPortfolio] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  // Analysis results
  const [comprehensiveReport, setComprehensiveReport] = useState(null);
  const [walkForwardResults, setWalkForwardResults] = useState(null);
  const [varResults, setVarResults] = useState(null);
  const [alphaResults, setAlphaResults] = useState(null);
  const [stressResults, setStressResults] = useState(null);
  const [regimeResults, setRegimeResults] = useState(null);
  const [capacityResults, setCapacityResults] = useState(null);
  const [stressScenarios, setStressScenarios] = useState([]);

  const parsedPortfolioId = portfolioId ? parseInt(portfolioId, 10) : null;

  // Fetch portfolio data
  const fetchPortfolio = useCallback(async () => {
    if (!parsedPortfolioId) return;

    try {
      const response = await portfoliosAPI.get(parsedPortfolioId);
      if (response.data) {
        setPortfolio(response.data);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [parsedPortfolioId]);

  // Fetch stress scenarios
  const fetchScenarios = useCallback(async () => {
    try {
      const response = await backtestingAPI.stress.getScenarios();
      if (response.success) {
        setStressScenarios(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch scenarios:', err);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchPortfolio(),
        fetchScenarios()
      ]);
      setLoading(false);
    };

    loadData();
  }, [fetchPortfolio, fetchScenarios]);

  // Run comprehensive analysis
  const runComprehensiveAnalysis = async () => {
    if (!parsedPortfolioId) return;

    setRunning(true);
    setError(null);

    try {
      const response = await backtestingAPI.report.generate(parsedPortfolioId);

      if (response.success) {
        setComprehensiveReport(response.data);
        setWalkForwardResults(response.data.walkForward);
        setAlphaResults(response.data.alphaValidation);
        setRegimeResults(response.data.regimeAnalysis);
        setCapacityResults(response.data.capacityAnalysis);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  // Run individual analyses
  const runWalkForward = async () => {
    setRunning(true);
    try {
      const response = await backtestingAPI.walkForward.run({ portfolioId: parsedPortfolioId });
      if (response.success) setWalkForwardResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runVaRBacktest = async () => {
    setRunning(true);
    try {
      const response = await backtestingAPI.varBacktest.run({ portfolioId: parsedPortfolioId });
      if (response.success) setVarResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runAlphaValidation = async () => {
    setRunning(true);
    try {
      const response = await backtestingAPI.alpha.run({ portfolioId: parsedPortfolioId });
      if (response.success) setAlphaResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runStressTest = async (scenarioName) => {
    setRunning(true);
    try {
      const response = await backtestingAPI.stress.runHistorical({
        portfolioId: parsedPortfolioId,
        scenarioName
      });
      if (response.success) setStressResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runRegimeAnalysis = async () => {
    setRunning(true);
    try {
      const response = await backtestingAPI.regime.analyze(parsedPortfolioId);
      if (response.success) setRegimeResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const runCapacityAnalysis = async () => {
    setRunning(true);
    try {
      const response = await backtestingAPI.capacity.estimate({ portfolioId: parsedPortfolioId });
      if (response.success) setCapacityResults(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="backtest-dashboard">
        <Skeleton className="backtest-dashboard__skeleton-header" />
        <Skeleton className="backtest-dashboard__skeleton-content" />
      </div>
    );
  }

  // Render error or no portfolio state
  if (!parsedPortfolioId || !portfolio) {
    return (
      <div className="backtest-dashboard">
        <Card variant="base" className="backtest-dashboard__error">
          <p>Please select a portfolio to run backtesting analysis.</p>
          <Link to="/portfolios" className="backtest-dashboard__link">
            <ArrowLeft size={16} /> Go to Portfolios
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="backtest-dashboard">
      {/* Header */}
      <div className="backtest-dashboard__header">
        <div className="backtest-dashboard__title-section">
          <Link to={`/portfolios/${parsedPortfolioId}`} className="backtest-dashboard__back">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="backtest-dashboard__title">
              <BarChart3 size={24} />
              Backtesting Dashboard
            </h1>
            <p className="backtest-dashboard__subtitle">
              {portfolio?.name} - HF-Style Performance Analysis
            </p>
          </div>
        </div>
        <div className="backtest-dashboard__actions">
          <Button
            variant="primary"
            onClick={runComprehensiveAnalysis}
            disabled={running}
            icon={running ? RefreshCw : Play}
          >
            {running ? 'Running...' : 'Run All Analyses'}
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Card variant="base" className="backtest-dashboard__error-card">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </Card>
      )}

      {/* Tab Navigation */}
      <div className="backtest-dashboard__tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`backtest-dashboard__tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="backtest-dashboard__content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="backtest-overview">
            <div className="backtest-overview__summary">
              <MetricCard
                title="Walk-Forward Efficiency"
                value={walkForwardResults?.walkForwardEfficiency?.toFixed(2) || '--'}
                subtitle={walkForwardResults?.interpretation?.[0] || 'Run analysis to see results'}
                icon={TrendingUp}
              />
              <MetricCard
                title="Alpha (Annualized)"
                value={alphaResults?.alphaAnalysis?.alpha?.annualized
                  ? (alphaResults.alphaAnalysis.alpha.annualized * 100).toFixed(2) + '%'
                  : '--'}
                subtitle={alphaResults?.alphaAnalysis?.alpha?.significant ? 'Significant' : 'Not significant'}
                trend={alphaResults?.alphaAnalysis?.alpha?.significant ? 'positive' : 'neutral'}
                icon={CheckCircle}
              />
              <MetricCard
                title="VaR Model Status"
                value={varResults?.tests?.basel?.zone || '--'}
                subtitle={varResults?.tests?.basel?.interpretation || 'Run VaR backtest'}
                icon={AlertTriangle}
              />
              <MetricCard
                title="Strategy Capacity"
                value={capacityResults?.estimatedCapacity || '--'}
                subtitle={capacityResults?.liquidityRating || 'Run capacity analysis'}
                icon={Scale}
              />
            </div>

            {comprehensiveReport && (
              <Card variant="glass" className="backtest-overview__report">
                <Card.Header>
                  <h3>Comprehensive Analysis Summary</h3>
                </Card.Header>
                <Card.Content>
                  <div className="backtest-overview__report-grid">
                    <div className="backtest-overview__report-item">
                      <span className="label">Current Regime:</span>
                      <span className="value">{comprehensiveReport.currentRegime?.regime || 'Unknown'}</span>
                    </div>
                    <div className="backtest-overview__report-item">
                      <span className="label">Analysis Period:</span>
                      <span className="value">
                        {comprehensiveReport.period?.startDate || 'N/A'} to {comprehensiveReport.period?.endDate || 'N/A'}
                      </span>
                    </div>
                  </div>
                </Card.Content>
              </Card>
            )}
          </div>
        )}

        {/* Walk-Forward Tab */}
        {activeTab === 'walkforward' && (
          <div className="backtest-walkforward">
            <div className="backtest-section__header">
              <h3>Walk-Forward Optimization</h3>
              <Button variant="secondary" onClick={runWalkForward} disabled={running} size="sm">
                {running ? 'Running...' : 'Run Analysis'}
              </Button>
            </div>

            {walkForwardResults ? (
              <div className="backtest-walkforward__results">
                <div className="backtest-metrics-grid">
                  <MetricCard
                    title="Walk-Forward Efficiency"
                    value={(walkForwardResults.walkForwardEfficiency * 100).toFixed(1) + '%'}
                    subtitle="OOS Sharpe / IS Sharpe"
                  />
                  <MetricCard
                    title="Parameter Stability"
                    value={(walkForwardResults.parameterStability * 100).toFixed(1) + '%'}
                  />
                  <MetricCard
                    title="OOS Sharpe"
                    value={walkForwardResults.aggregateMetrics?.oosSharpe?.toFixed(2) || '--'}
                  />
                  <MetricCard
                    title="OOS Max Drawdown"
                    value={(walkForwardResults.aggregateMetrics?.oosMaxDrawdown * 100).toFixed(1) + '%'}
                  />
                </div>

                <Card variant="base" className="backtest-walkforward__interpretation">
                  <Card.Header><h4>Interpretation</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {walkForwardResults.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>

                {walkForwardResults.periods?.length > 0 && (
                  <Card variant="base" className="backtest-walkforward__periods">
                    <Card.Header><h4>Period Results</h4></Card.Header>
                    <Card.Content>
                      <table className="backtest-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th>IS Sharpe</th>
                            <th>OOS Sharpe</th>
                            <th>WF Efficiency</th>
                          </tr>
                        </thead>
                        <tbody>
                          {walkForwardResults.periods.slice(0, 10).map((p, idx) => (
                            <tr key={idx}>
                              <td>{p.periodIndex + 1}</td>
                              <td>{p.isMetrics?.sharpe?.toFixed(2) || '--'}</td>
                              <td>{p.oosMetrics?.sharpe?.toFixed(2) || '--'}</td>
                              <td>{(p.walkForwardEfficiency * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card.Content>
                  </Card>
                )}
              </div>
            ) : (
              <Card variant="base" className="backtest-empty">
                <p>Run walk-forward analysis to see results</p>
              </Card>
            )}
          </div>
        )}

        {/* VaR Analysis Tab */}
        {activeTab === 'var' && (
          <div className="backtest-var">
            <div className="backtest-section__header">
              <h3>VaR Model Validation</h3>
              <Button variant="secondary" onClick={runVaRBacktest} disabled={running} size="sm">
                {running ? 'Running...' : 'Run Backtest'}
              </Button>
            </div>

            {varResults ? (
              <div className="backtest-var__results">
                <div className="backtest-metrics-grid">
                  <MetricCard
                    title="Exception Rate"
                    value={varResults.summary?.exceptionRate || '--'}
                    subtitle={`Expected: ${varResults.summary?.expectedRate}`}
                  />
                  <MetricCard
                    title="Basel Zone"
                    value={varResults.tests?.basel?.zone || '--'}
                    subtitle={varResults.tests?.basel?.interpretation}
                  />
                  <MetricCard
                    title="Kupiec Test"
                    value={varResults.tests?.kupiec?.pass ? 'PASS' : 'FAIL'}
                    subtitle={`p-value: ${varResults.tests?.kupiec?.pValue?.toFixed(4)}`}
                  />
                  <MetricCard
                    title="Christoffersen Test"
                    value={varResults.tests?.christoffersen?.pass ? 'PASS' : 'FAIL'}
                    subtitle={varResults.tests?.christoffersen?.independenceTest?.interpretation}
                  />
                </div>

                <Card variant="base" className="backtest-var__interpretation">
                  <Card.Header><h4>Model Assessment</h4></Card.Header>
                  <Card.Content>
                    <div className={`backtest-var__status backtest-var__status--${varResults.overallPass ? 'pass' : 'fail'}`}>
                      {varResults.overallPass ? (
                        <>
                          <CheckCircle size={20} />
                          <span>VaR model passes validation tests</span>
                        </>
                      ) : (
                        <>
                          <XCircle size={20} />
                          <span>VaR model requires attention</span>
                        </>
                      )}
                    </div>
                    <ul>
                      {varResults.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="backtest-empty">
                <p>Run VaR backtest to validate risk model</p>
              </Card>
            )}
          </div>
        )}

        {/* Alpha Validation Tab */}
        {activeTab === 'alpha' && (
          <div className="backtest-alpha">
            <div className="backtest-section__header">
              <h3>Alpha Significance Testing</h3>
              <Button variant="secondary" onClick={runAlphaValidation} disabled={running} size="sm">
                {running ? 'Running...' : 'Run Validation'}
              </Button>
            </div>

            {alphaResults ? (
              <div className="backtest-alpha__results">
                <div className="backtest-metrics-grid">
                  <MetricCard
                    title="Annualized Alpha"
                    value={(alphaResults.alphaAnalysis?.alpha?.annualized * 100).toFixed(2) + '%'}
                    subtitle={`t-stat: ${alphaResults.alphaAnalysis?.alpha?.tStatistic?.toFixed(2)}`}
                  />
                  <MetricCard
                    title="Alpha Significant"
                    value={alphaResults.alphaAnalysis?.alpha?.significant ? 'YES' : 'NO'}
                    subtitle={`p-value: ${alphaResults.alphaAnalysis?.alpha?.pValue?.toFixed(4)}`}
                  />
                  <MetricCard
                    title="Sharpe Ratio"
                    value={alphaResults.sharpeAnalysis?.observed?.toFixed(2) || '--'}
                  />
                  <MetricCard
                    title="Deflated Sharpe"
                    value={alphaResults.sharpeAnalysis?.deflated?.deflatedSharpe?.toFixed(2) || '--'}
                    subtitle={alphaResults.sharpeAnalysis?.deflated?.significant ? 'Survives adjustment' : 'May be data snooping'}
                  />
                </div>

                <div className="backtest-metrics-grid">
                  <MetricCard
                    title="Information Ratio"
                    value={alphaResults.alphaAnalysis?.informationRatio?.toFixed(2) || '--'}
                  />
                  <MetricCard
                    title="Tracking Error"
                    value={(alphaResults.alphaAnalysis?.trackingError * 100).toFixed(2) + '%'}
                  />
                  <MetricCard
                    title="Beta"
                    value={alphaResults.alphaAnalysis?.beta?.value?.toFixed(2) || '--'}
                  />
                  <MetricCard
                    title="Min Track Record"
                    value={`${alphaResults.minimumTrackRecord?.minMonths} months`}
                    subtitle={alphaResults.minimumTrackRecord?.interpretation}
                  />
                </div>

                <Card variant="base" className="backtest-alpha__assessment">
                  <Card.Header><h4>Overall Assessment</h4></Card.Header>
                  <Card.Content>
                    <div className="backtest-alpha__grade">
                      <span className="grade">{alphaResults.overallAssessment?.grade}</span>
                      <span className="score">Score: {alphaResults.overallAssessment?.score}/100</span>
                    </div>
                    <ul>
                      {alphaResults.overallAssessment?.assessments?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                    <p className="recommendation">{alphaResults.overallAssessment?.recommendation}</p>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="backtest-empty">
                <p>Run alpha validation to test statistical significance</p>
              </Card>
            )}
          </div>
        )}

        {/* Stress Testing Tab */}
        {activeTab === 'stress' && (
          <div className="backtest-stress">
            <div className="backtest-section__header">
              <h3>Stress Testing</h3>
            </div>

            <Card variant="base" className="backtest-stress__scenarios">
              <Card.Header><h4>Available Scenarios</h4></Card.Header>
              <Card.Content>
                <div className="backtest-stress__scenario-grid">
                  {stressScenarios.map(scenario => (
                    <button
                      key={scenario.id}
                      className="backtest-stress__scenario-btn"
                      onClick={() => runStressTest(scenario.id)}
                      disabled={running}
                    >
                      <span className="name">{scenario.name}</span>
                      <span className={`severity severity--${scenario.severity?.toLowerCase()}`}>
                        {scenario.severity}
                      </span>
                    </button>
                  ))}
                </div>
              </Card.Content>
            </Card>

            {stressResults && (
              <div className="backtest-stress__results">
                <Card variant="base">
                  <Card.Header>
                    <h4>{stressResults.scenario?.name}</h4>
                  </Card.Header>
                  <Card.Content>
                    <div className="backtest-metrics-grid">
                      <MetricCard
                        title="Portfolio Impact"
                        value={stressResults.results?.percentImpact}
                        subtitle={`$${stressResults.results?.totalImpact?.toLocaleString()}`}
                      />
                      <MetricCard
                        title="Worst Position"
                        value={stressResults.results?.worstPosition || '--'}
                        subtitle={`$${stressResults.results?.worstPositionImpact?.toLocaleString()}`}
                      />
                      <MetricCard
                        title="Est. Recovery"
                        value={`${stressResults.results?.estimatedRecoveryDays} days`}
                      />
                    </div>

                    <div className="backtest-stress__interpretation">
                      <ul>
                        {stressResults.interpretation?.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </Card.Content>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Regime Analysis Tab */}
        {activeTab === 'regime' && (
          <div className="backtest-regime">
            <div className="backtest-section__header">
              <h3>Regime-Conditional Performance</h3>
              <Button variant="secondary" onClick={runRegimeAnalysis} disabled={running} size="sm">
                {running ? 'Running...' : 'Run Analysis'}
              </Button>
            </div>

            {regimeResults ? (
              <div className="backtest-regime__results">
                <div className="backtest-regime__summary">
                  <MetricCard
                    title="Best Regime"
                    value={regimeResults.bestRegime?.regime || '--'}
                    subtitle={`Sharpe: ${regimeResults.bestRegime?.sharpe}`}
                  />
                  <MetricCard
                    title="Worst Regime"
                    value={regimeResults.worstRegime?.regime || '--'}
                    subtitle={`Sharpe: ${regimeResults.worstRegime?.sharpe}`}
                  />
                </div>

                <Card variant="base" className="backtest-regime__breakdown">
                  <Card.Header><h4>Performance by Regime</h4></Card.Header>
                  <Card.Content>
                    <table className="backtest-table">
                      <thead>
                        <tr>
                          <th>Regime</th>
                          <th>Days</th>
                          <th>Return</th>
                          <th>Sharpe</th>
                          <th>Max DD</th>
                          <th>Win Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(regimeResults.regimeBreakdown || {}).map(([regime, data]) => (
                          <tr key={regime}>
                            <td>{regime}</td>
                            <td>{data.tradingDays}</td>
                            <td>{data.metrics?.totalReturn ? (data.metrics.totalReturn * 100).toFixed(1) + '%' : '--'}</td>
                            <td>{data.metrics?.sharpe?.toFixed(2) || '--'}</td>
                            <td>{data.metrics?.maxDrawdown ? (data.metrics.maxDrawdown * 100).toFixed(1) + '%' : '--'}</td>
                            <td>{data.metrics?.winRate || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card.Content>
                </Card>

                <Card variant="base" className="backtest-regime__interpretation">
                  <Card.Header><h4>Interpretation</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {regimeResults.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="backtest-empty">
                <p>Run regime analysis to see performance across market conditions</p>
              </Card>
            )}
          </div>
        )}

        {/* Capacity Analysis Tab */}
        {activeTab === 'capacity' && (
          <div className="backtest-capacity">
            <div className="backtest-section__header">
              <h3>Strategy Capacity Analysis</h3>
              <Button variant="secondary" onClick={runCapacityAnalysis} disabled={running} size="sm">
                {running ? 'Running...' : 'Run Analysis'}
              </Button>
            </div>

            {capacityResults ? (
              <div className="backtest-capacity__results">
                <div className="backtest-metrics-grid">
                  <MetricCard
                    title="Current AUM"
                    value={capacityResults.currentAUM}
                  />
                  <MetricCard
                    title="Estimated Capacity"
                    value={capacityResults.estimatedCapacity}
                    subtitle={`${capacityResults.capacityMultiple} current size`}
                  />
                  <MetricCard
                    title="Liquidity Score"
                    value={capacityResults.liquidityScore}
                    subtitle={capacityResults.liquidityRating}
                  />
                </div>

                <Card variant="base" className="backtest-capacity__thresholds">
                  <Card.Header><h4>Capacity Thresholds</h4></Card.Header>
                  <Card.Content>
                    <div className="backtest-capacity__threshold-grid">
                      <div className="threshold">
                        <span className="label">@ 10 bps slippage:</span>
                        <span className="value">{capacityResults.thresholds?.capacityAt10bps}</span>
                      </div>
                      <div className="threshold">
                        <span className="label">@ 25 bps slippage:</span>
                        <span className="value">{capacityResults.thresholds?.capacityAt25bps}</span>
                      </div>
                      <div className="threshold">
                        <span className="label">@ 50 bps slippage:</span>
                        <span className="value">{capacityResults.thresholds?.capacityAt50bps}</span>
                      </div>
                    </div>
                  </Card.Content>
                </Card>

                {capacityResults.constraints?.length > 0 && (
                  <Card variant="base" className="backtest-capacity__constraints">
                    <Card.Header><h4>Capacity Constraints</h4></Card.Header>
                    <Card.Content>
                      <table className="backtest-table">
                        <thead>
                          <tr>
                            <th>Symbol</th>
                            <th>Weight</th>
                            <th>Avg Volume</th>
                            <th>Position Capacity</th>
                            <th>Constraint</th>
                          </tr>
                        </thead>
                        <tbody>
                          {capacityResults.constraints.slice(0, 5).map((c, idx) => (
                            <tr key={idx}>
                              <td>{c.symbol}</td>
                              <td>{c.weight}</td>
                              <td>{c.avgVolume}</td>
                              <td>{c.positionCapacity}</td>
                              <td>
                                <StatusBadge
                                  status={c.constraint === 'HIGH' ? 'pass' : c.constraint === 'MODERATE' ? 'warning' : 'fail'}
                                  label={c.constraint}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card.Content>
                  </Card>
                )}

                <Card variant="base" className="backtest-capacity__interpretation">
                  <Card.Header><h4>Interpretation</h4></Card.Header>
                  <Card.Content>
                    <ul>
                      {capacityResults.interpretation?.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </Card.Content>
                </Card>
              </div>
            ) : (
              <Card variant="base" className="backtest-empty">
                <p>Run capacity analysis to estimate strategy scalability</p>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default BacktestDashboard;
