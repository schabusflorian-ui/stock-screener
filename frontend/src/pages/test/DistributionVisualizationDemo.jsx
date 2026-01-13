// frontend/src/pages/test/DistributionVisualizationDemo.jsx
// Visual demo page for testing distribution visualization components
import { useState } from 'react';
import {
  FatTailWarningBanner,
  TalebRiskDashboard,
  DistributionComparisonChart
} from '../../components/portfolio/TalebComponents';
import './DistributionVisualizationDemo.css';

function DistributionVisualizationDemo() {
  const [selectedScenario, setSelectedScenario] = useState('high');

  // Mock data scenarios
  const scenarios = {
    moderate: {
      label: 'Moderate Tails (Kurtosis 4.2)',
      distributionFit: {
        type: 'studentT',
        name: "Student's t",
        params: {
          mean: 0.085,
          scale: 0.145,
          df: 8.5
        }
      },
      moments: {
        mean: 0.085,
        std: 0.145,
        skewness: -0.15,
        kurtosis: 4.2,
        excessKurtosis: 1.2
      },
      varComparison: {
        normalVaR: -0.154,
        adjustedVaR: -0.183,
        underestimationPct: 18.8,
        normalVaR99: -0.220,
        adjustedVaR99: -0.265,
        normalCVaR: -0.195,
        adjustedCVaR: -0.238
      }
    },
    high: {
      label: 'Heavy Tails (Kurtosis 5.5)',
      distributionFit: {
        type: 'studentT',
        name: "Student's t (Heavy Tails)",
        params: {
          mean: 0.075,
          scale: 0.162,
          df: 4.8
        }
      },
      moments: {
        mean: 0.075,
        std: 0.162,
        skewness: -0.35,
        kurtosis: 5.5,
        excessKurtosis: 2.5
      },
      varComparison: {
        normalVaR: -0.192,
        adjustedVaR: -0.267,
        underestimationPct: 39.1,
        normalVaR99: -0.285,
        adjustedVaR99: -0.412,
        normalCVaR: -0.243,
        adjustedCVaR: -0.356
      }
    },
    critical: {
      label: 'Extreme Tails (Kurtosis 7.2)',
      distributionFit: {
        type: 'studentT',
        name: "Student's t (Extreme Tails)",
        params: {
          mean: 0.068,
          scale: 0.185,
          df: 3.2
        }
      },
      moments: {
        mean: 0.068,
        std: 0.185,
        skewness: -0.52,
        kurtosis: 7.2,
        excessKurtosis: 4.2
      },
      varComparison: {
        normalVaR: -0.236,
        adjustedVaR: -0.358,
        underestimationPct: 51.7,
        normalVaR99: -0.356,
        adjustedVaR99: -0.585,
        normalCVaR: -0.298,
        adjustedCVaR: -0.485
      }
    }
  };

  const currentData = scenarios[selectedScenario];

  // Mock simulation results
  const mockSimulationResults = {
    simulationCount: 10000,
    survivalRate: selectedScenario === 'critical' ? 78.5 : selectedScenario === 'high' ? 85.2 : 91.3,
    medianEndingValue: 1234567,
    meanEndingValue: 1345678,
    percentile5: 678901,
    percentile95: 1890123
  };

  return (
    <div className="distribution-demo-page">
      <div className="demo-header">
        <h1>Distribution Visualization Demo</h1>
        <p className="demo-subtitle">
          Interactive preview of heavy-tail risk components
        </p>
      </div>

      {/* Scenario Selector */}
      <div className="scenario-selector">
        <h3>Select Risk Scenario:</h3>
        <div className="scenario-buttons">
          <button
            className={`scenario-btn ${selectedScenario === 'moderate' ? 'active moderate' : ''}`}
            onClick={() => setSelectedScenario('moderate')}
          >
            <span className="scenario-icon">📊</span>
            <span className="scenario-label">Moderate Tails</span>
            <span className="scenario-detail">Kurtosis 4.2</span>
          </button>
          <button
            className={`scenario-btn ${selectedScenario === 'high' ? 'active high' : ''}`}
            onClick={() => setSelectedScenario('high')}
          >
            <span className="scenario-icon">⚠️</span>
            <span className="scenario-label">Heavy Tails</span>
            <span className="scenario-detail">Kurtosis 5.5</span>
          </button>
          <button
            className={`scenario-btn ${selectedScenario === 'critical' ? 'active critical' : ''}`}
            onClick={() => setSelectedScenario('critical')}
          >
            <span className="scenario-icon">🚨</span>
            <span className="scenario-label">Extreme Tails</span>
            <span className="scenario-detail">Kurtosis 7.2</span>
          </button>
        </div>
      </div>

      {/* Data Preview */}
      <div className="data-preview">
        <h4>Current Scenario Data:</h4>
        <div className="data-grid">
          <div className="data-item">
            <span className="data-label">Mean Return:</span>
            <span className="data-value">{(currentData.moments.mean * 100).toFixed(2)}%</span>
          </div>
          <div className="data-item">
            <span className="data-label">Std Deviation:</span>
            <span className="data-value">{(currentData.moments.std * 100).toFixed(2)}%</span>
          </div>
          <div className="data-item">
            <span className="data-label">Skewness:</span>
            <span className="data-value">{currentData.moments.skewness.toFixed(3)}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Kurtosis:</span>
            <span className="data-value">{currentData.moments.kurtosis.toFixed(2)}</span>
          </div>
          <div className="data-item">
            <span className="data-label">Degrees of Freedom:</span>
            <span className="data-value">{currentData.distributionFit.params.df.toFixed(1)}</span>
          </div>
          <div className="data-item">
            <span className="data-label">VaR Underestimation:</span>
            <span className="data-value">{currentData.varComparison.underestimationPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Component Demos */}
      <div className="demo-components">
        <div className="component-section">
          <div className="component-header">
            <h3>1. Fat Tail Warning Banner</h3>
            <p>Appears automatically when heavy tails detected (kurtosis {'>'} 3.5)</p>
          </div>
          <FatTailWarningBanner
            distributionFit={currentData.distributionFit}
            moments={currentData.moments}
            varComparison={currentData.varComparison}
          />
        </div>

        <div className="component-section">
          <div className="component-header">
            <h3>2. Risk Model Comparison Dashboard</h3>
            <p>Expandable comparison of normal vs. heavy-tailed risk estimates</p>
          </div>
          <TalebRiskDashboard
            distributionFit={currentData.distributionFit}
            moments={currentData.moments}
            varComparison={currentData.varComparison}
            simulationResults={mockSimulationResults}
          />
        </div>

        <div className="component-section">
          <div className="component-header">
            <h3>3. Distribution Comparison Chart</h3>
            <p>Visual overlay showing where normal models fail to capture tail risk</p>
          </div>
          <DistributionComparisonChart
            moments={currentData.moments}
            distributionFit={currentData.distributionFit}
            historicalReturns={null}
          />
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="usage-instructions">
        <h3>Integration Instructions</h3>
        <div className="instruction-card">
          <h4>Drop-in Replacement (Recommended)</h4>
          <pre><code>{`import MonteCarloPanel from './components/portfolio/MonteCarloPanel.enhanced';

<MonteCarloPanel portfolioId={123} initialValue={100000} />`}</code></pre>
        </div>

        <div className="instruction-card">
          <h4>Individual Components</h4>
          <pre><code>{`import {
  FatTailWarningBanner,
  TalebRiskDashboard,
  DistributionComparisonChart
} from './components/portfolio/TalebComponents';

{results.distributionFit && results.distributionFit.moments?.kurtosis > 3.5 && (
  <>
    <FatTailWarningBanner {...props} />
    <TalebRiskDashboard {...props} />
    <DistributionComparisonChart {...props} />
  </>
)}`}</code></pre>
        </div>
      </div>
    </div>
  );
}

export default DistributionVisualizationDemo;
