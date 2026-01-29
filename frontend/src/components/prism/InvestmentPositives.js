// frontend/src/components/prism/InvestmentPositives.js
// Investment Positives (Bulls Say) component

import { TrendingUp, CheckCircle } from 'lucide-react';
import './InvestmentPositives.css';

export function InvestmentPositives({ positives }) {
  if (!positives || positives.length === 0) {
    return (
      <div className="investment-positives empty">
        <p>Investment positives not yet analyzed</p>
      </div>
    );
  }

  return (
    <div className="investment-positives">
      {positives.map((positive, index) => (
        <PositiveCard key={index} positive={positive} index={index + 1} />
      ))}
    </div>
  );
}

function PositiveCard({ positive, index }) {
  const {
    thesis,
    evidence,
    dataPoints,
    confidence
  } = typeof positive === 'string' ? { thesis: positive } : positive;

  return (
    <div className="positive-card">
      <div className="positive-header">
        <div className="positive-icon">
          <TrendingUp size={16} />
        </div>
        <div className="positive-number">{index}</div>
      </div>

      <div className="positive-content">
        <h4 className="positive-thesis">{thesis}</h4>

        {evidence && (
          <p className="positive-evidence">{evidence}</p>
        )}

        {dataPoints && dataPoints.length > 0 && (
          <div className="positive-data-points">
            {dataPoints.map((point, i) => (
              <span key={i} className="data-point">
                <CheckCircle size={12} />
                {point}
              </span>
            ))}
          </div>
        )}

        {confidence && (
          <div className={`positive-confidence confidence-${confidence.toLowerCase()}`}>
            {confidence} Confidence
          </div>
        )}
      </div>
    </div>
  );
}

export default InvestmentPositives;
