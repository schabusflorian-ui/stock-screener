// frontend/src/components/research/QuantWorkbench/DecayWarningBadge.js
// Decay Warning Badge - Visual indicator for factor decay

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, Info, X } from '../../icons';

export default function DecayWarningBadge({
  factorId,
  formula,
  icHistory,
  onDismiss,
  compact = false
}) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Fetch decay analysis
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (dismissed) return;

      setLoading(true);

      try {
        const response = await fetch('/api/factors/decay-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factorId,
            formula,
            icHistory
          })
        });

        const data = await response.json();

        if (data.success) {
          setAnalysis(data.data);
        }
      } catch (err) {
        console.warn('Failed to fetch decay analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    if (factorId || formula || icHistory) {
      fetchAnalysis();
    }
  }, [factorId, formula, icHistory, dismissed]);

  // Don't render if no decay detected
  if (loading || !analysis || !analysis.hasDecay) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // Compact mode - just a small badge
  if (compact) {
    return (
      <span
        className={`decay-badge-compact ${analysis.hasSevereDecay ? 'critical' : 'warning'}`}
        title={analysis.alert?.message || 'IC decay detected'}
      >
        <TrendingDown size={12} />
        {analysis.hasSevereDecay ? 'Decay' : 'Watch'}
      </span>
    );
  }

  // Full warning banner
  return (
    <div className={`decay-warning-banner ${analysis.alert?.level || 'warning'}`}>
      <div className="warning-icon">
        <AlertTriangle size={20} />
      </div>
      <div className="warning-content">
        <div className="warning-title">
          {analysis.hasSevereDecay ? 'Critical: Factor Decay Detected' : 'Warning: IC Declining'}
        </div>
        <div className="warning-message">
          {analysis.alert?.message}
        </div>
        <div className="warning-details">
          <span className="detail-item">
            <strong>Trend:</strong> {analysis.trend}
            {analysis.trendSlope && ` (${(analysis.trendSlope * 100).toFixed(3)}%/month)`}
          </span>
          <span className="detail-item">
            <strong>Recent IC:</strong> {(analysis.recentMean * 100).toFixed(2)}%
          </span>
          {analysis.halfLife && (
            <span className="detail-item">
              <strong>Est. half-life:</strong> {analysis.halfLife.toFixed(0)} months
            </span>
          )}
        </div>
        {analysis.alert?.recommendation && (
          <div className="warning-recommendation">
            <Info size={14} />
            {analysis.alert.recommendation}
          </div>
        )}
      </div>
      <button className="dismiss-btn" onClick={handleDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}
