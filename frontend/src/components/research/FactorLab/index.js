// frontend/src/components/research/FactorLab/index.js
// Factor Lab - Interactive factor backtesting and signal generation

import { useState } from 'react';
import FactorCombinationTester from './FactorCombinationTester';
import ScreeningBacktest from './ScreeningBacktest';
import FactorSignalGenerator from './FactorSignalGenerator';
import './FactorLab.css';

const TABS = [
  { id: 'combination', label: 'Factor Combos', icon: '🧪' },
  { id: 'screening', label: 'Screen Backtest', icon: '📊' },
  { id: 'signals', label: 'Signals', icon: '🎯' }
];

export default function FactorLab() {
  const [activeTab, setActiveTab] = useState('combination');

  return (
    <div className="factor-lab">
      <div className="factor-lab-header">
        <h3>Factor Lab</h3>
        <p className="factor-lab-description">
          Test factor combinations, backtest screening strategies, and generate signals
        </p>
      </div>

      <div className="factor-lab-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`factor-lab-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="factor-lab-content">
        {activeTab === 'combination' && <FactorCombinationTester />}
        {activeTab === 'screening' && <ScreeningBacktest />}
        {activeTab === 'signals' && <FactorSignalGenerator />}
      </div>
    </div>
  );
}

export { FactorCombinationTester, ScreeningBacktest, FactorSignalGenerator };
