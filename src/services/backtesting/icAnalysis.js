// src/services/backtesting/icAnalysis.js
// Information Coefficient (IC) Analysis for Signal Quality Testing
// Measures predictive power of trading signals using rank correlation

const { db } = require('../../database');

/**
 * Calculate Spearman rank correlation coefficient
 * @param {Array} x - First variable
 * @param {Array} y - Second variable
 * @returns {Object} { correlation, tStat, pValue }
 */
function spearmanCorrelation(x, y) {
  if (x.length !== y.length || x.length < 3) {
    return { correlation: 0, tStat: 0, pValue: 1 };
  }

  const n = x.length;

  // Calculate ranks
  const rankX = calculateRanks(x);
  const rankY = calculateRanks(y);

  // Calculate Spearman correlation using Pearson on ranks
  const meanX = rankX.reduce((a, b) => a + b, 0) / n;
  const meanY = rankY.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = rankX[i] - meanX;
    const dy = rankY[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  const correlation = denominator > 0 ? numerator / denominator : 0;

  // T-statistic for correlation significance
  const tStat = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));

  // P-value approximation (two-tailed)
  const pValue = tDistributionPValue(Math.abs(tStat), n - 2);

  return {
    correlation,
    tStat,
    pValue: pValue * 2 // two-tailed
  };
}

/**
 * Calculate ranks with average rank for ties
 */
function calculateRanks(arr) {
  const indexed = arr.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);

  const ranks = new Array(arr.length);
  let i = 0;

  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length && indexed[j].val === indexed[i].val) {
      j++;
    }
    // Average rank for ties
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j;
  }

  return ranks;
}

/**
 * Approximate p-value from t-distribution
 */
function tDistributionPValue(t, df) {
  // Using approximation for large df
  if (df > 100) {
    // Normal approximation
    return 1 - normalCDF(t);
  }

  // Beta function approximation
  const x = df / (df + t * t);
  return 0.5 * incompleteBeta(df / 2, 0.5, x);
}

function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

function incompleteBeta(a, b, x) {
  // Simple approximation
  if (x === 0) return 0;
  if (x === 1) return 1;

  // Use continued fraction approximation
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaContinuedFraction(a, b, x) / a;
  }
  return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
}

function lgamma(x) {
  // Lanczos approximation
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
 * Calculate Information Coefficient for a signal
 * @param {Array} signals - Signal values (predictions)
 * @param {Array} returns - Forward returns
 * @param {number} horizon - Horizon in days
 * @returns {Object} IC analysis results
 */
function calculateIC(signals, returns, horizon = 1) {
  // Align signals with forward returns
  const alignedData = [];

  for (let i = 0; i < signals.length - horizon; i++) {
    if (signals[i] !== null && returns[i + horizon] !== null) {
      alignedData.push({
        signal: signals[i],
        forwardReturn: returns[i + horizon]
      });
    }
  }

  if (alignedData.length < 10) {
    return {
      ic: 0,
      tStat: 0,
      pValue: 1,
      significant: false,
      sampleSize: alignedData.length
    };
  }

  const signalValues = alignedData.map(d => d.signal);
  const returnValues = alignedData.map(d => d.forwardReturn);

  const { correlation, tStat, pValue } = spearmanCorrelation(signalValues, returnValues);

  return {
    ic: correlation,
    tStat,
    pValue,
    significant: pValue < 0.05,
    sampleSize: alignedData.length,
    horizon
  };
}

/**
 * Calculate IC Information Ratio (IC_IR = mean(IC) / std(IC))
 * Higher IC_IR indicates more consistent signal quality
 */
function calculateICIR(icSeries) {
  if (icSeries.length < 2) return 0;

  const mean = icSeries.reduce((a, b) => a + b, 0) / icSeries.length;
  const variance = icSeries.reduce((acc, ic) => acc + Math.pow(ic - mean, 2), 0) / (icSeries.length - 1);
  const std = Math.sqrt(variance);

  return std > 0 ? mean / std : 0;
}

/**
 * Analyze IC decay across multiple horizons
 */
async function analyzeICDecay(params) {
  const {
    signalType,
    startDate,
    endDate,
    horizons = [1, 5, 10, 21, 63], // days
    regime = 'ALL'
  } = params;

  // Get signals and prices
  const signals = await getSignalHistory(signalType, startDate, endDate, regime);

  if (signals.length === 0) {
    return { signalType, horizons: [], error: 'No signal data available' };
  }

  // Get prices for all symbols in signals
  const symbols = [...new Set(signals.map(s => s.symbol))];
  const priceData = await getPriceData(symbols, startDate, endDate);

  // Calculate IC for each horizon
  const horizonResults = [];

  for (const horizon of horizons) {
    const icValues = [];

    for (const symbol of symbols) {
      const symbolSignals = signals.filter(s => s.symbol === symbol);
      const symbolPrices = priceData[symbol] || [];

      if (symbolSignals.length < 10 || symbolPrices.length < horizon + 10) continue;

      // Calculate forward returns
      const returns = [];
      for (let i = 0; i < symbolPrices.length - horizon; i++) {
        returns.push(symbolPrices[i + horizon].close / symbolPrices[i].close - 1);
      }

      const signalValues = symbolSignals.slice(0, returns.length).map(s => s.value);
      const result = calculateIC(signalValues, returns, 0);

      if (result.sampleSize >= 10) {
        icValues.push(result.ic);
      }
    }

    // Aggregate IC across symbols
    if (icValues.length > 0) {
      const avgIC = icValues.reduce((a, b) => a + b, 0) / icValues.length;
      const icIR = calculateICIR(icValues);

      // T-test for IC significantly different from 0
      const icStd = Math.sqrt(
        icValues.reduce((acc, ic) => acc + Math.pow(ic - avgIC, 2), 0) / (icValues.length - 1)
      );
      const tStat = avgIC / (icStd / Math.sqrt(icValues.length));
      const pValue = tDistributionPValue(Math.abs(tStat), icValues.length - 1) * 2;

      horizonResults.push({
        horizon,
        ic: avgIC,
        icIR,
        tStat,
        pValue,
        significant: pValue < 0.05,
        numSymbols: icValues.length
      });

      // Store in database
      db.prepare(`
        INSERT OR REPLACE INTO signal_ic_history
        (signal_type, horizon_days, ic_value, ic_ir, t_stat, p_value, hit_rate, regime, sample_size, calculated_date, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?)
      `).run(
        signalType,
        horizon,
        avgIC,
        icIR,
        tStat,
        pValue,
        null, // hit_rate calculated separately
        regime,
        icValues.length,
        startDate,
        endDate
      );
    }
  }

  // Find optimal horizon (highest IC)
  const optimalHorizon = horizonResults.reduce(
    (best, h) => (h.ic > best.ic ? h : best),
    { ic: -Infinity, horizon: 1 }
  );

  return {
    signalType,
    regime,
    horizons: horizonResults,
    optimalHorizon: optimalHorizon.horizon,
    optimalIC: optimalHorizon.ic,
    decayRate: calculateDecayRate(horizonResults),
    interpretation: interpretICResults(horizonResults, optimalHorizon)
  };
}

/**
 * Calculate signal decay rate (exponential decay fit)
 * Uses absolute IC values to handle both positive and inverse factors correctly
 */
function calculateDecayRate(horizonResults) {
  if (horizonResults.length < 2) return 0;

  // Filter out noise (|IC| < 1%) but include both positive AND negative ICs
  const validResults = horizonResults.filter(h => Math.abs(h.ic || 0) > 0.01);
  if (validResults.length < 2) return 0;

  const x = validResults.map(h => h.horizon);
  // Use absolute IC for log calculation (handles inverse factors correctly)
  const y = validResults.map(h => Math.log(Math.abs(h.ic)));

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  // Return half-life in days
  return slope !== 0 ? -Math.log(2) / slope : Infinity;
}

/**
 * Calculate hit rate (% of correct directional predictions)
 */
function calculateHitRate(signals, returns, threshold = 0) {
  if (signals.length === 0 || signals.length !== returns.length) {
    return { hitRate: 0, confInterval: [0, 0], significant: false };
  }

  let hits = 0;
  let total = 0;

  for (let i = 0; i < signals.length; i++) {
    if (signals[i] === null || returns[i] === null) continue;

    // Signal predicts direction correctly
    const signalDirection = signals[i] > threshold ? 1 : signals[i] < -threshold ? -1 : 0;
    const returnDirection = returns[i] > 0 ? 1 : returns[i] < 0 ? -1 : 0;

    if (signalDirection !== 0) {
      total++;
      if (signalDirection === returnDirection) hits++;
    }
  }

  if (total === 0) {
    return { hitRate: 0, confInterval: [0, 0], significant: false };
  }

  const hitRate = hits / total;

  // Wilson score confidence interval
  const z = 1.96; // 95% confidence
  const phat = hitRate;
  const n = total;

  const denominator = 1 + z * z / n;
  const center = (phat + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt((phat * (1 - phat) + z * z / (4 * n)) / n) / denominator;

  // Test if significantly better than 50%
  const zStat = (hitRate - 0.5) / Math.sqrt(0.25 / n);
  const pValue = 1 - normalCDF(zStat);

  return {
    hitRate,
    confInterval: [Math.max(0, center - margin), Math.min(1, center + margin)],
    significant: pValue < 0.05,
    pValue,
    sampleSize: total
  };
}

/**
 * Calculate signal correlation matrix (to identify multicollinearity)
 */
async function getSignalCorrelationMatrix(signalTypes, startDate, endDate) {
  const matrix = {};
  const signalData = {};

  // Load signal data for each type
  for (const signalType of signalTypes) {
    signalData[signalType] = await getSignalHistory(signalType, startDate, endDate);
  }

  // Calculate pairwise correlations
  for (let i = 0; i < signalTypes.length; i++) {
    matrix[signalTypes[i]] = {};

    for (let j = 0; j < signalTypes.length; j++) {
      if (i === j) {
        matrix[signalTypes[i]][signalTypes[j]] = 1.0;
        continue;
      }

      // Align signals by date and symbol
      const aligned = alignSignals(signalData[signalTypes[i]], signalData[signalTypes[j]]);

      if (aligned.signal1.length < 10) {
        matrix[signalTypes[i]][signalTypes[j]] = null;
        continue;
      }

      const { correlation } = spearmanCorrelation(aligned.signal1, aligned.signal2);
      matrix[signalTypes[i]][signalTypes[j]] = correlation;
    }
  }

  // Find highly correlated pairs (potential multicollinearity)
  const correlatedPairs = [];
  for (let i = 0; i < signalTypes.length; i++) {
    for (let j = i + 1; j < signalTypes.length; j++) {
      const corr = matrix[signalTypes[i]][signalTypes[j]];
      if (corr !== null && Math.abs(corr) > 0.7) {
        correlatedPairs.push({
          signal1: signalTypes[i],
          signal2: signalTypes[j],
          correlation: corr
        });
      }
    }
  }

  return {
    matrix,
    correlatedPairs,
    warning: correlatedPairs.length > 0
      ? `Found ${correlatedPairs.length} highly correlated signal pairs - consider removing redundant signals`
      : null
  };
}

/**
 * Align two signal series by date and symbol
 */
function alignSignals(signals1, signals2) {
  const map2 = new Map();
  for (const s of signals2) {
    map2.set(`${s.symbol}_${s.date}`, s.value);
  }

  const aligned1 = [];
  const aligned2 = [];

  for (const s of signals1) {
    const key = `${s.symbol}_${s.date}`;
    if (map2.has(key)) {
      aligned1.push(s.value);
      aligned2.push(map2.get(key));
    }
  }

  return { signal1: aligned1, signal2: aligned2 };
}

/**
 * Get signal history from database or generate from AI trading signals
 */
async function getSignalHistory(signalType, startDate, endDate, regime = 'ALL') {
  // Try to get from trading_signal_history if it exists
  const signals = db.prepare(`
    SELECT symbol, date, signal_value as value, regime
    FROM trading_signal_history
    WHERE signal_type = ?
      AND date >= COALESCE(?, '1900-01-01')
      AND date <= COALESCE(?, '2100-01-01')
      ${regime !== 'ALL' ? 'AND regime = ?' : ''}
    ORDER BY date ASC
  `).all(signalType, startDate, endDate, ...(regime !== 'ALL' ? [regime] : []));

  if (signals.length > 0) {
    return signals;
  }

  // Generate synthetic signals based on available metrics if no historical signals
  // This is a fallback for testing - in production, signals should be recorded
  return generateSyntheticSignals(signalType, startDate, endDate);
}

/**
 * Generate synthetic signals from available metrics for testing
 */
function generateSyntheticSignals(signalType, startDate, endDate) {
  const signals = [];

  // Map signal types to metric calculations
  const signalMetrics = {
    technical: ['rsi', 'macd_signal', 'momentum'],
    fundamental: ['pe_ratio', 'pb_ratio', 'roic', 'fcf_yield'],
    sentiment: ['sentiment_score'],
    insider: ['insider_buying_ratio'],
    valuation: ['pe_ratio', 'ev_ebitda', 'ps_ratio']
  };

  const metrics = signalMetrics[signalType] || [];
  if (metrics.length === 0) return signals;

  // Get data from calculated_metrics
  const data = db.prepare(`
    SELECT cm.symbol, cm.date, cm.metric_name, cm.value
    FROM calculated_metrics cm
    JOIN companies c ON cm.symbol = c.symbol
    WHERE cm.metric_name IN (${metrics.map(() => '?').join(',')})
      AND cm.date >= COALESCE(?, '1900-01-01')
      AND cm.date <= COALESCE(?, '2100-01-01')
    ORDER BY cm.date ASC
  `).all(...metrics, startDate, endDate);

  // Aggregate metrics into signals
  const bySymbolDate = new Map();
  for (const row of data) {
    const key = `${row.symbol}_${row.date}`;
    if (!bySymbolDate.has(key)) {
      bySymbolDate.set(key, { symbol: row.symbol, date: row.date, values: [] });
    }
    bySymbolDate.get(key).values.push(row.value);
  }

  // Calculate composite signal (simple average of z-scores)
  for (const [, data] of bySymbolDate) {
    const avgValue = data.values.reduce((a, b) => a + b, 0) / data.values.length;
    signals.push({
      symbol: data.symbol,
      date: data.date,
      value: avgValue
    });
  }

  return signals;
}

/**
 * Get price data for symbols
 */
async function getPriceData(symbols, startDate, endDate) {
  const priceData = {};

  for (const symbol of symbols) {
    const prices = db.prepare(`
      SELECT date, close
      FROM daily_prices
      WHERE symbol = ?
        AND date >= COALESCE(?, '1900-01-01')
        AND date <= COALESCE(?, '2100-01-01')
      ORDER BY date ASC
    `).all(symbol, startDate, endDate);

    priceData[symbol] = prices;
  }

  return priceData;
}

/**
 * Interpret IC analysis results
 */
function interpretICResults(horizonResults, optimalHorizon) {
  const interpretations = [];

  if (horizonResults.length === 0) {
    return ['No valid IC measurements - insufficient signal data'];
  }

  const maxIC = optimalHorizon.ic;

  if (maxIC >= 0.05) {
    interpretations.push(`Strong predictive signal (IC=${maxIC.toFixed(3)}): Signal has meaningful forecasting power`);
  } else if (maxIC >= 0.02) {
    interpretations.push(`Moderate predictive signal (IC=${maxIC.toFixed(3)}): Signal provides some edge`);
  } else if (maxIC > 0) {
    interpretations.push(`Weak predictive signal (IC=${maxIC.toFixed(3)}): Limited forecasting power, consider combining with other signals`);
  } else {
    interpretations.push(`No predictive power (IC=${maxIC.toFixed(3)}): Signal does not predict returns`);
  }

  interpretations.push(`Optimal holding period: ${optimalHorizon.horizon} days`);

  // Check for significant decay
  const shortHorizon = horizonResults.find(h => h.horizon <= 5);
  const longHorizon = horizonResults.find(h => h.horizon >= 21);

  if (shortHorizon && longHorizon) {
    const decay = (shortHorizon.ic - longHorizon.ic) / shortHorizon.ic;
    if (decay > 0.5) {
      interpretations.push('Signal decays quickly - suited for short-term trading');
    } else if (decay < 0.2) {
      interpretations.push('Signal persists - suited for medium-term positions');
    }
  }

  return interpretations;
}

/**
 * Get IC history for a signal type
 */
function getICHistory(signalType, days = 90) {
  return db.prepare(`
    SELECT *
    FROM signal_ic_history
    WHERE signal_type = ?
      AND calculated_date >= date('now', '-' || ? || ' days')
    ORDER BY calculated_date DESC, horizon_days ASC
  `).all(signalType, days);
}

/**
 * Get all signal types with IC data
 */
function getSignalTypes() {
  return db.prepare(`
    SELECT DISTINCT signal_type
    FROM signal_ic_history
    ORDER BY signal_type
  `).all().map(r => r.signal_type);
}

module.exports = {
  calculateIC,
  calculateICIR,
  analyzeICDecay,
  calculateHitRate,
  getSignalCorrelationMatrix,
  spearmanCorrelation,
  getICHistory,
  getSignalTypes
};
