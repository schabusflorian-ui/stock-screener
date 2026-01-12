// src/services/statistics/parametricDistributions.js
// Parametric Distribution Library for Financial Returns Modeling
// Supports Normal, Student's t, Skewed t, and Johnson SU distributions

/**
 * ParametricDistributions
 *
 * Core library for fitting, sampling, and analyzing parametric distributions
 * for financial returns. Captures fat tails and skewness that normal distributions miss.
 */
class ParametricDistributions {
  // Distribution type constants
  static DISTRIBUTIONS = {
    NORMAL: 'normal',         // μ, σ
    STUDENT_T: 'studentT',    // μ, σ, ν (degrees of freedom)
    SKEWED_T: 'skewedT',      // μ, σ, ν, α (skew parameter)
    JOHNSON_SU: 'johnsonSU'   // γ, δ, ξ, λ (4-parameter)
  };

  constructor() {
    // Constants for numerical stability
    this.EPSILON = 1e-10;
    this.MAX_ITERATIONS = 100;
    this.TOLERANCE = 1e-6;
  }

  // ============================================
  // Core Statistical Moments
  // ============================================

  /**
   * Calculate statistical moments from return data
   * @param {number[]} returns - Array of return values
   * @returns {Object} { mean, std, variance, skewness, kurtosis, n }
   */
  calculateMoments(returns) {
    const n = returns.length;
    if (n < 4) {
      throw new Error('Need at least 4 data points to calculate moments');
    }

    // Mean
    const mean = returns.reduce((a, b) => a + b, 0) / n;

    // Variance and standard deviation
    const squaredDeviations = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDeviations.reduce((a, b) => a + b, 0) / (n - 1);
    const std = Math.sqrt(variance);

    if (std < this.EPSILON) {
      return { mean, std: 0, variance: 0, skewness: 0, kurtosis: 3, n };
    }

    // Skewness (Fisher's definition)
    const cubedDeviations = returns.map(r => Math.pow((r - mean) / std, 3));
    const skewness = (n / ((n - 1) * (n - 2))) * cubedDeviations.reduce((a, b) => a + b, 0);

    // Kurtosis (excess kurtosis, Fisher's definition)
    const fourthDeviations = returns.map(r => Math.pow((r - mean) / std, 4));
    const rawKurtosis = fourthDeviations.reduce((a, b) => a + b, 0) / n;
    // Adjust for sample size
    const excessKurtosis = ((n + 1) * n * rawKurtosis - 3 * (n - 1) * (n - 1)) /
                          ((n - 1) * (n - 2) * (n - 3));

    return {
      mean,
      std,
      variance,
      skewness,
      kurtosis: excessKurtosis + 3, // Return raw kurtosis (normal = 3)
      excessKurtosis,
      n
    };
  }

  // ============================================
  // Distribution Fitting
  // ============================================

  /**
   * Fit a distribution to return data
   * @param {number[]} returns - Array of return values
   * @param {string} type - Distribution type ('auto', 'normal', 'studentT', 'skewedT')
   * @returns {Object} { type, params, moments, goodnessOfFit }
   */
  fitDistribution(returns, type = 'auto') {
    const moments = this.calculateMoments(returns);

    if (type === 'auto') {
      return this.findBestFit(returns);
    }

    let params;
    switch (type) {
      case ParametricDistributions.DISTRIBUTIONS.NORMAL:
        params = this._fitNormal(returns, moments);
        break;
      case ParametricDistributions.DISTRIBUTIONS.STUDENT_T:
        params = this._fitStudentT(returns, moments);
        break;
      case ParametricDistributions.DISTRIBUTIONS.SKEWED_T:
        params = this._fitSkewedT(returns, moments);
        break;
      case ParametricDistributions.DISTRIBUTIONS.JOHNSON_SU:
        params = this._fitJohnsonSU(returns, moments);
        break;
      default:
        throw new Error(`Unknown distribution type: ${type}`);
    }

    const ksTest = this.ksTest(returns, params, type);

    return {
      type,
      params,
      moments,
      goodnessOfFit: ksTest
    };
  }

  /**
   * Fit normal distribution (simple moment matching)
   */
  _fitNormal(returns, moments) {
    return {
      mean: moments.mean,
      std: moments.std
    };
  }

  /**
   * Fit Student's t distribution using MLE
   * Estimates degrees of freedom (df/ν) from data
   */
  _fitStudentT(returns, moments) {
    const { mean, std, kurtosis } = moments;

    // Initial estimate of df from kurtosis
    // For t-distribution: kurtosis = 3 + 6/(df-4) for df > 4
    // So: df = 4 + 6/(kurtosis-3) when kurtosis > 3
    let dfInitial;
    if (kurtosis > 3) {
      dfInitial = Math.max(4.1, 4 + 6 / (kurtosis - 3));
    } else {
      dfInitial = 30; // Near normal
    }

    // MLE optimization for df
    const df = this._optimizeStudentTDF(returns, mean, std, dfInitial);

    // Scale parameter adjustment for t-distribution
    // Variance of t = σ² * df / (df - 2) for df > 2
    const scale = df > 2 ? std * Math.sqrt((df - 2) / df) : std;

    return {
      mean: mean,
      scale: scale,
      df: df
    };
  }

  /**
   * Optimize Student's t degrees of freedom using MLE
   */
  _optimizeStudentTDF(returns, mean, scale, dfInitial) {
    let df = dfInitial;
    const n = returns.length;

    // Newton-Raphson optimization
    for (let iter = 0; iter < this.MAX_ITERATIONS; iter++) {
      // Log-likelihood derivative with respect to df
      let gradSum = 0;
      let hessSum = 0;

      for (const x of returns) {
        const z = (x - mean) / scale;
        const z2 = z * z;
        const term = 1 + z2 / df;

        // First derivative
        const psi1 = this._digamma((df + 1) / 2) - this._digamma(df / 2);
        gradSum += 0.5 * (psi1 - Math.log(term) - (df + 1) * z2 / (df * df * term));

        // Second derivative (approximate)
        hessSum += -0.25 * this._trigamma((df + 1) / 2) + 0.25 * this._trigamma(df / 2);
      }

      const gradient = gradSum;
      const hessian = hessSum;

      if (Math.abs(hessian) < this.EPSILON) break;

      const step = -gradient / hessian;
      const newDf = df + step;

      // Constrain df to reasonable range
      df = Math.max(2.1, Math.min(100, newDf));

      if (Math.abs(step) < this.TOLERANCE) break;
    }

    return Math.round(df * 100) / 100;
  }

  /**
   * Fit Hansen's Skewed t-distribution
   */
  _fitSkewedT(returns, moments) {
    const { mean, std, skewness, kurtosis } = moments;

    // Start with Student's t fit
    const tFit = this._fitStudentT(returns, moments);

    // Estimate skew parameter from sample skewness
    // For Hansen's skewed t: skew parameter α ∈ (-1, 1)
    // Simplified mapping: α ≈ skewness / 2 (bounded)
    const alpha = Math.max(-0.99, Math.min(0.99, skewness / 2));

    return {
      mean: mean,
      scale: tFit.scale,
      df: tFit.df,
      alpha: alpha
    };
  }

  /**
   * Fit Johnson SU distribution using moment matching
   */
  _fitJohnsonSU(returns, moments) {
    const { mean, std, skewness, kurtosis } = moments;

    // Johnson SU parameters from moments (Slifker-Shapiro method)
    const w = Math.sqrt(Math.sqrt(2 * kurtosis - 2.8 * skewness * skewness - 2) - 1);
    const omega = w > 0 ? w : 1;

    // Simplified parameter estimation
    const delta = 1 / Math.log(omega);
    const gamma = -skewness > 0 ? -delta * Math.asinh(skewness / 2) : delta * Math.asinh(-skewness / 2);
    const lambda = std / Math.sqrt((omega * omega - 1) * (omega * omega * Math.cosh(2 * gamma / delta) + 1) / 2);
    const xi = mean - lambda * omega * Math.sinh(gamma / delta);

    return {
      gamma: gamma,
      delta: Math.max(0.1, delta),
      xi: xi,
      lambda: Math.max(0.01, lambda)
    };
  }

  /**
   * Find the best fitting distribution automatically
   */
  findBestFit(returns) {
    const moments = this.calculateMoments(returns);
    const candidates = [];

    // Test each distribution type
    for (const type of [
      ParametricDistributions.DISTRIBUTIONS.NORMAL,
      ParametricDistributions.DISTRIBUTIONS.STUDENT_T,
      ParametricDistributions.DISTRIBUTIONS.SKEWED_T
    ]) {
      try {
        const fit = this.fitDistribution(returns, type);
        candidates.push(fit);
      } catch (e) {
        // Skip if fitting fails
        console.warn(`Failed to fit ${type}: ${e.message}`);
      }
    }

    if (candidates.length === 0) {
      // Fallback to normal
      return this.fitDistribution(returns, 'normal');
    }

    // Select best by KS test (lowest statistic = best fit)
    candidates.sort((a, b) => a.goodnessOfFit.statistic - b.goodnessOfFit.statistic);

    // But prefer normal if the difference is small (parsimony)
    const normalFit = candidates.find(c => c.type === 'normal');
    const bestFit = candidates[0];

    if (normalFit && bestFit.type !== 'normal') {
      const improvement = (normalFit.goodnessOfFit.statistic - bestFit.goodnessOfFit.statistic) /
                         normalFit.goodnessOfFit.statistic;
      if (improvement < 0.1) {
        // Less than 10% improvement, use normal for simplicity
        return normalFit;
      }
    }

    return bestFit;
  }

  // ============================================
  // Sampling Functions
  // ============================================

  /**
   * Sample from a fitted distribution
   * @param {number} n - Number of samples
   * @param {Object} params - Distribution parameters
   * @param {string} type - Distribution type
   * @returns {number[]} Array of samples
   */
  sample(n, params, type) {
    const samples = [];

    for (let i = 0; i < n; i++) {
      let value;
      switch (type) {
        case ParametricDistributions.DISTRIBUTIONS.NORMAL:
          value = this._sampleNormal(params.mean, params.std);
          break;
        case ParametricDistributions.DISTRIBUTIONS.STUDENT_T:
          value = this._sampleStudentT(params.mean, params.scale, params.df);
          break;
        case ParametricDistributions.DISTRIBUTIONS.SKEWED_T:
          value = this._sampleSkewedT(params.mean, params.scale, params.df, params.alpha);
          break;
        case ParametricDistributions.DISTRIBUTIONS.JOHNSON_SU:
          value = this._sampleJohnsonSU(params.gamma, params.delta, params.xi, params.lambda);
          break;
        default:
          value = this._sampleNormal(params.mean || 0, params.std || 1);
      }
      samples.push(value);
    }

    return samples;
  }

  /**
   * Sample from normal distribution using Box-Muller
   */
  _sampleNormal(mean, std) {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + std * z;
  }

  /**
   * Sample from Student's t distribution
   * Using ratio of normal to chi-squared
   */
  _sampleStudentT(mean, scale, df) {
    // Generate standard t variate
    const z = this._sampleNormal(0, 1);
    const chi2 = this._sampleChiSquared(df);
    const t = z / Math.sqrt(chi2 / df);

    return mean + scale * t;
  }

  /**
   * Sample from chi-squared distribution
   */
  _sampleChiSquared(df) {
    // Sum of df squared standard normals
    let sum = 0;
    for (let i = 0; i < Math.floor(df); i++) {
      const z = this._sampleNormal(0, 1);
      sum += z * z;
    }
    // Handle fractional df
    const frac = df - Math.floor(df);
    if (frac > 0) {
      const z = this._sampleNormal(0, 1);
      sum += frac * z * z;
    }
    return sum;
  }

  /**
   * Sample from Hansen's skewed t-distribution
   */
  _sampleSkewedT(mean, scale, df, alpha) {
    // Generate standard t variate
    const t = this._sampleStudentT(0, 1, df);

    // Apply skewing transformation
    const sign = t >= 0 ? 1 : -1;
    const skewed = sign * Math.abs(t) * (1 + alpha * sign);

    return mean + scale * skewed;
  }

  /**
   * Sample from Johnson SU distribution
   */
  _sampleJohnsonSU(gamma, delta, xi, lambda) {
    const z = this._sampleNormal(0, 1);
    const y = Math.sinh((z - gamma) / delta);
    return xi + lambda * y;
  }

  // ============================================
  // Probability Functions (PDF, CDF)
  // ============================================

  /**
   * Probability density function
   */
  pdf(x, params, type) {
    switch (type) {
      case ParametricDistributions.DISTRIBUTIONS.NORMAL:
        return this._pdfNormal(x, params.mean, params.std);
      case ParametricDistributions.DISTRIBUTIONS.STUDENT_T:
        return this._pdfStudentT(x, params.mean, params.scale, params.df);
      case ParametricDistributions.DISTRIBUTIONS.SKEWED_T:
        return this._pdfSkewedT(x, params.mean, params.scale, params.df, params.alpha);
      default:
        return this._pdfNormal(x, params.mean || 0, params.std || 1);
    }
  }

  _pdfNormal(x, mean, std) {
    const z = (x - mean) / std;
    return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
  }

  _pdfStudentT(x, mean, scale, df) {
    const z = (x - mean) / scale;
    const coefficient = this._gamma((df + 1) / 2) /
                       (Math.sqrt(df * Math.PI) * this._gamma(df / 2) * scale);
    return coefficient * Math.pow(1 + z * z / df, -(df + 1) / 2);
  }

  _pdfSkewedT(x, mean, scale, df, alpha) {
    const z = (x - mean) / scale;
    // Simplified Hansen's skewed t PDF
    const sign = z >= 0 ? 1 : -1;
    const adj = 1 + sign * alpha;
    const zAdj = z / adj;
    return (2 / (1 + Math.abs(alpha))) * this._pdfStudentT(mean + scale * zAdj, mean, scale, df) / scale;
  }

  /**
   * Cumulative distribution function
   */
  cdf(x, params, type) {
    switch (type) {
      case ParametricDistributions.DISTRIBUTIONS.NORMAL:
        return this._cdfNormal(x, params.mean, params.std);
      case ParametricDistributions.DISTRIBUTIONS.STUDENT_T:
        return this._cdfStudentT(x, params.mean, params.scale, params.df);
      default:
        return this._cdfNormal(x, params.mean || 0, params.std || 1);
    }
  }

  _cdfNormal(x, mean, std) {
    const z = (x - mean) / std;
    return 0.5 * (1 + this._erf(z / Math.sqrt(2)));
  }

  _cdfStudentT(x, mean, scale, df) {
    const z = (x - mean) / scale;

    // Use numerical integration or beta function approximation
    const t2 = z * z;
    const p = df / (df + t2);

    // Regularized incomplete beta function approximation
    if (z >= 0) {
      return 1 - 0.5 * this._betaIncomplete(df / 2, 0.5, p);
    } else {
      return 0.5 * this._betaIncomplete(df / 2, 0.5, p);
    }
  }

  /**
   * Inverse CDF (quantile function) - for VaR calculations
   */
  inverseCdf(p, params, type) {
    // Use bisection method for inverse
    let low = -10;
    let high = 10;

    // Adjust bounds based on distribution scale
    if (params.std) {
      low = params.mean - 10 * params.std;
      high = params.mean + 10 * params.std;
    } else if (params.scale) {
      low = params.mean - 10 * params.scale;
      high = params.mean + 10 * params.scale;
    }

    for (let iter = 0; iter < 100; iter++) {
      const mid = (low + high) / 2;
      const cdfMid = this.cdf(mid, params, type);

      if (Math.abs(cdfMid - p) < 1e-8) {
        return mid;
      }

      if (cdfMid < p) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  }

  // ============================================
  // Cornish-Fisher VaR Adjustment
  // ============================================

  /**
   * Calculate Cornish-Fisher adjusted VaR
   * Adjusts normal VaR for skewness and kurtosis
   *
   * @param {number} mean - Mean return
   * @param {number} std - Standard deviation
   * @param {number} skew - Skewness
   * @param {number} kurtosis - Kurtosis (raw, not excess)
   * @param {number} confidence - Confidence level (e.g., 0.95)
   * @returns {Object} { normalVaR, adjustedVaR, adjustment }
   */
  cornishFisherVaR(mean, std, skew, kurtosis, confidence = 0.95) {
    // Normal z-score for confidence level
    const z = this.inverseCdf(1 - confidence, { mean: 0, std: 1 }, 'normal');

    // Excess kurtosis (normal = 0)
    const K = kurtosis - 3;
    const S = skew;

    // Cornish-Fisher expansion
    // z_cf = z + (z² - 1)*S/6 + (z³ - 3z)*K/24 - (2z³ - 5z)*S²/36
    const z2 = z * z;
    const z3 = z2 * z;

    const term1 = (z2 - 1) * S / 6;
    const term2 = (z3 - 3 * z) * K / 24;
    const term3 = -(2 * z3 - 5 * z) * S * S / 36;

    const z_cf = z + term1 + term2 + term3;

    // VaR values (negative because losses)
    const normalVaR = mean + std * z;
    const adjustedVaR = mean + std * z_cf;

    return {
      normalVaR: normalVaR,
      adjustedVaR: adjustedVaR,
      adjustment: adjustedVaR - normalVaR,
      adjustmentPercent: ((adjustedVaR - normalVaR) / Math.abs(normalVaR)) * 100,
      zNormal: z,
      zAdjusted: z_cf,
      components: {
        skewnessContribution: term1,
        kurtosisContribution: term2,
        skewnessSquaredContribution: term3
      }
    };
  }

  // ============================================
  // Goodness of Fit Tests
  // ============================================

  /**
   * Kolmogorov-Smirnov test
   * Tests if data comes from specified distribution
   */
  ksTest(returns, params, type) {
    const n = returns.length;
    const sorted = [...returns].sort((a, b) => a - b);

    let maxD = 0;

    for (let i = 0; i < n; i++) {
      const empiricalCdf = (i + 1) / n;
      const theoreticalCdf = this.cdf(sorted[i], params, type);
      const d = Math.abs(empiricalCdf - theoreticalCdf);
      maxD = Math.max(maxD, d);
    }

    // Approximate p-value using asymptotic distribution
    const sqrtN = Math.sqrt(n);
    const lambda = (sqrtN + 0.12 + 0.11 / sqrtN) * maxD;
    const pValue = 2 * Math.exp(-2 * lambda * lambda);

    return {
      statistic: maxD,
      pValue: Math.min(1, Math.max(0, pValue)),
      significant: pValue < 0.05,
      interpretation: pValue < 0.05
        ? 'Distribution does not fit well (p < 0.05)'
        : 'Distribution fits reasonably (p >= 0.05)'
    };
  }

  /**
   * Anderson-Darling test (more sensitive to tails)
   */
  andersonDarlingTest(returns, params, type) {
    const n = returns.length;
    const sorted = [...returns].sort((a, b) => a - b);

    let A2 = 0;
    for (let i = 0; i < n; i++) {
      const Fi = this.cdf(sorted[i], params, type);
      const Fn_i = this.cdf(sorted[n - 1 - i], params, type);

      // Avoid log(0)
      const f1 = Math.max(this.EPSILON, Fi);
      const f2 = Math.max(this.EPSILON, 1 - Fn_i);

      A2 += (2 * (i + 1) - 1) * (Math.log(f1) + Math.log(f2));
    }

    A2 = -n - A2 / n;

    return {
      statistic: A2,
      interpretation: A2 < 2.5 ? 'Good fit' : A2 < 5 ? 'Moderate fit' : 'Poor fit'
    };
  }

  // ============================================
  // Special Mathematical Functions
  // ============================================

  /**
   * Error function (for normal CDF)
   */
  _erf(x) {
    // Approximation using Horner's method
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Gamma function (Lanczos approximation)
   */
  _gamma(z) {
    if (z < 0.5) {
      return Math.PI / (Math.sin(Math.PI * z) * this._gamma(1 - z));
    }

    z -= 1;
    const g = 7;
    const c = [
      0.99999999999980993,
      676.5203681218851,
      -1259.1392167224028,
      771.32342877765313,
      -176.61502916214059,
      12.507343278686905,
      -0.13857109526572012,
      9.9843695780195716e-6,
      1.5056327351493116e-7
    ];

    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
      x += c[i] / (z + i);
    }

    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }

  /**
   * Digamma function (for MLE optimization)
   */
  _digamma(x) {
    if (x < 6) {
      return this._digamma(x + 1) - 1 / x;
    }
    // Asymptotic expansion
    const x2 = x * x;
    return Math.log(x) - 1 / (2 * x) - 1 / (12 * x2) + 1 / (120 * x2 * x2);
  }

  /**
   * Trigamma function (second derivative of log gamma)
   */
  _trigamma(x) {
    if (x < 6) {
      return this._trigamma(x + 1) + 1 / (x * x);
    }
    // Asymptotic expansion
    const x2 = x * x;
    return 1 / x + 1 / (2 * x2) + 1 / (6 * x2 * x);
  }

  /**
   * Regularized incomplete beta function (for t CDF)
   */
  _betaIncomplete(a, b, x) {
    if (x === 0 || x === 1) return x;

    // Continued fraction approximation
    const maxIter = 100;
    const eps = 1e-10;

    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;

    let c = 1;
    let d = 1 - qab * x / qap;
    if (Math.abs(d) < eps) d = eps;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIter; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));

      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      h *= d * c;

      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < eps) d = eps;
      c = 1 + aa / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const del = d * c;
      h *= del;

      if (Math.abs(del - 1) < eps) break;
    }

    const bt = Math.exp(
      this._logGamma(a + b) - this._logGamma(a) - this._logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x)
    );

    return bt * h / a;
  }

  /**
   * Log gamma function
   */
  _logGamma(x) {
    const c = [
      76.18009172947146,
      -86.50532032941677,
      24.01409824083091,
      -1.231739572450155,
      0.1208650973866179e-2,
      -0.5395239384953e-5
    ];

    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;

    for (let j = 0; j < 6; j++) {
      ser += c[j] / ++y;
    }

    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Generate PDF points for plotting
   */
  generatePdfCurve(params, type, numPoints = 100) {
    const mean = params.mean || 0;
    const std = params.std || params.scale || 1;

    const xMin = mean - 4 * std;
    const xMax = mean + 4 * std;
    const step = (xMax - xMin) / numPoints;

    const points = [];
    for (let x = xMin; x <= xMax; x += step) {
      points.push({
        x: x,
        y: this.pdf(x, params, type)
      });
    }

    return points;
  }

  /**
   * Compare actual returns histogram with fitted distribution
   */
  generateComparisonData(returns, fittedDistribution, numBins = 30) {
    const moments = this.calculateMoments(returns);
    const min = Math.min(...returns);
    const max = Math.max(...returns);
    const binWidth = (max - min) / numBins;

    // Build histogram
    const histogram = [];
    for (let i = 0; i < numBins; i++) {
      const binStart = min + i * binWidth;
      const binEnd = binStart + binWidth;
      const binMid = (binStart + binEnd) / 2;

      const count = returns.filter(r => r >= binStart && r < binEnd).length;
      const empiricalDensity = count / (returns.length * binWidth);

      const fittedDensity = this.pdf(binMid, fittedDistribution.params, fittedDistribution.type);
      const normalDensity = this._pdfNormal(binMid, moments.mean, moments.std);

      histogram.push({
        binStart,
        binEnd,
        binMid,
        count,
        empiricalDensity,
        fittedDensity,
        normalDensity
      });
    }

    return {
      histogram,
      fittedType: fittedDistribution.type,
      moments
    };
  }

  /**
   * Get distribution summary for display
   */
  getSummary(fittedDistribution) {
    const { type, params, moments, goodnessOfFit } = fittedDistribution;

    const summary = {
      type,
      typeName: this._getDistributionName(type),
      moments: {
        mean: moments.mean,
        std: moments.std,
        skewness: moments.skewness,
        kurtosis: moments.kurtosis,
        excessKurtosis: moments.excessKurtosis
      },
      parameters: params,
      goodnessOfFit,
      riskCharacteristics: {
        fatTails: moments.kurtosis > 4,
        skewed: Math.abs(moments.skewness) > 0.5,
        normalAssumptionValid: moments.kurtosis < 4 && Math.abs(moments.skewness) < 0.5
      }
    };

    // Add VaR comparison
    const varComparison = this.cornishFisherVaR(
      moments.mean,
      moments.std,
      moments.skewness,
      moments.kurtosis,
      0.95
    );
    summary.varComparison = varComparison;

    return summary;
  }

  _getDistributionName(type) {
    const names = {
      normal: 'Normal (Gaussian)',
      studentT: "Student's t",
      skewedT: "Hansen's Skewed t",
      johnsonSU: 'Johnson SU'
    };
    return names[type] || type;
  }
}

module.exports = { ParametricDistributions };
