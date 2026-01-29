/**
 * ContextMenuContext - Provider for right-click "Ask AI" context menu
 *
 * Provides global state for:
 * - Menu open/close state and position
 * - Current context data from right-clicked element
 * - Suggested AI queries based on context
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useNLQuery } from './NLQueryContext';

const ContextMenuContext = createContext(null);

/**
 * Generate contextual AI query suggestions based on the data
 */
function generateSuggestions(data) {
  if (!data) return [];

  const suggestions = [];
  const { type, symbol, metric, value, label, period, trend, companyName } = data;

  switch (type) {
    case 'chart':
      if (symbol) {
        if (trend === 'up' || trend === 'outperformed') {
          suggestions.push(`Why has ${symbol} been rising?`);
        } else if (trend === 'down' || trend === 'underperformed') {
          suggestions.push(`Why has ${symbol} been falling?`);
        } else {
          suggestions.push(`Analyze ${symbol}'s recent price action`);
        }
        suggestions.push(`What's the technical outlook for ${symbol}?`);
        if (period) {
          suggestions.push(`Compare ${symbol} to the sector over ${period}`);
        } else {
          suggestions.push(`What are the key drivers for ${symbol}?`);
        }
      } else {
        // Fallback when no symbol is available
        suggestions.push(`Analyze this chart's pattern`);
        suggestions.push(`What does this price action indicate?`);
      }
      break;

    case 'metric':
      // Handle specific metric types with tailored suggestions

      // Financial Statement Breakdowns
      if (metric === 'financial_breakdown' || metric === 'income_statement') {
        if (symbol) {
          suggestions.push(`Analyze ${symbol}'s revenue growth trends`);
          suggestions.push(`How do ${symbol}'s margins compare to peers?`);
          suggestions.push(`What's driving ${symbol}'s profitability?`);
        } else {
          suggestions.push(`Explain this income statement breakdown`);
          suggestions.push(`What are the key profitability metrics here?`);
        }
      } else if (metric === 'balance_sheet') {
        if (symbol) {
          suggestions.push(`Is ${symbol}'s balance sheet healthy?`);
          suggestions.push(`How is ${symbol}'s debt level compared to peers?`);
          suggestions.push(`Analyze ${symbol}'s working capital position`);
        } else {
          suggestions.push(`Explain this balance sheet breakdown`);
          suggestions.push(`What are the key financial health indicators?`);
        }
      } else if (metric === 'cash_flow') {
        if (symbol) {
          suggestions.push(`Is ${symbol} generating enough free cash flow?`);
          suggestions.push(`How sustainable are ${symbol}'s dividends?`);
          suggestions.push(`Analyze ${symbol}'s capital allocation strategy`);
        } else {
          suggestions.push(`Explain this cash flow breakdown`);
          suggestions.push(`What are the key cash flow metrics here?`);
        }
      } else if (metric === 'earnings' || metric === 'earnings_calendar') {
        if (symbol) {
          suggestions.push(`What are analysts expecting for ${symbol}'s earnings?`);
          suggestions.push(`How has ${symbol} performed vs estimates historically?`);
          suggestions.push(`What drove ${symbol}'s last earnings surprise?`);
        } else {
          suggestions.push(`What earnings events should I watch?`);
          suggestions.push(`Which companies have upcoming earnings?`);
        }
      } else if (metric === 'reddit_sentiment' && symbol) {
        suggestions.push(`What's the Reddit buzz on ${symbol}?`);
        suggestions.push(`Is social sentiment bullish or bearish on ${symbol}?`);
        suggestions.push(`Should I be concerned about ${symbol}'s Reddit sentiment?`);
      } else if (metric === 'news_sentiment' && symbol) {
        suggestions.push(`What's driving ${symbol}'s news sentiment?`);
        suggestions.push(`Any concerning news about ${symbol}?`);
        suggestions.push(`How has news affected ${symbol}'s stock price?`);
      } else if (metric === 'stocktwits_sentiment' && symbol) {
        suggestions.push(`What's StockTwits saying about ${symbol}?`);
        suggestions.push(`Is trader sentiment bullish on ${symbol}?`);
        suggestions.push(`How does ${symbol}'s StockTwits sentiment compare?`);
      } else if (metric === 'combined_sentiment' && symbol) {
        suggestions.push(`What's the overall sentiment picture for ${symbol}?`);
        suggestions.push(`Are sentiment sources aligned on ${symbol}?`);
        suggestions.push(`Should I trust the sentiment signals on ${symbol}?`);
      } else if (metric === 'signals' || metric === 'enhanced_signals') {
        if (symbol) {
          suggestions.push(`What signals are flagging for ${symbol}?`);
          suggestions.push(`Is ${symbol} showing institutional buying?`);
          suggestions.push(`What's the momentum signal on ${symbol}?`);
        } else {
          suggestions.push(`Which stocks have the strongest buy signals?`);
          suggestions.push(`What do institutional flow signals show?`);
          suggestions.push(`Are there any momentum divergences to watch?`);
        }
      } else if (metric === 'holdings' || metric === 'holdings_table') {
        suggestions.push(`How diversified is this portfolio?`);
        suggestions.push(`Which positions are overweight?`);
        suggestions.push(`What's the sector concentration here?`);
      } else if (metric === 'distribution' || metric === 'return_distribution') {
        suggestions.push(`What does this return distribution tell me?`);
        suggestions.push(`Is this portfolio's risk profile appropriate?`);
        suggestions.push(`How does this compare to a normal distribution?`);
      } else if (metric === 'position_sizing') {
        suggestions.push(`Are these position sizes appropriate?`);
        suggestions.push(`Should I rebalance any positions?`);
        suggestions.push(`What's the optimal position sizing here?`);
      } else if (metric === 'rebalance') {
        suggestions.push(`Should I rebalance my portfolio now?`);
        suggestions.push(`What trades would optimize my allocation?`);
        suggestions.push(`How often should I rebalance?`);
      } else if (metric === 'what_if' || metric === 'scenario') {
        suggestions.push(`What are the key risks in this scenario?`);
        suggestions.push(`How sensitive is my portfolio to this change?`);
        suggestions.push(`What's the expected impact of this trade?`);
      } else if (metric === 'kelly' || metric === 'kelly_criterion') {
        suggestions.push(`What does Kelly criterion suggest for position size?`);
        suggestions.push(`Should I use full Kelly or fractional?`);
        suggestions.push(`How confident can I be in these Kelly estimates?`);
      } else if (metric === 'capital_allocation') {
        if (symbol) {
          suggestions.push(`How is ${symbol} allocating capital?`);
          suggestions.push(`Is ${symbol}'s buyback program significant?`);
          suggestions.push(`How does ${symbol}'s dividend compare to peers?`);
        } else {
          suggestions.push(`Which companies have the best capital allocation?`);
          suggestions.push(`What buyback activity is notable?`);
        }
      } else if (metric === 'sector_analysis') {
        suggestions.push(`Which sectors are performing best?`);
        suggestions.push(`What's the sector rotation trend?`);
        suggestions.push(`Which sectors are undervalued?`);
      } else if (metric === 'correlation_heatmap') {
        suggestions.push(`Which assets are most correlated?`);
        suggestions.push(`Are there diversification opportunities?`);
        suggestions.push(`What does this correlation matrix tell me?`);
      } else if (metric === 'macro' || metric === 'macro_dashboard') {
        suggestions.push(`What's the current macro environment?`);
        suggestions.push(`How might macro factors affect my portfolio?`);
        suggestions.push(`What economic indicators should I watch?`);
      } else if (metric === 'validation' || metric === 'signal_validation') {
        suggestions.push(`How accurate are these signals historically?`);
        suggestions.push(`What's the backtest performance?`);
        suggestions.push(`Should I trust this signal?`);
      } else if (metric === 'screener' || metric === 'screening') {
        suggestions.push(`Which stocks pass all criteria?`);
        suggestions.push(`What makes these stocks stand out?`);
        suggestions.push(`How can I refine this screen?`);
      } else if (metric === 'watchlist') {
        suggestions.push(`Which watchlist stocks are actionable?`);
        suggestions.push(`Any watchlist stocks hitting buy zones?`);
        suggestions.push(`How are my watchlist stocks performing?`);
      } else if (metric === 'comparison' || metric === 'compare') {
        suggestions.push(`Which stock looks best in this comparison?`);
        suggestions.push(`What are the key differences?`);
        suggestions.push(`Which metrics matter most here?`);
      } else if (metric === 'sentiment' && symbol) {
        suggestions.push(`What's driving ${symbol}'s sentiment?`);
        suggestions.push(`How does ${symbol}'s sentiment compare to peers?`);
        suggestions.push(`Should I be concerned about ${symbol}'s social sentiment?`);
      } else if (metric === 'market_sentiment') {
        suggestions.push(`What's driving overall market sentiment?`);
        suggestions.push(`Which sectors have the most positive sentiment?`);
        suggestions.push(`Are there any sentiment divergences to watch?`);
      } else if (metric === 'analyst_activity') {
        suggestions.push(`What do recent analyst upgrades/downgrades signal?`);
        suggestions.push(`Which stocks have the strongest analyst consensus?`);
        suggestions.push(`Are analysts turning bullish or bearish overall?`);
      } else if (metric === 'insider_activity') {
        suggestions.push(`What does insider trading activity suggest?`);
        suggestions.push(`Which stocks have significant insider buying?`);
        suggestions.push(`Should I follow insider trading signals?`);
      } else if (metric === 'alpha_analytics') {
        suggestions.push(`Am I generating alpha or just tracking the market?`);
        suggestions.push(`How confident can I be in my skill vs luck?`);
        suggestions.push(`What factors are driving my portfolio returns?`);
      } else if (metric === 'factor_exposure') {
        suggestions.push(`What are my portfolio's factor tilts?`);
        suggestions.push(`Is my portfolio properly diversified?`);
        suggestions.push(`How do my factor exposures affect risk?`);
      } else if (metric === 'portfolio_insights') {
        suggestions.push(`What are the biggest risks in my portfolio?`);
        suggestions.push(`How can I improve my portfolio?`);
        suggestions.push(`Are there any positions I should reconsider?`);
      } else if (metric === 'correlation_analysis') {
        suggestions.push(`Which holdings are most correlated?`);
        suggestions.push(`Am I properly diversified?`);
        suggestions.push(`How can I reduce concentration risk?`);
      } else if (metric === 'monte_carlo') {
        suggestions.push(`What do these simulation results mean?`);
        suggestions.push(`How likely am I to reach my goal?`);
        suggestions.push(`What assumptions should I adjust?`);
      } else if (metric === 'backtest') {
        suggestions.push(`How did my portfolio perform historically?`);
        suggestions.push(`What caused the biggest drawdown?`);
        suggestions.push(`How does this compare to the benchmark?`);
      } else if (metric === 'stress_test') {
        suggestions.push(`How would my portfolio handle a market crash?`);
        suggestions.push(`What's my worst-case scenario?`);
        suggestions.push(`How can I protect against downside?`);
      } else if (symbol && metric && value !== undefined) {
        const formattedMetric = label || metric.replace(/_/g, ' ');
        suggestions.push(`Is ${value} ${formattedMetric} good for ${symbol}?`);
        suggestions.push(`How does ${symbol}'s ${formattedMetric} compare to peers?`);
        suggestions.push(`What's driving ${symbol}'s ${formattedMetric}?`);
      } else if (metric || label) {
        const displayLabel = label || metric?.replace(/_/g, ' ');
        suggestions.push(`Explain what ${displayLabel} means`);
        suggestions.push(`How should I interpret this data?`);
        suggestions.push(`What are the key insights here?`);
      }
      break;

    case 'position':
      if (symbol) {
        suggestions.push(`Analyze my ${symbol} position`);
        if (data.return) {
          const returnStr = data.return > 0 ? `+${data.return}%` : `${data.return}%`;
          suggestions.push(`Should I take profits on ${symbol} at ${returnStr}?`);
        }
        suggestions.push(`What's the risk outlook for ${symbol}?`);
      }
      break;

    case 'company':
      if (symbol) {
        suggestions.push(`Give me a quick analysis of ${companyName || symbol}`);
        suggestions.push(`What's the sentiment on ${symbol}?`);
        suggestions.push(`Is ${symbol} a good investment right now?`);
      }
      break;

    case 'table_row':
      if (symbol) {
        suggestions.push(`Tell me more about ${companyName || symbol}`);
        suggestions.push(`Is ${symbol} undervalued?`);
      }
      break;

    case 'valuation_indicator':
      // Market valuation indicators like Buffett Indicator, S&P 500 P/E, etc.
      if (label && value) {
        suggestions.push(`What does ${label} at ${value} tell us about market valuation?`);
        suggestions.push(`Is ${label} signaling the market is overvalued or undervalued?`);
        suggestions.push(`How does current ${label} compare to historical averages?`);
      } else if (label || metric) {
        const displayLabel = label || metric;
        suggestions.push(`Explain what ${displayLabel} means for market valuation`);
        suggestions.push(`How should I interpret this indicator?`);
        suggestions.push(`What are the historical implications of ${displayLabel}?`);
      }
      break;

    case 'alert':
      // Alert cards from AlertsPage
      if (symbol) {
        suggestions.push(`Tell me more about this ${symbol} alert`);
        suggestions.push(`Should I act on this ${symbol} signal?`);
        suggestions.push(`What's the context behind this ${symbol} alert?`);
      } else {
        suggestions.push(`What does this alert mean?`);
        suggestions.push(`Should I take action on this signal?`);
      }
      break;

    default:
      if (symbol) {
        suggestions.push(`Analyze ${symbol}`);
        suggestions.push(`What's the outlook for ${symbol}?`);
      } else {
        // Generic fallback suggestions
        suggestions.push(`Explain what I'm looking at`);
        suggestions.push(`What insights can you provide?`);
      }
  }

  // Limit to 3 suggestions
  return suggestions.slice(0, 3);
}

export function ContextMenuProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [contextData, setContextData] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const {
    openPanel,
    setContext,
    clearConversation
  } = useNLQuery();

  /**
   * Show the context menu at the specified position with data
   */
  const showMenu = useCallback((x, y, data) => {
    // Adjust position to keep menu in viewport
    const menuWidth = 300;
    const menuHeight = 280;
    const adjustedX = Math.min(x, window.innerWidth - menuWidth - 16);
    const adjustedY = Math.min(y, window.innerHeight - menuHeight - 16);

    const finalX = Math.max(8, adjustedX);
    const finalY = Math.max(8, adjustedY);

    console.log('[ContextMenu] showMenu called', { x: finalX, y: finalY, data });
    setPosition({ x: finalX, y: finalY });
    setContextData(data);
    const generatedSuggestions = generateSuggestions(data);
    console.log('[ContextMenu] Generated suggestions', generatedSuggestions);
    setSuggestions(generatedSuggestions);
    setIsOpen(true);
  }, []);

  /**
   * Hide the context menu
   */
  const hideMenu = useCallback(() => {
    setIsOpen(false);
    setContextData(null);
    setSuggestions([]);
  }, []);

  /**
   * Handle selecting a suggestion - opens chat panel with query
   */
  const selectSuggestion = useCallback((query) => {
    // Capture context data before hiding menu (hideMenu sets contextData to null)
    const capturedContext = contextData;

    // Close menu (this sets contextData to null)
    hideMenu();

    // Set context for the AI using captured data
    setContext({
      symbol: capturedContext?.symbol,
      page: capturedContext?.page || window.location.pathname,
      metric: capturedContext?.metric,
      value: capturedContext?.value,
      contextType: capturedContext?.type,
      ...capturedContext
    });

    // Clear previous conversation and start fresh with this query
    clearConversation();

    // Open the panel first to ensure it's ready
    openPanel();

    // Trigger the query by dispatching a custom event
    // The ChatPanel listens for this and submits the query
    // Use requestAnimationFrame to ensure React state updates have flushed
    console.log('[ContextMenu] selectSuggestion called', { query, capturedContext });
    requestAnimationFrame(() => {
      console.log('[ContextMenu] Dispatching prism-context-query event');
      window.dispatchEvent(new CustomEvent('prism-context-query', {
        detail: { query, context: capturedContext }
      }));
    });
  }, [hideMenu, setContext, clearConversation, openPanel, contextData]);

  /**
   * Handle custom question - opens panel with input focused
   */
  const askCustomQuestion = useCallback(() => {
    // Capture context BEFORE hideMenu() sets contextData to null
    const capturedContext = contextData;
    hideMenu();

    // Set context using captured value
    setContext({
      symbol: capturedContext?.symbol,
      page: capturedContext?.page || window.location.pathname,
      metric: capturedContext?.metric,
      value: capturedContext?.value,
      contextType: capturedContext?.type,
      ...capturedContext
    });

    // Just open the panel without a query
    openPanel();
  }, [hideMenu, setContext, contextData, openPanel]);

  // Close menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        hideMenu();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hideMenu]);

  // Close menu on scroll
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => hideMenu();
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen, hideMenu]);

  // Close menu on click outside
  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;

    const handleClickOutside = (e) => {
      if (!isSubscribed) return;
      const menu = document.getElementById('prism-context-menu');
      if (menu && !menu.contains(e.target)) {
        hideMenu();
      }
    };

    // Use setTimeout to avoid immediate close from the opening click
    const timer = setTimeout(() => {
      if (isSubscribed) {
        document.addEventListener('mousedown', handleClickOutside);
      }
    }, 0);

    return () => {
      isSubscribed = false;
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, hideMenu]);

  // Memoize context value to prevent cascade re-renders (Tier 3 optimization)
  const value = useMemo(() => ({
    // State
    isOpen,
    position,
    contextData,
    suggestions,

    // Actions
    showMenu,
    hideMenu,
    selectSuggestion,
    askCustomQuestion
  }), [isOpen, position, contextData, suggestions, showMenu, hideMenu, selectSuggestion, askCustomQuestion]);

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
    </ContextMenuContext.Provider>
  );
}

/**
 * Hook to access context menu state and actions
 */
export function useContextMenu() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error('useContextMenu must be used within a ContextMenuProvider');
  }
  return context;
}

export default ContextMenuContext;
