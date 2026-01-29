// tests/utils/circuitBreaker.test.js
// Tests for circuit breaker utility

const { CircuitBreaker, CircuitBreakerRegistry, withCircuitBreaker, STATES } = require('../../src/utils/circuitBreaker');

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      resetTimeout: 100, // 100ms for faster tests
      halfOpenMax: 2,
    });
  });

  describe('Basic Operation', () => {
    test('should start in CLOSED state', () => {
      expect(breaker.state).toBe(STATES.CLOSED);
    });

    test('should execute successful functions', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.state).toBe(STATES.CLOSED);
    });

    test('should pass through errors in CLOSED state', async () => {
      await expect(
        breaker.execute(async () => { throw new Error('test error'); })
      ).rejects.toThrow('test error');
    });

    test('should track failure count', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Fail once
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.failures).toBe(1);
      expect(breaker.state).toBe(STATES.CLOSED);

      // Fail twice
      await expect(breaker.execute(failingFn)).rejects.toThrow();
      expect(breaker.failures).toBe(2);
      expect(breaker.state).toBe(STATES.CLOSED);
    });
  });

  describe('Circuit Opening', () => {
    test('should open circuit after threshold failures', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }

      expect(breaker.state).toBe(STATES.OPEN);
    });

    test('should reject requests immediately when OPEN', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
      }

      // Next request should be rejected by circuit
      await expect(
        breaker.execute(async () => 'should not run')
      ).rejects.toThrow('Circuit breaker');
      expect(breaker.stats.rejectedByCircuit).toBe(1);
    });
  });

  describe('Circuit Recovery', () => {
    test('should transition to HALF_OPEN after reset timeout', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }
      expect(breaker.state).toBe(STATES.OPEN);

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));

      // Next call should trigger half-open
      try {
        await breaker.execute(async () => 'success');
      } catch (e) {
        // May fail if timing is off
      }

      // State should be CLOSED (recovered) or HALF_OPEN (testing)
      expect([STATES.CLOSED, STATES.HALF_OPEN]).toContain(breaker.state);
    });

    test('should close circuit on successful half-open request', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));

      // Successful request should close circuit
      await breaker.execute(async () => 'success');
      expect(breaker.state).toBe(STATES.CLOSED);
      expect(breaker.failures).toBe(0);
    });

    test('should re-open circuit on half-open failure', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
      }

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));

      // Failing request should re-open circuit
      await expect(breaker.execute(failingFn)).rejects.toThrow('fail');
      expect(breaker.state).toBe(STATES.OPEN);
    });
  });

  describe('Stats Tracking', () => {
    test('should track request statistics', async () => {
      await breaker.execute(async () => 'success');
      await expect(
        breaker.execute(async () => { throw new Error('fail'); })
      ).rejects.toThrow();

      const status = breaker.getStatus();
      expect(status.stats.totalRequests).toBe(2);
      expect(status.stats.totalSuccesses).toBe(1);
      expect(status.stats.totalFailures).toBe(1);
    });
  });

  describe('Manual Reset', () => {
    test('should reset circuit state', async () => {
      const failingFn = async () => { throw new Error('fail'); };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow();
      }
      expect(breaker.state).toBe(STATES.OPEN);

      // Manual reset
      breaker.reset();
      expect(breaker.state).toBe(STATES.CLOSED);
      expect(breaker.failures).toBe(0);
      expect(breaker.stats.totalRequests).toBe(0);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  test('should create and return circuit breakers', () => {
    const breaker = registry.get('test', { failureThreshold: 5 });
    expect(breaker).toBeInstanceOf(CircuitBreaker);
    expect(breaker.name).toBe('test');
  });

  test('should return same instance for same name', () => {
    const breaker1 = registry.get('same-name');
    const breaker2 = registry.get('same-name');
    expect(breaker1).toBe(breaker2);
  });

  test('should get all breakers status', () => {
    registry.get('api1');
    registry.get('api2');

    const status = registry.getAll();
    expect(status).toHaveProperty('api1');
    expect(status).toHaveProperty('api2');
  });
});

describe('withCircuitBreaker', () => {
  test('should wrap function with circuit breaker', async () => {
    const fn = async (x) => x * 2;
    const wrapped = withCircuitBreaker('wrapper-test', fn);

    const result = await wrapped(5);
    expect(result).toBe(10);
  });
});
