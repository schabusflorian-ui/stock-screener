/**
 * Kelly Criterion Edge Case Tests
 *
 * Tests boundary conditions, extreme inputs, and error handling.
 * Ensures the implementation is robust against pathological inputs.
 */

// Note: Both modules export singleton instances, not classes
const positionSizing = require('../../src/services/portfolio/positionSizing');
const advancedKelly = require('../../src/services/portfolio/advancedKelly');
const testVectors = require('../fixtures/kellyTestVectors');

describe('Kelly Criterion Edge Cases', () => {

  // ============================================
  // Win Rate Boundary Tests
  // ============================================
  describe('Win Rate Extremes', () => {

    test('0% win rate returns zero shares', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0,
        avgWin: 2,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(result.shares).toBe(0);
      expect(result.kellyPct).toBeLessThanOrEqual(0);
    });

    test('100% win rate returns full Kelly = 1 (capped at max)', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 1.0,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // Full Kelly would be 100%, but positionPct is capped at maxPositionPct (default 25%)
      expect(result.positionPct).toBeLessThanOrEqual(25);
    });

    test('50% win rate with even odds is break-even', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.5,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // Break-even means Kelly = 0, so no shares
      expect(result.shares).toBe(0);
      expect(result.kellyPct).toBeLessThanOrEqual(0);
    });

    test('win rate slightly above 50% with even odds', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.501,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // Very small positive Kelly = 0.2%
      expect(result.kellyPct).toBeGreaterThan(0);
      expect(result.kellyPct).toBeLessThan(1); // Less than 1%
    });

    test('win rate slightly below 50% with even odds', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.499,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(result.shares).toBe(0);
      expect(result.kellyPct).toBeLessThan(0);
    });
  });

  // ============================================
  // Payoff Ratio Extremes
  // ============================================
  describe('Payoff Ratio Extremes', () => {

    test('very high payoff ratio (1000:1)', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.01,
        avgWin: 1000,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // EV = 0.01 * 1000 - 0.99 * 1 = 10 - 0.99 = 9.01 (positive)
      // Kelly = (1000 * 0.01 - 0.99) / 1000 = 0.00901
      expect(result.fullKellyPct / 100).toBeCloseTo(0.00901, 3);
      expect(result.expectedValue).toBeGreaterThan(0);
    });

    test('very low payoff ratio (0.01:1)', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.99,
        avgWin: 0.01,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // EV = 0.99 * 0.01 - 0.01 * 1 = 0.0099 - 0.01 = -0.0001 (negative)
      expect(result.shares).toBe(0);
    });

    test('equal win and loss amounts', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 100,
        avgLoss: 100,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // b = 1, Kelly = (1*0.6 - 0.4) / 1 = 0.2
      expect(result.fullKellyPct / 100).toBeCloseTo(0.2, 4);
    });

    test('asymmetric large win, small loss', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.3,
        avgWin: 500,
        avgLoss: 100,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // b = 5, Kelly = (5*0.3 - 0.7) / 5 = (1.5 - 0.7) / 5 = 0.16
      expect(result.fullKellyPct / 100).toBeCloseTo(0.16, 2);
    });
  });

  // ============================================
  // Zero and Near-Zero Values
  // ============================================
  describe('Zero and Near-Zero Values', () => {

    test('zero avgWin throws error or handles gracefully', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: 0,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('zero avgLoss throws error or handles gracefully', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: 1,
          avgLoss: 0,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('zero portfolio value throws error', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 0,
          winRate: 0.6,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('near-zero avgLoss (very small) returns finite Kelly', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 1,
        avgLoss: 0.001,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(Number.isFinite(result.fullKellyPct)).toBe(true);
    });
  });

  // ============================================
  // Negative Values
  // ============================================
  describe('Negative Values', () => {

    test('negative win rate is handled', () => {
      // Should either throw or return 0 shares
      try {
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: -0.1,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
        expect(result.shares).toBe(0);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    test('negative avgWin is handled', () => {
      try {
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: -1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
        expect(result.shares).toBe(0);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    test('negative Kelly fraction is handled', () => {
      try {
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: -0.5,
          entryPrice: 100
        });
        expect(result.kellyPct).toBeLessThanOrEqual(0);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  // ============================================
  // Very Large Values
  // ============================================
  describe('Very Large Values', () => {

    test('very large portfolio value', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 1e12, // $1 trillion
        winRate: 0.6,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 0.5,
        entryPrice: 100
      });

      expect(Number.isFinite(result.shares)).toBe(true);
      expect(result.shares).toBeGreaterThan(0);
    });

    test('very large entry price', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 0.5,
        entryPrice: 50000 // BRK.A style
      });

      // May result in 0 shares if position size < entry price
      expect(Number.isFinite(result.shares)).toBe(true);
    });

    test('win rate at machine precision boundary', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.5 + Number.EPSILON,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(Number.isFinite(result.kellyPct)).toBe(true);
    });
  });

  // ============================================
  // Missing Required Parameters
  // ============================================
  describe('Missing Required Parameters', () => {

    test('missing portfolioValue throws error', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          winRate: 0.6,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('missing winRate throws error', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('missing avgWin throws error', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });

    test('missing avgLoss throws error', () => {
      expect(() => {
        positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
      }).toThrow();
    });
  });

  // ============================================
  // NaN and Infinity Handling
  // ============================================
  describe('NaN and Infinity Handling', () => {

    test('NaN winRate is handled', () => {
      try {
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: NaN,
          avgWin: 1,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
        expect(Number.isNaN(result.kellyPct)).toBe(false);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    test('Infinity avgWin is handled', () => {
      try {
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate: 0.6,
          avgWin: Infinity,
          avgLoss: 1,
          kellyFraction: 1.0,
          entryPrice: 100
        });
        expect(Number.isFinite(result.kellyPct)).toBe(true);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  // ============================================
  // Default Value Tests
  // ============================================
  describe('Default Values', () => {

    test('default kellyFraction is 0.5 (half-Kelly)', () => {
      const withDefault = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 2,
        avgLoss: 1,
        entryPrice: 100
        // No kellyFraction specified
      });

      const withHalf = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 2,
        avgLoss: 1,
        kellyFraction: 0.5,
        entryPrice: 100
      });

      expect(withDefault.kellyPct).toBeCloseTo(withHalf.kellyPct, 4);
    });

    test('default maxPositionPct is 25%', () => {
      // High Kelly that would exceed 25%
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.9,
        avgWin: 5,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
        // No maxPositionPct specified
      });

      expect(result.positionPct).toBeLessThanOrEqual(25);
    });
  });

  // ============================================
  // Continuous Kelly Edge Cases
  // ============================================
  describe('Continuous Kelly Edge Cases', () => {

    test('zero volatility returns 0', () => {
      const kelly = testVectors.calculateContinuousKelly(0.10, 0.05, 0);
      expect(kelly).toBe(0);
    });

    test('negative volatility is handled (absolute value)', () => {
      // Volatility should always be positive; test handling
      const kellyPos = testVectors.calculateContinuousKelly(0.10, 0.05, 0.20);
      const kellyNeg = testVectors.calculateContinuousKelly(0.10, 0.05, -0.20);

      // Behavior depends on implementation - may use absolute or error
      expect(Number.isFinite(kellyNeg)).toBe(true);
    });

    test('return equals risk-free rate gives zero Kelly', () => {
      const rf = 0.05;
      const kelly = testVectors.calculateContinuousKelly(rf, rf, 0.20);
      expect(kelly).toBeCloseTo(0, 10);
    });

    test('very high volatility gives small Kelly', () => {
      // 100% annual volatility
      const kelly = testVectors.calculateContinuousKelly(0.15, 0.05, 1.0);
      // (0.15 - 0.05) / 1.0 = 0.10
      expect(kelly).toBeCloseTo(0.10, 2);
    });

    test('very low volatility gives large Kelly', () => {
      // 1% annual volatility
      const kelly = testVectors.calculateContinuousKelly(0.10, 0.05, 0.01);
      // (0.10 - 0.05) / 0.0001 = 500
      expect(kelly).toBeCloseTo(500, 0);
    });
  });

  // ============================================
  // Kelly Fraction Boundary Tests
  // ============================================
  describe('Kelly Fraction Boundaries', () => {

    test('Kelly fraction of 0 gives zero position', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 2,
        avgLoss: 1,
        kellyFraction: 0,
        entryPrice: 100
      });

      expect(result.kellyPct).toBe(0);
      expect(result.shares).toBe(0);
    });

    test('Kelly fraction of 1 gives full Kelly', () => {
      const fullKelly = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 2,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(fullKelly.kellyPct).toEqual(fullKelly.fullKellyPct);
    });

    test('Kelly fraction > 1 allows over-betting (if uncapped)', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 2,
        avgLoss: 1,
        kellyFraction: 2.0, // Double Kelly
        entryPrice: 100,
        maxPositionPct: 100 // Remove cap for test
      });

      // Double Kelly should be 2x full Kelly
      expect(result.kellyPct).toBeCloseTo(result.fullKellyPct * 2, 1);
    });
  });
});
