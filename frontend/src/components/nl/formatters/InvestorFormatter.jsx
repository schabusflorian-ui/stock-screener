/**
 * InvestorFormatter - Handles all investor-related response types
 *
 * Types handled:
 * - investor_holdings
 * - investor_top_holdings
 * - investor_new_positions
 * - investor_exits
 * - investor_activity
 * - investor_specific_holding
 * - investor_history
 * - investor_list
 */

import React from 'react';
import { TrendingUp, TrendingDown, User, Briefcase, ArrowUpRight, ArrowDownRight, Users } from '../../icons';
import './Formatters.css';

function InvestorFormatter({ result, onSymbolClick }) {
  const { type } = result;

  switch (type) {
    case 'investor_holdings':
    case 'investor_top_holdings':
      return <HoldingsView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_new_positions':
      return <NewPositionsView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_exits':
      return <ExitsView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_activity':
      return <ActivityView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_specific_holding':
      return <SpecificHoldingView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_history':
      return <HistoryView result={result} onSymbolClick={onSymbolClick} />;

    case 'investor_list':
      return <InvestorListView result={result} />;

    default:
      return <HoldingsView result={result} onSymbolClick={onSymbolClick} />;
  }
}

/**
 * Holdings view - shows investor's portfolio holdings
 */
function HoldingsView({ result, onSymbolClick }) {
  const { investor, investor_name, holdings, total_value, filing_date, total_holdings } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  return (
    <div className="fmt-investor-holdings">
      <div className="fmt-header">
        <User size={16} />
        <span className="fmt-investor-name">{investorName}</span>
        {filing_date && <span className="fmt-filing-date">As of {formatDate(filing_date)}</span>}
      </div>

      <div className="fmt-holdings-summary">
        {total_value && (
          <div className="fmt-summary-item">
            <span className="fmt-summary-label">Portfolio Value</span>
            <span className="fmt-summary-value">{formatCurrency(total_value)}</span>
          </div>
        )}
        {total_holdings !== undefined && (
          <div className="fmt-summary-item">
            <span className="fmt-summary-label">Positions</span>
            <span className="fmt-summary-value">{total_holdings}</span>
          </div>
        )}
      </div>

      {holdings && holdings.length > 0 && (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Company</th>
                <th>Shares</th>
                <th>Value</th>
                <th>% Port</th>
              </tr>
            </thead>
            <tbody>
              {holdings.slice(0, 10).map((h, i) => (
                <tr key={i}>
                  <td>
                    <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(h.symbol)}>
                      {h.symbol}
                    </span>
                  </td>
                  <td>{h.company || h.name || '-'}</td>
                  <td>{h.shares?.toLocaleString() || '-'}</td>
                  <td>{h.value ? formatCurrency(h.value) : '-'}</td>
                  <td>{h.percent_of_portfolio ? `${h.percent_of_portfolio.toFixed(1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {holdings.length > 10 && (
            <div className="fmt-table-more">+{holdings.length - 10} more positions</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * New positions view
 */
function NewPositionsView({ result, onSymbolClick }) {
  const { investor, investor_name, new_positions, period } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  return (
    <div className="fmt-investor-new">
      <div className="fmt-header">
        <ArrowUpRight size={16} className="positive" />
        <span className="fmt-investor-name">{investorName}</span>
        <span className="fmt-section-badge">New Positions</span>
        {period && <span className="fmt-period">{period}</span>}
      </div>

      {new_positions && new_positions.length > 0 ? (
        <div className="fmt-positions-list">
          {new_positions.slice(0, 8).map((pos, i) => (
            <div key={i} className="fmt-position-card new">
              <div className="fmt-position-header">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(pos.symbol)}>
                  {pos.symbol}
                </span>
                {pos.value && <span className="fmt-position-value">{formatCurrency(pos.value)}</span>}
              </div>
              {pos.company && <span className="fmt-position-company">{pos.company}</span>}
              {pos.shares && <span className="fmt-position-shares">{pos.shares.toLocaleString()} shares</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="fmt-no-data">No new positions found</div>
      )}
    </div>
  );
}

/**
 * Exits view
 */
function ExitsView({ result, onSymbolClick }) {
  const { investor, investor_name, exits, period } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  return (
    <div className="fmt-investor-exits">
      <div className="fmt-header">
        <ArrowDownRight size={16} className="negative" />
        <span className="fmt-investor-name">{investorName}</span>
        <span className="fmt-section-badge exit">Exits</span>
        {period && <span className="fmt-period">{period}</span>}
      </div>

      {exits && exits.length > 0 ? (
        <div className="fmt-positions-list">
          {exits.slice(0, 8).map((pos, i) => (
            <div key={i} className="fmt-position-card exit">
              <div className="fmt-position-header">
                <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(pos.symbol)}>
                  {pos.symbol}
                </span>
                {pos.previous_value && (
                  <span className="fmt-position-value dim">was {formatCurrency(pos.previous_value)}</span>
                )}
              </div>
              {pos.company && <span className="fmt-position-company">{pos.company}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="fmt-no-data">No exits found</div>
      )}
    </div>
  );
}

/**
 * Activity view - buys and sells
 */
function ActivityView({ result, onSymbolClick }) {
  const { investor, investor_name, activity, buys, sells, summary, period } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  const buysList = activity?.buys || buys || [];
  const sellsList = activity?.sells || sells || [];

  return (
    <div className="fmt-investor-activity">
      <div className="fmt-header">
        <Briefcase size={16} />
        <span className="fmt-investor-name">{investorName}</span>
        <span className="fmt-section-badge">Activity</span>
        {period && <span className="fmt-period">{period}</span>}
      </div>

      {summary && (
        <div className="fmt-activity-summary">{summary}</div>
      )}

      <div className="fmt-activity-grid">
        {/* Buys */}
        <div className="fmt-activity-column">
          <h4 className="fmt-activity-title positive">
            <TrendingUp size={14} /> Buys ({buysList.length})
          </h4>
          {buysList.slice(0, 5).map((item, i) => (
            <div key={i} className="fmt-activity-item buy">
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(item.symbol)}>
                {item.symbol}
              </span>
              {item.shares && <span>{item.shares.toLocaleString()} shares</span>}
              {item.change_percent && <span>+{item.change_percent.toFixed(1)}%</span>}
            </div>
          ))}
        </div>

        {/* Sells */}
        <div className="fmt-activity-column">
          <h4 className="fmt-activity-title negative">
            <TrendingDown size={14} /> Sells ({sellsList.length})
          </h4>
          {sellsList.slice(0, 5).map((item, i) => (
            <div key={i} className="fmt-activity-item sell">
              <span className="fmt-symbol-link" onClick={() => onSymbolClick?.(item.symbol)}>
                {item.symbol}
              </span>
              {item.shares && <span>{item.shares.toLocaleString()} shares</span>}
              {item.change_percent && <span>{item.change_percent.toFixed(1)}%</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Specific holding view
 */
function SpecificHoldingView({ result, onSymbolClick }) {
  const { investor, investor_name, symbol, holding, history } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  return (
    <div className="fmt-specific-holding">
      <div className="fmt-header">
        <User size={16} />
        <span className="fmt-investor-name">{investorName}</span>
        <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>{symbol}</span>
      </div>

      {holding && (
        <div className="fmt-holding-details">
          <div className="fmt-metrics-grid">
            {holding.shares && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">Shares</span>
                <span className="fmt-metric-value">{holding.shares.toLocaleString()}</span>
              </div>
            )}
            {holding.value && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">Value</span>
                <span className="fmt-metric-value">{formatCurrency(holding.value)}</span>
              </div>
            )}
            {holding.percent_of_portfolio && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">% of Portfolio</span>
                <span className="fmt-metric-value">{holding.percent_of_portfolio.toFixed(2)}%</span>
              </div>
            )}
            {holding.change_shares && (
              <div className="fmt-metric-card">
                <span className="fmt-metric-label">Change in Shares</span>
                <span className={`fmt-metric-value ${holding.change_shares >= 0 ? 'positive' : 'negative'}`}>
                  {holding.change_shares >= 0 ? '+' : ''}{holding.change_shares.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {history && history.length > 0 && (
        <div className="fmt-holding-history">
          <h4 className="fmt-section-title">Position History</h4>
          <div className="fmt-history-timeline">
            {history.slice(0, 6).map((h, i) => (
              <div key={i} className="fmt-history-item">
                <span className="fmt-history-date">{formatDate(h.date || h.filing_date)}</span>
                <span className="fmt-history-shares">{h.shares?.toLocaleString()} shares</span>
                {h.change && (
                  <span className={`fmt-history-change ${h.change >= 0 ? 'positive' : 'negative'}`}>
                    {h.change >= 0 ? '+' : ''}{h.change.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * History view
 */
function HistoryView({ result, onSymbolClick }) {
  const { investor, investor_name, history, symbol } = result;
  const investorName = investor_name || investor?.name || investor || 'Investor';

  return (
    <div className="fmt-investor-history">
      <div className="fmt-header">
        <User size={16} />
        <span className="fmt-investor-name">{investorName}</span>
        {symbol && (
          <span className="fmt-symbol" onClick={() => onSymbolClick?.(symbol)}>{symbol}</span>
        )}
        <span className="fmt-section-badge">History</span>
      </div>

      {history && history.length > 0 && (
        <div className="fmt-table-wrapper">
          <table className="fmt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Shares</th>
                <th>Value</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {history.slice(0, 8).map((h, i) => (
                <tr key={i}>
                  <td>{formatDate(h.date || h.filing_date)}</td>
                  <td>{h.shares?.toLocaleString() || '-'}</td>
                  <td>{h.value ? formatCurrency(h.value) : '-'}</td>
                  <td className={h.change >= 0 ? 'positive' : 'negative'}>
                    {h.change !== undefined ? `${h.change >= 0 ? '+' : ''}${h.change.toLocaleString()}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Investor list view
 */
function InvestorListView({ result }) {
  const { investors, category } = result;

  return (
    <div className="fmt-investor-list">
      <div className="fmt-header">
        <Users size={16} />
        <span className="fmt-name">{category || 'Investors'}</span>
      </div>

      {investors && investors.length > 0 ? (
        <div className="fmt-investors-grid">
          {investors.slice(0, 12).map((inv, i) => (
            <div key={i} className="fmt-investor-card">
              <span className="fmt-investor-card-name">{inv.name || inv}</span>
              {inv.aum && <span className="fmt-investor-card-aum">AUM: {formatCurrency(inv.aum)}</span>}
              {inv.type && <span className="fmt-investor-card-type">{inv.type}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="fmt-no-data">No investors found</div>
      )}
    </div>
  );
}

// Utility functions
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  const num = Number(value);
  if (isNaN(num)) return value;

  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

export default InvestorFormatter;
