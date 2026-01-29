// frontend/src/pages/agents/components/BeginnerStrategyTypeStep.js
// Step for selecting beginner strategy type

import React from 'react';
import {
  DollarSign,
  TrendingUp,
  RefreshCw,
  PieChart,
  Layers,
  ChevronRight,
  Info,
  IconButton
} from '../../../components/icons';
import './BeginnerWizard.css';

const STRATEGY_TYPES = [
  {
    id: 'dca',
    name: 'Dollar Cost Averaging',
    shortName: 'DCA',
    icon: DollarSign,
    color: '#059669',
    description: 'Invest a fixed amount at regular intervals',
    details: [
      'Reduces timing risk',
      'Automatic and consistent',
      'Best for long-term growth'
    ],
    ideal: 'Regular income investors'
  },
  {
    id: 'value_averaging',
    name: 'Value Averaging',
    shortName: 'VA',
    icon: TrendingUp,
    color: '#2563EB',
    description: 'Adjust contributions to hit growth targets',
    details: [
      'Buy more when market is down',
      'Buy less when market is up',
      'Targets steady portfolio growth'
    ],
    ideal: 'Disciplined investors'
  },
  {
    id: 'drip',
    name: 'Dividend Reinvestment',
    shortName: 'DRIP',
    icon: RefreshCw,
    color: '#7C3AED',
    description: 'Automatically reinvest dividends',
    details: [
      'Compound returns over time',
      'No contribution required',
      'Works with dividend stocks/ETFs'
    ],
    ideal: 'Income-focused investors'
  },
  {
    id: 'rebalance',
    name: 'Portfolio Rebalancing',
    shortName: 'Rebalance',
    icon: PieChart,
    color: '#D97706',
    description: 'Maintain target asset allocation',
    details: [
      'Sells winners, buys losers',
      'Enforces discipline',
      'Quarterly or threshold-based'
    ],
    ideal: 'Balanced portfolio investors'
  },
  {
    id: 'lump_dca',
    name: 'Lump Sum + DCA Hybrid',
    shortName: 'Hybrid',
    icon: Layers,
    color: '#7C3AED',
    description: 'Invest portion now, DCA the rest',
    details: [
      'Balance time-in-market with risk',
      'Great for windfalls/bonuses',
      'Customizable split ratio'
    ],
    ideal: 'One-time investment events'
  }
];

function BeginnerStrategyTypeStep({ selectedType, onSelect }) {
  return (
    <div className="beginner-step">
      <div className="beginner-step__header">
        <h2>Choose Your Strategy</h2>
        <p className="beginner-step__subtitle">
          Select a simple, proven investment strategy. All strategies are designed
          for long-term wealth building with minimal active management.
        </p>
      </div>

      <div className="strategy-type-grid">
        {STRATEGY_TYPES.map(strategy => {
          const Icon = strategy.icon;
          const isSelected = selectedType === strategy.id;

          return (
            <button
              key={strategy.id}
              type="button"
              className={`strategy-type-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(strategy.id)}
              style={{ '--strategy-color': strategy.color }}
            >
              <div className="strategy-type-card__header">
                <IconButton
                  icon={Icon}
                  color={strategy.color}
                  pastel={`${strategy.color}20`}
                  darkColor={strategy.color}
                  size="small"
                  className="strategy-type-card__icon-btn"
                />
                <div className="strategy-type-card__title">
                  <h3>{strategy.name}</h3>
                  <span className="strategy-type-card__short">{strategy.shortName}</span>
                </div>
                <ChevronRight
                  size={20}
                  className={`strategy-type-card__arrow ${isSelected ? 'visible' : ''}`}
                />
              </div>

              <p className="strategy-type-card__desc">{strategy.description}</p>

              <ul className="strategy-type-card__details">
                {strategy.details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>

              <div className="strategy-type-card__ideal">
                <Info size={14} />
                <span>Ideal for: {strategy.ideal}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="beginner-step__info-box">
        <Info size={18} />
        <div>
          <strong>Not sure which to choose?</strong>
          <p>
            DCA (Dollar Cost Averaging) is the most popular choice for beginners.
            It's simple, effective, and removes the stress of timing the market.
          </p>
        </div>
      </div>
    </div>
  );
}

export default BeginnerStrategyTypeStep;
export { STRATEGY_TYPES };