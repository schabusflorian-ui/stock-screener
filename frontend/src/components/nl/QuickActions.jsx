/**
 * QuickActions - Contextual action buttons for chat responses
 *
 * Displays relevant follow-up actions based on the response type
 * and data returned from the API.
 */

import React from 'react';
import { TrendingUp, BarChart2, Users, RefreshCw, Search, PieChart } from '../icons';
import './QuickActions.css';

function QuickActions({ result, symbol, onAction }) {
  const actions = getContextualActions(result, symbol);

  if (actions.length === 0) return null;

  return (
    <div className="quick-actions">
      {actions.map((action, i) => (
        <button
          key={i}
          className="quick-action-btn"
          onClick={() => onAction(action.query)}
          title={action.description}
        >
          {action.icon && <action.icon size={14} />}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Generate contextual actions based on response type and content
 */
function getContextualActions(result, symbol) {
  const actions = [];
  const type = result?.type || '';

  // Symbol-specific actions
  if (symbol) {
    actions.push({
      label: 'Price Chart',
      query: `Show me ${symbol} price chart`,
      icon: TrendingUp,
      description: `View ${symbol} price history`
    });

    actions.push({
      label: 'Compare',
      query: `Compare ${symbol} to competitors`,
      icon: BarChart2,
      description: `Compare ${symbol} with similar companies`
    });

    actions.push({
      label: 'Sentiment',
      query: `What's the sentiment on ${symbol}?`,
      icon: PieChart,
      description: `View sentiment analysis for ${symbol}`
    });

    actions.push({
      label: 'Who owns it?',
      query: `Which famous investors own ${symbol}?`,
      icon: Users,
      description: `See institutional ownership`
    });
  }

  // Type-specific actions
  switch (type) {
    case 'screen_results':
      actions.unshift({
        label: 'Refine criteria',
        query: 'Make the screening criteria stricter',
        icon: Search,
        description: 'Narrow down results'
      });
      break;

    case 'comparison_results':
      actions.unshift({
        label: 'More metrics',
        query: 'Show more detailed comparison metrics',
        icon: BarChart2,
        description: 'See additional comparison data'
      });
      break;

    case 'sentiment':
    case 'sentiment_analysis':
      if (symbol) {
        actions.unshift({
          label: 'Recent news',
          query: `Show me recent news for ${symbol}`,
          icon: RefreshCw,
          description: 'View latest news articles'
        });
      }
      break;

    case 'price_data':
    case 'technical_analysis':
      if (symbol) {
        actions.unshift({
          label: 'Technical indicators',
          query: `What are the technical indicators for ${symbol}?`,
          icon: TrendingUp,
          description: 'View RSI, MACD, and more'
        });
      }
      break;

    case 'investor_holdings':
      actions.unshift({
        label: 'Recent changes',
        query: 'Show me their recent position changes',
        icon: RefreshCw,
        description: 'See what they bought/sold recently'
      });
      break;

    case 'valuation':
    case 'dcf':
      if (symbol) {
        actions.unshift({
          label: 'Sensitivity',
          query: `Run sensitivity analysis on ${symbol} DCF`,
          icon: BarChart2,
          description: 'See how assumptions affect value'
        });
      }
      break;

    default:
      // For general responses, add helpful follow-ups
      if (!symbol && actions.length === 0) {
        actions.push({
          label: 'Show stocks',
          query: 'Show me undervalued tech stocks',
          icon: Search,
          description: 'Find interesting stocks'
        });
        actions.push({
          label: 'Market outlook',
          query: 'What does the macro environment look like?',
          icon: TrendingUp,
          description: 'View macro indicators'
        });
      }
      break;
  }

  // Return top 4 actions
  return actions.slice(0, 4);
}

export default QuickActions;
