/**
 * AskAIContext - Provides inherited context for Ask AI functionality
 *
 * This context allows parent components to provide context data that child
 * components (especially charts) can inherit for their Ask AI right-click menus.
 *
 * Usage:
 *   // In parent component (e.g., ValuationCard)
 *   <AskAIProvider value={{ type: 'valuation_indicator', label: 'S&P 500 P/E', value: '22.5x' }}>
 *     <MiniChart data={chartData} />
 *   </AskAIProvider>
 *
 *   // In child component (e.g., MiniChart)
 *   const inheritedContext = useAskAIContext();
 *   const askAIProps = useAskAI(() => ({
 *     ...inheritedContext,  // Inherit parent context
 *     metric: 'chart_specific_metric'  // Override or add specific fields
 *   }));
 */

import { createContext, useContext } from 'react';

// Context for Ask AI data inheritance
const AskAIContext = createContext(null);

/**
 * Provider component to wrap elements that should share Ask AI context
 */
export function AskAIProvider({ children, value }) {
  // Merge with any existing parent context
  const parentContext = useContext(AskAIContext);
  const mergedContext = parentContext ? { ...parentContext, ...value } : value;

  return (
    <AskAIContext.Provider value={mergedContext}>
      {children}
    </AskAIContext.Provider>
  );
}

/**
 * Hook to access inherited Ask AI context from parent components
 * Returns null if no parent context exists
 */
export function useAskAIContext() {
  return useContext(AskAIContext);
}

export default AskAIContext;
