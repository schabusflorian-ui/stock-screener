// components/empty-states/EmptyState.jsx
import './EmptyState.css';

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  actionLabel,
  secondaryAction,
  secondaryLabel,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <span>{icon}</span>
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {(action || secondaryAction) && (
        <div className="empty-state-actions">
          {action && (
            <button onClick={action} className="empty-state-action-primary">
              {actionLabel}
            </button>
          )}
          {secondaryAction && (
            <button onClick={secondaryAction} className="empty-state-action-secondary">
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Pre-built empty states for common scenarios
export const EmptyWatchlist = ({ onAddStock }) => (
  <EmptyState
    icon="⭐"
    title="Your watchlist is empty"
    description="Start tracking stocks by adding them to your watchlist. Search for any company or browse our suggestions."
    action={onAddStock}
    actionLabel="Add your first stock"
  />
);

export const EmptyPortfolio = ({ onCreate }) => (
  <EmptyState
    icon="📊"
    title="No portfolios yet"
    description="Create a portfolio to track your investments and see how they perform over time. Test strategies without real money!"
    action={onCreate}
    actionLabel="Create portfolio"
    secondaryAction={() => window.open('/help/portfolios', '_blank')}
    secondaryLabel="Learn more"
  />
);

export const EmptyAlerts = ({ onCreate }) => (
  <EmptyState
    icon="🔔"
    title="No alerts set"
    description="Get notified when stocks hit your target prices. Set up price alerts to never miss an opportunity!"
    action={onCreate}
    actionLabel="Create alert"
  />
);

export const EmptySearchResults = ({ query, onClear }) => (
  <EmptyState
    icon="🔍"
    title={`No results for "${query}"`}
    description="Try a different search term, or check the spelling. You can search by company name or ticker symbol."
    action={onClear}
    actionLabel="Clear search"
  />
);

export const EmptyNews = ({ symbol }) => (
  <EmptyState
    icon="📰"
    title="No recent news"
    description={`We couldn't find any recent news articles about ${symbol}. Check back later for updates!`}
  />
);

export const EmptyAgents = ({ onCreate }) => (
  <EmptyState
    icon="🤖"
    title="No trading agents yet"
    description="Create AI-powered trading strategies and backtest them against historical data. Build your first agent to get started!"
    action={onCreate}
    actionLabel="Create your first agent"
    secondaryAction={() => window.open('/help/agents', '_blank')}
    secondaryLabel="Learn about agents"
  />
);

export const EmptyBacktest = () => (
  <EmptyState
    icon="📈"
    title="No backtest results"
    description="Run a backtest to see how your strategy would have performed historically. Use walk-forward analysis to validate your approach."
  />
);

export const EmptyScreening = ({ onReset }) => (
  <EmptyState
    icon="🎯"
    title="No stocks match your criteria"
    description="Try adjusting your filters to see more results. You can also save this screen to track how results change over time."
    action={onReset}
    actionLabel="Reset filters"
  />
);

export const EmptyInsiderTrades = ({ symbol }) => (
  <EmptyState
    icon="📋"
    title="No insider trading activity"
    description={`No recent insider transactions found for ${symbol}. This could mean stable insider confidence.`}
  />
);

export const EmptyEarnings = ({ symbol }) => (
  <EmptyState
    icon="📅"
    title="No earnings data available"
    description={`We don't have earnings history for ${symbol} yet. This data may be available soon for this company.`}
  />
);
