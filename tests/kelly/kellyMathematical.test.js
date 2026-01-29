/**
 * Kelly Criterion Mathematical Correctness Tests
 *
 * Tests verify the mathematical accuracy of Kelly formulas against known academic results.
 * Sources: Thorp (1969), MacLean/Thorp/Ziemba (2011), Poundstone (2005)
 */

const path = require('path');

// Import the modules to test
// Note: Both modules export singleton instances, not classes
const positionSizing = require('../../src/services/portfolio/positionSizing');
const advancedKelly = require('../../src/services/portfolio/advancedKelly');
const testVectors = require('../fixtures/kellyTestVectors');

describe('Kelly Criterion Mathematical Correctness', () => {

  // ============================================
  // Classic Kelly Formula: f* = (bp - q) / b
  // ============================================
  describe('Classic Kelly Formula: f* = (bp - q) / b', () => {

    describe('Known Academic Test Cases', () => {

      test('fair coin with 2:1 odds (Thorp example)', () => {
        const { winRate, avgWin, avgLoss, expectedKelly, tolerance } =
          testVectors.CLASSIC_KELLY.fairCoin2to1;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0, // Full Kelly
          entryPrice: 100
        });

        // The kellyPct returned is already multiplied by kellyFraction
        // and capped at maxPositionPct. Compare the fullKellyPct
        expect(result.fullKellyPct / 100).toBeCloseTo(expectedKelly, 4);
      });

      test('biased coin 60% win, even odds', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.biasedCoinEvenOdds;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        expect(result.fullKellyPct / 100).toBeCloseTo(expectedKelly, 4);
      });

      test('blackjack card counter edge (Thorp)', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.blackjackCounter;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        expect(result.fullKellyPct / 100).toBeCloseTo(expectedKelly, 3);
      });

      test('lottery-style bet (high payoff, low probability)', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.lotteryStyle;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        expect(result.fullKellyPct / 100).toBeCloseTo(expectedKelly, 3);
      });

      test('frequent small wins', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.frequentSmallWins;

        // Verify the formula manually
        const b = avgWin / avgLoss;
        const calculatedKelly = (b * winRate - (1 - winRate)) / b;

        expect(calculatedKelly).toBeCloseTo(expectedKelly, 2);

        // The position sizing module caps at maxPositionPct
        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        // Position is capped at 25%
        expect(result.positionPct).toBeLessThanOrEqual(25);
      });
    });

    describe('Break-Even and Losing Games', () => {

      test('break-even game (50% win, even odds) returns zero', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.breakEven;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        // Should return 0 shares and recommendation to not trade
        expect(result.shares).toBe(0);
        expect(result.kellyPct).toBeLessThanOrEqual(0);
      });

      test('losing game returns negative Kelly', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.losingGame;

        const result = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        // Negative Kelly means don't bet
        expect(result.shares).toBe(0);
        expect(result.recommendation).toContain('negative');
      });
    });

    describe('Kelly Fraction Application', () => {

      test('half-Kelly returns 50% of full Kelly', () => {
        const { winRate, avgWin, avgLoss, expectedKelly } =
          testVectors.CLASSIC_KELLY.fairCoin2to1;

        const fullKelly = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        const halfKelly = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 0.5,
          entryPrice: 100
        });

        // Half Kelly should be 50% of full Kelly (before capping)
        expect(halfKelly.fullKellyPct).toBeCloseTo(fullKelly.fullKellyPct, 4);
        expect(halfKelly.kellyPct).toBeCloseTo(fullKelly.kellyPct / 2, 4);
      });

      test('quarter-Kelly returns 25% of full Kelly', () => {
        const { winRate, avgWin, avgLoss } =
          testVectors.CLASSIC_KELLY.biasedCoinEvenOdds;

        const fullKelly = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 1.0,
          entryPrice: 100
        });

        const quarterKelly = positionSizing.calculate('kelly', {
          portfolioValue: 100000,
          winRate,
          avgWin,
          avgLoss,
          kellyFraction: 0.25,
          entryPrice: 100
        });

        expect(quarterKelly.kellyPct).toBeCloseTo(fullKelly.kellyPct / 4, 4);
      });
    });

    describe('Formula Verification with Helper', () => {

      test('helper function matches manual calculation', () => {
        // Manual: f* = (bp - q) / b
        const p = 0.6;
        const avgWin = 2;
        const avgLoss = 1;
        const b = avgWin / avgLoss;
        const q = 1 - p;
        const manualKelly = (b * p - q) / b;

        const helperKelly = testVectors.calculateClassicKelly(p, avgWin, avgLoss);

        expect(helperKelly).toBeCloseTo(manualKelly, 10);
      });

      test('all test vectors satisfy formula', () => {
        for (const [name, testCase] of Object.entries(testVectors.CLASSIC_KELLY)) {
          const { winRate, avgWin, avgLoss, expectedKelly, tolerance } = testCase;
          const calculated = testVectors.calculateClassicKelly(winRate, avgWin, avgLoss);

          expect(calculated).toBeCloseTo(expectedKelly, -Math.log10(tolerance || 0.001));
        }
      });
    });
  });

  // ============================================
  // Continuous Kelly Formula: f* = (mu - r) / sigma^2
  // ============================================
  describe('Continuous Kelly Formula: f* = (mu - r) / sigma^2', () => {

    describe('Known Test Cases', () => {

      test('stock with 15% return, 5% rf, 20% vol', () => {
        const { annualReturn, riskFreeRate, annualVolatility, expectedKelly } =
          testVectors.CONTINUOUS_KELLY.typicalStock;

        const calculated = testVectors.calculateContinuousKelly(
          annualReturn, riskFreeRate, annualVolatility
        );

        expect(calculated).toBeCloseTo(expectedKelly, 2);
      });

      test('S&P 500 historical average', () => {
        const { annualReturn, riskFreeRate, annualVolatility, expectedKelly } =
          testVectors.CONTINUOUS_KELLY.sp500Historical;

        const calculated = testVectors.calculateContinuousKelly(
          annualReturn, riskFreeRate, annualVolatility
        );

        expect(calculated).toBeCloseTo(expectedKelly, 2);
      });

      test('low volatility stock', () => {
        const { annualReturn, riskFreeRate, annualVolatility, expectedKelly } =
          testVectors.CONTINUOUS_KELLY.lowVolStock;

        const calculated = testVectors.calculateContinuousKelly(
          annualReturn, riskFreeRate, annualVolatility
        );

        expect(calculated).toBeCloseTo(expectedKelly, 2);
      });

      test('high volatility stock', () => {
        const { annualReturn, riskFreeRate, annualVolatility, expectedKelly } =
          testVectors.CONTINUOUS_KELLY.highVolStock;

        const calculated = testVectors.calculateContinuousKelly(
          annualReturn, riskFreeRate, annualVolatility
        );

        expect(calculated).toBeCloseTo(expectedKelly, 2);
      });

      test('negative excess return', () => {
        const { annualReturn, riskFreeRate, annualVolatility, expectedKelly } =
          testVectors.CONTINUOUS_KELLY.negativeExcess;

        const calculated = testVectors.calculateContinuousKelly(
          annualReturn, riskFreeRate, annualVolatility
        );

        expect(calculated).toBeCloseTo(expectedKelly, 2);
        expect(calculated).toBeLessThan(0);
      });
    });

    describe('Zero Volatility Handling', () => {

      test('zero volatility returns zero (not infinity)', () => {
        const calculated = testVectors.calculateContinuousKelly(0.10, 0.05, 0);
        expect(calculated).toBe(0);
        expect(Number.isFinite(calculated)).toBe(true);
      });

      test('near-zero volatility returns large but finite value', () => {
        const calculated = testVectors.calculateContinuousKelly(0.10, 0.05, 0.001);
        expect(Number.isFinite(calculated)).toBe(true);
        expect(calculated).toBeGreaterThan(0);
      });
    });

    describe('Mathematical Properties', () => {

      test('Kelly increases with higher returns (fixed vol)', () => {
        const vol = 0.20;
        const rf = 0.05;

        const kelly1 = testVectors.calculateContinuousKelly(0.10, rf, vol);
        const kelly2 = testVectors.calculateContinuousKelly(0.15, rf, vol);
        const kelly3 = testVectors.calculateContinuousKelly(0.20, rf, vol);

        expect(kelly2).toBeGreaterThan(kelly1);
        expect(kelly3).toBeGreaterThan(kelly2);
      });

      test('Kelly decreases with higher volatility (fixed returns)', () => {
        const ret = 0.15;
        const rf = 0.05;

        const kelly1 = testVectors.calculateContinuousKelly(ret, rf, 0.15);
        const kelly2 = testVectors.calculateContinuousKelly(ret, rf, 0.20);
        const kelly3 = testVectors.calculateContinuousKelly(ret, rf, 0.30);

        expect(kelly1).toBeGreaterThan(kelly2);
        expect(kelly2).toBeGreaterThan(kelly3);
      });

      test('Kelly is zero when return equals risk-free rate', () => {
        const rf = 0.05;
        const kelly = testVectors.calculateContinuousKelly(rf, rf, 0.20);
        expect(kelly).toBeCloseTo(0, 10);
      });

      test('Kelly is negative when return is below risk-free rate', () => {
        const kelly = testVectors.calculateContinuousKelly(0.03, 0.05, 0.20);
        expect(kelly).toBeLessThan(0);
      });

      test('Kelly scales inversely with variance (squared volatility)', () => {
        const ret = 0.15;
        const rf = 0.05;
        const excessReturn = ret - rf;

        // Double volatility = 4x variance = 1/4 Kelly
        const kelly1 = testVectors.calculateContinuousKelly(ret, rf, 0.10);
        const kelly2 = testVectors.calculateContinuousKelly(ret, rf, 0.20);

        expect(kelly1).toBeCloseTo(kelly2 * 4, 2);
      });
    });
  });

  // ============================================
  // Expected Value Calculations
  // ============================================
  describe('Expected Value Calculations', () => {

    test('positive EV game has positive Kelly', () => {
      // EV = p * win - q * loss = 0.6 * 1 - 0.4 * 1 = 0.2 (positive)
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.6,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(result.expectedValue).toBeGreaterThan(0);
      expect(result.fullKellyPct).toBeGreaterThan(0);
    });

    test('negative EV game has zero shares', () => {
      // EV = p * win - q * loss = 0.4 * 1 - 0.6 * 1 = -0.2 (negative)
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.4,
        avgWin: 1,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      // Negative EV means don't bet
      expect(result.shares).toBe(0);
      expect(result.kellyPct).toBeLessThanOrEqual(0);
    });

    test('expected value calculation is correct', () => {
      const winRate = 0.55;
      const avgWin = 120;
      const avgLoss = 100;
      const expectedEV = winRate * avgWin - (1 - winRate) * avgLoss;

      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate,
        avgWin,
        avgLoss,
        kellyFraction: 1.0,
        entryPrice: 100
      });

      expect(result.expectedValue).toBeCloseTo(expectedEV, 4);
    });
  });

  // ============================================
  // Position Size Calculations
  // ============================================
  describe('Position Size Calculations', () => {

    test('calculates correct number of shares', () => {
      const portfolioValue = 100000;
      const winRate = 0.6;
      const avgWin = 2;
      const avgLoss = 1;
      const entryPrice = 50;
      const kellyFraction = 0.5;

      // Full Kelly = (2*0.6 - 0.4) / 2 = 0.4 = 40%
      // Half Kelly = 20%
      // But capped at maxPositionPct = 25%
      // Position value = min(20%, 25%) * 100000 = $20,000
      // Shares = floor(20000 / 50) = 400

      const result = positionSizing.calculate('kelly', {
        portfolioValue,
        winRate,
        avgWin,
        avgLoss,
        kellyFraction,
        entryPrice
      });

      expect(result.shares).toBe(400);
      expect(result.positionValue).toBe(20000);
      expect(result.positionPct).toBeCloseTo(20, 1);
    });

    test('respects maximum position size cap', () => {
      // Very high Kelly (> 25% max)
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 100000,
        winRate: 0.8,
        avgWin: 3,
        avgLoss: 1,
        kellyFraction: 1.0,
        entryPrice: 100,
        maxPositionPct: 25
      });

      expect(result.positionPct).toBeLessThanOrEqual(25);
    });

    test('floors share count to whole number', () => {
      const result = positionSizing.calculate('kelly', {
        portfolioValue: 10000,
        winRate: 0.6,
        avgWin: 1.5,
        avgLoss: 1,
        kellyFraction: 0.5,
        entryPrice: 157.33 // Odd price
      });

      expect(Number.isInteger(result.shares)).toBe(true);
    });
  });
});
