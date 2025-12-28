import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import apiCache from '../services/apiCache';

/**
 * Custom hook for API calls with caching, loading states, and error handling.
 *
 * @param {Function} apiFn - The API function to call
 * @param {Object} options - Configuration options
 * @param {Array} deps - Dependencies that trigger refetch
 * @returns {Object} { data, loading, error, refetch }
 */
export function useApi(apiFn, options = {}, deps = []) {
  const {
    enabled = true,
    onSuccess,
    onError,
    initialData = null,
    cacheKey = null,
    skipCache = false
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  const fetch = useCallback(async (force = false) => {
    if (!enabled) return;

    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      let response;

      if (cacheKey && !skipCache && !force) {
        // Try cache first
        response = await apiCache.withCache(
          () => apiFn(),
          cacheKey
        );
      } else {
        response = await apiFn();
        // Store in cache if we have a key
        if (cacheKey && !skipCache) {
          apiCache.set(apiCache.getCacheKey(cacheKey), response, cacheKey);
        }
      }

      // Only update if this is still the latest request and component is mounted
      if (fetchId === fetchIdRef.current && mountedRef.current) {
        const responseData = response?.data ?? response;
        setData(responseData);
        setLoading(false);
        onSuccess?.(responseData);
      }
    } catch (err) {
      if (fetchId === fetchIdRef.current && mountedRef.current) {
        const errorMessage = err?.response?.data?.error || err.message || 'An error occurred';
        setError(errorMessage);
        setLoading(false);
        onError?.(err);
      }
    }
  }, [apiFn, enabled, cacheKey, skipCache, onSuccess, onError]);

  const refetch = useCallback(() => {
    return fetch(true);
  }, [fetch]);

  useEffect(() => {
    mountedRef.current = true;
    fetch();

    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, refetch };
}

/**
 * Hook for lazy loading API data (only fetches when called)
 *
 * @param {Function} apiFn - The API function to call
 * @param {Object} options - Configuration options
 * @returns {Object} { data, loading, error, fetch }
 */
export function useLazyApi(apiFn, options = {}) {
  const { onSuccess, onError, initialData = null } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetch = useCallback(async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFn(...args);
      if (mountedRef.current) {
        const responseData = response?.data ?? response;
        setData(responseData);
        setLoading(false);
        onSuccess?.(responseData);
        return responseData;
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err?.response?.data?.error || err.message || 'An error occurred';
        setError(errorMessage);
        setLoading(false);
        onError?.(err);
        throw err;
      }
    }
  }, [apiFn, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(initialData);
    setLoading(false);
    setError(null);
  }, [initialData]);

  return { data, loading, error, fetch, reset };
}

/**
 * Hook for paginated API data
 *
 * @param {Function} apiFn - API function that accepts { limit, offset } params
 * @param {Object} options - Configuration options
 * @returns {Object} { data, loading, error, loadMore, hasMore, reset }
 */
export function usePaginatedApi(apiFn, options = {}) {
  const { pageSize = 20, onSuccess, onError } = options;

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiFn({ limit: pageSize, offset });
      if (mountedRef.current) {
        const newItems = response?.data ?? response;
        const items = Array.isArray(newItems) ? newItems : newItems?.items || [];

        setData(prev => [...prev, ...items]);
        setOffset(prev => prev + items.length);
        setHasMore(items.length === pageSize);
        setLoading(false);
        onSuccess?.(items);
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err?.response?.data?.error || err.message || 'An error occurred';
        setError(errorMessage);
        setLoading(false);
        onError?.(err);
      }
    }
  }, [apiFn, loading, hasMore, pageSize, offset, onSuccess, onError]);

  const reset = useCallback(() => {
    setData([]);
    setOffset(0);
    setHasMore(true);
    setError(null);
    setLoading(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error, loadMore, hasMore, reset };
}

/**
 * Hook for mutation operations (POST, PUT, DELETE)
 *
 * @param {Function} mutationFn - The mutation function to call
 * @param {Object} options - Configuration options
 * @returns {Object} { mutate, loading, error, data, reset }
 */
export function useMutation(mutationFn, options = {}) {
  const { onSuccess, onError, invalidateKeys = [] } = options;

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

  const mutate = useCallback(async (...args) => {
    setLoading(true);
    setError(null);

    try {
      const response = await mutationFn(...args);
      if (mountedRef.current) {
        const responseData = response?.data ?? response;
        setData(responseData);
        setLoading(false);

        // Invalidate related cache entries
        invalidateKeys.forEach(key => apiCache.invalidate(key));

        onSuccess?.(responseData, ...args);
        return responseData;
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMessage = err?.response?.data?.error || err.message || 'An error occurred';
        setError(errorMessage);
        setLoading(false);
        onError?.(err, ...args);
        throw err;
      }
    }
  }, [mutationFn, invalidateKeys, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(null);
    setLoading(false);
    setError(null);
  }, []);

  return { mutate, loading, error, data, reset };
}

// PropTypes for documentation
useApi.propTypes = {
  apiFn: PropTypes.func.isRequired,
  options: PropTypes.shape({
    enabled: PropTypes.bool,
    onSuccess: PropTypes.func,
    onError: PropTypes.func,
    initialData: PropTypes.any,
    cacheKey: PropTypes.string,
    skipCache: PropTypes.bool
  }),
  deps: PropTypes.array
};

export default useApi;
