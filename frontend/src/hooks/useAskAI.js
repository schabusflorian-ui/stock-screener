/**
 * useAskAI - Hook to add right-click "Ask AI" functionality to any element
 *
 * Usage:
 *   const askAIProps = useAskAI({
 *     type: 'chart',
 *     symbol: 'AAPL',
 *     metric: 'price',
 *     value: 189.45
 *   });
 *
 *   return <div {...askAIProps}>Chart content</div>
 *
 * Or with a data extractor function:
 *   const askAIProps = useAskAI(() => ({
 *     type: 'metric',
 *     symbol: currentSymbol,
 *     value: currentValue
 *   }));
 *
 * Context Inheritance:
 *   Child components automatically inherit context from parent AskAIProvider.
 *   Use AskAIProvider to wrap charts so they inherit parent context:
 *
 *   <AskAIProvider value={{ type: 'valuation_indicator', label: 'S&P 500 P/E' }}>
 *     <MiniChart data={chartData} />
 *   </AskAIProvider>
 */

import { useCallback } from 'react';
import { useContextMenu } from '../context/ContextMenuContext';
import { useAskAIContext } from '../context/AskAIContext';

/**
 * Hook to add "Ask AI" context menu to an element
 * Automatically merges inherited context from parent AskAIProvider
 * @param {Object|Function|null} dataOrExtractor - Static data object, function to extract data, or null to disable
 * @returns {Object} Props to spread on the target element
 */
export function useAskAI(dataOrExtractor) {
  const { showMenu } = useContextMenu();
  const inheritedContext = useAskAIContext();

  const handleContextMenu = useCallback((event) => {
    // If no extractor provided, don't handle the event
    if (!dataOrExtractor) return;

    // Prevent the default browser context menu
    event.preventDefault();
    event.stopPropagation();

    // Extract data either from static object or from extractor function
    let localData;
    try {
      localData = typeof dataOrExtractor === 'function'
        ? dataOrExtractor(event)
        : dataOrExtractor;
    } catch (err) {
      console.error('useAskAI: Error extracting data:', err);
      return;
    }

    // Merge inherited context with local data (local data takes precedence)
    // Filter out null/undefined values from local data to allow inheritance
    const filteredLocalData = localData ? Object.fromEntries(
      Object.entries(localData).filter(([_, v]) => v != null)
    ) : {};

    const data = inheritedContext
      ? { ...inheritedContext, ...filteredLocalData }
      : localData;

    if (data) {
      // Use clientX/clientY for position
      const x = event.clientX || event.pageX || 100;
      const y = event.clientY || event.pageY || 100;
      console.log('[AskAI] Context menu triggered', { x, y, data, inherited: !!inheritedContext });
      showMenu(x, y, data);
    }
  }, [dataOrExtractor, showMenu, inheritedContext]);

  // If disabled, return empty props
  if (!dataOrExtractor) {
    return {};
  }

  return {
    onContextMenu: handleContextMenu,
    'data-ask-ai': 'true'
  };
}

/**
 * Create a data extractor for chart components
 * @param {Function} dataFn - Function that returns chart context data
 */
export function createChartExtractor(dataFn) {
  return () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    return {
      type: 'chart',
      ...data
    };
  };
}

/**
 * Create a data extractor for metric displays
 * @param {Function} dataFn - Function that returns metric context data
 */
export function createMetricExtractor(dataFn) {
  return () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    return {
      type: 'metric',
      ...data
    };
  };
}

/**
 * Create a data extractor for portfolio positions
 * @param {Function} dataFn - Function that returns position context data
 */
export function createPositionExtractor(dataFn) {
  return () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    return {
      type: 'position',
      ...data
    };
  };
}

/**
 * Create a data extractor for company headers
 * @param {Function} dataFn - Function that returns company context data
 */
export function createCompanyExtractor(dataFn) {
  return () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    return {
      type: 'company',
      ...data
    };
  };
}

/**
 * Create a data extractor for table rows
 * @param {Function} dataFn - Function that returns table row context data
 */
export function createTableRowExtractor(dataFn) {
  return () => {
    const data = typeof dataFn === 'function' ? dataFn() : dataFn;
    return {
      type: 'table_row',
      symbol: data.symbol || data.ticker,
      companyName: data.name || data.companyName,
      ...data
    };
  };
}

export default useAskAI;
