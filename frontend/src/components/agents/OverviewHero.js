// frontend/src/components/agents/OverviewHero.js
// Hero section for Agent Overview tab - shows primary metric

import { TrendingUp, TrendingDown, Wallet, Target } from '../icons';
import './OverviewHero.css';

function formatCurrency(value) {
  if (value == null) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  if (value == null) return '0%';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

const STRATEGY_LABELS = {
  dca: 'Dollar Cost Averaging',
  value_averaging: 'Value Averaging',
  drip: 'Dividend Reinvestment',
  rebalance: 'Portfolio Rebalancing',
  lump_dca: 'Lump Sum + DCA'
};

const FREQUENCY_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly'
};

// Advanced Agent Hero - Shows total portfolio value
function ValueHero({ totalValue, totalPnL, pnlPercent, portfolioCount }) {
  const isPositive = totalPnL >= 0;

  return (
    <div className="overview-hero overview-hero--value">
      <div className="overview-hero__icon">
        <Wallet size={24} />
      </div>
      <div className="overview-hero__content">
        <div className="overview-hero__label">Total Portfolio Value</div>
        <div className="overview-hero__primary">
          <span className="overview-hero__value">{formatCurrency(totalValue)}</span>
          {totalPnL != null && (
            <span className={`overview-hero__pnl ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              {formatCurrency(Math.abs(totalPnL))} ({formatPercent(pnlPercent)})
            </span>
          )}
        </div>
        <div className="overview-hero__secondary">
          {portfolioCount} {portfolioCount === 1 ? 'portfolio' : 'portfolios'} managed
        </div>
      </div>
    </div>
  );
}

// Beginner Agent Hero - Shows progress toward goal
function ProgressHero({ currentValue, targetValue, strategy, frequency, contributionAmount, estimatedCompletion }) {
  const percent = targetValue > 0 ? Math.min((currentValue / targetValue) * 100, 100) : 0;
  const strategyLabel = STRATEGY_LABELS[strategy] || strategy;
  const frequencyLabel = FREQUENCY_LABELS[frequency] || frequency;

  return (
    <div className="overview-hero overview-hero--progress">
      <div className="overview-hero__icon">
        <Target size={24} />
      </div>
      <div className="overview-hero__content">
        <div className="overview-hero__label">Progress to Goal</div>
        <div className="overview-hero__progress-container">
          <div className="overview-hero__progress-bar">
            <div
              className="overview-hero__progress-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="overview-hero__progress-percent">{percent.toFixed(0)}%</span>
        </div>
        <div className="overview-hero__progress-values">
          <span className="overview-hero__current">{formatCurrency(currentValue)}</span>
          <span className="overview-hero__separator">of</span>
          <span className="overview-hero__target">{formatCurrency(targetValue)} target</span>
        </div>
        <div className="overview-hero__secondary">
          {strategyLabel} {frequencyLabel && `(${frequencyLabel})`}
          {contributionAmount && ` • ${formatCurrency(contributionAmount)}/contribution`}
          {estimatedCompletion && ` • Est. ${estimatedCompletion}`}
        </div>
      </div>
    </div>
  );
}

// No portfolios state
function EmptyHero({ onAddPortfolio }) {
  return (
    <div className="overview-hero overview-hero--empty">
      <div className="overview-hero__icon">
        <Wallet size={24} />
      </div>
      <div className="overview-hero__content">
        <div className="overview-hero__label">No Portfolios Yet</div>
        <div className="overview-hero__empty-text">
          Add a portfolio to start tracking your agent's performance
        </div>
        {onAddPortfolio && (
          <button className="overview-hero__cta" onClick={onAddPortfolio}>
            Add Portfolio
          </button>
        )}
      </div>
    </div>
  );
}

export default function OverviewHero({
  type = 'value',
  // Value props
  totalValue = 0,
  totalPnL = null,
  pnlPercent = null,
  portfolioCount = 0,
  // Progress props
  currentValue = 0,
  targetValue = 0,
  strategy = '',
  frequency = '',
  contributionAmount = null,
  estimatedCompletion = null,
  // Empty state
  onAddPortfolio = null
}) {
  // Show empty state if no portfolios and type is value
  if (type === 'value' && portfolioCount === 0) {
    return <EmptyHero onAddPortfolio={onAddPortfolio} />;
  }

  if (type === 'progress') {
    return (
      <ProgressHero
        currentValue={currentValue}
        targetValue={targetValue}
        strategy={strategy}
        frequency={frequency}
        contributionAmount={contributionAmount}
        estimatedCompletion={estimatedCompletion}
      />
    );
  }

  return (
    <ValueHero
      totalValue={totalValue}
      totalPnL={totalPnL}
      pnlPercent={pnlPercent}
      portfolioCount={portfolioCount}
    />
  );
}
