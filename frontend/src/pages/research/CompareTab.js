// frontend/src/pages/research/CompareTab.js
// Unified Compare tab with Price Charts and Metrics Comparison views
import { useState } from 'react';
import { LineChart, BarChart3 } from '../../components/icons';
import ComparePage from '../ComparePage';
import AdvancedChartsPage from '../AdvancedChartsPage';
import './CompareTab.css';

const VIEW_MODES = [
  { id: 'metrics', label: 'Metrics', icon: BarChart3, description: 'Compare fundamental metrics' },
  { id: 'price', label: 'Price Charts', icon: LineChart, description: 'Compare price performance' }
];

export default function CompareTab() {
  const [viewMode, setViewMode] = useState('metrics');

  return (
    <div className="compare-tab">
      {/* View mode toggle */}
      <div className="compare-view-toggle">
        {VIEW_MODES.map(mode => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              className={`view-toggle-btn ${viewMode === mode.id ? 'active' : ''}`}
              onClick={() => setViewMode(mode.id)}
              title={mode.description}
            >
              <Icon size={16} />
              <span>{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* View content */}
      <div className="compare-view-content">
        {viewMode === 'metrics' && <ComparePage embedded />}
        {viewMode === 'price' && <AdvancedChartsPage embedded />}
      </div>
    </div>
  );
}
