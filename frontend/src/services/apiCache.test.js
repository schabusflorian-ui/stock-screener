import apiCache from './apiCache';

describe('apiCache', () => {
  beforeEach(() => {
    // Clear cache before each test
    apiCache.clear();
  });

  describe('getCacheKey', () => {
    test('generates key from URL only', () => {
      const key = apiCache.getCacheKey('/api/test');
      expect(key).toBe('/api/test');
    });

    test('generates key from URL and params', () => {
      const key = apiCache.getCacheKey('/api/test', { limit: 10, offset: 0 });
      expect(key).toBe('/api/test?limit=10&offset=0');
    });

    test('sorts params alphabetically', () => {
      const key = apiCache.getCacheKey('/api/test', { z: 1, a: 2 });
      expect(key).toBe('/api/test?a=2&z=1');
    });
  });

  describe('get and set', () => {
    test('returns null for non-existent key', () => {
      const result = apiCache.get('non-existent');
      expect(result).toBeNull();
    });

    test('stores and retrieves data', () => {
      const data = { id: 1, name: 'test' };
      apiCache.set('test-key', data, '/api/test');

      const result = apiCache.get('test-key');
      expect(result).toEqual(data);
    });

    test('increments hits on access', () => {
      apiCache.set('hit-test', { value: 1 }, '/api/test');

      apiCache.get('hit-test');
      apiCache.get('hit-test');
      apiCache.get('hit-test');

      const stats = apiCache.getStats();
      expect(stats.totalHits).toBe(3);
    });
  });

  describe('shouldCache', () => {
    test('returns true for normal endpoints', () => {
      expect(apiCache.shouldCache('/api/companies')).toBe(true);
      expect(apiCache.shouldCache('/api/metrics')).toBe(true);
    });

    test('returns false for refresh endpoints', () => {
      expect(apiCache.shouldCache('/api/sentiment/refresh')).toBe(false);
    });

    test('returns false for update endpoints', () => {
      expect(apiCache.shouldCache('/api/prices/update')).toBe(false);
    });

    test('returns false for scan endpoints', () => {
      expect(apiCache.shouldCache('/api/alerts/scan')).toBe(false);
    });
  });

  describe('getTTL', () => {
    test('returns default TTL for unknown endpoints', () => {
      const ttl = apiCache.getTTL('/api/unknown');
      expect(ttl).toBe(apiCache.config.defaultTTL);
    });

    test('returns custom TTL for configured endpoints', () => {
      const ttl = apiCache.getTTL('/screening/options');
      expect(ttl).toBe(30 * 60 * 1000); // 30 minutes
    });
  });

  describe('invalidate', () => {
    test('removes entries matching string prefix', () => {
      apiCache.set('/api/companies/1', { id: 1 }, '/api/companies');
      apiCache.set('/api/companies/2', { id: 2 }, '/api/companies');
      apiCache.set('/api/metrics', { data: [] }, '/api/metrics');

      apiCache.invalidate('/api/companies');

      expect(apiCache.get('/api/companies/1')).toBeNull();
      expect(apiCache.get('/api/companies/2')).toBeNull();
      expect(apiCache.get('/api/metrics')).not.toBeNull();
    });

    test('removes entries matching regex', () => {
      apiCache.set('/api/company/AAPL', { symbol: 'AAPL' }, '/api/company');
      apiCache.set('/api/company/MSFT', { symbol: 'MSFT' }, '/api/company');

      apiCache.invalidate(/company\/[A-Z]+$/);

      expect(apiCache.get('/api/company/AAPL')).toBeNull();
      expect(apiCache.get('/api/company/MSFT')).toBeNull();
    });
  });

  describe('clear', () => {
    test('removes all entries', () => {
      apiCache.set('key1', { a: 1 }, '/api/test');
      apiCache.set('key2', { b: 2 }, '/api/test');

      apiCache.clear();

      const stats = apiCache.getStats();
      expect(stats.totalEntries).toBe(0);
    });
  });

  describe('withCache', () => {
    test('caches API response', async () => {
      const mockApi = jest.fn().mockResolvedValue({ data: 'test' });

      const result1 = await apiCache.withCache(mockApi, '/api/test');
      const result2 = await apiCache.withCache(mockApi, '/api/test');

      expect(result1).toEqual({ data: 'test' });
      expect(result2).toEqual({ data: 'test' });
      expect(mockApi).toHaveBeenCalledTimes(1); // Only called once due to caching
    });

    test('deduplicates concurrent requests', async () => {
      let resolvePromise;
      const mockApi = jest.fn().mockImplementation(() =>
        new Promise(resolve => {
          resolvePromise = () => resolve({ data: 'test' });
        })
      );

      // Start two concurrent requests
      const promise1 = apiCache.withCache(mockApi, '/api/slow');
      const promise2 = apiCache.withCache(mockApi, '/api/slow');

      // Resolve the promise
      resolvePromise();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual({ data: 'test' });
      expect(result2).toEqual({ data: 'test' });
      expect(mockApi).toHaveBeenCalledTimes(1); // Only one actual API call
    });

    test('handles errors without caching', async () => {
      const mockApi = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(apiCache.withCache(mockApi, '/api/error')).rejects.toThrow('API Error');
      expect(apiCache.get(apiCache.getCacheKey('/api/error'))).toBeNull();
    });
  });

  describe('getStats', () => {
    test('returns correct statistics', () => {
      apiCache.set('key1', { a: 1 }, '/api/test');
      apiCache.set('key2', { b: 2 }, '/api/test');
      apiCache.get('key1');
      apiCache.get('key1');

      const stats = apiCache.getStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.activeEntries).toBe(2);
      expect(stats.totalHits).toBe(2);
      expect(stats.maxEntries).toBe(apiCache.config.maxEntries);
    });
  });
});
