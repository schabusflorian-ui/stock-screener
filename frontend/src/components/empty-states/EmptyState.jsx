// components/empty-states/EmptyState.jsx
import {
  Star, BarChart2, Bell, Search, Newspaper, Bot,
  TrendingUp, Target, FileText, Calendar
} from '../icons';
import './EmptyState.css';

export const EmptyState = ({
  icon,
  Icon, // Prism icon component
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
        {Icon ? <Icon size={48} /> : <span>{icon}</span>}
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
    Icon={Star}
    title="Your watchlist is empty"
    description="Start tracking stocks by adding them to your watchlist. Search for any company or browse our suggestions."
    action={onAddStock}
    actionLabel="Add your first stock"
  />
);

export const EmptyPortfolio = ({ onCreate }) => (
  <EmptyState
    Icon={BarChart2}
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
    Icon={Bell}
    title="No alerts set"
    description="Get notified when stocks hit your target prices. Set up price alerts to never miss an opportunity!"
    action={onCreate}
    actionLabel="Create alert"
  />
);

export const EmptySearchResults = ({ query, onClear }) => (
  <EmptyState
    Icon={Search}
    title={`No results for "${query}"`}
    description="Try a different search term, or check the spelling. You can search by company name or ticker symbol."
    action={onClear}
    actionLabel="Clear search"
  />
);

export const EmptyNews = ({ symbol }) => (
  <EmptyState
    Icon={Newspaper}
    title="No recent news"
    description={`We couldn't find any recent news articles about ${symbol}. Check back later for updates!`}
  />
);

export const EmptyAgents = ({ onCreate }) => (
  <EmptyState
    Icon={Bot}
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
    Icon={TrendingUp}
    title="No backtest results"
    description="Run a backtest to see how your strategy would have performed historically. Use walk-forward analysis to validate your approach."
  />
);

export const EmptyScreening = ({ onReset }) => (
  <EmptyState
    Icon={Target}
    title="No stocks match your criteria"
    description="Try adjusting your filters to see more results. You can also save this screen to track how results change over time."
    action={onReset}
    actionLabel="Reset filters"
  />
);

export const EmptyInsiderTrades = ({ symbol }) => (
  <EmptyState
    Icon={FileText}
    title="No insider trading activity"
    description={`No recent insider transactions found for ${symbol}. This could mean stable insider confidence.`}
  />
);

export const EmptyEarnings = ({ symbol }) => (
  <EmptyState
    Icon={Calendar}
    title="No earnings data available"
    description={`We don't have earnings history for ${symbol} yet. This data may be available soon for this company.`}
  />
);
