// tests/lib/redisCache.test.js
// Tests for Redis caching with memory fallback

const fs = require('fs');
const path = require('path');

describe('RedisCache Module', () => {
  test('redisCache.js should exist', () => {
    const filePath = path.join(__dirname, '../../src/lib/redisCache.js');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('should export RedisCache class', () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    expect(RedisCache).toBeDefined();
    expect(typeof RedisCache).toBe('function');
  });

  test('should export UnifiedCache class', () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    expect(UnifiedCache).toBeDefined();
    expect(typeof UnifiedCache).toBe('function');
  });

  test('should export unifiedCache singleton', () => {
    const { unifiedCache } = require('../../src/lib/redisCache');
    expect(unifiedCache).toBeDefined();
    expect(typeof unifiedCache.get).toBe('function');
    expect(typeof unifiedCache.set).toBe('function');
  });

  test('should export TTL constants', () => {
    const { TTL } = require('../../src/lib/redisCache');
    expect(TTL).toBeDefined();
    expect(typeof TTL).toBe('object');
  });
});

describe('RedisCache Class', () => {
  test('should initialize with default options', () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    expect(cache.prefix).toBe('cache:');
    expect(cache.defaultTTL).toBe(300000);
    expect(cache.connected).toBe(false);
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
  });

  test('should accept custom options', () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache({
      prefix: 'custom:',
      defaultTTL: 60000,
    });

    expect(cache.prefix).toBe('custom:');
    expect(cache.defaultTTL).toBe(60000);
  });

  test('should generate prefixed keys', () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache({ prefix: 'test:' });

    expect(cache._key('mykey')).toBe('test:mykey');
    expect(cache._key('foo/bar')).toBe('test:foo/bar');
  });

  test('should return undefined when not connected', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const result = await cache.get('any-key');
    expect(result).toBeUndefined();
    expect(cache.misses).toBe(1);
  });

  test('should return false for set when not connected', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const result = await cache.set('key', 'value');
    expect(result).toBe(false);
  });

  test('should return false for delete when not connected', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const result = await cache.delete('key');
    expect(result).toBe(false);
  });

  test('should return false for has when not connected', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const result = await cache.has('key');
    expect(result).toBe(false);
  });

  test('should return empty object for mget when not connected', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const result = await cache.mget(['key1', 'key2']);
    expect(result).toEqual({});
  });

  test('getOrFetch should call fetchFn when not cached', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const fetchFn = jest.fn().mockResolvedValue({ data: 'fetched' });
    const result = await cache.getOrFetch('key', fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ data: 'fetched' });
  });

  test('getStats should return stats object', async () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    const stats = await cache.getStats();
    expect(stats).toHaveProperty('connected', false);
    expect(stats).toHaveProperty('hits', 0);
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('hitRate', '0%');
  });

  test('isConnected should return connected status', () => {
    const { RedisCache } = require('../../src/lib/redisCache');
    const cache = new RedisCache();

    expect(cache.isConnected()).toBe(false);
  });
});

describe('UnifiedCache Class', () => {
  test('should initialize with memory cache as fallback', () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    expect(cache.memoryCache).toBeDefined();
    expect(cache.getBackend()).toBe('memory');
  });

  test('should accept custom options', () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache({
      maxSize: 1000,
      defaultTTL: 120000,
    });

    expect(cache.memoryCache).toBeDefined();
  });

  test('should proxy get to memory cache when Redis not available', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    // Set a value
    await cache.set('test-key', { foo: 'bar' });

    // Get should return the value
    const result = await cache.get('test-key');
    expect(result).toEqual({ foo: 'bar' });
  });

  test('should proxy set to memory cache when Redis not available', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    // Set a value and verify it can be retrieved
    await cache.set('key', 'value');
    const result = await cache.get('key');
    expect(result).toBe('value');
  });

  test('should proxy delete to memory cache', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    await cache.set('to-delete', 'value');
    await cache.delete('to-delete');

    const result = await cache.get('to-delete');
    expect(result).toBeUndefined();
  });

  test('should proxy has to memory cache', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    await cache.set('exists-key', 'value');

    const exists = await cache.has('exists-key');
    const notExists = await cache.has('not-exists');

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });

  test('should proxy getOrFetch to memory cache', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    const fetchFn = jest.fn().mockResolvedValue({ data: 'fetched' });

    // First call should fetch
    const result1 = await cache.getOrFetch('fetch-key', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result1).toEqual({ data: 'fetched' });

    // Second call should use cache
    const result2 = await cache.getOrFetch('fetch-key', fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1); // Not called again
    expect(result2).toEqual({ data: 'fetched' });
  });

  test('should proxy mset and mget to memory cache', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    await cache.mset({
      'multi-1': { a: 1 },
      'multi-2': { b: 2 },
    });

    const results = await cache.mget(['multi-1', 'multi-2', 'multi-3']);
    expect(results['multi-1']).toEqual({ a: 1 });
    expect(results['multi-2']).toEqual({ b: 2 });
    expect(results['multi-3']).toBeUndefined();
  });

  test('should proxy clear to memory cache', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    await cache.set('clear-test', 'value');
    await cache.clear();

    const result = await cache.get('clear-test');
    expect(result).toBeUndefined();
  });

  test('getStats should include backend info', async () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    const stats = await cache.getStats();
    expect(stats).toHaveProperty('backend', 'memory');
  });

  test('getBackend should return memory when Redis not connected', () => {
    const { UnifiedCache } = require('../../src/lib/redisCache');
    const cache = new UnifiedCache();

    expect(cache.getBackend()).toBe('memory');
  });
});

describe('Cache Integration with API Optimization', () => {
  test('apiOptimization should import unified cache', () => {
    const filePath = path.join(__dirname, '../../src/middleware/apiOptimization.js');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code).toContain("require('../lib/redisCache')");
    expect(code).toContain('unifiedCache');
  });

  test('responseCacheMiddleware should support Redis', () => {
    const filePath = path.join(__dirname, '../../src/middleware/apiOptimization.js');
    const code = fs.readFileSync(filePath, 'utf8');

    expect(code).toContain('redisCacheMiddleware');
    expect(code).toContain('X-Cache-Backend');
  });

  test('getCacheStats should be exported', () => {
    // Check the exports in source code (avoids ESM import issues with uuid in Jest)
    const filePath = path.join(__dirname, '../../src/middleware/apiOptimization.js');
    const code = fs.readFileSync(filePath, 'utf8');

    // Verify getCacheStats is defined and exported
    expect(code).toContain('async function getCacheStats()');
    expect(code).toContain('getCacheStats,');
  });
});
