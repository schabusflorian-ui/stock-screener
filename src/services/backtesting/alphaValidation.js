// src/services/backtesting/alphaValidation.js
// Statistical Validation Framework for Alpha Significance Testing
// Implements t-tests, bootstrap confidence intervals, Deflated Sharpe Ratio, and multiple testing corrections

const { db } = require('../../database');

/**
 * Normal distribution CDF
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

/**
 * T-distribution CDF
 */
function tCDF(t, df) {
  if (df <= 0) return 0.5;
  if (!isFinite(t)) return t > 0 ? 1 : 0;

  const x = df / (df + t * t);
  const bt = Math.exp(
    lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(Math.PI * df)
  );

  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
  }
  return 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function lgamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function incompleteBeta(a, b, x) {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinuedFraction(a, b, x) / a;
  }
  return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
}

function betaContinuedFraction(a, b, x) {
  const maxIter = 100;
  const eps = 1e-10;
  let am = 1, bm = 1, az = 1;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let bz = 1 - qab * x / qap;

  for (let m = 1; m <= maxIter; m++) {
    const em = m, tem = em + em;
    let d = em * (b - m) * x / ((qam + tem) * (a + tem));
    const ap = az + d * am;
    const bp = bz + d * bm;
    d = -(a + em) * (qab + em) * x / ((a + tem) * (qap + tem));
    const app = ap + d * az;
    const bpp = bp + d * bz;
    const aold = az;
    am = ap / bpp; bm = bp / bpp; az = app / bpp; bz = 1;
    if (Math.abs(az - aold) < eps * Math.abs(az)) return az;
  }
  return az;
}

/**
 * Calculate basic statistics
 */
function calculateStats(arr) {
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0, skew: 0, kurtosis: 3 };

  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const m2 = arr.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0);
  const m3 = arr.reduce((acc, x) => acc + Math.pow(x - mean, 3), 0);
  const m4 = arr.reduce((acc, x) => acc + Math.pow(x - mean, 4), 0);

  const variance = m2 / (n - 1);
  const std = Math.sqrt(variance);

  const skew = n > 2 ? (m3 / n) / Math.pow(std, 3) : 0;
  const kurtosis = n > 3 ? (m4 / n) / Math.pow(std, 4) : 3;

  return { mean, std, variance, skew, kurtosis, n };
}

/**
 * Test alpha significance using OLS regression
 * Y = alpha + beta * X + epsilon
 *
 * @param {Array} portfolioReturns - Strategy returns
 * @param {Array} benchmarkReturns - Benchmark returns
 * @param {number} riskFreeRate - Annual risk-free rate
 * @returns {Object} Alpha test results
 */
function testAlphaSignificance(portfolioReturns, benchmarkReturns, riskFreeRate = 0.02) {
  if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 30) {
    return {
      error: 'Insufficient or mismatched data',
      alpha: 0,
      significant: false
    };
  }

  const n = portfolioReturns.length;
  const dailyRf = Math.pow(1 + riskFreeRate, 1 / 252) - 1;

  // Excess returns
  const y = portfolioReturns.map(r => r - dailyRf);
  const x = benchmarkReturns.map(r => r - dailyRf);

  // OLS regression
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let ssXX = 0, ssXY = 0;
  for (let i = 0; i < n; i++) {
    ssXX += (x[i] - xMean) * (x[i] - xMean);
    ssXY += (x[i] - xMean) * (y[i] - yMean);
  }

  const beta = ssXY / ssXX;
  const alpha = yMean - beta * xMean;

  // Residuals and standard errors
  const residuals = [];
  let ssResidual = 0;
  for (let i = 0; i < n; i++) {
    const predicted = alpha + beta * x[i];
    const residual = y[i] - predicted;
    residuals.push(residual);
    ssResidual += residual * residual;
  }

  const mse = ssResidual / (n - 2);
  const seAlpha = Math.sqrt(mse * (1 / n + xMean * xMean / ssXX));
  const seBeta = Math.sqrt(mse / ssXX);

  // T-statistics
  const tAlpha = alpha / seAlpha;
  const tBeta = beta / seBeta;

  // P-values (two-tailed)
  const pAlpha = 2 * (1 - tCDF(Math.abs(tAlpha), n - 2));
  const pBeta = 2 * (1 - tCDF(Math.abs(tBeta), n - 2));

  // Annualized alpha
  const annualizedAlpha = alpha * 252;

  // R-squared
  const ssTotal = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
  const rSquared = 1 - ssResidual / ssTotal;

  // Information Ratio and Tracking Error
  const trackingError = Math.sqrt(
    residuals.reduce((acc, r) => acc + r * r, 0) / (n - 1)
  ) * Math.sqrt(252);
  const informationRatio = annualizedAlpha / trackingError;

  return {
    alpha: {
      daily: alpha,
      annualized: annualizedAlpha,
      standardError: seAlpha,
      tStatistic: tAlpha,
      pValue: pAlpha,
      significant: pAlpha < 0.05,
      confInterval95: [
        alpha - 1.96 * seAlpha,
        alpha + 1.96 * seAlpha
      ].map(a => a * 252) // annualized
    },
    beta: {
      value: beta,
      standardError: seBeta,
      tStatistic: tBeta,
      pValue: pBeta
    },
    rSquared,
    trackingError,
    informationRatio,
    sampleSize: n,
    interpretation: interpretAlphaResults(annualizedAlpha, pAlpha, informationRatio)
  };
}

/**
 * Bootstrap confidence intervals
 * Uses block bootstrap to preserve autocorrelation
 *
 * @param {Array} returns - Return series
 * @param {Function} metricFn - Function to compute metric
 * @param {number} nBootstrap - Number of bootstrap samples
 * @param {number} blockSize - Block size for block bootstrap
 * @returns {Object} Bootstrap results
 */
function bootstrapConfidenceInterval(returns, metricFn, nBootstrap = 10000, blockSize = 21) {
  if (returns.length < blockSize * 2) {
    return { error: 'Insufficient data for bootstrap' };
  }

  const n = returns.length;
  const numBlocks = Math.ceil(n / blockSize);
  const bootstrapEstimates = [];

  for (let b = 0; b < nBootstrap; b++) {
    // Block bootstrap resampling
    const sample = [];

    for (let i = 0; i < numBlocks; i++) {
      const startIdx = Math.floor(Math.random() * (n - blockSize + 1));
      for (let j = 0; j < blockSize && sample.length < n; j++) {
        sample.push(returns[startIdx + j]);
      }
    }

    // Compute metric on bootstrap sample
    const estimate = metricFn(sample.slice(0, n));
    if (isFinite(estimate)) {
      bootstrapEstimates.push(estimate);
    }
  }

  if (bootstrapEstimates.length < nBootstrap * 0.9) {
    return { error: 'Too many invalid bootstrap samples' };
  }

  // Sort for percentiles
  bootstrapEstimates.sort((a, b) => a - b);

  const pointEstimate = metricFn(returns);
  const mean = bootstrapEstimates.reduce((a, b) => a + b, 0) / bootstrapEstimates.length;
  const variance = bootstrapEstimates.reduce((acc, e) => acc + Math.pow(e - mean, 2), 0) / (bootstrapEstimates.length - 1);
  const se = Math.sqrt(variance);

  // Percentile confidence intervals
  const ci90 = [
    bootstrapEstimates[Math.floor(0.05 * bootstrapEstimates.length)],
    bootstrapEstimates[Math.floor(0.95 * bootstrapEstimates.length)]
  ];
  const ci95 = [
    bootstrapEstimates[Math.floor(0.025 * bootstrapEstimates.length)],
    bootstrapEstimates[Math.floor(0.975 * bootstrapEstimates.length)]
  ];
  const ci99 = [
    bootstrapEstimates[Math.floor(0.005 * bootstrapEstimates.length)],
    bootstrapEstimates[Math.floor(0.995 * bootstrapEstimates.length)]
  ];

  // Bias
  const bias = mean - pointEstimate;

  return {
    pointEstimate,
    bootstrapMean: mean,
    standardError: se,
    bias,
    biasAdjusted: pointEstimate - bias,
    ci90,
    ci95,
    ci99,
    nBootstrap: bootstrapEstimates.length
  };
}

/**
 * Calculate Sharpe Ratio
 */
function calculateSharpeRatio(returns, riskFreeRate = 0.02) {
  const stats = calculateStats(returns);
  const dailyRf = Math.pow(1 + riskFreeRate, 1 / 252) - 1;
  const excessMean = stats.mean - dailyRf;
  const annualizedExcessReturn = excessMean * 252;
  const annualizedVol = stats.std * Math.sqrt(252);
  return annualizedVol > 0 ? annualizedExcessReturn / annualizedVol : 0;
}

/**
 * Deflated Sharpe Ratio (Harvey, Liu, Zhu 2016)
 * Adjusts for multiple testing / data snooping
 *
 * @param {number} sharpe - Observed Sharpe ratio
 * @param {number} nTrials - Number of strategy variations tested
 * @param {number} skew - Return skewness
 * @param {number} kurtosis - Return kurtosis
 * @param {number} nObservations - Number of observations
 * @returns {Object} Deflated Sharpe results
 */
function deflatedSharpeRatio(sharpe, nTrials, skew, kurtosis, nObservations) {
  // Expected maximum Sharpe under null (multiple testing)
  // E[max(SR)] ≈ sqrt(2 * log(N)) * (1 - gamma / (2 * log(N)))
  // where gamma ≈ 0.5772 (Euler-Mascheroni constant)

  const gamma = 0.5772;
  const logN = Math.log(nTrials);

  if (logN <= 0) {
    return { deflatedSharpe: sharpe, pValue: 0, nTrials: 1 };
  }

  const expectedMaxSharpe = Math.sqrt(2 * logN) * (1 - gamma / (2 * logN)) +
                            gamma / Math.sqrt(2 * logN);

  // Standard error of Sharpe ratio (Lo 2002, adjusted for non-normality)
  const seSharpe = Math.sqrt((1 + 0.5 * sharpe * sharpe -
                             skew * sharpe +
                             ((kurtosis - 3) / 4) * sharpe * sharpe) / nObservations);

  // Deflated Sharpe Ratio
  const deflatedSharpe = (sharpe - expectedMaxSharpe) / seSharpe;

  // P-value (probability of observing this Sharpe by chance given multiple testing)
  const pValue = 1 - normalCDF(deflatedSharpe);

  return {
    observedSharpe: sharpe,
    expectedMaxSharpeUnderNull: expectedMaxSharpe,
    standardError: seSharpe,
    deflatedSharpe,
    pValue,
    significant: pValue < 0.05,
    nTrials,
    interpretation: pValue < 0.05
      ? 'Strategy Sharpe is significant even after adjusting for multiple testing'
      : 'Strategy Sharpe may be explained by data snooping / multiple testing'
  };
}

/**
 * Minimum Track Record Length (Bailey & Lopez de Prado 2012)
 * Calculate minimum months needed to validate a Sharpe ratio
 *
 * @param {number} sharpe - Target Sharpe ratio to validate
 * @param {number} targetProb - Confidence level (default 0.95)
 * @param {number} skew - Return skewness
 * @param {number} kurtosis - Return kurtosis
 * @returns {Object} Minimum track record results
 */
function minimumTrackRecord(sharpe, targetProb = 0.95, skew = 0, kurtosis = 3) {
  if (sharpe <= 0) {
    return {
      minMonths: Infinity,
      interpretation: 'Cannot validate non-positive Sharpe ratio'
    };
  }

  // Z-score for target probability
  const zScore = -normalQuantile(1 - targetProb);

  // Minimum observations needed
  // n = (z / SR)^2 * (1 + 0.5*SR^2 - skew*SR + ((kurt-3)/4)*SR^2)
  const adjustment = 1 + 0.5 * sharpe * sharpe - skew * sharpe +
                    ((kurtosis - 3) / 4) * sharpe * sharpe;

  const minDays = Math.pow(zScore / sharpe, 2) * adjustment;
  const minMonths = minDays / 21; // ~21 trading days per month

  return {
    minDays: Math.ceil(minDays),
    minMonths: Math.ceil(minMonths),
    minYears: (minMonths / 12).toFixed(1),
    targetSharpe: sharpe,
    confidenceLevel: targetProb * 100 + '%',
    interpretation: `Need at least ${Math.ceil(minMonths)} months (${(minMonths / 12).toFixed(1)} years) of data to validate Sharpe of ${sharpe.toFixed(2)} with ${(targetProb * 100).toFixed(0)}% confidence`
  };
}

/**
 * Normal quantile (inverse CDF)
 */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];

  const pLow = 0.02425, pHigh = 1 - pLow;
  let q;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
           ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
           (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
            ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
}

/**
 * Multiple Hypothesis Testing Corrections
 *
 * @param {Array} pValues - Array of p-values
 * @param {string} method - 'bonferroni', 'holm', 'fdr_bh' (Benjamini-Hochberg)
 * @returns {Object} Adjusted p-values and significant indices
 */
function correctForMultipleTesting(pValues, method = 'fdr_bh') {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));

  let adjusted;

  switch (method) {
    case 'bonferroni':
      // Most conservative: p_adj = p * n
      adjusted = pValues.map(p => Math.min(1, p * n));
      break;

    case 'holm':
      // Holm-Bonferroni: sequential rejection
      indexed.sort((a, b) => a.p - b.p);
      adjusted = new Array(n);
      let maxAdj = 0;
      for (let i = 0; i < n; i++) {
        const adj = indexed[i].p * (n - i);
        maxAdj = Math.max(maxAdj, adj);
        adjusted[indexed[i].i] = Math.min(1, maxAdj);
      }
      break;

    case 'fdr_bh':
      // Benjamini-Hochberg FDR control
      indexed.sort((a, b) => a.p - b.p);
      adjusted = new Array(n);
      let minAdj = 1;
      for (let i = n - 1; i >= 0; i--) {
        const adj = indexed[i].p * n / (i + 1);
        minAdj = Math.min(minAdj, adj);
        adjusted[indexed[i].i] = Math.min(1, minAdj);
      }
      break;

    default:
      adjusted = pValues;
  }

  // Determine which are significant at 0.05
  const significant = adjusted.map((p, i) => ({
    originalIndex: i,
    originalPValue: pValues[i],
    adjustedPValue: p,
    significant: p < 0.05
  }));

  const numSignificant = significant.filter(s => s.significant).length;

  return {
    method,
    adjustedPValues: adjusted,
    significant,
    numSignificant,
    interpretation: `${numSignificant} of ${n} tests significant after ${method} correction`
  };
}

/**
 * Run complete alpha validation for a portfolio
 */
async function runAlphaValidation(params) {
  const {
    portfolioId,
    benchmark = 'SPY',
    startDate,
    endDate,
    nBootstrap = 10000,
    nTrials = 1 // Number of strategy variations tested (for deflated Sharpe)
  } = params;

  // Get portfolio returns
  const portfolioReturns = db.prepare(`
    SELECT snapshot_date as date, daily_return_pct as daily_return
    FROM portfolio_snapshots
    WHERE portfolio_id = ?
      AND snapshot_date >= COALESCE(?, '1900-01-01')
      AND snapshot_date <= COALESCE(?, '2100-01-01')
    ORDER BY snapshot_date ASC
  `).all(portfolioId, startDate, endDate);

  if (portfolioReturns.length < 60) {
    throw new Error(`Insufficient portfolio data: ${portfolioReturns.length} days`);
  }

  // Get benchmark returns
  const benchmarkReturns = db.prepare(`
    SELECT date, close
    FROM daily_prices
    WHERE symbol = ?
      AND date >= COALESCE(?, '1900-01-01')
      AND date <= COALESCE(?, '2100-01-01')
    ORDER BY date ASC
  `).all(benchmark, startDate, endDate);

  // Calculate benchmark returns
  const benchmarkReturnMap = new Map();
  for (let i = 1; i < benchmarkReturns.length; i++) {
    const ret = (benchmarkReturns[i].close - benchmarkReturns[i - 1].close) / benchmarkReturns[i - 1].close;
    benchmarkReturnMap.set(benchmarkReturns[i].date, ret);
  }

  // Align returns
  const alignedPortfolio = [];
  const alignedBenchmark = [];

  for (const pr of portfolioReturns) {
    if (benchmarkReturnMap.has(pr.date)) {
      alignedPortfolio.push(pr.daily_return);
      alignedBenchmark.push(benchmarkReturnMap.get(pr.date));
    }
  }

  if (alignedPortfolio.length < 60) {
    throw new Error('Insufficient overlapping data with benchmark');
  }

  // Calculate stats
  const stats = calculateStats(alignedPortfolio);
  const sharpe = calculateSharpeRatio(alignedPortfolio);

  // Alpha significance test
  const alphaTest = testAlphaSignificance(alignedPortfolio, alignedBenchmark);

  // Bootstrap confidence intervals
  const bootstrapSharpe = bootstrapConfidenceInterval(
    alignedPortfolio,
    calculateSharpeRatio,
    nBootstrap
  );

  const bootstrapAlpha = bootstrapConfidenceInterval(
    alignedPortfolio,
    (returns) => {
      const result = testAlphaSignificance(returns, alignedBenchmark.slice(0, returns.length));
      return result.alpha?.annualized || 0;
    },
    Math.min(nBootstrap, 5000) // Fewer for alpha (more expensive)
  );

  // Deflated Sharpe Ratio
  const deflatedSharpe = deflatedSharpeRatio(
    sharpe,
    nTrials,
    stats.skew,
    stats.kurtosis,
    alignedPortfolio.length
  );

  // Minimum track record
  const minTrackRecord = minimumTrackRecord(sharpe, 0.95, stats.skew, stats.kurtosis);

  // Store results
  db.prepare(`
    INSERT INTO alpha_validation_results
    (portfolio_id, benchmark, start_date, end_date,
     alpha, alpha_t_stat, alpha_p_value, alpha_significant,
     beta, sharpe_ratio, deflated_sharpe, deflated_sharpe_p_value,
     bootstrap_alpha_lower, bootstrap_alpha_upper,
     bootstrap_sharpe_lower, bootstrap_sharpe_upper,
     n_bootstrap, min_track_record_months, information_ratio, tracking_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    portfolioId,
    benchmark,
    portfolioReturns[0]?.date,
    portfolioReturns[portfolioReturns.length - 1]?.date,
    alphaTest.alpha?.annualized || 0,
    alphaTest.alpha?.tStatistic || 0,
    alphaTest.alpha?.pValue || 1,
    (alphaTest.alpha?.significant ? 1 : 0),
    alphaTest.beta?.value || 0,
    sharpe,
    deflatedSharpe.deflatedSharpe,
    deflatedSharpe.pValue,
    bootstrapAlpha.ci95?.[0] || null,
    bootstrapAlpha.ci95?.[1] || null,
    bootstrapSharpe.ci95?.[0] || null,
    bootstrapSharpe.ci95?.[1] || null,
    nBootstrap,
    minTrackRecord.minMonths,
    alphaTest.informationRatio || 0,
    alphaTest.trackingError || 0
  );

  return {
    portfolioId,
    benchmark,
    period: {
      start: portfolioReturns[0]?.date,
      end: portfolioReturns[portfolioReturns.length - 1]?.date,
      tradingDays: alignedPortfolio.length
    },
    returnStats: {
      ...stats,
      annualizedReturn: stats.mean * 252,
      annualizedVolatility: stats.std * Math.sqrt(252)
    },
    alphaAnalysis: alphaTest,
    sharpeAnalysis: {
      observed: sharpe,
      bootstrap: bootstrapSharpe,
      deflated: deflatedSharpe
    },
    minimumTrackRecord: minTrackRecord,
    bootstrapAlpha,
    overallAssessment: generateOverallAssessment(alphaTest, deflatedSharpe, minTrackRecord, alignedPortfolio.length)
  };
}

/**
 * Generate overall assessment
 */
function generateOverallAssessment(alphaTest, deflatedSharpe, minTrackRecord, actualDays) {
  const assessments = [];
  let score = 0;

  // Alpha significance
  if (alphaTest.alpha?.significant) {
    assessments.push('Alpha is statistically significant (p < 0.05)');
    score += 25;
  } else {
    assessments.push('Alpha is not statistically significant');
  }

  // Deflated Sharpe
  if (deflatedSharpe.significant) {
    assessments.push('Sharpe ratio survives multiple testing adjustment');
    score += 25;
  } else {
    assessments.push('Sharpe ratio may be explained by data snooping');
  }

  // Track record length
  const actualMonths = actualDays / 21;
  if (actualMonths >= minTrackRecord.minMonths) {
    assessments.push(`Track record (${actualMonths.toFixed(0)} months) exceeds minimum required (${minTrackRecord.minMonths} months)`);
    score += 25;
  } else {
    assessments.push(`Track record (${actualMonths.toFixed(0)} months) is shorter than minimum required (${minTrackRecord.minMonths} months)`);
  }

  // Information Ratio
  if (alphaTest.informationRatio > 0.5) {
    assessments.push(`Strong Information Ratio (${alphaTest.informationRatio.toFixed(2)})`);
    score += 25;
  } else if (alphaTest.informationRatio > 0) {
    assessments.push(`Positive Information Ratio (${alphaTest.informationRatio.toFixed(2)})`);
    score += 10;
  }

  let grade;
  if (score >= 75) grade = 'A';
  else if (score >= 50) grade = 'B';
  else if (score >= 25) grade = 'C';
  else grade = 'D';

  return {
    score,
    grade,
    assessments,
    recommendation: score >= 50
      ? 'Strategy shows statistical evidence of skill'
      : 'Strategy requires more evidence before deployment'
  };
}

/**
 * Interpret alpha results
 */
function interpretAlphaResults(alpha, pValue, ir) {
  const interpretations = [];

  if (alpha > 0.05 && pValue < 0.05) {
    interpretations.push(`Strong significant alpha of ${(alpha * 100).toFixed(1)}% annually`);
  } else if (alpha > 0.02 && pValue < 0.05) {
    interpretations.push(`Moderate significant alpha of ${(alpha * 100).toFixed(1)}% annually`);
  } else if (alpha > 0) {
    interpretations.push(`Positive but not significant alpha of ${(alpha * 100).toFixed(1)}% annually`);
  } else {
    interpretations.push(`Negative alpha of ${(alpha * 100).toFixed(1)}% annually`);
  }

  if (ir > 1) {
    interpretations.push('Excellent risk-adjusted returns (IR > 1)');
  } else if (ir > 0.5) {
    interpretations.push('Good risk-adjusted returns (IR 0.5-1)');
  } else if (ir > 0) {
    interpretations.push('Modest risk-adjusted returns (IR < 0.5)');
  }

  return interpretations;
}

/**
 * Get alpha validation history
 */
function getAlphaValidationHistory(portfolioId, limit = 10) {
  return db.prepare(`
    SELECT *
    FROM alpha_validation_results
    WHERE portfolio_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(portfolioId, limit);
}

module.exports = {
  testAlphaSignificance,
  bootstrapConfidenceInterval,
  deflatedSharpeRatio,
  minimumTrackRecord,
  correctForMultipleTesting,
  calculateSharpeRatio,
  calculateStats,
  runAlphaValidation,
  getAlphaValidationHistory
};
