// src/services/backtesting/varBacktest.js
// VaR (Value at Risk) Backtesting with Statistical Validation
// Implements Kupiec Test, Christoffersen Test, and Basel Traffic Light System

const { getDatabaseAsync } = require('../../database');

/**
 * Chi-squared distribution quantile approximation
 */
function chiSquaredQuantile(p, df) {
  // Wilson-Hilferty approximation
  if (df <= 0) return 0;

  const z = normalQuantile(p);
  const a = 2 / (9 * df);

  const x = df * Math.pow(1 - a + z * Math.sqrt(a), 3);
  return Math.max(0, x);
}

/**
 * Normal distribution quantile (inverse CDF)
 */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  // Rational approximation
  const a = [
    -3.969683028665376e+01,
    2.209460984245205e+02,
    -2.759285104469687e+02,
    1.383577518672690e+02,
    -3.066479806614716e+01,
    2.506628277459239e+00
  ];
  const b = [
    -5.447609879822406e+01,
    1.615858368580409e+02,
    -1.556989798598866e+02,
    6.680131188771972e+01,
    -1.328068155288572e+01
  ];
  const c = [
    -7.784894002430293e-03,
    -3.223964580411365e-01,
    -2.400758277161838e+00,
    -2.549732539343734e+00,
    4.374664141464968e+00,
    2.938163982698783e+00
  ];
  const d = [
    7.784695709041462e-03,
    3.224671290700398e-01,
    2.445134137142996e+00,
    3.754408661907416e+00
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= pHigh) {
    q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
}

/**
 * Chi-squared distribution CDF
 */
function chiSquaredCDF(x, df) {
  if (x <= 0) return 0;
  return gammaCDF(x / 2, df / 2);
}

/**
 * Gamma distribution CDF (regularized incomplete gamma function)
 */
function gammaCDF(x, a) {
  if (x <= 0) return 0;
  if (a <= 0) return 0;

  // Use series expansion for small x
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 100; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < 1e-10) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }

  // Use continued fraction for large x
  let f = 1e-30;
  let c = 1e-30;
  let d = 0;

  for (let n = 1; n < 100; n++) {
    const an = n % 2 === 1 ? ((n + 1) / 2) : (n / 2 - a);
    const bn = n % 2 === 1 ? 1 : x;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return 1 - f * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

/**
 * Log gamma function (Lanczos approximation)
 */
function lgamma(x) {
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

/**
 * Kupiec Test (Proportion of Failures Test - POF)
 * Tests if the observed exception rate matches the expected rate
 *
 * H0: The VaR model is correctly specified
 * @param {number} exceptions - Number of VaR breaches
 * @param {number} observations - Total number of observations
 * @param {number} confidenceLevel - VaR confidence level (e.g., 0.99)
 * @returns {Object} Test results
 */
function kupiecTest(exceptions, observations, confidenceLevel) {
  const expectedRate = 1 - confidenceLevel;
  const observedRate = exceptions / observations;

  // Likelihood ratio test statistic
  // LR = -2 * log[(1-p)^(n-x) * p^x / (1-p_hat)^(n-x) * p_hat^x]

  let logLikelihoodRatio;

  if (exceptions === 0) {
    logLikelihoodRatio = -2 * (observations * Math.log(1 - expectedRate) -
                               observations * Math.log(1 - observedRate));
  } else if (exceptions === observations) {
    logLikelihoodRatio = -2 * (observations * Math.log(expectedRate) -
                               observations * Math.log(observedRate));
  } else {
    const logL0 = (observations - exceptions) * Math.log(1 - expectedRate) +
                  exceptions * Math.log(expectedRate);
    const logL1 = (observations - exceptions) * Math.log(1 - observedRate) +
                  exceptions * Math.log(observedRate);
    logLikelihoodRatio = -2 * (logL0 - logL1);
  }

  // LR ~ chi-squared(1) under H0
  const pValue = 1 - chiSquaredCDF(logLikelihoodRatio, 1);

  return {
    testName: 'Kupiec POF Test',
    exceptions,
    observations,
    expectedRate,
    observedRate,
    lrStatistic: logLikelihoodRatio,
    pValue,
    pass: pValue > 0.05,
    interpretation: pValue > 0.05
      ? 'VaR model passes (exception rate consistent with confidence level)'
      : 'VaR model fails (exception rate significantly different from expected)'
  };
}

/**
 * Christoffersen Test (Conditional Coverage Test)
 * Tests both coverage (POF) and independence of exceptions
 *
 * @param {Array} exceptions - Array of 0/1 indicating exceptions
 * @returns {Object} Test results
 */
function christoffersenTest(exceptions) {
  const n = exceptions.length;

  if (n < 10) {
    return {
      testName: 'Christoffersen CC Test',
      error: 'Insufficient observations for test',
      pass: null
    };
  }

  // Count transitions
  let n00 = 0, n01 = 0, n10 = 0, n11 = 0;

  for (let i = 1; i < n; i++) {
    const prev = exceptions[i - 1];
    const curr = exceptions[i];

    if (prev === 0 && curr === 0) n00++;
    else if (prev === 0 && curr === 1) n01++;
    else if (prev === 1 && curr === 0) n10++;
    else if (prev === 1 && curr === 1) n11++;
  }

  // Transition probabilities
  const pi01 = n01 / (n00 + n01 || 1);
  const pi11 = n11 / (n10 + n11 || 1);
  const pi = (n01 + n11) / (n - 1);

  // Independence test LR statistic
  let lrInd = 0;

  if (n00 > 0 && n01 > 0) {
    lrInd += n00 * Math.log(1 - pi01) + n01 * Math.log(pi01);
    lrInd -= n00 * Math.log(1 - pi) + n01 * Math.log(pi);
  }
  if (n10 > 0 && n11 > 0) {
    lrInd += n10 * Math.log(1 - pi11) + n11 * Math.log(pi11);
    lrInd -= n10 * Math.log(1 - pi) + n11 * Math.log(pi);
  }

  lrInd = -2 * lrInd;

  // Independence p-value (chi-squared with 1 df)
  const pValueInd = 1 - chiSquaredCDF(Math.max(0, lrInd), 1);

  // Combined conditional coverage test
  const totalExceptions = exceptions.filter(e => e === 1).length;
  const kupiec = kupiecTest(totalExceptions, n, 0.99); // Assuming 99% VaR

  const lrCC = kupiec.lrStatistic + lrInd;
  const pValueCC = 1 - chiSquaredCDF(lrCC, 2);

  return {
    testName: 'Christoffersen CC Test',
    observations: n,
    totalExceptions,
    transitions: { n00, n01, n10, n11 },
    independenceTest: {
      lrStatistic: lrInd,
      pValue: pValueInd,
      pass: pValueInd > 0.05,
      interpretation: pValueInd > 0.05
        ? 'Exceptions are independent (no clustering)'
        : 'Exceptions are clustered (serial dependence detected)'
    },
    conditionalCoverage: {
      lrStatistic: lrCC,
      pValue: pValueCC,
      pass: pValueCC > 0.05
    },
    pass: pValueCC > 0.05,
    interpretation: pValueCC > 0.05
      ? 'VaR model passes conditional coverage test'
      : 'VaR model fails - check both coverage and exception clustering'
  };
}

/**
 * Basel Traffic Light System for VaR Model Validation
 * Classifies model based on number of exceptions in 250 trading days
 *
 * @param {number} exceptions - Number of exceptions
 * @param {number} observations - Should be ~250 for annual
 * @param {number} confidenceLevel - VaR confidence level
 * @returns {Object} Basel classification
 */
function baselTrafficLight(exceptions, observations = 250, confidenceLevel = 0.99) {
  const expectedExceptions = (1 - confidenceLevel) * observations;

  // Basel guidelines for 99% VaR over 250 days (expected: 2.5)
  // Green: 0-4 exceptions
  // Yellow: 5-9 exceptions
  // Red: 10+ exceptions

  const scaledThresholds = {
    greenMax: Math.ceil(4 * (observations / 250)),
    yellowMax: Math.ceil(9 * (observations / 250))
  };

  let zone, color, multiplier, interpretation;

  if (exceptions <= scaledThresholds.greenMax) {
    zone = 'GREEN';
    color = '#22c55e';
    multiplier = 0;
    interpretation = 'Model performs well - no additional capital required';
  } else if (exceptions <= scaledThresholds.yellowMax) {
    zone = 'YELLOW';
    color = '#f59e0b';
    // Basel multiplication factors for yellow zone
    const yellowMultipliers = [0.4, 0.5, 0.65, 0.75, 0.85];
    const yellowIndex = Math.min(exceptions - scaledThresholds.greenMax - 1, 4);
    multiplier = yellowMultipliers[yellowIndex];
    interpretation = `Model shows some weakness - capital multiplier: ${(3 + multiplier).toFixed(2)}x`;
  } else {
    zone = 'RED';
    color = '#ef4444';
    multiplier = 1;
    interpretation = 'Model is rejected - maximum capital multiplier: 4x, model review required';
  }

  // Calculate cumulative probability of observing this many exceptions or more
  const binomialPValue = binomialCDF(exceptions - 1, observations, 1 - confidenceLevel);

  return {
    zone,
    color,
    exceptions,
    observations,
    expectedExceptions: expectedExceptions.toFixed(1),
    capitalMultiplier: 3 + multiplier,
    pValue: 1 - binomialPValue,
    interpretation,
    thresholds: {
      green: `0-${scaledThresholds.greenMax}`,
      yellow: `${scaledThresholds.greenMax + 1}-${scaledThresholds.yellowMax}`,
      red: `${scaledThresholds.yellowMax + 1}+`
    }
  };
}

/**
 * Binomial CDF
 */
function binomialCDF(k, n, p) {
  let cdf = 0;
  for (let i = 0; i <= k; i++) {
    cdf += binomialPMF(i, n, p);
  }
  return cdf;
}

function binomialPMF(k, n, p) {
  if (k < 0 || k > n) return 0;
  const logCoeff = lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
  return Math.exp(logCoeff + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/**
 * Expected Shortfall (ES) Backtest
 * Validates that average loss exceeding VaR matches ES estimate
 *
 * @param {Array} losses - Array of actual losses (positive values)
 * @param {Array} varEstimates - Array of VaR estimates
 * @param {Array} esEstimates - Array of ES estimates
 * @returns {Object} ES validation results
 */
function backtestExpectedShortfall(losses, varEstimates, esEstimates) {
  if (losses.length !== varEstimates.length || losses.length !== esEstimates.length) {
    throw new Error('Arrays must have same length');
  }

  const n = losses.length;
  const exceedances = [];
  const esRatios = [];

  for (let i = 0; i < n; i++) {
    if (losses[i] > varEstimates[i]) {
      exceedances.push({
        date: i,
        loss: losses[i],
        var: varEstimates[i],
        es: esEstimates[i],
        ratio: losses[i] / esEstimates[i]
      });
      esRatios.push(losses[i] / esEstimates[i]);
    }
  }

  if (exceedances.length === 0) {
    return {
      testName: 'Expected Shortfall Backtest',
      exceedances: 0,
      avgExceedanceRatio: null,
      valid: true,
      interpretation: 'No VaR exceedances - ES cannot be validated'
    };
  }

  // Average ratio of actual loss to ES estimate
  const avgRatio = esRatios.reduce((a, b) => a + b, 0) / esRatios.length;

  // Standard error
  const variance = esRatios.reduce((acc, r) => acc + Math.pow(r - avgRatio, 2), 0) / (esRatios.length - 1);
  const se = Math.sqrt(variance / esRatios.length);

  // T-test: H0: avgRatio = 1 (ES is correctly specified)
  const tStat = (avgRatio - 1) / se;
  const pValue = 2 * (1 - tCDF(Math.abs(tStat), esRatios.length - 1));

  // ES should capture average tail loss, so ratio should be around 1
  const valid = avgRatio <= 1.5 && pValue > 0.05;

  return {
    testName: 'Expected Shortfall Backtest',
    exceedances: exceedances.length,
    avgExceedanceRatio: avgRatio,
    ratioStdError: se,
    tStatistic: tStat,
    pValue,
    valid,
    interpretation: valid
      ? `ES model is adequate (avg loss/ES ratio: ${avgRatio.toFixed(2)})`
      : `ES model may underestimate tail risk (avg loss/ES ratio: ${avgRatio.toFixed(2)})`
  };
}

/**
 * T-distribution CDF approximation
 */
function tCDF(t, df) {
  if (df <= 0) return 0.5;

  const x = df / (df + t * t);

  // Use beta function
  const bt = Math.exp(
    lgamma((df + 1) / 2) - lgamma(df / 2) - 0.5 * Math.log(Math.PI * df)
  );

  if (t >= 0) {
    return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
  } else {
    return 0.5 * incompleteBeta(df / 2, 0.5, x);
  }
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
  const maxIterations = 100;
  const epsilon = 1e-10;

  let am = 1, bm = 1, az = 1;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let bz = 1 - qab * x / qap;

  for (let m = 1; m <= maxIterations; m++) {
    const em = m;
    const tem = em + em;
    let d = em * (b - m) * x / ((qam + tem) * (a + tem));
    const ap = az + d * am;
    const bp = bz + d * bm;
    d = -(a + em) * (qab + em) * x / ((a + tem) * (qap + tem));
    const app = ap + d * az;
    const bpp = bp + d * bz;
    const aold = az;
    am = ap / bpp;
    bm = bp / bpp;
    az = app / bpp;
    bz = 1;

    if (Math.abs(az - aold) < epsilon * Math.abs(az)) {
      return az;
    }
  }
  return az;
}

/**
 * Run complete VaR backtest for a portfolio
 */
async function runVaRBacktest(params) {
  const {
    portfolioId,
    startDate,
    endDate,
    confidenceLevel = 0.99,
    method = 'historical' // 'historical', 'parametric', 'monte_carlo'
  } = params;

  const database = await getDatabaseAsync();

  // Get portfolio daily returns
  const result = await database.query(`
    SELECT snapshot_date as date, daily_return_pct as daily_return
    FROM portfolio_snapshots
    WHERE portfolio_id = $1
      AND snapshot_date >= COALESCE($2::date, '1900-01-01'::date)
      AND snapshot_date <= COALESCE($3::date, '2100-01-01'::date)
    ORDER BY snapshot_date ASC
  `, [portfolioId, startDate, endDate]);

  const returns = result.rows;

  if (returns.length < 252) {
    throw new Error(`Insufficient data: ${returns.length} days, need at least 252`);
  }

  const lookback = 252; // 1 year for VaR estimation
  const exceptions = [];
  const exceptionDates = [];
  const varEstimates = [];
  const esEstimates = [];
  const actualLosses = [];

  // Rolling VaR estimation
  for (let i = lookback; i < returns.length; i++) {
    const historicalReturns = returns.slice(i - lookback, i).map(r => r.daily_return);
    const currentReturn = returns[i].daily_return;
    const currentDate = returns[i].date;

    // Calculate VaR based on method
    let var_, es;

    if (method === 'historical') {
      const sorted = [...historicalReturns].sort((a, b) => a - b);
      const varIndex = Math.floor(sorted.length * (1 - confidenceLevel));
      var_ = -sorted[varIndex]; // VaR is positive
      es = -sorted.slice(0, varIndex + 1).reduce((a, b) => a + b, 0) / (varIndex + 1);
    } else if (method === 'parametric') {
      const mean = historicalReturns.reduce((a, b) => a + b, 0) / historicalReturns.length;
      const variance = historicalReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (historicalReturns.length - 1);
      const std = Math.sqrt(variance);

      const zScore = normalQuantile(1 - confidenceLevel);
      var_ = -(mean + zScore * std);

      // ES for normal distribution
      const phi = Math.exp(-zScore * zScore / 2) / Math.sqrt(2 * Math.PI);
      es = -mean + std * phi / (1 - confidenceLevel);
    } else {
      // Monte Carlo - simplified
      const mean = historicalReturns.reduce((a, b) => a + b, 0) / historicalReturns.length;
      const variance = historicalReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / (historicalReturns.length - 1);
      const std = Math.sqrt(variance);

      const simulations = [];
      for (let s = 0; s < 10000; s++) {
        simulations.push(mean + std * normalRandom());
      }
      simulations.sort((a, b) => a - b);

      const varIndex = Math.floor(10000 * (1 - confidenceLevel));
      var_ = -simulations[varIndex];
      es = -simulations.slice(0, varIndex + 1).reduce((a, b) => a + b, 0) / (varIndex + 1);
    }

    varEstimates.push(var_);
    esEstimates.push(es);
    actualLosses.push(-currentReturn); // Loss is negative of return

    const isException = -currentReturn > var_ ? 1 : 0;
    exceptions.push(isException);

    if (isException) {
      exceptionDates.push(currentDate);
    }

    // Store exception in database
    await database.query(`
      INSERT INTO var_exceptions
      (portfolio_id, exception_date, var_estimate, es_estimate, actual_loss, confidence_level, method, is_exception)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (portfolio_id, exception_date) DO UPDATE SET
        var_estimate = $3,
        es_estimate = $4,
        actual_loss = $5,
        confidence_level = $6,
        method = $7,
        is_exception = $8
    `, [
      portfolioId,
      currentDate,
      var_,
      es,
      -currentReturn,
      confidenceLevel,
      method,
      isException === 1 ? true : false
    ]);
  }

  // Run statistical tests
  const totalExceptions = exceptions.filter(e => e === 1).length;
  const totalObservations = exceptions.length;

  const kupiecResult = kupiecTest(totalExceptions, totalObservations, confidenceLevel);
  const christoffersenResult = christoffersenTest(exceptions);
  const baselResult = baselTrafficLight(totalExceptions, totalObservations, confidenceLevel);
  const esResult = backtestExpectedShortfall(actualLosses, varEstimates, esEstimates);

  // Store summary results
  await database.query(`
    INSERT INTO var_backtest_results
    (portfolio_id, confidence_level, method, start_date, end_date,
     total_observations, total_exceptions, exception_rate, expected_exception_rate,
     kupiec_stat, kupiec_p_value, kupiec_pass,
     christoffersen_stat, christoffersen_p_value, christoffersen_pass,
     basel_zone, es_ratio)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
  `, [
    portfolioId,
    confidenceLevel,
    method,
    returns[lookback]?.date,
    returns[returns.length - 1]?.date,
    totalObservations,
    totalExceptions,
    totalExceptions / totalObservations,
    1 - confidenceLevel,
    kupiecResult.lrStatistic,
    kupiecResult.pValue,
    kupiecResult.pass ? true : false,
    christoffersenResult.conditionalCoverage?.lrStatistic || 0,
    christoffersenResult.conditionalCoverage?.pValue || 1,
    christoffersenResult.pass ? true : false,
    baselResult.zone,
    esResult.avgExceedanceRatio
  ]);

  return {
    portfolioId,
    method,
    confidenceLevel,
    startDate: returns[lookback]?.date,
    endDate: returns[returns.length - 1]?.date,
    summary: {
      totalObservations,
      totalExceptions,
      exceptionRate: (totalExceptions / totalObservations * 100).toFixed(2) + '%',
      expectedRate: ((1 - confidenceLevel) * 100).toFixed(2) + '%'
    },
    tests: {
      kupiec: kupiecResult,
      christoffersen: christoffersenResult,
      basel: baselResult,
      expectedShortfall: esResult
    },
    exceptionDates: exceptionDates.slice(-20), // Last 20 exceptions
    overallPass: kupiecResult.pass && christoffersenResult.pass && baselResult.zone !== 'RED',
    interpretation: generateInterpretation(kupiecResult, christoffersenResult, baselResult)
  };
}

/**
 * Generate overall interpretation
 */
function generateInterpretation(kupiec, christoffersen, basel) {
  const interpretations = [];

  if (basel.zone === 'GREEN') {
    interpretations.push('VaR model performs within acceptable bounds (Basel Green Zone)');
  } else if (basel.zone === 'YELLOW') {
    interpretations.push('VaR model shows elevated exceptions (Basel Yellow Zone) - monitor closely');
  } else {
    interpretations.push('VaR model has excessive exceptions (Basel Red Zone) - model review required');
  }

  if (!kupiec.pass) {
    interpretations.push('Exception frequency differs significantly from expected - consider model recalibration');
  }

  if (!christoffersen.independenceTest?.pass) {
    interpretations.push('Exceptions are clustered - model may underestimate risk during volatile periods');
  }

  return interpretations;
}

/**
 * Standard normal random number (Box-Muller)
 */
function normalRandom() {
  let u1, u2;
  do {
    u1 = Math.random();
    u2 = Math.random();
  } while (u1 === 0);

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Get VaR backtest history for a portfolio
 */
async function getVaRBacktestHistory(portfolioId, limit = 10) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT *
    FROM var_backtest_results
    WHERE portfolio_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [portfolioId, limit]);
  return result.rows;
}

/**
 * Get VaR exceptions for a portfolio
 */
async function getVaRExceptions(portfolioId, days = 90) {
  const database = await getDatabaseAsync();
  const result = await database.query(`
    SELECT *
    FROM var_exceptions
    WHERE portfolio_id = $1
      AND exception_date >= CURRENT_DATE - INTERVAL '1 day' * $2
      AND is_exception = true
    ORDER BY exception_date DESC
  `, [portfolioId, days]);
  return result.rows;
}

module.exports = {
  runVaRBacktest,
  kupiecTest,
  christoffersenTest,
  baselTrafficLight,
  backtestExpectedShortfall,
  getVaRBacktestHistory,
  getVaRExceptions
};
