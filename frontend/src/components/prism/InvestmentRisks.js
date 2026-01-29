// frontend/src/components/prism/InvestmentRisks.js
// Investment Risks (Bears Say) component

import { TrendingDown, AlertTriangle } from 'lucide-react';
import './InvestmentRisks.css';

export function InvestmentRisks({ risks }) {
  if (!risks || risks.length === 0) {
    return (
      <div className="investment-risks empty">
        <p>Investment risks not yet analyzed</p>
      </div>
    );
  }

  return (
    <div className="investment-risks">
      {risks.map((risk, index) => (
        <RiskCard key={index} risk={risk} index={index + 1} />
      ))}
    </div>
  );
}

function RiskCard({ risk, index }) {
  const {
    thesis,
    evidence,
    severity,
    probability,
    mitigation
  } = typeof risk === 'string' ? { thesis: risk } : risk;

  return (
    <div className="risk-card">
      <div className="risk-header">
        <div className="risk-icon">
          <TrendingDown size={16} />
        </div>
        <div className="risk-number">{index}</div>
        {severity && (
          <SeverityBadge severity={severity} />
        )}
      </div>

      <div className="risk-content">
        <h4 className="risk-thesis">{thesis}</h4>

        {evidence && (
          <p className="risk-evidence">{evidence}</p>
        )}

        {probability && (
          <div className="risk-probability">
            <AlertTriangle size={12} />
            <span>Probability: {formatProbability(probability)}</span>
          </div>
        )}

        {mitigation && (
          <div className="risk-mitigation">
            <span className="mitigation-label">Mitigating factors:</span>
            <p>{mitigation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const normalizedSeverity = typeof severity === 'string'
    ? severity.toLowerCase()
    : severity > 3 ? 'high' : severity > 1 ? 'medium' : 'low';

  return (
    <span className={`severity-badge ${normalizedSeverity}`}>
      {normalizedSeverity.charAt(0).toUpperCase() + normalizedSeverity.slice(1)} Risk
    </span>
  );
}

function formatProbability(prob) {
  if (typeof prob === 'string') return prob;
  if (typeof prob === 'number') {
    if (prob <= 1) return `${(prob * 100).toFixed(0)}%`;
    return `${prob.toFixed(0)}%`;
  }
  return prob;
}

export default InvestmentRisks;
