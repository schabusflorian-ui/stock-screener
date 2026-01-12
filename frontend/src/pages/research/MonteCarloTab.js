// frontend/src/pages/research/MonteCarloTab.js
// Monte Carlo simulations - standalone version for Research Lab
import { useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import MonteCarloPanel from '../../components/portfolio/MonteCarloPanel';
import './MonteCarloTab.css';

export default function MonteCarloTab() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="monte-carlo-tab">
      <div className="tab-header">
        <div className="header-content">
          <h2>Monte Carlo Simulation</h2>
          <p className="subtitle">Run probability simulations on portfolio performance</p>
        </div>
        <button
          className="info-btn"
          onClick={() => setShowInfo(!showInfo)}
          title="About Monte Carlo"
        >
          <Info size={18} />
        </button>
      </div>

      {showInfo && (
        <div className="info-panel">
          <h4>About Monte Carlo Simulations</h4>
          <p>
            Monte Carlo simulation uses random sampling to model the probability of different
            outcomes in a process that cannot easily be predicted. For portfolios, it helps
            understand the range of potential future values based on historical return patterns.
          </p>
          <ul>
            <li><strong>Simulations:</strong> Number of random scenarios to generate</li>
            <li><strong>Time Horizon:</strong> How far into the future to project</li>
            <li><strong>Return Model:</strong> Historical vs. parametric distribution</li>
          </ul>
        </div>
      )}

      <div className="monte-carlo-notice">
        <AlertTriangle size={18} />
        <span>Select a portfolio to run Monte Carlo simulations, or use standalone mode with custom parameters.</span>
      </div>

      <MonteCarloPanel
        portfolioId={null}
        initialValue={100000}
      />
    </div>
  );
}
