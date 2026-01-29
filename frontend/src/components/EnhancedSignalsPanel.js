// frontend/src/components/EnhancedSignalsPanel.js
// Displays enhanced signals: 13F activity, insider open market buys, earnings momentum

import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Briefcase,
  Award,
  ChevronDown,
  ChevronUp,
  Loader
} from './icons';
import { signalsAPI } from '../services/api';
import { useAskAI } from '../hooks/useAskAI';
import './EnhancedSignalsPanel.css';

function EnhancedSignalsPanel({ symbol }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signals, setSignals] = useState(null);
  const [expanded, setExpanded] = useState({
    thirteenF: false,
    insider: false,
    earnings: false
  });

  // Ask AI context menu for signals panel
  const askAIProps = useAskAI(() => ({
    type: 'metric',
    metric: 'signals',
    symbol,
    label: 'Enhanced Signals',
    combinedScore: signals?.combined?.score,
    thirteenFSignal: signals?.signals?.thirteenF?.score,
    insiderSignal: signals?.signals?.insider?.score,
    earningsSignal: signals?.signals?.earnings?.score
  }));

  useEffect(() => {
    if (!symbol) return;

    const fetchSignals = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await signalsAPI.getCombined(symbol);
        setSignals(res.data);
      } catch (err) {
        console.error('Error fetching signals:', err);
        setError('Failed to load signals');
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, [symbol]);

  const getScoreColor = (score) => {
    if (score >= 0.5) return 'strong-bullish';
    if (score >= 0.2) return 'bullish';
    if (score <= -0.5) return 'strong-bearish';
    if (score <= -0.2) return 'bearish';
    return 'neutral';
  };

  const getScoreLabel = (score) => {
    if (score >= 0.5) return 'Strong Buy';
    if (score >= 0.2) return 'Buy';
    if (score <= -0.5) return 'Strong Sell';
    if (score <= -0.2) return 'Sell';
    return 'Neutral';
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const toggleSection = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (loading) {
    return (
      <div className="enhanced-signals-panel loading" {...askAIProps}>
        <Loader className="spinning" size={20} />
        <span>Loading signals...</span>
      </div>
    );
  }

  if (error || !signals) {
    return null; // Silent fail - don't show panel if no data
  }

  const { thirteenF, insider, earnings, combined } = signals.signals ? signals.signals : signals;
  const combinedData = signals.combined || combined;

  // Check if we have any meaningful data
  const hasData = (thirteenF?.confidence > 0) || (insider?.confidence > 0) || (earnings?.confidence > 0);

  if (!hasData) {
    return null; // No signals to show
  }

  return (
    <div className="enhanced-signals-panel" {...askAIProps}>
      <div className="panel-header">
        <h3>
          <BarChart3 size={18} />
          Enhanced Signals
        </h3>
        {combinedData && combinedData.confidence > 0 && (
          <div className={`combined-score ${getScoreColor(combinedData.score)}`}>
            <span className="score-value">{(combinedData.score * 100).toFixed(0)}</span>
            <span className="score-label">{combinedData.interpretation || getScoreLabel(combinedData.score)}</span>
          </div>
        )}
      </div>

      {/* 13F Activity */}
      {thirteenF && thirteenF.confidence > 0 && (
        <div className="signal-section">
          <button
            className="section-header"
            onClick={() => toggleSection('thirteenF')}
          >
            <div className="section-title">
              <Briefcase size={16} />
              <span>13F Super-Investor Activity</span>
            </div>
            <div className="section-summary">
              <span className={`signal-badge ${getScoreColor(thirteenF.score)}`}>
                {getScoreLabel(thirteenF.score)}
              </span>
              {expanded.thirteenF ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {expanded.thirteenF && thirteenF.details && (
            <div className="section-content">
              <p className="interpretation">{thirteenF.interpretation}</p>

              {thirteenF.details.newPositions?.length > 0 && (
                <div className="activity-group">
                  <h5><TrendingUp size={14} /> New Positions</h5>
                  <div className="activity-list">
                    {thirteenF.details.newPositions.map((p, i) => (
                      <div key={i} className="activity-item bullish">
                        <span className="investor-name">{p.investor}</span>
                        <span className="activity-value">{formatValue(p.value)}</span>
                        <span className="activity-date">{formatDate(p.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {thirteenF.details.increases?.length > 0 && (
                <div className="activity-group">
                  <h5><TrendingUp size={14} /> Position Increases</h5>
                  <div className="activity-list">
                    {thirteenF.details.increases.map((p, i) => (
                      <div key={i} className="activity-item bullish">
                        <span className="investor-name">{p.investor}</span>
                        <span className="activity-value">+{p.changePct?.toFixed(0)}%</span>
                        <span className="activity-date">{formatDate(p.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {thirteenF.details.exits?.length > 0 && (
                <div className="activity-group">
                  <h5><TrendingDown size={14} /> Exits</h5>
                  <div className="activity-list">
                    {thirteenF.details.exits.map((p, i) => (
                      <div key={i} className="activity-item bearish">
                        <span className="investor-name">{p.investor}</span>
                        <span className="activity-value">Sold</span>
                        <span className="activity-date">{formatDate(p.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="signal-meta">
                <span>Confidence: {(thirteenF.confidence * 100).toFixed(0)}%</span>
                <span>{thirteenF.details.investorCount} investor(s) tracked</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Insider Open Market Buys */}
      {insider && insider.confidence > 0 && (
        <div className="signal-section">
          <button
            className="section-header"
            onClick={() => toggleSection('insider')}
          >
            <div className="section-title">
              <Users size={16} />
              <span>Insider Activity (Classified)</span>
            </div>
            <div className="section-summary">
              <span className={`signal-badge ${getScoreColor(insider.score)}`}>
                {getScoreLabel(insider.score)}
              </span>
              {expanded.insider ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {expanded.insider && insider.details && (
            <div className="section-content">
              <p className="interpretation">{insider.interpretation}</p>

              {insider.details.openMarketBuys?.length > 0 && (
                <div className="activity-group highlight">
                  <h5><Award size={14} /> Open Market Buys (Most Bullish)</h5>
                  <div className="activity-list">
                    {insider.details.openMarketBuys.map((b, i) => (
                      <div key={i} className="activity-item bullish">
                        <div className="insider-info">
                          <span className="insider-name">{b.insider}</span>
                          <span className="insider-title">{b.title}</span>
                        </div>
                        <span className="activity-value">{formatValue(b.value)}</span>
                        <span className="activity-date">{formatDate(b.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insider.details.sells?.length > 0 && (
                <div className="activity-group">
                  <h5><TrendingDown size={14} /> Sales</h5>
                  <div className="activity-list">
                    {insider.details.sells.slice(0, 3).map((s, i) => (
                      <div key={i} className="activity-item bearish">
                        <div className="insider-info">
                          <span className="insider-name">{s.insider}</span>
                          <span className="insider-title">{s.title}</span>
                        </div>
                        <span className="activity-value">{formatValue(s.value)}</span>
                        <span className="activity-date">{formatDate(s.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {insider.details.optionExercises?.length > 0 && (
                <div className="activity-group muted">
                  <h5>Option Exercises (Neutral)</h5>
                  <p className="note">{insider.details.optionExercises.length} exercise(s) - compensation-related, not discretionary</p>
                </div>
              )}

              <div className="signal-meta">
                <span>Confidence: {(insider.confidence * 100).toFixed(0)}%</span>
                <span>Net Buy: {formatValue(insider.details.netBuyValue - insider.details.netSellValue)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Earnings Momentum */}
      {earnings && earnings.confidence > 0 && (
        <div className="signal-section">
          <button
            className="section-header"
            onClick={() => toggleSection('earnings')}
          >
            <div className="section-title">
              <BarChart3 size={16} />
              <span>Earnings Momentum</span>
            </div>
            <div className="section-summary">
              <span className={`signal-badge ${getScoreColor(earnings.score)}`}>
                {getScoreLabel(earnings.score)}
              </span>
              {expanded.earnings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </button>

          {expanded.earnings && earnings.details && (
            <div className="section-content">
              <p className="interpretation">{earnings.interpretation}</p>

              <div className="earnings-stats">
                <div className="stat-item">
                  <span className="stat-label">Consecutive Beats</span>
                  <span className={`stat-value ${earnings.details.consecutiveBeats >= 3 ? 'positive' : ''}`}>
                    {earnings.details.consecutiveBeats || 0}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Beat Rate</span>
                  <span className="stat-value">
                    {earnings.details.beatRate ? `${(earnings.details.beatRate * 100).toFixed(0)}%` : '-'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Avg Surprise</span>
                  <span className={`stat-value ${earnings.details.avgSurprise > 0 ? 'positive' : earnings.details.avgSurprise < 0 ? 'negative' : ''}`}>
                    {earnings.details.avgSurprise ? `${earnings.details.avgSurprise.toFixed(1)}%` : '-'}
                  </span>
                </div>
                {earnings.details.trend && (
                  <div className="stat-item">
                    <span className="stat-label">Trend</span>
                    <span className={`stat-value trend-${earnings.details.trend}`}>
                      {earnings.details.trend}
                    </span>
                  </div>
                )}
              </div>

              {earnings.details.recentQuarters?.length > 0 && (
                <div className="recent-quarters">
                  <h5>Recent Quarters</h5>
                  <div className="quarters-list">
                    {earnings.details.recentQuarters.map((q, i) => (
                      <div key={i} className={`quarter-item ${q.beat ? 'beat' : 'miss'}`}>
                        <span className="quarter-name">{q.quarter}</span>
                        <span className="quarter-result">
                          {q.beat ? '✓' : '✗'} {q.surprisePct?.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="signal-meta">
                <span>Confidence: {(earnings.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default EnhancedSignalsPanel;
