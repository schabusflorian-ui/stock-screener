import { useState, useCallback, useRef, useEffect } from 'react';
import apiCache from '../services/apiCache';

/**
 * Hook for mutations with optimistic updates.
 *
 * Applies UI changes immediately before the API call completes,
 * then rolls back if the request fails.
 *
 * @param {Function} mutationFn - The async mutation function
 * @param {Object} options - Configuration options
 * @param {Function} options.onMutate - Called before mutation, return value is passed to onError for rollback
 * @param {Function} options.onSuccess - Called on success with (result, variables, context)
 * @param {Function} options.onError - Called on error with (error, variables, context) for rollback
 * @param {Function} options.onSettled - Called on both success and error
 * @param {Array<string>} options.invalidateKeys - Cache keys to invalidate on success
 * @returns {Object} { mutate, loading, error, reset }
 *
 * @example
 * const { mutate: toggleWatchlist } = useOptimisticMutation(
 *   (isAdding) => isAdding ? addToWatchlist(symbol) : removeFromWatchlist(symbol),
 *   {
 *     onMutate: (isAdding) => {
 *       const previous = isInWatchlist;
 *       setIsInWatchlist(isAdding);  // Optimistic update
 *       return previous;  // Context for rollback
 *     },
 *     onError: (err, vars, previous) => {
 *       setIsInWatchlist(previous);  // Rollback
 *     }
 *   }
 * );
 */
export function useOptimisticMutation(mutationFn, options = {}) {
  const {
    onMutate,
    onSuccess,
    onError,
    onSettled,
    invalidateKeys = []
  } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const mutate = useCallback(async (variables) => {
    setLoading(true);
    setError(null);

    // Apply optimistic update synchronously, get rollback context
    let context;
    try {
      context = onMutate?.(variables);
    } catch (err) {
      console.error('Error in onMutate:', err);
    }

    try {
      const result = await mutationFn(variables);

      if (mountedRef.current) {
        const responseData = result?.data ?? result;
        setData(responseData);
        setLoading(false);

        // Invalidate related cache entries
        invalidateKeys.forEach(key => apiCache.invalidate(key));

        onSuccess?.(responseData, variables, context);
        onSettled?.(responseData, null, variables, context);
      }

      return result;
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err?.response?.data?.error || err.message || 'An error occurred';
        setError(errorMessage);
        setLoading(false);

        // Call onError for rollback
        onError?.(err, variables, context);
        onSettled?.(null, err, variables, context);
      }
      throw err;
    }
  }, [mutationFn, onMutate, onSuccess, onError, onSettled, invalidateKeys]);

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { mutate, loading, error, data, reset };
}

export default useOptimisticMutation;
