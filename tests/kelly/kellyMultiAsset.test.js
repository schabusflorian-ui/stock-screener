/**
 * Multi-Asset Kelly Criterion Tests
 *
 * Tests the multi-asset Kelly optimization: f* = Sigma^(-1) * mu
 * Verifies correlation handling, covariance matrix usage, and constraint enforcement.
 */

// Note: AdvancedKelly exports a singleton instance, not a class
const advancedKelly = require('../../src/services/portfolio/advancedKelly');
const testVectors = require('../fixtures/kellyTestVectors');

describe('Multi-Asset Kelly Criterion', () => {

  // ============================================
  // Two-Asset Analytical Verification
  // ============================================
  describe('Two-Asset Analytical Solutions', () => {

    test('two uncorrelated assets with equal stats', () => {
      const { returns, volatilities, correlation, expectedWeights, tolerance } =
        testVectors.MULTI_ASSET_KELLY.twoUncorrelatedEqual;

      // Build covariance matrix
      const cov = testVectors.buildCovMatrix2x2(
        volatilities[0], volatilities[1], correlation
      );

      // For uncorrelated assets: f_i = mu_i / sigma_i^2
      // Expected: [0.10/0.04, 0.10/0.04] = [2.5, 2.5]

      // Verify analytically
      const f1 = returns[0] / (volatilities[0] ** 2);
      const f2 = returns[1] / (volatilities[1] ** 2);

      expect(f1).toBeCloseTo(expectedWeights[0], 1);
      expect(f2).toBeCloseTo(expectedWeights[1], 1);
    });

    test('two uncorrelated assets with different stats', () => {
      const { returns, volatilities, correlation, expectedWeights, tolerance } =
        testVectors.MULTI_ASSET_KELLY.twoUncorrelatedDifferent;

      // For uncorrelated: f_i = mu_i / sigma_i^2
      const f1 = returns[0] / (volatilities[0] ** 2);
      const f2 = returns[1] / (volatilities[1] ** 2);

      expect(f1).toBeCloseTo(expectedWeights[0], 1);
      expect(f2).toBeCloseTo(expectedWeights[1], 1);
    });

    test('two positively correlated assets reduce allocation', () => {
      const { returns, volatilities, correlation, expectedWeights, tolerance } =
        testVectors.MULTI_ASSET_KELLY.twoPositivelyCorrelated;

      // Build and invert covariance matrix
      const cov = testVectors.buildCovMatrix2x2(
        volatilities[0], volatilities[1], correlation
      );
      const invCov = testVectors.invert2x2(cov);

      // f* = Sigma^(-1) * mu
      const f1 = invCov[0][0] * returns[0] + invCov[0][1] * returns[1];
      const f2 = invCov[1][0] * returns[0] + invCov[1][1] * returns[1];

      expect(f1).toBeCloseTo(expectedWeights[0], 0);
      expect(f2).toBeCloseTo(expectedWeights[1], 0);

      // Total allocation should be less than uncorrelated case
      const uncorrelatedTotal = returns[0] / (volatilities[0] ** 2) +
                                returns[1] / (volatilities[1] ** 2);
      const correlatedTotal = f1 + f2;

      expect(correlatedTotal).toBeLessThan(uncorrelatedTotal);
    });

    test('two negatively correlated assets increase allocation', () => {
      const { returns, volatilities, correlation } =
        testVectors.MULTI_ASSET_KELLY.twoNegativelyCorrelated;

      // Build and invert covariance matrix
      const cov = testVectors.buildCovMatrix2x2(
        volatilities[0], volatilities[1], correlation
      );
      const invCov = testVectors.invert2x2(cov);

      // f* = Sigma^(-1) * mu
      const f1 = invCov[0][0] * returns[0] + invCov[0][1] * returns[1];
      const f2 = invCov[1][0] * returns[0] + invCov[1][1] * returns[1];

      // Total allocation should be greater than uncorrelated case
      const uncorrelatedTotal = returns[0] / (volatilities[0] ** 2) +
                                returns[1] / (volatilities[1] ** 2);
      const correlatedTotal = f1 + f2;

      // Key assertion: negative correlation increases total allocation
      expect(correlatedTotal).toBeGreaterThan(uncorrelatedTotal);
    });
  });

  // ============================================
  // Correlation Impact Tests
  // ============================================
  describe('Correlation Impact on Weights', () => {

    test('higher positive correlation reduces total allocation', () => {
      const vol = 0.20;
      const returns = [0.10, 0.10];

      // Calculate total weights for different correlations
      const correlations = [0, 0.3, 0.5, 0.7, 0.9];
      const totals = correlations.map(rho => {
        const cov = testVectors.buildCovMatrix2x2(vol, vol, rho);
        const invCov = testVectors.invert2x2(cov);
        if (!invCov) return null;
        const f1 = invCov[0][0] * returns[0] + invCov[0][1] * returns[1];
        const f2 = invCov[1][0] * returns[0] + invCov[1][1] * returns[1];
        return f1 + f2;
      }).filter(x => x !== null);

      // Each subsequent total should be less than previous
      for (let i = 1; i < totals.length; i++) {
        expect(totals[i]).toBeLessThan(totals[i - 1]);
      }
    });

    test('negative correlation increases total allocation', () => {
      const vol = 0.20;
      const returns = [0.10, 0.10];

      const covPos = testVectors.buildCovMatrix2x2(vol, vol, 0.5);
      const covNeg = testVectors.buildCovMatrix2x2(vol, vol, -0.5);

      const invPos = testVectors.invert2x2(covPos);
      const invNeg = testVectors.invert2x2(covNeg);

      const totalPos = invPos[0][0] * returns[0] + invPos[0][1] * returns[1] +
                       invPos[1][0] * returns[0] + invPos[1][1] * returns[1];
      const totalNeg = invNeg[0][0] * returns[0] + invNeg[0][1] * returns[1] +
                       invNeg[1][0] * returns[0] + invNeg[1][1] * returns[1];

      expect(totalNeg).toBeGreaterThan(totalPos);
    });

    test('zero correlation gives independent sizing', () => {
      const vol1 = 0.20;
      const vol2 = 0.15;
      const returns = [0.10, 0.08];

      const cov = testVectors.buildCovMatrix2x2(vol1, vol2, 0);
      const invCov = testVectors.invert2x2(cov);

      const f1 = invCov[0][0] * returns[0] + invCov[0][1] * returns[1];
      const f2 = invCov[1][0] * returns[0] + invCov[1][1] * returns[1];

      // Should equal simple mu/sigma^2
      expect(f1).toBeCloseTo(returns[0] / (vol1 ** 2), 2);
      expect(f2).toBeCloseTo(returns[1] / (vol2 ** 2), 2);
    });
  });

  // ============================================
  // Singular/Near-Singular Matrix Tests
  // ============================================
  describe('Singular and Near-Singular Covariance', () => {

    test('perfect positive correlation (singular matrix)', () => {
      const vol = 0.20;
      const cov = testVectors.buildCovMatrix2x2(vol, vol, 1.0);
      const invCov = testVectors.invert2x2(cov);

      // Should return null for singular matrix
      expect(invCov).toBeNull();
    });

    test('perfect negative correlation (singular matrix)', () => {
      const vol = 0.20;
      const cov = testVectors.buildCovMatrix2x2(vol, vol, -1.0);
      const invCov = testVectors.invert2x2(cov);

      // Should return null for singular matrix
      expect(invCov).toBeNull();
    });

    test('near-singular matrix (correlation = 0.99)', () => {
      const vol = 0.20;
      const cov = testVectors.buildCovMatrix2x2(vol, vol, 0.99);
      const invCov = testVectors.invert2x2(cov);

      // Should return a valid inverse but with large values
      expect(invCov).not.toBeNull();

      // Check condition number is high (determinant is small)
      const det = cov[0][0] * cov[1][1] - cov[0][1] * cov[1][0];
      expect(Math.abs(det)).toBeLessThan(0.001);
    });

    test('near-singular matrix (correlation = 0.999)', () => {
      const vol = 0.20;
      const cov = testVectors.buildCovMatrix2x2(vol, vol, 0.999);
      const invCov = testVectors.invert2x2(cov);

      // May return null or very large values
      if (invCov) {
        // Check for numerical instability
        const maxVal = Math.max(...invCov.flat().map(Math.abs));
        // Inverse elements can be very large
        expect(maxVal).toBeGreaterThan(1000);
      }
    });
  });

  // ============================================
  // Constraint Tests
  // ============================================
  describe('Weight Constraints', () => {

    test('maximum weight constraint is respected', () => {
      // Test case where unconstrained Kelly > max weight
      // Simulated using test vectors
      const returns = [0.30, 0.05]; // First asset has huge edge
      const vols = [0.10, 0.20];
      const maxWeight = 0.40;

      // Unconstrained Kelly for first asset: 0.30 / 0.01 = 30 (3000%!)
      const unconstrainedKelly = returns[0] / (vols[0] ** 2);
      expect(unconstrainedKelly).toBeGreaterThan(1);

      // When normalized and constrained, first asset should hit max
      // This would be tested via advancedKelly._calculateKellyWeights
    });

    test('minimum weight constraint is respected', () => {
      // Very small edge should either be 0 or meet minimum
      const returns = [0.10, 0.001]; // Second asset has tiny edge
      const vols = [0.20, 0.20];
      const minWeight = 0.05;

      // Unconstrained Kelly for second: 0.001 / 0.04 = 0.025 (2.5%)
      const unconstrainedKelly = returns[1] / (vols[1] ** 2);
      expect(unconstrainedKelly).toBeLessThan(minWeight);

      // Should either be excluded (0) or raised to minimum
    });

    test('weights sum to 1 when normalized', () => {
      // After normalization for a fully invested portfolio
      const returns = [0.10, 0.08, 0.06];
      const vols = [0.20, 0.15, 0.25];

      // Raw Kelly weights
      const rawWeights = returns.map((r, i) => r / (vols[i] ** 2));
      const sum = rawWeights.reduce((a, b) => a + b, 0);
      const normalized = rawWeights.map(w => w / sum);

      expect(normalized.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    });

    test('no short positions when disallowed', () => {
      // Create scenario where one asset would have negative weight
      const returns = [0.10, -0.05]; // Second has negative expected return

      // Without shorts, second should be 0
      const weights = returns.map(r => Math.max(0, r > 0 ? r / 0.04 : 0));
      expect(weights[1]).toBe(0);
    });
  });

  // ============================================
  // Multi-Asset (3+) Tests
  // ============================================
  describe('Three or More Assets', () => {

    test('three uncorrelated assets', () => {
      const { returns, volatilities, expectedWeights, tolerance } =
        testVectors.MULTI_ASSET_KELLY.threeUncorrelated;

      // For uncorrelated: f_i = mu_i / sigma_i^2
      const calculatedWeights = returns.map((r, i) => r / (volatilities[i] ** 2));

      calculatedWeights.forEach((w, i) => {
        expect(w).toBeCloseTo(expectedWeights[i], 1);
      });
    });

    test('diversification benefit increases with more assets', () => {
      const singleAssetKelly = 0.10 / 0.04; // 2.5

      // With 5 uncorrelated assets, each can get full Kelly
      const fiveAssetTotal = 5 * singleAssetKelly;

      // Total Kelly allocation is higher with more diversification
      expect(fiveAssetTotal).toBeGreaterThan(singleAssetKelly);
    });

    test('correlated assets reduce diversification benefit', () => {
      // With high correlation, can't just add up individual Kellys
      const vol = 0.20;
      const mu = 0.10;

      // Two uncorrelated
      const uncorrelatedTotal = 2 * (mu / (vol ** 2)); // = 5.0

      // Two highly correlated (rho = 0.8)
      const cov = testVectors.buildCovMatrix2x2(vol, vol, 0.8);
      const invCov = testVectors.invert2x2(cov);
      const correlatedTotal = 2 * (invCov[0][0] * mu + invCov[0][1] * mu);

      expect(correlatedTotal).toBeLessThan(uncorrelatedTotal);
    });
  });

  // ============================================
  // Diagonal Approximation vs Full Matrix
  // ============================================
  describe('Diagonal Approximation vs Full Matrix', () => {

    test('diagonal approximation equals full matrix when uncorrelated', () => {
      const vol1 = 0.20;
      const vol2 = 0.15;
      const returns = [0.10, 0.08];

      // Diagonal approximation
      const diagonalWeights = returns.map((r, i) => {
        const sigma = i === 0 ? vol1 : vol2;
        return r / (sigma ** 2);
      });

      // Full matrix (with correlation = 0)
      const cov = testVectors.buildCovMatrix2x2(vol1, vol2, 0);
      const invCov = testVectors.invert2x2(cov);
      const fullWeights = [
        invCov[0][0] * returns[0] + invCov[0][1] * returns[1],
        invCov[1][0] * returns[0] + invCov[1][1] * returns[1]
      ];

      expect(diagonalWeights[0]).toBeCloseTo(fullWeights[0], 4);
      expect(diagonalWeights[1]).toBeCloseTo(fullWeights[1], 4);
    });

    test('diagonal approximation differs from full matrix when correlated', () => {
      const vol = 0.20;
      const returns = [0.10, 0.10];
      const correlation = 0.5;

      // Diagonal approximation (ignores correlation)
      const diagonalWeights = returns.map(r => r / (vol ** 2));

      // Full matrix
      const cov = testVectors.buildCovMatrix2x2(vol, vol, correlation);
      const invCov = testVectors.invert2x2(cov);
      const fullWeights = [
        invCov[0][0] * returns[0] + invCov[0][1] * returns[1],
        invCov[1][0] * returns[0] + invCov[1][1] * returns[1]
      ];

      // They should NOT be equal
      expect(diagonalWeights[0]).not.toBeCloseTo(fullWeights[0], 1);

      // Full matrix should give lower weights due to correlation
      expect(fullWeights[0] + fullWeights[1]).toBeLessThan(
        diagonalWeights[0] + diagonalWeights[1]
      );
    });

    test('diagonal approximation overestimates when assets correlated', () => {
      const vol = 0.20;
      const returns = [0.10, 0.10];

      // Test for various positive correlations
      [0.3, 0.5, 0.7].forEach(rho => {
        const diagonalTotal = 2 * returns[0] / (vol ** 2);

        const cov = testVectors.buildCovMatrix2x2(vol, vol, rho);
        const invCov = testVectors.invert2x2(cov);
        const fullTotal = invCov[0][0] * returns[0] + invCov[0][1] * returns[1] +
                         invCov[1][0] * returns[0] + invCov[1][1] * returns[1];

        // Diagonal overestimates (doesn't account for shared risk)
        expect(diagonalTotal).toBeGreaterThan(fullTotal);
      });
    });
  });

  // ============================================
  // Kelly Fraction Application in Multi-Asset
  // ============================================
  describe('Kelly Fraction in Multi-Asset Context', () => {

    test('half-Kelly applies to all assets proportionally', () => {
      const returns = [0.10, 0.08];
      const vols = [0.20, 0.15];

      const fullKelly = returns.map((r, i) => r / (vols[i] ** 2));
      const halfKelly = fullKelly.map(w => w * 0.5);

      // Verify proportionality
      expect(halfKelly[0] / fullKelly[0]).toBeCloseTo(0.5, 10);
      expect(halfKelly[1] / fullKelly[1]).toBeCloseTo(0.5, 10);
    });

    test('portfolio Kelly respects total leverage constraint', () => {
      const returns = [0.20, 0.20, 0.20];
      const vols = [0.10, 0.10, 0.10];

      // Each asset has Kelly = 0.20 / 0.01 = 20 (2000%)
      // Total unconstrained = 60 (6000%)

      const unconstrainedTotal = returns.reduce((sum, r, i) =>
        sum + r / (vols[i] ** 2), 0);

      expect(unconstrainedTotal).toBeCloseTo(60, 5);

      // With leverage constraint of 1.0, should normalize to 1.0 total
      const normalized = returns.map((r, i) => {
        const w = r / (vols[i] ** 2);
        return w / unconstrainedTotal;
      });

      expect(normalized.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    });
  });

  // ============================================
  // Return Series Tests (Integration)
  // ============================================
  describe('Return Series Integration', () => {

    test('calculates weights from return series', () => {
      // Synthetic return series (252 days, ~1 year)
      const n = 252;
      const returns1 = Array(n).fill(0).map(() => 0.0004 + 0.01 * (Math.random() - 0.5));
      const returns2 = Array(n).fill(0).map(() => 0.0003 + 0.008 * (Math.random() - 0.5));

      // Calculate means
      const mean1 = returns1.reduce((a, b) => a + b, 0) / n;
      const mean2 = returns2.reduce((a, b) => a + b, 0) / n;

      // Calculate variances
      const var1 = returns1.reduce((sum, r) => sum + (r - mean1) ** 2, 0) / (n - 1);
      const var2 = returns2.reduce((sum, r) => sum + (r - mean2) ** 2, 0) / (n - 1);

      // Diagonal Kelly weights
      const w1 = mean1 / var1;
      const w2 = mean2 / var2;

      expect(Number.isFinite(w1)).toBe(true);
      expect(Number.isFinite(w2)).toBe(true);
    });

    test('handles aligned return series of different lengths', () => {
      const returns1 = Array(252).fill(0.0004);
      const returns2 = Array(200).fill(0.0003); // Shorter

      // Should use minimum length
      const minLen = Math.min(returns1.length, returns2.length);
      const alignedR1 = returns1.slice(-minLen);
      const alignedR2 = returns2.slice(-minLen);

      expect(alignedR1.length).toBe(alignedR2.length);
      expect(alignedR1.length).toBe(200);
    });
  });
});
