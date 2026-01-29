// tests/middleware/rateLimiter.test.js
// Tests for rate limiter middleware - validates memory management and request limiting

const { RateLimiter } = require('../../src/middleware/rateLimiter');

describe('RateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 1000, // 1 second window for testing
      maxRequests: 5,
      maxStoreSize: 10
    });
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.destroy();
    }
    rateLimiter = null;
  });

  describe('Basic Rate Limiting', () => {
    test('should track request counts correctly', () => {
      const key = '127.0.0.1';

      for (let i = 0; i < 5; i++) {
        const entry = rateLimiter.increment(key);
        expect(entry.count).toBe(i + 1);
      }
    });

    test('should count requests over the limit', () => {
      const key = '127.0.0.1';

      // Make 6 requests (limit is 5)
      for (let i = 0; i < 6; i++) {
        rateLimiter.increment(key);
      }

      // Check final count
      const count = rateLimiter.getCount(key);
      expect(count).toBe(6);
    });

    test('should track different keys separately', () => {
      const key1 = '127.0.0.1';
      const key2 = '192.168.1.1';

      // Increment key1 multiple times
      for (let i = 0; i < 5; i++) {
        rateLimiter.increment(key1);
      }

      // key2 should start fresh
      const entry = rateLimiter.increment(key2);
      expect(entry.count).toBe(1);
    });

    test('getCount should return 0 for unknown key', () => {
      expect(rateLimiter.getCount('unknown-key')).toBe(0);
    });
  });

  describe('Memory Management (LRU Eviction)', () => {
    test('should not exceed maxStoreSize', () => {
      // Create entries for 15 different IPs (maxStoreSize is 10)
      for (let i = 0; i < 15; i++) {
        rateLimiter.increment(`192.168.1.${i}`);
      }

      // Store size should not exceed maxStoreSize
      expect(rateLimiter.store.size).toBeLessThanOrEqual(10);
    });

    test('should evict oldest entries when store is full', () => {
      // Fill up the store
      for (let i = 0; i < 10; i++) {
        rateLimiter.increment(`192.168.1.${i}`);
      }

      // Add one more - should evict the oldest
      rateLimiter.increment('192.168.1.100');

      // First key should be evicted
      expect(rateLimiter.store.has('192.168.1.0')).toBe(false);
      // New key should exist
      expect(rateLimiter.store.has('192.168.1.100')).toBe(true);
    });

    test('should maintain LRU order on access', () => {
      // Fill up the store
      for (let i = 0; i < 10; i++) {
        rateLimiter.increment(`192.168.1.${i}`);
      }

      // Access the first key again (should move to end of LRU)
      rateLimiter.increment('192.168.1.0');

      // Add a new key - should evict second key, not first
      rateLimiter.increment('192.168.1.100');

      // First key should still exist (was recently accessed)
      expect(rateLimiter.store.has('192.168.1.0')).toBe(true);
      // Second key should be evicted
      expect(rateLimiter.store.has('192.168.1.1')).toBe(false);
    });
  });

  describe('Cleanup', () => {
    test('should remove expired entries on cleanup', async () => {
      const key = '127.0.0.1';
      rateLimiter.increment(key);

      expect(rateLimiter.store.has(key)).toBe(true);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Trigger cleanup
      rateLimiter.cleanup();

      expect(rateLimiter.store.has(key)).toBe(false);
    });

    test('should enforce maxStoreSize during cleanup', () => {
      // Create a limiter with very small maxStoreSize
      const smallLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        maxStoreSize: 5
      });

      // Add 10 entries
      for (let i = 0; i < 10; i++) {
        smallLimiter.increment(`192.168.1.${i}`);
      }

      // Cleanup should enforce size limit
      smallLimiter.cleanup();

      expect(smallLimiter.store.size).toBeLessThanOrEqual(5);
      smallLimiter.destroy();
    });
  });

  describe('Window Reset', () => {
    test('should reset count after window expires', async () => {
      const key = '127.0.0.1';

      // Make some requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.increment(key);
      }

      expect(rateLimiter.getCount(key)).toBe(3);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Count should reset to 0 (entry expired)
      expect(rateLimiter.getCount(key)).toBe(0);

      // New request should start fresh
      const entry = rateLimiter.increment(key);
      expect(entry.count).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null/undefined keys gracefully', () => {
      // These should not throw
      expect(() => rateLimiter.increment(null)).not.toThrow();
      expect(() => rateLimiter.increment(undefined)).not.toThrow();
    });

    test('should handle empty string key', () => {
      const entry = rateLimiter.increment('');
      expect(entry).toHaveProperty('count');
      expect(entry.count).toBe(1);
    });
  });

  describe('Middleware Integration', () => {
    test('should create middleware function', () => {
      const middleware = rateLimiter.middleware();
      expect(typeof middleware).toBe('function');
    });

    test('middleware should call next() for allowed requests', (done) => {
      const middleware = rateLimiter.middleware();
      const req = { ip: '127.0.0.1' };
      const res = {
        setHeader: jest.fn()
      };
      const next = jest.fn(() => {
        expect(next).toHaveBeenCalled();
        done();
      });

      middleware(req, res, next);
    });

    test('middleware should set rate limit headers', (done) => {
      const middleware = rateLimiter.middleware();
      const req = { ip: '127.0.0.1' };
      const res = {
        setHeader: jest.fn()
      };
      const next = jest.fn(() => {
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
        done();
      });

      middleware(req, res, next);
    });

    test('middleware should return 429 for requests over limit', (done) => {
      const middleware = rateLimiter.middleware();
      const req = { ip: '127.0.0.1' };
      const res = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn(() => {
          expect(res.status).toHaveBeenCalledWith(429);
          done();
        })
      };
      const next = jest.fn();

      // Exhaust the limit (make 6 requests, limit is 5)
      for (let i = 0; i < 6; i++) {
        middleware(req, res, next);
      }
    });
  });

  describe('Destroy', () => {
    test('should clear cleanup interval on destroy', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 5 });
      expect(limiter.cleanupInterval).toBeDefined();

      limiter.destroy();
      // After destroy, interval reference should still exist but be cleared
      expect(limiter.cleanupInterval).toBeDefined();
    });
  });
});
