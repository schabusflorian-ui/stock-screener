// tests/middleware/apiOptimization.test.js
// Tests for API optimization middleware - validates caching, deduplication, and response optimization

const {
  ResponseCache,
  responseCache,
  responseCacheMiddleware,
  deduplicationMiddleware,
  etagMiddleware,
  fieldSelectionMiddleware,
  paginationMiddleware,
  applyFieldSelection,
  getDedupeStats
} = require('../../src/middleware/apiOptimization');

describe('ResponseCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ResponseCache(10, 1000); // 10 items, 1 second TTL
  });

  describe('Basic Operations', () => {
    test('should store and retrieve values', () => {
      cache.set('key1', { data: 'test' });
      const result = cache.get('key1');
      expect(result).toEqual({ data: 'test' });
    });

    test('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    test('should generate consistent cache keys', () => {
      const mockReq = {
        method: 'GET',
        path: '/api/test',
        query: { b: '2', a: '1' }
      };
      const key = cache.generateKey(mockReq);
      expect(key).toBe('GET:/api/test?a=1&b=2');
    });

    test('should sort query params in cache key', () => {
      const req1 = { method: 'GET', path: '/api/test', query: { z: '1', a: '2' } };
      const req2 = { method: 'GET', path: '/api/test', query: { a: '2', z: '1' } };
      expect(cache.generateKey(req1)).toBe(cache.generateKey(req2));
    });
  });

  describe('TTL Expiration', () => {
    test('should expire entries after TTL', async () => {
      cache.set('key1', { data: 'test' }, 100); // 100ms TTL

      expect(cache.get('key1')).toEqual({ data: 'test' });

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(cache.get('key1')).toBeNull();
    });

    test('should not return expired entries', async () => {
      cache.set('key1', { data: 'test' }, 50);

      await new Promise(resolve => setTimeout(resolve, 100));

      const result = cache.get('key1');
      expect(result).toBeNull();
    });
  });

  describe('LRU Eviction', () => {
    test('should not exceed maxSize', () => {
      for (let i = 0; i < 15; i++) {
        cache.set(`key${i}`, { data: i });
      }
      expect(cache.stats().size).toBeLessThanOrEqual(10);
    });

    test('should evict oldest entries when full', () => {
      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { data: i });
      }

      // Add one more - should evict oldest
      cache.set('key10', { data: 10 });

      // First key should be evicted
      expect(cache.get('key0')).toBeNull();
      // New key should exist
      expect(cache.get('key10')).toEqual({ data: 10 });
    });

    test('should maintain LRU order on access', () => {
      // Fill cache
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, { data: i });
      }

      // Access key0 (moves to end of LRU)
      cache.get('key0');

      // Add new key - should evict key1, not key0
      cache.set('key10', { data: 10 });

      expect(cache.get('key0')).toEqual({ data: 0 }); // Still exists
      expect(cache.get('key1')).toBeNull(); // Evicted
    });
  });

  describe('Cache Invalidation', () => {
    test('should invalidate entries matching pattern', () => {
      cache.set('/api/companies/AAPL', { data: 'apple' });
      cache.set('/api/companies/MSFT', { data: 'microsoft' });
      cache.set('/api/investors/123', { data: 'investor' });

      cache.invalidate('/api/companies');

      expect(cache.get('/api/companies/AAPL')).toBeNull();
      expect(cache.get('/api/companies/MSFT')).toBeNull();
      expect(cache.get('/api/investors/123')).toEqual({ data: 'investor' });
    });

    test('should clear all entries', () => {
      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });

      cache.clear();

      expect(cache.stats().size).toBe(0);
    });
  });

  describe('Stats', () => {
    test('should return accurate stats', () => {
      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });

      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });
  });
});

describe('responseCacheMiddleware', () => {
  beforeEach(() => {
    // Clear shared cache before each test
    responseCache.clear();
  });

  test('should skip caching for non-GET requests', async () => {
    const mockReq = { method: 'POST', path: '/api/test', query: {} };
    const mockRes = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext = jest.fn();

    const middleware = responseCacheMiddleware({ ttl: 1000, useRedis: false });

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.setHeader).not.toHaveBeenCalled();
  });

  test('should return cached response on cache hit', async () => {
    const middleware = responseCacheMiddleware({ ttl: 1000, useRedis: false });
    const testData = { result: 'cached' };

    // First request - cache miss
    const mockReq1 = { method: 'GET', path: '/api/test', query: {} };
    const mockRes1 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext1 = jest.fn();

    await middleware(mockReq1, mockRes1, mockNext1);
    mockRes1.json(testData);

    // Second request - cache hit (new mock objects)
    const mockReq2 = { method: 'GET', path: '/api/test', query: {} };
    const mockRes2 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext2 = jest.fn();

    await middleware(mockReq2, mockRes2, mockNext2);

    expect(mockRes2.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(mockRes2.json).toHaveBeenCalledWith(testData);
    expect(mockNext2).not.toHaveBeenCalled();
  });

  test('should set X-Cache: MISS on first request', async () => {
    const mockReq = { method: 'GET', path: '/api/test', query: {} };
    const mockRes = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext = jest.fn();

    const middleware = responseCacheMiddleware({ ttl: 1000, useRedis: false });

    await middleware(mockReq, mockRes, mockNext);
    mockRes.json({ data: 'test' });

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
  });

  test('should not cache error responses', async () => {
    const middleware = responseCacheMiddleware({ ttl: 1000, useRedis: false });

    // First request - error response
    const mockReq1 = { method: 'GET', path: '/api/test-error', query: {} };
    const mockRes1 = { statusCode: 500, setHeader: jest.fn(), json: jest.fn() };
    const mockNext1 = jest.fn();

    await middleware(mockReq1, mockRes1, mockNext1);
    mockRes1.json({ error: 'Server error' });

    // Second request - should not be cached
    const mockReq2 = { method: 'GET', path: '/api/test-error', query: {} };
    const mockRes2 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext2 = jest.fn();

    await middleware(mockReq2, mockRes2, mockNext2);

    // Should call next (not cached)
    expect(mockNext1).toHaveBeenCalled();
    expect(mockNext2).toHaveBeenCalled();
  });

  test('should use custom key function if provided', async () => {
    const customKeyFn = (req) => 'custom-key';
    const middleware = responseCacheMiddleware({ ttl: 1000, keyFn: customKeyFn, useRedis: false });

    // First request with custom key
    const mockReq1 = { method: 'GET', path: '/api/test1', query: {} };
    const mockRes1 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext1 = jest.fn();

    await middleware(mockReq1, mockRes1, mockNext1);
    mockRes1.json({ data: 'test' });

    // Second request with different path but same custom key
    const mockReq2 = { method: 'GET', path: '/api/test2', query: {} };
    const mockRes2 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext2 = jest.fn();

    await middleware(mockReq2, mockRes2, mockNext2);

    expect(mockRes2.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
  });
});

describe('deduplicationMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      path: '/api/test',
      query: {}
    };

    mockRes = {
      statusCode: 200,
      setHeader: jest.fn(),
      json: jest.fn(),
      on: jest.fn()
    };

    mockNext = jest.fn();
  });

  test('should skip deduplication for non-GET requests', async () => {
    mockReq.method = 'POST';
    const middleware = deduplicationMiddleware();

    await middleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-Dedupe', expect.anything());
  });

  test('should set X-Dedupe: FIRST on first request', async () => {
    const middleware = deduplicationMiddleware({ ttl: 5000 });

    await middleware(mockReq, mockRes, mockNext);
    mockRes.json({ data: 'test' });

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-Dedupe', 'FIRST');
  });

  test('should return deduplication stats', () => {
    const stats = getDedupeStats();
    expect(stats).toHaveProperty('inflightRequests');
    expect(typeof stats.inflightRequests).toBe('number');
  });
});

describe('etagMiddleware', () => {
  test('should add ETag header to response', () => {
    const mockReq = { method: 'GET', headers: {} };
    const mockRes = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext = jest.fn();

    etagMiddleware(mockReq, mockRes, mockNext);
    mockRes.json({ data: 'test' });

    expect(mockRes.setHeader).toHaveBeenCalledWith('ETag', expect.stringMatching(/^W\/".*"$/));
  });

  test('should return 304 on matching ETag', () => {
    // First request to get ETag
    const mockReq1 = { method: 'GET', headers: {} };
    const mockRes1 = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext1 = jest.fn();

    etagMiddleware(mockReq1, mockRes1, mockNext1);
    mockRes1.json({ data: 'test' });

    // Get the ETag that was set
    const etagCall = mockRes1.setHeader.mock.calls.find(call => call[0] === 'ETag');
    const etag = etagCall[1];

    // Second request with matching If-None-Match
    const mockReq2 = { method: 'GET', headers: { 'if-none-match': etag } };
    const mockRes2 = { statusCode: 200, setHeader: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn(), json: jest.fn() };
    const mockNext2 = jest.fn();

    etagMiddleware(mockReq2, mockRes2, mockNext2);
    mockRes2.json({ data: 'test' });

    expect(mockRes2.status).toHaveBeenCalledWith(304);
    expect(mockRes2.end).toHaveBeenCalled();
  });

  test('should skip ETag for error responses', () => {
    const mockReq = { method: 'GET', headers: {} };
    const mockRes = { statusCode: 500, setHeader: jest.fn(), json: jest.fn() };
    const mockNext = jest.fn();

    etagMiddleware(mockReq, mockRes, mockNext);
    mockRes.json({ error: 'Server error' });

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('ETag', expect.anything());
  });

  test('should skip ETag for non-GET requests', () => {
    const mockReq = { method: 'POST', headers: {} };
    const mockRes = { statusCode: 200, setHeader: jest.fn(), json: jest.fn() };
    const mockNext = jest.fn();

    etagMiddleware(mockReq, mockRes, mockNext);
    mockRes.json({ data: 'test' });

    expect(mockRes.setHeader).not.toHaveBeenCalledWith('ETag', expect.anything());
  });
});

describe('fieldSelectionMiddleware', () => {
  test('should pass through when no fields specified', () => {
    const testData = { id: 1, name: 'test', value: 100 };
    let capturedData = null;

    const mockReq = { query: {} };
    const mockRes = {
      json: (data) => { capturedData = data; return mockRes; }
    };
    const mockNext = jest.fn();

    fieldSelectionMiddleware(mockReq, mockRes, mockNext);
    mockRes.json(testData);

    expect(capturedData).toEqual(testData);
  });

  test('should filter object fields', () => {
    let capturedData = null;

    const mockReq = { query: { fields: 'id,name' } };
    const mockRes = {
      json: (data) => { capturedData = data; return mockRes; }
    };
    const mockNext = jest.fn();

    fieldSelectionMiddleware(mockReq, mockRes, mockNext);
    mockRes.json({ id: 1, name: 'test', value: 100, extra: 'data' });

    expect(capturedData).toEqual({ id: 1, name: 'test' });
  });

  test('should filter array of objects', () => {
    let capturedData = null;

    const mockReq = { query: { fields: 'id,name' } };
    const mockRes = {
      json: (data) => { capturedData = data; return mockRes; }
    };
    const mockNext = jest.fn();
    const data = [
      { id: 1, name: 'test1', value: 100 },
      { id: 2, name: 'test2', value: 200 }
    ];

    fieldSelectionMiddleware(mockReq, mockRes, mockNext);
    mockRes.json(data);

    expect(capturedData).toEqual([
      { id: 1, name: 'test1' },
      { id: 2, name: 'test2' }
    ]);
  });

  test('should handle wrapped response with data array', () => {
    let capturedData = null;

    const mockReq = { query: { fields: 'id,name' } };
    const mockRes = {
      json: (data) => { capturedData = data; return mockRes; }
    };
    const mockNext = jest.fn();
    const response = {
      data: [{ id: 1, name: 'test', value: 100 }],
      meta: { total: 1 }
    };

    fieldSelectionMiddleware(mockReq, mockRes, mockNext);
    mockRes.json(response);

    expect(capturedData).toEqual({
      data: [{ id: 1, name: 'test' }],
      meta: { total: 1 }
    });
  });
});

describe('paginationMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      query: {}
    };

    mockRes = {
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  test('should set default pagination values', () => {
    paginationMiddleware(mockReq, mockRes, mockNext);

    expect(mockReq.pagination).toEqual({
      page: 1,
      limit: 25,
      offset: 0
    });
  });

  test('should parse custom pagination params', () => {
    mockReq.query.page = '3';
    mockReq.query.limit = '50';

    paginationMiddleware(mockReq, mockRes, mockNext);

    expect(mockReq.pagination).toEqual({
      page: 3,
      limit: 50,
      offset: 100
    });
  });

  test('should enforce minimum page of 1', () => {
    mockReq.query.page = '-5';

    paginationMiddleware(mockReq, mockRes, mockNext);

    expect(mockReq.pagination.page).toBe(1);
  });

  test('should enforce maximum limit of 100', () => {
    mockReq.query.limit = '500';

    paginationMiddleware(mockReq, mockRes, mockNext);

    expect(mockReq.pagination.limit).toBe(100);
  });

  test('should provide paginate helper', () => {
    paginationMiddleware(mockReq, mockRes, mockNext);

    const data = [1, 2, 3];
    mockRes.paginate(data, 100);

    expect(mockRes.json).toHaveBeenCalledWith({
      data: [1, 2, 3],
      pagination: {
        page: 1,
        limit: 25,
        total: 100,
        totalPages: 4,
        hasNext: true,
        hasPrev: false
      }
    });
  });
});

describe('applyFieldSelection', () => {
  test('should return data unchanged when no fields specified', () => {
    const data = { id: 1, name: 'test' };
    expect(applyFieldSelection(data, [])).toEqual(data);
    expect(applyFieldSelection(data, null)).toEqual(data);
  });

  test('should handle nested field paths', () => {
    const data = {
      id: 1,
      company: { name: 'Test Corp', id: 100 },
      value: 500
    };

    const result = applyFieldSelection(data, ['id', 'company.name']);

    expect(result).toEqual({
      id: 1,
      company: { name: 'Test Corp' }
    });
  });

  test('should handle primitive values', () => {
    expect(applyFieldSelection('string', ['field'])).toBe('string');
    expect(applyFieldSelection(123, ['field'])).toBe(123);
    expect(applyFieldSelection(null, ['field'])).toBe(null);
  });
});
