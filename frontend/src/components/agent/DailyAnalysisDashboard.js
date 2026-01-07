// frontend/src/components/agent/DailyAnalysisDashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Play, RefreshCw, Clock, TrendingUp, TrendingDown, Target, Percent } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { Skeleton } from '../Skeleton';
import RegimeIndicator from './RegimeIndicator';
import OpportunityList from './OpportunityList';
import AgentRecommendation from './AgentRecommendation';
import FactorPerformance from './FactorPerformance';
import { orchestratorAPI, attributionAPI } from '../../services/api';
import './DailyAnalysisDashboard.css';

/**
 * DailyAnalysisDashboard Component
 *
 * The main dashboard combining regime display, opportunities,
 * recommendations, and analysis controls.
 */
function DailyAnalysisDashboard({ portfolioId, className = '' }) {
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [regime, setRegime] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (portfolioId) {
      fetchData();
    }
  }, [portfolioId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch latest analysis and regime in parallel
      const [analysisRes, regimeRes] = await Promise.all([
        orchestratorAPI.getLatest(portfolioId).catch(() => ({ data: { success: false } })),
        attributionAPI.getRegime().catch(() => ({ data: { success: false } })),
      ]);

      if (analysisRes.data?.success) {
        setAnalysis(analysisRes.data.data);
      }
      if (regimeRes.data?.success) {
        setRegime(regimeRes.data.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = useCallback(async () => {
    setIsRunning(true);
    try {
      const response = await orchestratorAPI.run(portfolioId);
      if (response.data?.success) {
        setAnalysis(response.data.data);
      }
      // Refresh regime as well
      const regimeRes = await attributionAPI.getRegime();
      if (regimeRes.data?.success) {
        setRegime(regimeRes.data.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to run analysis');
    } finally {
      setIsRunning(false);
    }
  }, [portfolioId]);

  const handleSymbolSelect = useCallback((symbol) => {
    setSelectedSymbol(symbol);
  }, []);

  if (loading) {
    return (
      <div className={`daily-analysis-dashboard ${className}`}>
        <Skeleton className="daily-analysis-dashboard__skeleton-header" />
        <div className="daily-analysis-dashboard__grid">
          <Skeleton className="daily-analysis-dashboard__skeleton-section" />
          <Skeleton className="daily-analysis-dashboard__skeleton-section" />
        </div>
      </div>
    );
  }

  return (
    <div className={`daily-analysis-dashboard ${className}`}>
      {/* Header */}
      <div className="daily-analysis-dashboard__header">
        <div>
          <h2 className="daily-analysis-dashboard__title">Daily Analysis</h2>
          {analysis?.date && (
            <p className="daily-analysis-dashboard__subtitle">
              <Clock size={14} />
              Last updated: {new Date(analysis.date).toLocaleString()}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          onClick={runAnalysis}
          loading={isRunning}
          icon={isRunning ? RefreshCw : Play}
        >
          {isRunning ? 'Running...' : 'Run Analysis'}
        </Button>
      </div>

      {/* Market Regime */}
      {regime && <RegimeIndicator regime={regime} />}

      {/* Main Content Grid */}
      <div className="daily-analysis-dashboard__grid">
        {/* Opportunities */}
        <Card variant="glass" className="daily-analysis-dashboard__section">
          <Card.Header>
            <Card.Title>Today's Opportunities</Card.Title>
          </Card.Header>
          <Card.Content>
            <OpportunityList
              limit={10}
              onSelect={handleSymbolSelect}
            />
          </Card.Content>
        </Card>

        {/* Selected Recommendation */}
        <div className="daily-analysis-dashboard__recommendation">
          {selectedSymbol ? (
            <AgentRecommendation
              symbol={selectedSymbol}
              portfolioId={portfolioId}
            />
          ) : (
            <Card variant="base" className="daily-analysis-dashboard__placeholder">
              <div className="daily-analysis-dashboard__placeholder-content">
                <Target size={32} />
                <p>Select an opportunity to see detailed recommendation</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      {analysis?.summary && (
        <Card variant="glass" className="daily-analysis-dashboard__summary">
          <Card.Header>
            <Card.Title>Analysis Summary</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="daily-analysis-dashboard__stats">
              <div className="daily-analysis-dashboard__stat">
                <Target size={20} />
                <div className="daily-analysis-dashboard__stat-value">
                  {analysis.summary.opportunitiesFound || analysis.summary.opportunities_count || 0}
                </div>
                <div className="daily-analysis-dashboard__stat-label">Opportunities</div>
              </div>
              <div className="daily-analysis-dashboard__stat daily-analysis-dashboard__stat--positive">
                <TrendingUp size={20} />
                <div className="daily-analysis-dashboard__stat-value">
                  {analysis.summary.actionableBuys || 0}
                </div>
                <div className="daily-analysis-dashboard__stat-label">Buy Signals</div>
              </div>
              <div className="daily-analysis-dashboard__stat daily-analysis-dashboard__stat--negative">
                <TrendingDown size={20} />
                <div className="daily-analysis-dashboard__stat-value">
                  {analysis.summary.actionableSells || 0}
                </div>
                <div className="daily-analysis-dashboard__stat-label">Sell Signals</div>
              </div>
              <div className="daily-analysis-dashboard__stat daily-analysis-dashboard__stat--info">
                <Percent size={20} />
                <div className="daily-analysis-dashboard__stat-value">
                  {((analysis.summary.avgConfidence || 0) * 100).toFixed(0)}%
                </div>
                <div className="daily-analysis-dashboard__stat-label">Avg Confidence</div>
              </div>
            </div>
          </Card.Content>
        </Card>
      )}

      {/* Factor Performance */}
      <FactorPerformance portfolioId={portfolioId} />

      {/* Execution Info */}
      {analysis?.execution_time_ms && (
        <div className="daily-analysis-dashboard__footer">
          Analysis completed in {(analysis.execution_time_ms / 1000).toFixed(1)}s
        </div>
      )}

      {error && (
        <div className="daily-analysis-dashboard__error">
          {error}
        </div>
      )}
    </div>
  );
}

DailyAnalysisDashboard.propTypes = {
  portfolioId: PropTypes.number.isRequired,
  className: PropTypes.string,
};

export default DailyAnalysisDashboard;
