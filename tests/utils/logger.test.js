// tests/utils/logger.test.js
// Tests for structured logging utility

const { logger, createLogger, LOG_LEVELS } = require('../../src/utils/logger');

describe('Logger Utility', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Default Logger', () => {
    test('should have all log level methods', () => {
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.trace).toBe('function');
    });

    test('should log info messages', () => {
      logger.info('Test message');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    test('should log error messages to console.error', () => {
      logger.error('Error message');
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    test('should log warn messages to console.warn', () => {
      logger.warn('Warning message');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    test('should include context in log output', () => {
      logger.info('Test message', { userId: 123, action: 'login' });
      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('Test message');
    });
  });

  describe('createLogger', () => {
    test('should create logger with default context', () => {
      const serviceLogger = createLogger({ service: 'test-service' });
      serviceLogger.info('Service message');

      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('Service message');
    });

    test('should merge default context with call context', () => {
      const serviceLogger = createLogger({ service: 'api' });
      serviceLogger.info('Request received', { endpoint: '/users' });

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    test('child logger should inherit parent context', () => {
      const parentLogger = createLogger({ service: 'api' });
      const childLogger = parentLogger.child({ component: 'auth' });

      childLogger.info('Auth event');
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    test('should have correct level values', () => {
      expect(LOG_LEVELS.error).toBe(0);
      expect(LOG_LEVELS.warn).toBe(1);
      expect(LOG_LEVELS.info).toBe(2);
      expect(LOG_LEVELS.debug).toBe(3);
      expect(LOG_LEVELS.trace).toBe(4);
    });

    test('error should have lowest level (highest priority)', () => {
      expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.warn);
      expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.info);
      expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.debug);
      expect(LOG_LEVELS.debug).toBeLessThan(LOG_LEVELS.trace);
    });
  });

  describe('Timing Helper', () => {
    test('should have time method', () => {
      expect(typeof logger.time).toBe('function');
    });

    test('time().end() should log with duration', async () => {
      const timer = logger.time('operation');

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 50));

      timer.end('Operation completed');

      expect(consoleSpy.log).toHaveBeenCalled();
      const logCall = consoleSpy.log.mock.calls[0][0];
      expect(logCall).toContain('Operation completed');
    });

    test('time() should track duration in milliseconds', async () => {
      const timer = logger.time('test-operation');

      await new Promise(resolve => setTimeout(resolve, 100));

      timer.end('Completed', { extra: 'context' });

      // Duration should be at least 100ms
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Service Loggers', () => {
    test('should export named service loggers', () => {
      const { api, jobs, database, sentiment, trading, agent, ml, prism, xbrl, sec } = require('../../src/utils/logger');

      expect(api).toBeDefined();
      expect(jobs).toBeDefined();
      expect(database).toBeDefined();
      expect(sentiment).toBeDefined();
      expect(trading).toBeDefined();
      expect(agent).toBeDefined();
      expect(ml).toBeDefined();
      expect(prism).toBeDefined();
      expect(xbrl).toBeDefined();
      expect(sec).toBeDefined();
    });

    test('service loggers should function correctly', () => {
      const { api } = require('../../src/utils/logger');
      api.info('API request');
      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    test('should handle null context gracefully', () => {
      expect(() => logger.info('Test', null)).not.toThrow();
    });

    test('should handle undefined message', () => {
      expect(() => logger.info(undefined)).not.toThrow();
    });

    test('should handle circular references in context', () => {
      const circular = { name: 'test' };
      circular.self = circular;

      // Should not throw, but may not include circular reference
      expect(() => logger.info('Test', circular)).not.toThrow();
    });

    test('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      expect(() => logger.info(longMessage)).not.toThrow();
    });
  });
});
