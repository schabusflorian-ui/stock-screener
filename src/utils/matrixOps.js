/**
 * Matrix Operations for Multi-Asset Kelly Criterion
 *
 * Provides numerical linear algebra operations needed for portfolio optimization:
 * - Matrix inversion via LU decomposition with partial pivoting
 * - Condition number estimation
 * - Regularization (Tikhonov and Ledoit-Wolf shrinkage)
 *
 * Designed to be numerically stable for covariance matrices up to ~50x50.
 */

class MatrixOps {
  /**
   * Create a deep copy of a matrix
   * @param {number[][]} matrix - Input matrix
   * @returns {number[][]} - Copy of matrix
   */
  static copy(matrix) {
    return matrix.map(row => [...row]);
  }

  /**
   * Create an identity matrix of size n
   * @param {number} n - Size of matrix
   * @returns {number[][]} - Identity matrix
   */
  static identity(n) {
    const I = Array(n).fill(null).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      I[i][i] = 1;
    }
    return I;
  }

  /**
   * Calculate the trace (sum of diagonal elements)
   * @param {number[][]} matrix - Square matrix
   * @returns {number} - Trace value
   */
  static trace(matrix) {
    let sum = 0;
    for (let i = 0; i < matrix.length; i++) {
      sum += matrix[i][i];
    }
    return sum;
  }

  /**
   * Matrix-vector multiplication: result = A * v
   * @param {number[][]} matrix - n x n matrix
   * @param {number[]} vector - n-element vector
   * @returns {number[]} - Resulting n-element vector
   */
  static matVecMult(matrix, vector) {
    const n = matrix.length;
    const result = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i] += matrix[i][j] * vector[j];
      }
    }
    return result;
  }

  /**
   * Matrix-matrix multiplication: result = A * B
   * @param {number[][]} A - n x m matrix
   * @param {number[][]} B - m x p matrix
   * @returns {number[][]} - Resulting n x p matrix
   */
  static matMult(A, B) {
    const n = A.length;
    const m = B.length;
    const p = B[0].length;
    const result = Array(n).fill(null).map(() => Array(p).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < p; j++) {
        for (let k = 0; k < m; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  /**
   * Transpose a matrix
   * @param {number[][]} matrix - Input matrix
   * @returns {number[][]} - Transposed matrix
   */
  static transpose(matrix) {
    const n = matrix.length;
    const m = matrix[0].length;
    const result = Array(m).fill(null).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  }

  /**
   * LU decomposition with partial pivoting
   * @param {number[][]} matrix - Square matrix to decompose
   * @returns {Object} - { L, U, P, singular } where PA = LU
   */
  static luDecompose(matrix) {
    const n = matrix.length;
    const L = this.identity(n);
    const U = this.copy(matrix);
    const P = this.identity(n);
    let singular = false;

    for (let k = 0; k < n - 1; k++) {
      // Partial pivoting: find row with largest element in column k
      let maxVal = Math.abs(U[k][k]);
      let maxRow = k;

      for (let i = k + 1; i < n; i++) {
        if (Math.abs(U[i][k]) > maxVal) {
          maxVal = Math.abs(U[i][k]);
          maxRow = i;
        }
      }

      // Check for singularity
      if (maxVal < 1e-14) {
        singular = true;
        continue;
      }

      // Swap rows in U, P, and lower part of L
      if (maxRow !== k) {
        [U[k], U[maxRow]] = [U[maxRow], U[k]];
        [P[k], P[maxRow]] = [P[maxRow], P[k]];
        // Swap lower triangular portion of L
        for (let j = 0; j < k; j++) {
          [L[k][j], L[maxRow][j]] = [L[maxRow][j], L[k][j]];
        }
      }

      // Elimination
      for (let i = k + 1; i < n; i++) {
        L[i][k] = U[i][k] / U[k][k];
        for (let j = k; j < n; j++) {
          U[i][j] -= L[i][k] * U[k][j];
        }
      }
    }

    // Check last diagonal element
    if (Math.abs(U[n - 1][n - 1]) < 1e-14) {
      singular = true;
    }

    return { L, U, P, singular };
  }

  /**
   * Solve linear system Ax = b using LU decomposition
   * @param {number[][]} A - Coefficient matrix
   * @param {number[]} b - Right-hand side vector
   * @returns {number[]|null} - Solution vector or null if singular
   */
  static solve(A, b) {
    const n = A.length;
    const { L, U, P, singular } = this.luDecompose(A);

    if (singular) {
      return null;
    }

    // Apply permutation: Pb
    const pb = this.matVecMult(P, b);

    // Forward substitution: Ly = Pb
    const y = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      y[i] = pb[i];
      for (let j = 0; j < i; j++) {
        y[i] -= L[i][j] * y[j];
      }
    }

    // Back substitution: Ux = y
    const x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = y[i];
      for (let j = i + 1; j < n; j++) {
        x[i] -= U[i][j] * x[j];
      }
      x[i] /= U[i][i];
    }

    return x;
  }

  /**
   * Invert a matrix using LU decomposition
   * @param {number[][]} matrix - Square matrix to invert
   * @returns {number[][]|null} - Inverse matrix or null if singular
   */
  static invert(matrix) {
    const n = matrix.length;
    const inverse = Array(n).fill(null).map(() => Array(n).fill(0));

    // Solve A * x_i = e_i for each column
    for (let i = 0; i < n; i++) {
      const e = Array(n).fill(0);
      e[i] = 1;
      const col = this.solve(matrix, e);

      if (!col) {
        return null;
      }

      for (let j = 0; j < n; j++) {
        inverse[j][i] = col[j];
      }
    }

    return inverse;
  }

  /**
   * Estimate condition number using 1-norm approximation
   * @param {number[][]} matrix - Square matrix
   * @returns {number} - Estimated condition number (Infinity if singular)
   */
  static conditionNumber(matrix) {
    const n = matrix.length;

    // Calculate 1-norm of A: max column sum of absolute values
    let normA = 0;
    for (let j = 0; j < n; j++) {
      let colSum = 0;
      for (let i = 0; i < n; i++) {
        colSum += Math.abs(matrix[i][j]);
      }
      normA = Math.max(normA, colSum);
    }

    // Calculate 1-norm of A^(-1)
    const inverse = this.invert(matrix);
    if (!inverse) {
      return Infinity;
    }

    let normAinv = 0;
    for (let j = 0; j < n; j++) {
      let colSum = 0;
      for (let i = 0; i < n; i++) {
        colSum += Math.abs(inverse[i][j]);
      }
      normAinv = Math.max(normAinv, colSum);
    }

    return normA * normAinv;
  }

  /**
   * Apply Tikhonov regularization: A_reg = A + lambda * I
   * @param {number[][]} matrix - Square matrix to regularize
   * @param {number} lambda - Regularization parameter
   * @returns {number[][]} - Regularized matrix
   */
  static regularize(matrix, lambda) {
    const n = matrix.length;
    const result = this.copy(matrix);

    for (let i = 0; i < n; i++) {
      result[i][i] += lambda;
    }

    return result;
  }

  /**
   * Ledoit-Wolf shrinkage for covariance matrix estimation
   * Shrinks toward scaled identity matrix
   * @param {number[][]} sampleCov - Sample covariance matrix
   * @returns {number[][]} - Shrunk covariance matrix
   */
  static ledoitWolfShrink(sampleCov) {
    const n = sampleCov.length;

    // Target: scaled identity (mean variance on diagonal)
    const meanVar = this.trace(sampleCov) / n;
    const target = this.identity(n).map(row => row.map(x => x * meanVar));

    // Simple shrinkage intensity estimation
    // In practice, this should use the Ledoit-Wolf formula, but we use
    // a simplified heuristic based on condition number
    const condNum = this.conditionNumber(sampleCov);
    let shrinkage;

    if (condNum === Infinity) {
      shrinkage = 0.99; // Nearly singular, strong shrinkage
    } else if (condNum > 1000) {
      shrinkage = Math.min(0.5, condNum / 10000);
    } else if (condNum > 100) {
      shrinkage = 0.1;
    } else {
      shrinkage = 0.01; // Well-conditioned, minimal shrinkage
    }

    // Shrunk covariance = (1 - shrinkage) * sampleCov + shrinkage * target
    const result = Array(n).fill(null).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result[i][j] = (1 - shrinkage) * sampleCov[i][j] + shrinkage * target[i][j];
      }
    }

    return result;
  }

  /**
   * Check if matrix is positive definite (all eigenvalues > 0)
   * Uses Cholesky decomposition attempt
   * @param {number[][]} matrix - Symmetric matrix to check
   * @returns {boolean} - True if positive definite
   */
  static isPositiveDefinite(matrix) {
    const n = matrix.length;
    const L = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = matrix[i][j];

        for (let k = 0; k < j; k++) {
          sum -= L[i][k] * L[j][k];
        }

        if (i === j) {
          if (sum <= 0) {
            return false;
          }
          L[i][j] = Math.sqrt(sum);
        } else {
          L[i][j] = sum / L[j][j];
        }
      }
    }

    return true;
  }

  /**
   * Calculate covariance matrix from return series
   * @param {number[][]} returnsArrays - Array of return series (one per asset)
   * @returns {number[][]} - Covariance matrix
   */
  static buildCovarianceMatrix(returnsArrays) {
    const n = returnsArrays.length;
    const minLen = Math.min(...returnsArrays.map(r => r.length));

    if (minLen < 2) {
      throw new Error('Need at least 2 observations for covariance');
    }

    // Calculate means
    const means = returnsArrays.map(returns => {
      const slice = returns.slice(-minLen);
      return slice.reduce((a, b) => a + b, 0) / minLen;
    });

    // Calculate covariance matrix
    const cov = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let k = 0; k < minLen; k++) {
          const idx1 = returnsArrays[i].length - minLen + k;
          const idx2 = returnsArrays[j].length - minLen + k;
          sum += (returnsArrays[i][idx1] - means[i]) *
                 (returnsArrays[j][idx2] - means[j]);
        }
        cov[i][j] = sum / (minLen - 1);
      }
    }

    return cov;
  }

  /**
   * Compute multi-asset Kelly weights with stability handling
   * @param {number[][]} covMatrix - Covariance matrix
   * @param {number[]} meanReturns - Vector of mean returns
   * @param {Object} options - Configuration options
   * @returns {Object} - { weights, conditionNumber, method, regularized }
   */
  static computeKellyWeights(covMatrix, meanReturns, options = {}) {
    const {
      maxConditionNumber = 1000,
      fallbackToDiagonal = true,
      regularizationMethod = 'tikhonov' // 'tikhonov' or 'ledoitWolf'
    } = options;

    const n = covMatrix.length;
    const conditionNumber = this.conditionNumber(covMatrix);

    const result = {
      weights: null,
      conditionNumber,
      method: 'exact',
      regularized: false
    };

    // Case 1: Well-conditioned matrix - use exact inversion
    if (conditionNumber < maxConditionNumber) {
      const invCov = this.invert(covMatrix);
      if (invCov) {
        result.weights = this.matVecMult(invCov, meanReturns);
        return result;
      }
    }

    // Case 2: Moderately ill-conditioned - apply regularization
    if (conditionNumber < maxConditionNumber * 10) {
      result.regularized = true;

      let workingCov;
      if (regularizationMethod === 'ledoitWolf') {
        workingCov = this.ledoitWolfShrink(covMatrix);
        result.method = 'ledoitWolf';
      } else {
        // Tikhonov regularization
        const lambda = 0.01 * this.trace(covMatrix) / n;
        workingCov = this.regularize(covMatrix, lambda);
        result.method = 'tikhonov';
      }

      const invCov = this.invert(workingCov);
      if (invCov) {
        result.weights = this.matVecMult(invCov, meanReturns);
        return result;
      }
    }

    // Case 3: Extremely ill-conditioned - fall back to diagonal approximation
    if (fallbackToDiagonal) {
      result.method = 'diagonal_fallback';
      result.regularized = true;
      result.weights = meanReturns.map((m, i) => {
        const variance = covMatrix[i][i];
        if (variance <= 0) return 0;
        return m / variance;
      });
      return result;
    }

    // Case 4: Cannot compute weights
    result.method = 'failed';
    result.weights = new Array(n).fill(1 / n); // Equal weight fallback
    return result;
  }

  /**
   * Validate that a matrix is a valid covariance matrix
   * @param {number[][]} matrix - Matrix to validate
   * @returns {Object} - { valid, errors }
   */
  static validateCovarianceMatrix(matrix) {
    const errors = [];
    const n = matrix.length;

    // Check square
    if (!matrix.every(row => row.length === n)) {
      errors.push('Matrix is not square');
    }

    // Check symmetric
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(matrix[i][j] - matrix[j][i]) > 1e-10) {
          errors.push(`Matrix is not symmetric at (${i},${j})`);
        }
      }
    }

    // Check positive diagonal
    for (let i = 0; i < n; i++) {
      if (matrix[i][i] <= 0) {
        errors.push(`Non-positive variance at (${i},${i}): ${matrix[i][i]}`);
      }
    }

    // Check positive semi-definite (via Cholesky)
    if (errors.length === 0 && !this.isPositiveDefinite(matrix)) {
      errors.push('Matrix is not positive definite');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = MatrixOps;
