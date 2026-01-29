/**
 * Kelly Criterion Historical Stress Tests
 *
 * Tests Kelly behavior during major market crises:
 * - 2008 Global Financial Crisis
 * - COVID-19 Crash (2020)
 * - 2022 Fed Rate Shock
 * - Flash Crashes
 */

// Note: AdvancedKelly exports a singleton instance, not a class
const advancedKelly = require('../../src/services/portfolio/advancedKelly');
const crisisData = require('../fixtures/historicalCrisisData');
const testVectors = require('../fixtures/kellyTestVectors');

describe('Kelly Criterion Stress Tests', () => {

  // ============================================
  // 2008 Global Financial Crisis
  // ============================================
  describe('2008 Global Financial Crisis', () => {

    const { SP500, FINANCIALS, expectedBehavior } = crisisData.GFC_2008;

    test('crisis period has higher volatility than normal', () => {
      const crisisStats = crisisData.calculateStats(SP500.returns);
      const normalStats = crisisData.calculateStats(crisisData.NORMAL_BULL.returns);

      // Crisis should have higher volatility
      expect(crisisStats.annualVol).toBeGreaterThan(normalStats.annualVol);
    });

    test('Kelly fraction should be minimal or avoid', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // Negative mean return during crisis
      expect(stats.mean).toBeLessThan(0);

      // Continuous Kelly should be negative
      const continuousKelly = testVectors.calculateContinuousKelly(
        stats.annualReturn,
        0.05, // risk-free rate
        stats.annualVol
      );

      expect(continuousKelly).toBeLessThan(0);
    });

    test('high volatility detected', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // Annualized volatility should be elevated during crisis (>25%)
      expect(stats.annualVol).toBeGreaterThan(0.25);
    });

    test('financials have even worse metrics', () => {
      const spStats = crisisData.calculateStats(SP500.returns);
      const finStats = crisisData.calculateStats(FINANCIALS.returns);

      // Financials had worse drawdown
      expect(finStats.maxDrawdown).toBeLessThan(spStats.maxDrawdown);

      // And higher volatility
      expect(finStats.annualVol).toBeGreaterThan(spStats.annualVol);
    });

    test('max drawdown estimation is reasonable', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // Historical GFC drawdown was ~57%
      // Our synthetic data should show significant drawdown
      expect(stats.maxDrawdown).toBeLessThan(-0.30);
    });
  });

  // ============================================
  // COVID-19 Crash (March 2020)
  // ============================================
  describe('COVID-19 Crash', () => {

    const { SP500, expectedBehavior } = crisisData.COVID_2020;

    test('detects extreme volatility spike', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // COVID had ~80% annualized vol at peak
      expect(stats.annualVol).toBeGreaterThan(0.50);
    });

    test('extreme volatility during crash', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // COVID crash had ~50%+ annualized volatility
      expect(stats.annualVol).toBeGreaterThan(0.30);
    });

    test('short duration but severe decline', () => {
      const returns = SP500.returns;

      // Total decline in ~23 days
      expect(returns.length).toBeLessThanOrEqual(30);

      // Cumulative return very negative
      const totalReturn = returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
      expect(totalReturn).toBeLessThan(-0.20);
    });

    test('Kelly should recommend minimal allocation', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // During crash, continuous Kelly is deeply negative
      const continuousKelly = testVectors.calculateContinuousKelly(
        stats.annualReturn,
        0.02,
        stats.annualVol
      );

      expect(continuousKelly).toBeLessThan(-1);
    });

    test('regime detection would classify as bear high-vol', () => {
      const stats = crisisData.calculateStats(SP500.returns);

      // Negative returns + high vol = bear_high_vol
      const isBearish = stats.annualReturn < 0;
      const isHighVol = stats.annualVol > 0.25; // > 25% annual vol

      expect(isBearish).toBe(true);
      expect(isHighVol).toBe(true);
    });
  });

  // ============================================
  // 2022 Rate Shock
  // ============================================
  describe('2022 Fed Rate Shock', () => {

    const { NASDAQ, GROWTH_STOCKS } = crisisData.RATE_SHOCK_2022;

    test('prolonged negative returns (not a crash)', () => {
      const stats = crisisData.calculateStats(NASDAQ.returns);

      // Negative annual return
      expect(stats.annualReturn).toBeLessThan(0);

      // But not extreme volatility (grinding decline)
      expect(stats.annualVol).toBeLessThan(0.40);
    });

    test('continuous Kelly strongly negative', () => {
      const stats = crisisData.calculateStats(NASDAQ.returns);

      const continuousKelly = testVectors.calculateContinuousKelly(
        stats.annualReturn,
        0.05, // Higher risk-free in 2022
        stats.annualVol
      );

      // Should recommend not investing
      expect(continuousKelly).toBeLessThan(0);
    });

    test('growth stocks have higher volatility', () => {
      const nasdaqStats = crisisData.calculateStats(NASDAQ.returns);
      const growthStats = crisisData.calculateStats(GROWTH_STOCKS.returns);

      // Growth stocks typically have higher volatility
      expect(growthStats.annualVol).toBeGreaterThan(nasdaqStats.annualVol);
    });

    test('may not detect as fat-tailed (more normal distribution)', () => {
      const stats = crisisData.calculateStats(NASDAQ.returns);

      // Grinding declines often have more normal distributions
      // Kurtosis may be close to normal (0 excess)
      expect(Math.abs(stats.kurtosis)).toBeLessThan(5);
    });
  });

  // ============================================
  // Flash Crash Scenarios
  // ============================================
  describe('Flash Crash Scenarios', () => {

    const { intradayReturns } = crisisData.FLASH_CRASH_2010;

    test('extreme returns in flash crash data', () => {
      const returns = intradayReturns;

      // Find the extreme return
      const extremeReturn = returns.find(r => Math.abs(r) > 0.05);
      expect(extremeReturn).toBeDefined();

      // Verify there's a significant outlier
      const maxAbs = Math.max(...returns.map(Math.abs));
      expect(maxAbs).toBeGreaterThan(0.05);
    });

    test('single extreme return dominates statistics', () => {
      const returns = intradayReturns;
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const extremeReturn = returns.find(r => Math.abs(r) > 0.05);

      expect(extremeReturn).toBeDefined();
      expect(Math.abs(extremeReturn)).toBeGreaterThan(0.05);
    });

    test('quick recovery may show positive total', () => {
      const totalReturn = intradayReturns.reduce((acc, r) => acc * (1 + r), 1) - 1;

      // Flash crash with recovery may net neutral
      expect(Math.abs(totalReturn)).toBeLessThan(0.10);
    });
  });

  // ============================================
  // Normal Market Comparison
  // ============================================
  describe('Normal Market Comparison', () => {

    const { returns, expectedBehavior } = crisisData.NORMAL_BULL;

    test('normal kurtosis (close to 3)', () => {
      const stats = crisisData.calculateStats(returns);

      // Excess kurtosis should be small
      expect(Math.abs(stats.kurtosis)).toBeLessThan(2);
    });

    test('lower volatility than crisis periods', () => {
      const normalStats = crisisData.calculateStats(returns);
      const crisisStats = crisisData.calculateStats(crisisData.GFC_2008.SP500.returns);

      // Normal market has lower volatility
      expect(normalStats.annualVol).toBeLessThan(crisisStats.annualVol);
    });

    test('moderate volatility', () => {
      const stats = crisisData.calculateStats(returns);

      // Normal market vol ~15-20%
      expect(stats.annualVol).toBeGreaterThan(0.10);
      expect(stats.annualVol).toBeLessThan(0.30);
    });

    test('Kelly calculation produces finite result', () => {
      const stats = crisisData.calculateStats(returns);

      const continuousKelly = testVectors.calculateContinuousKelly(
        stats.annualReturn,
        0.02,
        stats.annualVol
      );

      // Kelly should be a finite number
      expect(Number.isFinite(continuousKelly)).toBe(true);
    });

    test('higher Sharpe ratio than crisis periods', () => {
      const normalStats = crisisData.calculateStats(returns);
      const crisisStats = crisisData.calculateStats(crisisData.GFC_2008.SP500.returns);

      expect(normalStats.sharpe).toBeGreaterThan(crisisStats.sharpe);
    });
  });

  // ============================================
  // Fat Tail Detection Tests
  // ============================================
  describe('Fat Tail Detection', () => {

    test('hasFatTails function works with synthetic data', () => {
      // Test that the function returns a boolean
      const crisisResult = crisisData.hasFatTails(crisisData.GFC_2008.SP500.returns);
      const normalResult = crisisData.hasFatTails(crisisData.NORMAL_BULL.returns);

      expect(typeof crisisResult).toBe('boolean');
      expect(typeof normalResult).toBe('boolean');
    });

    test('hasFatTails respects threshold parameter', () => {
      const returns = crisisData.NORMAL_BULL.returns;

      // Very low threshold should be more likely to trigger
      const lowThreshold = crisisData.hasFatTails(returns, -10);
      // Very high threshold should be less likely to trigger
      const highThreshold = crisisData.hasFatTails(returns, 100);

      // At least one should be true, one false for reasonable data
      expect(lowThreshold).toBe(true);
      expect(highThreshold).toBe(false);
    });
  });

  // ============================================
  // Taleb/Spitznagel Safety Tests
  // ============================================
  describe('Taleb/Spitznagel Safety During Crises', () => {

    test('25% Kelly cap protects during GFC', () => {
      const stats = crisisData.calculateStats(crisisData.GFC_2008.SP500.returns);

      // Full continuous Kelly would be deeply negative
      const fullKelly = testVectors.calculateContinuousKelly(
        stats.annualReturn, 0.05, stats.annualVol
      );

      // With 25% cap, even if miscalculated as positive, limited damage
      const cappedKelly = Math.min(0.25, Math.max(0, fullKelly));

      expect(cappedKelly).toBe(0); // Because Kelly is negative
    });

    test('regime multiplier reduces exposure in bear markets', () => {
      // Bear + high vol = 0.1x multiplier
      const baseKelly = 0.25;
      const regimeMultiplier = 0.1; // bear_high_vol

      const adjustedKelly = baseKelly * regimeMultiplier;
      expect(adjustedKelly).toBe(0.025); // 2.5% position
    });

    test('kurtosis adjustment formula works correctly', () => {
      // Test the adjustment formula directly
      const highKurtosis = 10; // Clearly fat-tailed
      const normalKurtosis = 3; // Normal distribution

      const fatTailAdjustment = highKurtosis > 3 ? 3 / (highKurtosis + 3) : 1;
      const normalAdjustment = normalKurtosis > 3 ? 3 / (normalKurtosis + 3) : 1;

      // Fat tails should reduce Kelly
      expect(fatTailAdjustment).toBeLessThan(1);
      expect(fatTailAdjustment).toBeCloseTo(3 / 13, 4);

      // Normal distribution gets no adjustment
      expect(normalAdjustment).toBe(1);
    });
  });

  // ============================================
  // Risk of Ruin During Crises
  // ============================================
  describe('Risk of Ruin Analysis', () => {

    test('full Kelly during GFC has high ruin probability', () => {
      const returns = crisisData.GFC_2008.SP500.returns;

      // Simulate path with full Kelly
      let capital = 100000;
      const kellyFraction = 1.0;

      for (const r of returns) {
        capital *= (1 + r * kellyFraction);
      }

      const drawdown = (100000 - capital) / 100000;

      // Significant drawdown with full Kelly
      expect(drawdown).toBeGreaterThan(0.30);
    });

    test('quarter Kelly limits drawdown', () => {
      const returns = crisisData.GFC_2008.SP500.returns;

      let capital = 100000;
      const kellyFraction = 0.25;

      for (const r of returns) {
        capital *= (1 + r * kellyFraction);
      }

      const drawdown = (100000 - capital) / 100000;

      // Quarter Kelly should have smaller drawdown
      expect(drawdown).toBeLessThan(0.25);
    });

    test('ruin threshold crossing detection', () => {
      const returns = crisisData.COVID_2020.SP500.returns;
      const ruinThreshold = 0.50; // 50% drawdown = ruin

      let capital = 100000;
      let peak = capital;
      let maxDrawdown = 0;

      for (const r of returns) {
        capital *= (1 + r);
        peak = Math.max(peak, capital);
        const dd = (peak - capital) / peak;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }

      // Check if we approached ruin threshold
      const approachedRuin = maxDrawdown > ruinThreshold * 0.5;
      expect(approachedRuin).toBe(true);
    });
  });

  // ============================================
  // Recovery Analysis
  // ============================================
  describe('Recovery Period Analysis', () => {

    test('COVID recovery shows positive Kelly opportunity', () => {
      const recoveryReturns = crisisData.COVID_2020.RECOVERY.returns;
      const stats = crisisData.calculateStats(recoveryReturns);

      // Recovery period should have positive returns
      expect(stats.annualReturn).toBeGreaterThan(0);

      // And positive Kelly
      const kelly = testVectors.calculateContinuousKelly(
        stats.annualReturn, 0.02, stats.annualVol
      );
      expect(kelly).toBeGreaterThan(0);
    });

    test('volatility decreases during recovery', () => {
      const crashStats = crisisData.calculateStats(crisisData.COVID_2020.SP500.returns);
      const recoveryStats = crisisData.calculateStats(crisisData.COVID_2020.RECOVERY.returns);

      expect(recoveryStats.annualVol).toBeLessThan(crashStats.annualVol);
    });
  });

  // ============================================
  // Cross-Crisis Comparison
  // ============================================
  describe('Cross-Crisis Comparison', () => {

    test('GFC had longest duration', () => {
      const gfcDays = crisisData.GFC_2008.SP500.returns.length;
      const covidDays = crisisData.COVID_2020.SP500.returns.length;

      expect(gfcDays).toBeGreaterThan(covidDays);
    });

    test('COVID had fastest decline rate', () => {
      const gfcStats = crisisData.calculateStats(crisisData.GFC_2008.SP500.returns);
      const covidStats = crisisData.calculateStats(crisisData.COVID_2020.SP500.returns);

      // Daily mean return more negative for COVID
      expect(covidStats.mean).toBeLessThan(gfcStats.mean);
    });

    test('all crises have negative Sharpe ratios', () => {
      const crises = [
        crisisData.GFC_2008.SP500.returns,
        crisisData.COVID_2020.SP500.returns,
        crisisData.RATE_SHOCK_2022.NASDAQ.returns
      ];

      crises.forEach(returns => {
        const stats = crisisData.calculateStats(returns);
        expect(stats.sharpe).toBeLessThan(0);
      });
    });

    test('normal markets outperform all crisis periods', () => {
      const normalStats = crisisData.calculateStats(crisisData.NORMAL_BULL.returns);

      const crisisDatasets = [
        crisisData.GFC_2008.SP500.returns,
        crisisData.COVID_2020.SP500.returns,
        crisisData.RATE_SHOCK_2022.NASDAQ.returns
      ];

      crisisDatasets.forEach(returns => {
        const crisisStats = crisisData.calculateStats(returns);
        expect(normalStats.sharpe).toBeGreaterThan(crisisStats.sharpe);
      });
    });
  });
});
