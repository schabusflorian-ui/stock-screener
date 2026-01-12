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
