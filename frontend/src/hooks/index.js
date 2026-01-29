/**
 * Hooks Index
 *
 * Central export for all custom hooks
 */

export { useApi, useLazyApi, usePaginatedApi, useMutation } from './useApi';
export { default as useApiDefault } from './useApi';
export { useOptimisticMutation } from './useOptimisticMutation';

export {
  useAsync,
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  usePrevious,
  useLocalStorage
} from './useAsync';

export {
  useAskAI,
  createChartExtractor,
  createMetricExtractor,
  createPositionExtractor,
  createCompanyExtractor,
  createTableRowExtractor
} from './useAskAI';

// Re-export Ask AI context for parent components to provide context to children
export { AskAIProvider, useAskAIContext } from '../context/AskAIContext';
