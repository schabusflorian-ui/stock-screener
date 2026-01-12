/**
 * PortfolioFormatter - Handles all portfolio-related response types
 *
 * Types handled:
 * - portfolio_overview
 * - portfolio_holdings
 * - portfolio_performance
 * - portfolio_allocation
 * - portfolio_risk
 * - portfolio_comparison
 * - portfolio_rebalance
 * - portfolio_investor_comparison
 */

import React from 'react';
import {
  PieChart, TrendingUp, TrendingDown, AlertTriangle,
  BarChart3, RefreshCw, Users, Briefcase
} from 'lucide-react';
import './Formatters.css';

function PortfolioFormatter({ result, onSymbolClick }) {
  const { type } = result;

  switch (type) {
    case 'portfolio_overview':
      return <OverviewView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_holdings':
      return <HoldingsView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_performance':
      return <PerformanceView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_allocation':
      return <AllocationView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_risk':
      return <RiskView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_comparison':
      return <ComparisonView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_rebalance':
      return <RebalanceView result={result} onSymbolClick={onSymbolClick} />;

    case 'portfolio_investor_comparison':
      return <InvestorComparisonView result={result} onSymbolClick={onSymbolClick} />;

    default:
      return <OverviewView result={result} onSymbolClick={onSymbolClick} />;
  }
}

/**
 * Portfolio overview with summary metrics
 */
function OverviewView({ result, onSymbolClick }) {
  const {
    portfolio_name, portfolio, total_value, total_gain, total_gain_percent,
    holdings_count, cash, cash_percent, day_change, day_change_percent,
    summary, holdings
  } = result;

  const name = portfolio_name || portfolio?.name || 'Portfolio';
  const isPositive = (total_gain || 0) >= 0;

  return (
    <div className="fmt-portfolio-overview">
      <div className="fmt-header">
        <Briefcase size={16} />
        <span className="fmt-portfolio-name">{name}</span>
      </div>

      <div className="fmt-portfolio-summary">
        {total_value && (
          <div className="fmt-summary-main">
            <span className="fmt-summary-value-large">{formatCurrency(total_value)}</span>
            {(total_gain !== undefined || total_gain_percent !== undefined) && (
              <div className={`fmt-summary-change ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {total_gain && <span>{formatCurrency(total_gain)}</span>}
                {total_gain_percent && <span>({formatPercent(total_gain_percent)})</span>}
              </div>
            )}
          </div>
        )}

        <div className="fmt-metrics-row">
          {holdings_count !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Positions</span>
              <span className="fmt-metric-value">{holdings_count}</span>
            </div>
          )}
          {cash !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Cash</span>
              <span className="fmt-metric-value">
                {formatCurrency(cash)}
                {cash_percent && <span className="fmt-metric-sub">({formatPercent(cash_percent)})</span>}
              </span>
            </div>
          )}
          {day_change !== undefined && (
            <div className="fmt-metric-card">
              <span className="fmt-metric-label">Today</span>
              <span className={`fmt-metric-value ${day_change >= 0 ? 'positive' : 'negative'}`}>
                {day_change >= 0 ? '+' : ''}{formatCurrency(day_change)}
                {day_change_percent && <span className="fmt-metric-sub">({formatPercent(day_change_percent)})</span>}
              </span>
            </div>
          )}
        </div>
      </div>

      {holdings && holdings.length > 0 && (
        <div className="fmt-holdings-preview">
          <h4 className="fmt-section-title">Top Holdings</h4>
          <div className="fmt-holdings-list">
            {holdings.slice(0, 5).map((h, i) => (
              <div key={i} className="fmt-holding-row">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol)}>
                  {h.symbol}
                </span>
                <span className="fmt-holding-value">{formatCurrency(h.value || h.market_value)}</span>
                <span className={`fmt-holding-change ${(h.gain_percent || 0) >= 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(h.gain_percent || h.change_percent)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div className="fmt-interpretation">{summary}</div>
      )}
    </div>
  );
}

/**
 * Holdings table view
 */
function HoldingsView({ result, onSymbolClick }) {
  const { portfolio_name, holdings, total_value } = result;

  return (
    <div className="fmt-portfolio-holdings">
      <div className="fmt-header">
        <Briefcase size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Portfolio Holdings'}</span>
        {total_value && <span className="fmt-total-value">{formatCurrency(total_value)}</span>}
      </div>

      {holdings && holdings.length > 0 ? (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Value</th>
                <th>Gain/Loss</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {holdings.slice(0, 15).map((h, i) => (
                <tr key={i}>
                  <td>
                    <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol)}>
                      {h.symbol}
                    </span>
                  </td>
                  <td>{h.shares?.toLocaleString() || h.quantity?.toLocaleString() || '-'}</td>
                  <td>{h.price ? `$${h.price.toFixed(2)}` : '-'}</td>
                  <td>{formatCurrency(h.value || h.market_value)}</td>
                  <td className={(h.gain || h.unrealized_gain || 0) >= 0 ? 'positive' : 'negative'}>
                    {formatCurrency(h.gain || h.unrealized_gain)}
                  </td>
                  <td className={(h.gain_percent || h.change_percent || 0) >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(h.gain_percent || h.change_percent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {holdings.length > 15 && (
            <div className="fmt-table-more">+{holdings.length - 15} more positions</div>
          )}
        </div>
      ) : (
        <div className="fmt-no-data">No holdings found</div>
      )}
    </div>
  );
}

/**
 * Performance metrics view
 */
function PerformanceView({ result, onSymbolClick }) {
  const {
    portfolio_name, period, total_return, total_return_percent,
    benchmark_return, alpha, sharpe_ratio, max_drawdown,
    best_performer, worst_performer
  } = result;

  return (
    <div className="fmt-portfolio-performance">
      <div className="fmt-header">
        <TrendingUp size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Portfolio'}</span>
        <span className="fmt-section-badge">Performance</span>
        {period && <span className="fmt-period">{period}</span>}
      </div>

      <div className="fmt-metrics-grid">
        {total_return_percent !== undefined && (
          <div className="fmt-metric-card highlight">
            <span className="fmt-metric-label">Total Return</span>
            <span className={`fmt-metric-value ${total_return_percent >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(total_return_percent)}
            </span>
            {total_return && (
              <span className="fmt-metric-sub">{formatCurrency(total_return)}</span>
            )}
          </div>
        )}

        {benchmark_return !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Benchmark</span>
            <span className={`fmt-metric-value ${benchmark_return >= 0 ? 'positive' : 'negative'}`}>
              {formatPercent(benchmark_return)}
            </span>
          </div>
        )}

        {alpha !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Alpha</span>
            <span className={`fmt-metric-value ${alpha >= 0 ? 'positive' : 'negative'}`}>
              {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}%
            </span>
          </div>
        )}

        {sharpe_ratio !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Sharpe Ratio</span>
            <span className="fmt-metric-value">{sharpe_ratio.toFixed(2)}</span>
          </div>
        )}

        {max_drawdown !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Max Drawdown</span>
            <span className="fmt-metric-value negative">{formatPercent(max_drawdown)}</span>
          </div>
        )}
      </div>

      {(best_performer || worst_performer) && (
        <div className="fmt-performers">
          {best_performer && (
            <div className="fmt-performer best">
              <TrendingUp size={14} />
              <span>Best: </span>
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(best_performer.symbol)}>
                {best_performer.symbol}
              </span>
              <span className="positive">{formatPercent(best_performer.return_percent)}</span>
            </div>
          )}
          {worst_performer && (
            <div className="fmt-performer worst">
              <TrendingDown size={14} />
              <span>Worst: </span>
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(worst_performer.symbol)}>
                {worst_performer.symbol}
              </span>
              <span className="negative">{formatPercent(worst_performer.return_percent)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Allocation breakdown view
 */
function AllocationView({ result, onSymbolClick }) {
  const { portfolio_name, allocations, by_sector, by_asset_class, concentration } = result;
  const allocationData = allocations || by_sector || by_asset_class || [];

  return (
    <div className="fmt-portfolio-allocation">
      <div className="fmt-header">
        <PieChart size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Portfolio'}</span>
        <span className="fmt-section-badge">Allocation</span>
      </div>

      {allocationData.length > 0 && (
        <div className="fmt-allocation-bars">
          {allocationData.slice(0, 10).map((item, i) => (
            <div key={i} className="fmt-allocation-row">
              <div className="fmt-allocation-label">
                <span className="fmt-allocation-name">
                  {item.symbol ? (
                    <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(item.symbol)}>
                      {item.symbol}
                    </span>
                  ) : (
                    item.name || item.sector || item.asset_class
                  )}
                </span>
                <span className="fmt-allocation-percent">{formatPercent(item.percent || item.weight)}</span>
              </div>
              <div className="fmt-allocation-bar-track">
                <div
                  className="fmt-allocation-bar-fill"
                  style={{ width: `${Math.min(100, item.percent || item.weight || 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {concentration && (
        <div className="fmt-concentration">
          <h4 className="fmt-section-title">Concentration</h4>
          <div className="fmt-metrics-row">
            {concentration.top_5_percent && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">Top 5</span>
                <span className="fmt-metric-value">{formatPercent(concentration.top_5_percent)}</span>
              </div>
            )}
            {concentration.top_10_percent && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">Top 10</span>
                <span className="fmt-metric-value">{formatPercent(concentration.top_10_percent)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Risk metrics view
 */
function RiskView({ result }) {
  const {
    portfolio_name, volatility, beta, var_95, var_99,
    correlation_to_market, max_drawdown, risk_score, risk_level,
    risk_factors
  } = result;

  const getRiskLevelClass = (level) => {
    if (!level) return '';
    const levelLower = level.toLowerCase();
    if (levelLower.includes('low')) return 'low';
    if (levelLower.includes('high') || levelLower.includes('elevated')) return 'high';
    return 'moderate';
  };

  return (
    <div className="fmt-portfolio-risk">
      <div className="fmt-header">
        <AlertTriangle size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Portfolio'}</span>
        <span className="fmt-section-badge">Risk Analysis</span>
      </div>

      {risk_level && (
        <div className={`fmt-risk-level ${getRiskLevelClass(risk_level)}`}>
          <span className="fmt-risk-label">Risk Level:</span>
          <span className="fmt-risk-value">{risk_level}</span>
          {risk_score !== undefined && (
            <span className="fmt-risk-score">Score: {risk_score}/100</span>
          )}
        </div>
      )}

      <div className="fmt-metrics-grid">
        {volatility !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Volatility</span>
            <span className="fmt-metric-value">{formatPercent(volatility)}</span>
          </div>
        )}

        {beta !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Beta</span>
            <span className="fmt-metric-value">{beta.toFixed(2)}</span>
          </div>
        )}

        {var_95 !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">VaR (95%)</span>
            <span className="fmt-metric-value negative">{formatPercent(var_95)}</span>
          </div>
        )}

        {var_99 !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">VaR (99%)</span>
            <span className="fmt-metric-value negative">{formatPercent(var_99)}</span>
          </div>
        )}

        {max_drawdown !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Max Drawdown</span>
            <span className="fmt-metric-value negative">{formatPercent(max_drawdown)}</span>
          </div>
        )}

        {correlation_to_market !== undefined && (
          <div className="fmt-metric-card">
            <span className="fmt-metric-label">Market Correlation</span>
            <span className="fmt-metric-value">{correlation_to_market.toFixed(2)}</span>
          </div>
        )}
      </div>

      {risk_factors && risk_factors.length > 0 && (
        <div className="fmt-risk-factors">
          <h4 className="fmt-section-title">Risk Factors</h4>
          {risk_factors.slice(0, 5).map((factor, i) => (
            <div key={i} className="fmt-risk-factor">
              <AlertTriangle size={12} />
              <span>{factor.name || factor}</span>
              {factor.exposure && <span className="fmt-factor-exposure">{factor.exposure}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Portfolio comparison view
 */
function ComparisonView({ result, onSymbolClick }) {
  const { portfolios, comparison_metrics } = result;

  return (
    <div className="fmt-portfolio-comparison">
      <div className="fmt-header">
        <BarChart3 size={16} />
        <span className="fmt-name">Portfolio Comparison</span>
      </div>

      {portfolios && portfolios.length > 0 && (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Portfolio</th>
                <th>Value</th>
                <th>Return</th>
                <th>Risk</th>
                <th>Sharpe</th>
              </tr>
            </thead>
            <tbody>
              {portfolios.map((p, i) => (
                <tr key={i}>
                  <td>{p.name}</td>
                  <td>{formatCurrency(p.total_value)}</td>
                  <td className={(p.total_return_percent || 0) >= 0 ? 'positive' : 'negative'}>
                    {formatPercent(p.total_return_percent)}
                  </td>
                  <td>{formatPercent(p.volatility)}</td>
                  <td>{p.sharpe_ratio?.toFixed(2) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comparison_metrics && (
        <div className="fmt-comparison-insights">
          <h4 className="fmt-section-title">Insights</h4>
          {comparison_metrics.best_performer && (
            <div className="fmt-insight">
              <TrendingUp size={14} className="positive" />
              <span>Best performer: <strong>{comparison_metrics.best_performer}</strong></span>
            </div>
          )}
          {comparison_metrics.lowest_risk && (
            <div className="fmt-insight">
              <AlertTriangle size={14} />
              <span>Lowest risk: <strong>{comparison_metrics.lowest_risk}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rebalancing suggestions view
 */
function RebalanceView({ result, onSymbolClick }) {
  const { portfolio_name, suggestions, trades } = result;

  return (
    <div className="fmt-portfolio-rebalance">
      <div className="fmt-header">
        <RefreshCw size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Portfolio'}</span>
        <span className="fmt-section-badge">Rebalance</span>
      </div>

      {trades && trades.length > 0 && (
        <div className="fmt-rebalance-trades">
          <h4 className="fmt-section-title">Suggested Trades</h4>
          {trades.slice(0, 10).map((trade, i) => (
            <div key={i} className={`fmt-trade-row ${trade.action?.toLowerCase()}`}>
              <span className={`fmt-trade-action ${trade.action?.toLowerCase() === 'buy' ? 'positive' : 'negative'}`}>
                {trade.action}
              </span>
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(trade.symbol)}>
                {trade.symbol}
              </span>
              {trade.shares && <span className="fmt-trade-shares">{trade.shares} shares</span>}
              {trade.amount && <span className="fmt-trade-amount">{formatCurrency(trade.amount)}</span>}
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="fmt-rebalance-suggestions">
          <h4 className="fmt-section-title">Recommendations</h4>
          {suggestions.slice(0, 5).map((sug, i) => (
            <div key={i} className="fmt-suggestion">
              {sug}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compare portfolio to famous investors
 */
function InvestorComparisonView({ result, onSymbolClick }) {
  const { portfolio_name, investor, overlap, shared_holdings, unique_to_portfolio, unique_to_investor } = result;

  return (
    <div className="fmt-investor-comparison">
      <div className="fmt-header">
        <Users size={16} />
        <span className="fmt-portfolio-name">{portfolio_name || 'Your Portfolio'}</span>
        <span className="fmt-vs">vs</span>
        <span className="fmt-investor-name">{investor}</span>
      </div>

      {overlap !== undefined && (
        <div className="fmt-overlap-meter">
          <span className="fmt-overlap-label">Portfolio Overlap</span>
          <div className="fmt-overlap-bar">
            <div className="fmt-overlap-fill" style={{ width: `${overlap}%` }} />
          </div>
          <span className="fmt-overlap-percent">{overlap.toFixed(1)}%</span>
        </div>
      )}

      <div className="fmt-comparison-columns">
        {shared_holdings && shared_holdings.length > 0 && (
          <div className="fmt-comparison-column">
            <h4 className="fmt-section-title">Shared Holdings</h4>
            {shared_holdings.slice(0, 5).map((h, i) => (
              <div key={i} className="fmt-holding-chip shared">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol || h)}>
                  {h.symbol || h}
                </span>
              </div>
            ))}
          </div>
        )}

        {unique_to_portfolio && unique_to_portfolio.length > 0 && (
          <div className="fmt-comparison-column">
            <h4 className="fmt-section-title">Only in Your Portfolio</h4>
            {unique_to_portfolio.slice(0, 5).map((h, i) => (
              <div key={i} className="fmt-holding-chip yours">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol || h)}>
                  {h.symbol || h}
                </span>
              </div>
            ))}
          </div>
        )}

        {unique_to_investor && unique_to_investor.length > 0 && (
          <div className="fmt-comparison-column">
            <h4 className="fmt-section-title">Only in {investor}'s</h4>
            {unique_to_investor.slice(0, 5).map((h, i) => (
              <div key={i} className="fmt-holding-chip investor">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol || h)}>
                  {h.symbol || h}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Utility functions
function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return value;

  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return value;
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

export default PortfolioFormatter;
