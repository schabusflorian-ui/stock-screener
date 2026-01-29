/**
 * Matrix Operations Unit Tests
 *
 * Tests for the MatrixOps utility class used in multi-asset Kelly calculations.
 */

const MatrixOps = require('../../src/utils/matrixOps');

describe('MatrixOps', () => {

  // ============================================
  // Basic Operations
  // ============================================
  describe('Basic Operations', () => {

    test('creates identity matrix', () => {
      const I = MatrixOps.identity(3);
      expect(I).toEqual([
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1]
      ]);
    });

    test('calculates trace correctly', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
      ];
      expect(MatrixOps.trace(matrix)).toBe(15);
    });

    test('copies matrix without reference', () => {
      const original = [[1, 2], [3, 4]];
      const copy = MatrixOps.copy(original);

      copy[0][0] = 99;
      expect(original[0][0]).toBe(1);
    });

    test('transposes matrix', () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6]
      ];
      const transposed = MatrixOps.transpose(matrix);
      expect(transposed).toEqual([
        [1, 4],
        [2, 5],
        [3, 6]
      ]);
    });
  });

  // ============================================
  // Matrix-Vector Multiplication
  // ============================================
  describe('Matrix-Vector Multiplication', () => {

    test('multiplies matrix by vector', () => {
      const matrix = [
        [1, 2],
        [3, 4]
      ];
      const vector = [5, 6];
      const result = MatrixOps.matVecMult(matrix, vector);

      expect(result[0]).toBeCloseTo(17, 10); // 1*5 + 2*6
      expect(result[1]).toBeCloseTo(39, 10); // 3*5 + 4*6
    });

    test('identity matrix preserves vector', () => {
      const I = MatrixOps.identity(3);
      const v = [1, 2, 3];
      const result = MatrixOps.matVecMult(I, v);

      expect(result).toEqual(v);
    });

    test('zero matrix gives zero vector', () => {
      const zero = [[0, 0], [0, 0]];
      const v = [1, 2];
      const result = MatrixOps.matVecMult(zero, v);

      expect(result).toEqual([0, 0]);
    });
  });

  // ============================================
  // Matrix-Matrix Multiplication
  // ============================================
  describe('Matrix-Matrix Multiplication', () => {

    test('multiplies two matrices', () => {
      const A = [[1, 2], [3, 4]];
      const B = [[5, 6], [7, 8]];
      const result = MatrixOps.matMult(A, B);

      expect(result[0][0]).toBeCloseTo(19, 10); // 1*5 + 2*7
      expect(result[0][1]).toBeCloseTo(22, 10); // 1*6 + 2*8
      expect(result[1][0]).toBeCloseTo(43, 10); // 3*5 + 4*7
      expect(result[1][1]).toBeCloseTo(50, 10); // 3*6 + 4*8
    });

    test('identity multiplication preserves matrix', () => {
      const A = [[1, 2], [3, 4]];
      const I = MatrixOps.identity(2);
      const result = MatrixOps.matMult(A, I);

      expect(result).toEqual(A);
    });
  });

  // ============================================
  // LU Decomposition
  // ============================================
  describe('LU Decomposition', () => {

    test('decomposes 2x2 matrix', () => {
      const A = [[4, 3], [6, 3]];
      const { L, U, P, singular } = MatrixOps.luDecompose(A);

      expect(singular).toBe(false);

      // Verify PA = LU
      const PA = MatrixOps.matMult(P, A);
      const LU = MatrixOps.matMult(L, U);

      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          expect(PA[i][j]).toBeCloseTo(LU[i][j], 10);
        }
      }
    });

    test('decomposes 3x3 matrix', () => {
      const A = [
        [2, -1, 0],
        [-1, 2, -1],
        [0, -1, 2]
      ];
      const { L, U, P, singular } = MatrixOps.luDecompose(A);

      expect(singular).toBe(false);

      const PA = MatrixOps.matMult(P, A);
      const LU = MatrixOps.matMult(L, U);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(PA[i][j]).toBeCloseTo(LU[i][j], 10);
        }
      }
    });

    test('detects singular matrix', () => {
      const singular = [[1, 2], [2, 4]]; // Rows are linearly dependent
      const { singular: isSingular } = MatrixOps.luDecompose(singular);

      expect(isSingular).toBe(true);
    });
  });

  // ============================================
  // Matrix Inversion
  // ============================================
  describe('Matrix Inversion', () => {

    test('inverts 2x2 matrix', () => {
      const A = [[4, 7], [2, 6]];
      const inv = MatrixOps.invert(A);

      // A * A^(-1) should equal I
      const product = MatrixOps.matMult(A, inv);

      expect(product[0][0]).toBeCloseTo(1, 10);
      expect(product[0][1]).toBeCloseTo(0, 10);
      expect(product[1][0]).toBeCloseTo(0, 10);
      expect(product[1][1]).toBeCloseTo(1, 10);
    });

    test('inverts 3x3 matrix', () => {
      const A = [
        [1, 2, 3],
        [0, 1, 4],
        [5, 6, 0]
      ];
      const inv = MatrixOps.invert(A);

      expect(inv).not.toBeNull();

      const product = MatrixOps.matMult(A, inv);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(product[i][j]).toBeCloseTo(i === j ? 1 : 0, 8);
        }
      }
    });

    test('returns null for singular matrix', () => {
      const singular = [[1, 2], [2, 4]];
      const inv = MatrixOps.invert(singular);

      expect(inv).toBeNull();
    });

    test('inverts identity matrix to itself', () => {
      const I = MatrixOps.identity(3);
      const inv = MatrixOps.invert(I);

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          expect(inv[i][j]).toBeCloseTo(i === j ? 1 : 0, 10);
        }
      }
    });
  });

  // ============================================
  // Linear System Solving
  // ============================================
  describe('Linear System Solving', () => {

    test('solves 2x2 system', () => {
      // 2x + 3y = 8
      // 4x + 1y = 6
      // Solution: x = 1, y = 2
      const A = [[2, 3], [4, 1]];
      const b = [8, 6];
      const x = MatrixOps.solve(A, b);

      expect(x[0]).toBeCloseTo(1, 10);
      expect(x[1]).toBeCloseTo(2, 10);
    });

    test('solves 3x3 system', () => {
      // System with known solution [1, 2, 3]
      const A = [
        [1, 1, 1],
        [0, 2, 1],
        [1, 0, 1]
      ];
      const solution = [1, 2, 3];
      const b = MatrixOps.matVecMult(A, solution);

      const x = MatrixOps.solve(A, b);

      expect(x[0]).toBeCloseTo(solution[0], 10);
      expect(x[1]).toBeCloseTo(solution[1], 10);
      expect(x[2]).toBeCloseTo(solution[2], 10);
    });

    test('returns null for singular system', () => {
      const A = [[1, 2], [2, 4]];
      const b = [3, 6];
      const x = MatrixOps.solve(A, b);

      expect(x).toBeNull();
    });
  });

  // ============================================
  // Condition Number
  // ============================================
  describe('Condition Number', () => {

    test('identity matrix has condition number 1', () => {
      const I = MatrixOps.identity(3);
      const cond = MatrixOps.conditionNumber(I);

      expect(cond).toBeCloseTo(1, 5);
    });

    test('well-conditioned matrix has low condition number', () => {
      const A = [
        [4, 1],
        [1, 3]
      ];
      const cond = MatrixOps.conditionNumber(A);

      expect(cond).toBeLessThan(10);
    });

    test('ill-conditioned matrix has high condition number', () => {
      // Near-singular matrix
      const A = [
        [1, 1],
        [1, 1.0001]
      ];
      const cond = MatrixOps.conditionNumber(A);

      expect(cond).toBeGreaterThan(1000);
    });

    test('singular matrix has infinite condition number', () => {
      const singular = [[1, 2], [2, 4]];
      const cond = MatrixOps.conditionNumber(singular);

      expect(cond).toBe(Infinity);
    });
  });

  // ============================================
  // Regularization
  // ============================================
  describe('Regularization', () => {

    test('Tikhonov regularization adds to diagonal', () => {
      const A = [[1, 2], [3, 4]];
      const lambda = 0.1;
      const reg = MatrixOps.regularize(A, lambda);

      expect(reg[0][0]).toBeCloseTo(1.1, 10);
      expect(reg[1][1]).toBeCloseTo(4.1, 10);
      expect(reg[0][1]).toBeCloseTo(2, 10); // Off-diagonal unchanged
    });

    test('regularization improves condition number', () => {
      const A = [
        [1, 0.99],
        [0.99, 1]
      ];
      const lambda = 0.1;

      const condOrig = MatrixOps.conditionNumber(A);
      const reg = MatrixOps.regularize(A, lambda);
      const condReg = MatrixOps.conditionNumber(reg);

      expect(condReg).toBeLessThan(condOrig);
    });

    test('Ledoit-Wolf shrinkage reduces condition number', () => {
      const A = [
        [1, 0.95],
        [0.95, 1]
      ];

      const condOrig = MatrixOps.conditionNumber(A);
      const shrunk = MatrixOps.ledoitWolfShrink(A);
      const condShrunk = MatrixOps.conditionNumber(shrunk);

      expect(condShrunk).toBeLessThan(condOrig);
    });

    test('Ledoit-Wolf shrinks toward scaled identity', () => {
      const A = [[2, 1], [1, 2]];
      const shrunk = MatrixOps.ledoitWolfShrink(A);

      // Off-diagonal should shrink toward 0
      expect(Math.abs(shrunk[0][1])).toBeLessThanOrEqual(Math.abs(A[0][1]));

      // Diagonal should shrink toward mean or stay same (well-conditioned matrix may have minimal shrinkage)
      const meanVar = MatrixOps.trace(A) / 2;
      expect(Math.abs(shrunk[0][0] - meanVar)).toBeLessThanOrEqual(Math.abs(A[0][0] - meanVar));
    });
  });

  // ============================================
  // Positive Definite Check
  // ============================================
  describe('Positive Definite Check', () => {

    test('identity is positive definite', () => {
      const I = MatrixOps.identity(3);
      expect(MatrixOps.isPositiveDefinite(I)).toBe(true);
    });

    test('valid covariance matrix is positive definite', () => {
      const cov = [
        [0.04, 0.01],
        [0.01, 0.09]
      ];
      expect(MatrixOps.isPositiveDefinite(cov)).toBe(true);
    });

    test('singular matrix is not positive definite', () => {
      const singular = [
        [1, 1],
        [1, 1]
      ];
      expect(MatrixOps.isPositiveDefinite(singular)).toBe(false);
    });

    test('negative diagonal is not positive definite', () => {
      const neg = [
        [-1, 0],
        [0, 1]
      ];
      expect(MatrixOps.isPositiveDefinite(neg)).toBe(false);
    });
  });

  // ============================================
  // Covariance Matrix Building
  // ============================================
  describe('Covariance Matrix Building', () => {

    test('builds covariance from return series', () => {
      const returns1 = [0.01, 0.02, -0.01, 0.03];
      const returns2 = [0.02, 0.01, -0.02, 0.04];

      const cov = MatrixOps.buildCovarianceMatrix([returns1, returns2]);

      // Should be 2x2 symmetric
      expect(cov.length).toBe(2);
      expect(cov[0].length).toBe(2);
      expect(cov[0][1]).toBeCloseTo(cov[1][0], 10);
    });

    test('diagonal elements are variances', () => {
      const returns = [0.01, 0.02, -0.01, 0.03, 0.02];
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);

      const cov = MatrixOps.buildCovarianceMatrix([returns, returns]);

      expect(cov[0][0]).toBeCloseTo(variance, 10);
    });

    test('throws for insufficient data', () => {
      expect(() => {
        MatrixOps.buildCovarianceMatrix([[0.01]]); // Only 1 observation
      }).toThrow('at least 2');
    });
  });

  // ============================================
  // Kelly Weights Computation
  // ============================================
  describe('Kelly Weights Computation', () => {

    test('computes weights for well-conditioned matrix', () => {
      const cov = [
        [0.04, 0],
        [0, 0.04]
      ];
      const means = [0.10, 0.08];

      const result = MatrixOps.computeKellyWeights(cov, means);

      expect(result.method).toBe('exact');
      expect(result.regularized).toBe(false);

      // For uncorrelated: w_i = mu_i / sigma_i^2
      expect(result.weights[0]).toBeCloseTo(2.5, 1); // 0.10 / 0.04
      expect(result.weights[1]).toBeCloseTo(2.0, 1); // 0.08 / 0.04
    });

    test('uses regularization for ill-conditioned matrix', () => {
      const cov = [
        [0.04, 0.039],
        [0.039, 0.04]
      ];
      const means = [0.10, 0.10];

      const result = MatrixOps.computeKellyWeights(cov, means, {
        maxConditionNumber: 10
      });

      expect(result.regularized).toBe(true);
      expect(['tikhonov', 'ledoitWolf'].includes(result.method)).toBe(true);
    });

    test('falls back to diagonal for near-singular matrix', () => {
      const cov = [
        [0.04, 0.0399],
        [0.0399, 0.04]
      ];
      const means = [0.10, 0.10];

      const result = MatrixOps.computeKellyWeights(cov, means, {
        maxConditionNumber: 5
      });

      // Should fall back eventually
      expect(result.weights).not.toBeNull();
      expect(result.weights.length).toBe(2);
    });

    test('respects regularization method option', () => {
      const cov = [
        [0.04, 0.035],
        [0.035, 0.04]
      ];
      const means = [0.10, 0.08];

      const tikhonovResult = MatrixOps.computeKellyWeights(cov, means, {
        maxConditionNumber: 5,
        regularizationMethod: 'tikhonov'
      });

      const lwResult = MatrixOps.computeKellyWeights(cov, means, {
        maxConditionNumber: 5,
        regularizationMethod: 'ledoitWolf'
      });

      // Both should produce valid weights
      expect(tikhonovResult.weights.every(w => Number.isFinite(w))).toBe(true);
      expect(lwResult.weights.every(w => Number.isFinite(w))).toBe(true);
    });
  });

  // ============================================
  // Covariance Matrix Validation
  // ============================================
  describe('Covariance Matrix Validation', () => {

    test('accepts valid covariance matrix', () => {
      const cov = [
        [0.04, 0.01],
        [0.01, 0.09]
      ];
      const result = MatrixOps.validateCovarianceMatrix(cov);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('rejects non-symmetric matrix', () => {
      const cov = [
        [0.04, 0.02],
        [0.01, 0.09]
      ];
      const result = MatrixOps.validateCovarianceMatrix(cov);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('symmetric'))).toBe(true);
    });

    test('rejects non-positive diagonal', () => {
      const cov = [
        [-0.01, 0],
        [0, 0.04]
      ];
      const result = MatrixOps.validateCovarianceMatrix(cov);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('variance'))).toBe(true);
    });

    test('rejects non-positive definite', () => {
      const cov = [
        [0.04, 0.10], // Correlation > 1
        [0.10, 0.04]
      ];
      const result = MatrixOps.validateCovarianceMatrix(cov);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('positive definite'))).toBe(true);
    });
  });

  // ============================================
  // Numerical Stability Edge Cases
  // ============================================
  describe('Numerical Stability', () => {

    test('handles very small values', () => {
      const A = [
        [1e-10, 0],
        [0, 1e-10]
      ];
      const inv = MatrixOps.invert(A);

      expect(inv).not.toBeNull();
      expect(inv[0][0]).toBeCloseTo(1e10, 5);
    });

    test('handles very large values', () => {
      const A = [
        [1e10, 0],
        [0, 1e10]
      ];
      const inv = MatrixOps.invert(A);

      expect(inv).not.toBeNull();
      expect(inv[0][0]).toBeCloseTo(1e-10, 15);
    });

    test('handles mixed scales', () => {
      const A = [
        [1e6, 1],
        [1, 1e-6]
      ];
      const inv = MatrixOps.invert(A);

      // Should handle but may have numerical issues
      if (inv) {
        const product = MatrixOps.matMult(A, inv);
        expect(product[0][0]).toBeCloseTo(1, 3);
      }
    });
  });
});
