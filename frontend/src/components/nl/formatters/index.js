/**
 * Formatter Registry - Maps response types to formatter components
 *
 * This provides a central registry for handling all 38+ response types
 * from the NL query backend.
 */

import React from 'react';
import DataFormatter from './DataFormatter';
import SentimentFormatter from './SentimentFormatter';
import TechnicalFormatter from './TechnicalFormatter';
import InvestorFormatter from './InvestorFormatter';
import PortfolioFormatter from './PortfolioFormatter';
import UnknownFormatter from './UnknownFormatter';

/**
 * Registry mapping response types to formatter components
 */
const FORMATTER_REGISTRY = {
  // Screening & Lists
  'screen_results': DataFormatter,

  // Comparison
  'comparison_results': DataFormatter,
  'similarity_results': DataFormatter,

  // Historical
  'historical_results': DataFormatter,
  'driver_analysis': DataFormatter,

  // Lookup / Info types
  'info': DataFormatter,
  'not_found': DataFormatter,
  'data_response': DataFormatter,
  'company_summary': DataFormatter,
  'metric_lookup': DataFormatter,
  'llm_response': DataFormatter,
  'explanation': DataFormatter,

  // Sentiment types (7 total)
  'sentiment_analysis': SentimentFormatter,
  'news_sentiment': SentimentFormatter,
  'analyst_sentiment': SentimentFormatter,
  'insider_activity': SentimentFormatter,
  'trending_sentiment': SentimentFormatter,
  'market_sentiment': SentimentFormatter,
  'sentiment_overview': SentimentFormatter,

  // Technical types (3 total)
  'technical_indicator': TechnicalFormatter,
  'technical_pattern': TechnicalFormatter,
  'technical_analysis': TechnicalFormatter,

  // Investor types (8 total)
  'investor_holdings': InvestorFormatter,
  'investor_top_holdings': InvestorFormatter,
  'investor_new_positions': InvestorFormatter,
  'investor_exits': InvestorFormatter,
  'investor_activity': InvestorFormatter,
  'investor_specific_holding': InvestorFormatter,
  'investor_history': InvestorFormatter,
  'investor_list': InvestorFormatter,

  // Portfolio types (8 total)
  'portfolio_overview': PortfolioFormatter,
  'portfolio_holdings': PortfolioFormatter,
  'portfolio_performance': PortfolioFormatter,
  'portfolio_allocation': PortfolioFormatter,
  'portfolio_risk': PortfolioFormatter,
  'portfolio_comparison': PortfolioFormatter,
  'portfolio_rebalance': PortfolioFormatter,
  'portfolio_investor_comparison': PortfolioFormatter,

  // Calculation
  'calculation': DataFormatter,
  'calculation_result': DataFormatter,

  // Error
  'error': UnknownFormatter,
  'unknown': UnknownFormatter,
};

/**
 * Get the appropriate formatter component for a response type
 * @param {string} type - The response type from the backend
 * @returns {React.Component} - The formatter component
 */
export function getFormatter(type) {
  return FORMATTER_REGISTRY[type] || UnknownFormatter;
}

/**
 * Format a response using the appropriate formatter
 * @param {object} result - The result object from the API
 * @param {function} onSymbolClick - Callback when a symbol is clicked
 * @returns {React.Element} - The formatted response
 */
export function formatResponse(result, onSymbolClick) {
  if (!result) {
    return null;
  }

  const Formatter = getFormatter(result.type);
  return <Formatter result={result} onSymbolClick={onSymbolClick} />;
}

const formatterExports = {
  getFormatter,
  formatResponse,
  FORMATTER_REGISTRY
};

export default formatterExports;
