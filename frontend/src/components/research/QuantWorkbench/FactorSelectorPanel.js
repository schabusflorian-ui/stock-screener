// frontend/src/components/research/QuantWorkbench/FactorSelectorPanel.js
// Reusable factor selector panel for Test and Deploy tabs

import { TestTube, Rocket, Settings, X, Play } from '../../icons';
import { STANDARD_FACTORS } from './FactorRepository';

/**
 * FactorSelectorPanel - Unified factor selection UI
 *
 * @param {Object} props
 * @param {Object} props.selectedFactor - Currently selected factor
 * @param {Function} props.onSelectFactor - Callback when factor is selected
 * @param {Array} props.userFactors - User's custom factors
 * @param {string} props.context - 'test' or 'deploy' - affects title and action button
 * @param {Function} props.onAction - Callback for primary action button (Run Tests / Generate Signals)
 * @param {Function} props.onCreateNew - Callback to navigate to create new factor
 * @param {boolean} props.loading - Whether primary action is loading
 */
export default function FactorSelectorPanel({
  selectedFactor,
  onSelectFactor,
  userFactors = [],
  context = 'test',
  onAction,
  onCreateNew,
  loading = false
}) {
  // Context-specific labels
  const config = {
    test: {
      Icon: TestTube,
      title: 'Select Factor to Test',
      actionLabel: 'Run All Tests',
      actionIcon: Play
    },
    deploy: {
      Icon: Rocket,
      title: 'Select Factor to Deploy',
      actionLabel: 'Generate Signals',
      actionIcon: Play
    }
  };

  const { Icon, title, actionLabel, actionIcon: ActionIcon } = config[context] || config.test;

  return (
    <div className="factor-selector-panel">
      {/* Panel Header */}
      <div className="selector-panel-header">
        <div className="panel-title">
          <Icon size={18} />
          <h4>{title}</h4>
        </div>
      </div>

      {/* Factor selection grid - always visible */}
      <div className="factor-grid">
        {/* Standard Factors */}
        <div className="factor-category">
          <span className="category-label standard">Standard Factors</span>
          <div className="category-buttons">
            {STANDARD_FACTORS.map(f => (
              <button
                key={f.id}
                className={`factor-btn ${selectedFactor?.id === f.id ? 'active' : ''}`}
                onClick={() => onSelectFactor(f)}
                title={f.description}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Factors */}
        <div className="factor-category">
          <span className="category-label custom">
            Custom Factors
            {userFactors.length === 0 && <span className="empty-hint">(none yet)</span>}
          </span>
          <div className="category-buttons">
            {userFactors.map(f => (
              <button
                key={f.id}
                className={`factor-btn custom ${selectedFactor?.id === f.id ? 'active' : ''}`}
                onClick={() => onSelectFactor({ ...f, type: 'custom' })}
                title={f.description || f.formula}
              >
                {f.name}
              </button>
            ))}
            {onCreateNew && (
              <button
                className="factor-btn new"
                onClick={onCreateNew}
              >
                <Settings size={12} />
                Create New
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Selected factor indicator + Action button */}
      {selectedFactor && (
        <div className="selected-factor-bar">
          <div className="selected-info">
            <span className={`type-dot ${selectedFactor.type || 'standard'}`} />
            <strong>{selectedFactor.name}</strong>
            <code>
              {selectedFactor.formula?.length > 40
                ? selectedFactor.formula.slice(0, 40) + '...'
                : selectedFactor.formula}
            </code>
            <button
              className="clear-selection"
              onClick={() => onSelectFactor(null)}
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
          {onAction && (
            <button
              className={`run-tests-btn ${context === 'deploy' ? 'deploy-action' : ''}`}
              onClick={onAction}
              disabled={loading}
            >
              <ActionIcon size={14} />
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
